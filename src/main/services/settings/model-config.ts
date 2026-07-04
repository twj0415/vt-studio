import { randomUUID } from 'node:crypto';
import { VT_STATUS } from '@shared/constants/status';
import { toPublicSecretState } from '@shared/security/secrets';
import type {
  ApiConnection,
  ApiConnectionDeletePayload,
  ApiConnectionDeleteResult,
  ApiConnectionDraft,
  ApiConnectionListResult,
  ApiConnectionSavePayload,
  ApiConnectionSaveResult,
  ApiConnectionTestPayload,
  ApiConnectionTestResult,
  ApiProtocolType,
  ApiServiceType,
  CapabilityBindingMap,
  CapabilitySummary,
  ModelCapability,
  RegisteredModel,
  ResourceBindingSavePayload,
  ResourceBindingSaveResult,
  ResourceConfigResult,
  ResourceTestPayload,
  ResourceTestResult,
} from '@shared/types/model-config';
import { getDatabase } from '../database';
import { createError } from '../result';
import { getVendorRows, parseJsonObject, parseModelList, upsertVendorRecord, type VendorRow } from '../model/storage';
import { getBuiltinVendorDefinition } from '../model/builtin-vendors';
import { validateComfyUiWorkflowManifest } from '../model/comfyui-workflow';
import {
  CONNECTION_PROJECTION_ADAPTER_KEY,
  CONNECTION_PROJECTION_NAME_KEY,
  getConnectionProjectionMeta,
  isConnectionProjectionId,
} from '../model/connection-projection';
import {
  buildCapabilityMatrixForConnections,
  getDefaultRegisteredModelModeKey,
  getRegisteredModelModeKeys,
  normalizeRegisteredModel,
  registeredModelToVendorModel,
  vendorModelToRegisteredModel,
} from '../model/capability-matrix';
import { runVendorImageTest, runVendorTextTest, runVendorVideoTest } from './vendor';
import { TASK_STATUS } from '../task/constants';
import type { VendorModelConfig } from '../model/types';

const CONNECTIONS_KEY = 'modelConnections.v1';
const BINDINGS_KEY = 'modelCapabilityBindings.v1';

const CAPABILITY_LABELS: Record<ModelCapability, string> = {
  text: '文本生成',
  image: '图片生成',
  video: '视频生成',
  tts: '语音生成',
};

const SERVICE_META: Record<
  ApiServiceType,
  {
    name: string;
    protocolType: ApiProtocolType;
    adapterVendorId: string;
    defaultBaseUrl: string;
    capabilities: ModelCapability[];
    models: RegisteredModel[];
  }
> = {
  'openai-official': {
    name: 'OpenAI 官方',
    protocolType: 'openai-official',
    adapterVendorId: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    capabilities: ['text', 'image', 'tts'],
    models: [
      { id: 'gpt-5.5', displayName: 'GPT-5.5', modelName: 'gpt-5.5', type: 'text', think: true },
      { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 mini', modelName: 'gpt-4.1-mini', type: 'text', think: false },
      { id: 'gpt-image-1', displayName: 'GPT Image 1', modelName: 'gpt-image-1', type: 'image', imageModes: ['text', 'singleImage'] },
    ],
  },
  'openai-gateway': {
    name: 'OpenAI 中转',
    protocolType: 'openai-compatible',
    adapterVendorId: 'atlascloud',
    defaultBaseUrl: '',
    capabilities: ['text', 'image'],
    models: [
      { id: 'gpt-5.5', displayName: 'GPT-5.5', modelName: 'gpt-5.5', type: 'text', think: true },
      { id: 'gpt-5.4', displayName: 'GPT-5.4', modelName: 'gpt-5.4', type: 'text', think: false },
      { id: 'gpt-image-2', displayName: 'GPT Image 2', modelName: 'gpt-image-2', type: 'image', imageModes: ['text', 'singleImage', 'multiReference'] },
    ],
  },
  claude: {
    name: 'Claude',
    protocolType: 'anthropic',
    adapterVendorId: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    capabilities: ['text'],
    models: [{ id: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', modelName: 'claude-sonnet-4-5', type: 'text', think: true }],
  },
  deepseek: {
    name: 'DeepSeek',
    protocolType: 'deepseek',
    adapterVendorId: 'deepseek',
    defaultBaseUrl: 'https://api.deepseek.com',
    capabilities: ['text'],
    models: [{ id: 'deepseek-chat', displayName: 'DeepSeek Chat', modelName: 'deepseek-chat', type: 'text', think: false }],
  },
  gemini: {
    name: 'Gemini',
    protocolType: 'gemini',
    adapterVendorId: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    capabilities: ['text', 'image', 'video'],
    models: [{ id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', modelName: 'gemini-2.5-flash', type: 'text', think: true }],
  },
  'local-workflow': {
    name: '本地工作流',
    protocolType: 'workflow',
    adapterVendorId: 'comfyui',
    defaultBaseUrl: 'http://127.0.0.1:8188',
    capabilities: ['image'],
    models: [{ id: 'comfyui-workflow', displayName: 'ComfyUI Workflow', modelName: 'comfyui-workflow', type: 'image', imageModes: ['text', 'singleImage', 'multiReference'] }],
  },
  advanced: {
    name: '其他高级接入',
    protocolType: 'custom-adapter',
    adapterVendorId: 'atlascloud',
    defaultBaseUrl: '',
    capabilities: ['text'],
    models: [{ id: 'custom-chat-model', displayName: '自定义文本模型', modelName: 'custom-chat-model', type: 'text', think: false }],
  },
};

export type ModelConnectionConsistencyIssueType =
  | 'missing-vendor-projection'
  | 'stale-vendor-projection'
  | 'orphan-vendor-projection'
  | 'invalid-capability-binding'
  | 'invalid-agent-model'
  | 'invalid-project-model';

export interface ModelConnectionConsistencyIssue {
  type: ModelConnectionConsistencyIssueType;
  severity: 'warning' | 'error';
  message: string;
  connectionId?: string;
  vendorId?: string;
  repaired: boolean;
  repairAction: 'none' | 'synced' | 'disabled' | 'cleared';
}

export interface ModelConnectionConsistencyReport {
  ok: boolean;
  connectionCount: number;
  projectionCount: number;
  issueCount: number;
  repairedCount: number;
  issues: ModelConnectionConsistencyIssue[];
}

function getSettingJson<T>(key: string, fallback: T): T {
  const row = getDatabase().prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(key);
  if (!row?.value) {
    return fallback;
  }

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function saveSettingJson(key: string, value: unknown): void {
  const now = Date.now();
  const serialized = JSON.stringify(value);
  const existing = getDatabase().prepare<[string], { key: string } | undefined>('SELECT key FROM app_settings WHERE key = ? LIMIT 1').get(key);
  if (existing) {
    getDatabase().prepare<[string, number, string]>('UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?').run(serialized, now, key);
    return;
  }

  getDatabase()
    .prepare<[string, string, number, number]>('INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(key, serialized, now, now);
}

function tableExists(tableName: string): boolean {
  const row = getDatabase()
    .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);

  return Boolean(row);
}

function createConnectionId(): string {
  return `conn_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function normalizeModels(models: RegisteredModel[], serviceType: ApiServiceType): RegisteredModel[] {
  const fallback = SERVICE_META[serviceType].models;
  const source = models.length > 0 ? models : fallback;
  const seen = new Set<string>();

  return source
    .map(normalizeRegisteredModel)
    .filter((model) => {
      if (!model.modelName || seen.has(model.modelName)) {
        return false;
      }

      seen.add(model.modelName);
      return true;
    });
}

function deriveCapabilitiesFromModels(models: RegisteredModel[]): ModelCapability[] {
  return [...new Set(models.map((model) => model.type))] as ModelCapability[];
}

function getConnectionStatus(connection: Pick<ApiConnection, 'apiKey' | 'serviceType' | 'baseUrl' | 'workflowManifest' | 'models'>): Pick<ApiConnection, 'status' | 'statusText'> {
  if (!connection.apiKey.trim() && connection.serviceType !== 'local-workflow') {
    return { status: 'incomplete', statusText: '缺少 API Key' };
  }

  if (connection.serviceType === 'local-workflow') {
    if (!connection.baseUrl.trim()) {
      return { status: 'incomplete', statusText: '缺少 ComfyUI Endpoint' };
    }

    const validation = validateComfyUiWorkflowManifest(connection.workflowManifest ?? '');
    if (!validation.ok) {
      return { status: 'incomplete', statusText: validation.reason };
    }
  }

  if (connection.serviceType === 'openai-gateway' && !connection.baseUrl.trim()) {
    return { status: 'incomplete', statusText: '中转服务需要 Base URL' };
  }

  if (connection.models.length === 0) {
    return { status: 'incomplete', statusText: '至少需要登记一个模型' };
  }

  return { status: 'ready', statusText: '配置完整' };
}

function normalizeDraft(draft: ApiConnectionDraft, previous?: ApiConnection): ApiConnection {
  const now = Date.now();
  const serviceType = draft.serviceType;
  const meta = SERVICE_META[serviceType];
  const models = normalizeModels(draft.models ?? [], serviceType);
  const capabilities = deriveCapabilitiesFromModels(models);
  const apiKey = draft.apiKey.trim() || previous?.apiKey || '';
  const base = {
    id: draft.id?.trim() || previous?.id || createConnectionId(),
    name: draft.name.trim() || meta.name,
    serviceType,
    protocolType: meta.protocolType,
    baseUrl: draft.baseUrl.trim(),
    apiKey,
    workflowManifest: draft.workflowManifest?.trim() || previous?.workflowManifest || '',
    capabilities,
    models,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    ...base,
    ...getConnectionStatus(base),
  };
}

function readStoredConnections(): ApiConnection[] {
  const connections = getSettingJson<ApiConnection[]>(CONNECTIONS_KEY, []);
  if (Array.isArray(connections) && connections.length > 0) {
    return connections;
  }

  const migrated = migrateLegacyVendorConnections();
  if (migrated.length > 0) {
    saveConnections(migrated);
  }

  return migrated;
}

function getStoredConnections(): ApiConnection[] {
  const connections = readStoredConnections();
  ensureConnectionVendorProjections(connections);
  return connections;
}

function saveConnections(connections: ApiConnection[]): void {
  saveSettingJson(CONNECTIONS_KEY, connections);
}

function toPublicConnection(connection: ApiConnection): ApiConnection {
  const apiKeyState = toPublicSecretState(connection.apiKey);
  return {
    ...connection,
    apiKey: '',
    apiKeyConfigured: apiKeyState.configured,
    apiKeyMasked: apiKeyState.masked,
  };
}

function toPublicConnections(connections: ApiConnection[]): ApiConnection[] {
  return connections.map(toPublicConnection);
}

function getServiceTypeFromVendor(vendorId: string, inputValues: Record<string, string>): ApiServiceType | null {
  if (vendorId === 'openai') {
    const baseUrl = inputValues.baseUrl?.trim() ?? '';
    return baseUrl && !baseUrl.includes('api.openai.com') ? 'openai-gateway' : 'openai-official';
  }

  const map: Partial<Record<string, ApiServiceType>> = {
    anthropic: 'claude',
    deepseek: 'deepseek',
    gemini: 'gemini',
    comfyui: 'local-workflow',
    atlascloud: 'openai-gateway',
  };

  return map[vendorId] ?? null;
}

function migrateLegacyVendorConnections(): ApiConnection[] {
  const now = Date.now();
  const connections: ApiConnection[] = [];

  for (const row of getVendorRows()) {
    const inputValues = parseJsonObject(row.input_values);
    if (!inputValues.apiKey?.trim() && !inputValues.baseUrl?.trim() && row.enabled !== 1) {
      continue;
    }

    const serviceType = getServiceTypeFromVendor(row.id, inputValues);
    if (!serviceType) {
      continue;
    }

    const meta = SERVICE_META[serviceType];
    const builtin = getBuiltinVendorDefinition(meta.adapterVendorId);
    const storedModels = parseModelList(row.models);
    const sourceModels = storedModels.length > 0 ? storedModels : builtin?.manifest.models ?? [];
    const models = sourceModels.map(vendorModelToRegisteredModel);
    const base = {
      id: `conn_migrated_${row.id}`,
      name: `${meta.name}（已迁移）`,
      serviceType,
      protocolType: meta.protocolType,
      baseUrl: inputValues.baseUrl ?? inputValues.endpoint ?? meta.defaultBaseUrl,
      apiKey: inputValues.apiKey ?? '',
      workflowManifest: inputValues.workflowManifest ?? inputValues.workflow ?? '',
      capabilities: deriveCapabilitiesFromModels(models),
      models,
      createdAt: row.created_at || now,
      updatedAt: now,
    };
    const connection = {
      ...base,
      ...getConnectionStatus(base),
    };

    syncConnectionToVendor(connection);
    connections.push(connection);
  }

  return connections;
}

function getBindings(): CapabilityBindingMap {
  const bindings = getSettingJson<CapabilityBindingMap>(BINDINGS_KEY, {});
  return bindings && typeof bindings === 'object' ? bindings : {};
}

function saveBindings(bindings: CapabilityBindingMap): void {
  saveSettingJson(BINDINGS_KEY, bindings);
}

function isBindingValid(connections: ApiConnection[], capability: ModelCapability, binding: CapabilityBindingMap[ModelCapability]): boolean {
  if (!binding) {
    return false;
  }

  const connection = connections.find((item) => item.id === binding.connectionId);
  const model = connection?.models.find((item) => item.modelName === binding.modelName);
  return Boolean(connection && connection.status === 'ready' && model?.type === capability);
}

function findDefaultBinding(connections: ApiConnection[], capability: ModelCapability): CapabilityBindingMap[ModelCapability] {
  for (const connection of connections) {
    if (connection.status !== 'ready') {
      continue;
    }

    const model = connection.models.find((item) => item.type === capability);
    if (model) {
      return {
        connectionId: connection.id,
        modelName: model.modelName,
      };
    }
  }

  return undefined;
}

function ensureDefaultBindings(connections: ApiConnection[]): void {
  const bindings = getBindings();
  let changed = false;

  for (const capability of Object.keys(CAPABILITY_LABELS) as ModelCapability[]) {
    if (isBindingValid(connections, capability, bindings[capability])) {
      continue;
    }

    const fallback = findDefaultBinding(connections, capability);
    if (fallback) {
      bindings[capability] = fallback;
      changed = true;
    } else if (bindings[capability]) {
      delete bindings[capability];
      changed = true;
    }
  }

  if (changed) {
    saveBindings(bindings);
  }
}

function getConnectionProjectionInputValues(connection: ApiConnection): Record<string, string> {
  const meta = SERVICE_META[connection.serviceType];
  return {
    apiKey: connection.apiKey,
    baseUrl: connection.baseUrl,
    endpoint: connection.baseUrl,
    workflow: connection.workflowManifest ?? '',
    workflowManifest: connection.workflowManifest ?? '',
    [CONNECTION_PROJECTION_ADAPTER_KEY]: meta.adapterVendorId,
    [CONNECTION_PROJECTION_NAME_KEY]: connection.name,
  };
}

function getConnectionProjectionModels(models: RegisteredModel[]): VendorModelConfig[] {
  return models.map(registeredModelToVendorModel);
}

function syncConnectionToVendor(connection: ApiConnection): void {
  upsertVendorRecord({
    id: connection.id,
    inputValues: getConnectionProjectionInputValues(connection),
    models: getConnectionProjectionModels(connection.models),
    enabled: connection.status === 'ready',
  });
}

function getVendorProjectionRow(connectionId: string): VendorRow | null {
  return getDatabase().prepare<[string], VendorRow>('SELECT * FROM model_vendors WHERE id = ? LIMIT 1').get(connectionId) ?? null;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function getProjectionMismatchFields(connection: ApiConnection, row: VendorRow): string[] {
  const expectedInputs = getConnectionProjectionInputValues(connection);
  const actualInputs = parseJsonObject(row.input_values);
  const expectedModels = getConnectionProjectionModels(connection.models);
  const actualModels = parseModelList(row.models);
  const mismatch: string[] = [];

  for (const key of ['apiKey', 'baseUrl', 'endpoint', 'workflow', 'workflowManifest', CONNECTION_PROJECTION_ADAPTER_KEY, CONNECTION_PROJECTION_NAME_KEY]) {
    if ((actualInputs[key] ?? '') !== (expectedInputs[key] ?? '')) {
      mismatch.push(key);
    }
  }

  if (stableJson(actualModels) !== stableJson(expectedModels)) {
    mismatch.push('models');
  }

  if ((row.enabled === 1) !== (connection.status === 'ready')) {
    mismatch.push('enabled');
  }

  return mismatch;
}

function ensureConnectionVendorProjections(connections: ApiConnection[]): void {
  for (const connection of connections) {
    const row = getVendorProjectionRow(connection.id);
    if (!row || getProjectionMismatchFields(connection, row).length > 0) {
      syncConnectionToVendor(connection);
    }
  }
}

function assertConnectionReady(connection: ApiConnection): void {
  if (connection.status !== 'ready') {
    throw createError(VT_STATUS.MODEL_NOT_CONFIGURED, connection.statusText);
  }
}

function findConnection(connectionId: string): ApiConnection {
  const connection = getStoredConnections().find((item) => item.id === connectionId);
  if (!connection) {
    throw createError(VT_STATUS.NOT_FOUND, '连接不存在');
  }

  return connection;
}

function findModel(connection: ApiConnection, modelName: string): RegisteredModel {
  const model = connection.models.find((item) => item.modelName === modelName);
  if (!model) {
    throw createError(VT_STATUS.MODEL_NOT_FOUND, '模型不存在');
  }

  return model;
}

function buildCapabilitySummaries(connections: ApiConnection[], bindings: CapabilityBindingMap): CapabilitySummary[] {
  return (Object.keys(CAPABILITY_LABELS) as ModelCapability[]).map((capability) => {
    const binding = bindings[capability] ?? null;
    const connection = binding ? connections.find((item) => item.id === binding.connectionId) : null;
    const model = connection && binding ? connection.models.find((item) => item.modelName === binding.modelName) : null;

    if (!binding) {
      return {
        capability,
        label: CAPABILITY_LABELS[capability],
        binding: null,
        connectionName: '未选择',
        modelDisplayName: '未选择',
        modelName: '',
        status: 'missing',
        statusText: '未配置',
      };
    }

    if (!connection || !model) {
      return {
        capability,
        label: CAPABILITY_LABELS[capability],
        binding,
        connectionName: connection?.name ?? '连接不存在',
        modelDisplayName: model?.displayName ?? '模型不存在',
        modelName: binding.modelName,
        status: 'unsupported',
        statusText: '绑定已失效',
      };
    }

    if (model.type !== capability) {
      return {
        capability,
        label: CAPABILITY_LABELS[capability],
        binding,
        connectionName: connection.name,
        modelDisplayName: model.displayName,
        modelName: model.modelName,
        status: 'unsupported',
        statusText: '模型能力不匹配',
      };
    }

    return {
      capability,
      label: CAPABILITY_LABELS[capability],
      binding,
      connectionName: connection.name,
      modelDisplayName: model.displayName,
      modelName: model.modelName,
      status: connection.status === 'ready' ? 'configured' : 'missing',
      statusText: connection.status === 'ready' ? '已配置' : connection.statusText,
    };
  });
}

interface ConnectionReference {
  type: 'capability' | 'agent' | 'project' | 'task';
  name: string;
  detail: string;
}

function listConnectionReferences(connectionId: string): ConnectionReference[] {
  const references: ConnectionReference[] = [];
  const bindings = getBindings();
  for (const capability of Object.keys(bindings) as ModelCapability[]) {
    const binding = bindings[capability];
    if (binding?.connectionId === connectionId) {
      references.push({
        type: 'capability',
        name: CAPABILITY_LABELS[capability],
        detail: `${connectionId}:${binding.modelName}`,
      });
    }
  }

  const modelIdLike = `${connectionId}:%`;
  const agentRows = getDatabase()
    .prepare<[string, string], { key: string; name: string | null; model_id: string | null }>(
      'SELECT key, name, model_id FROM agent_model_configs WHERE vendor_id = ? OR model_id LIKE ? ORDER BY id ASC',
    )
    .all(connectionId, modelIdLike);
  for (const row of agentRows) {
    references.push({
      type: 'agent',
      name: row.name ?? row.key,
      detail: row.model_id ?? connectionId,
    });
  }

  if (tableExists('projects')) {
    const projectRows = getDatabase()
      .prepare<[string, string], { id: number; name: string; image_model_id: string; video_model_id: string }>(
        'SELECT id, name, image_model_id, video_model_id FROM projects WHERE image_model_id LIKE ? OR video_model_id LIKE ? ORDER BY id ASC',
      )
      .all(modelIdLike, modelIdLike);
    for (const row of projectRows) {
      const fields: string[] = [];
      if (row.image_model_id.startsWith(`${connectionId}:`)) {
        fields.push(`图片模型 ${row.image_model_id}`);
      }
      if (row.video_model_id.startsWith(`${connectionId}:`)) {
        fields.push(`视频模型 ${row.video_model_id}`);
      }

      references.push({
        type: 'project',
        name: row.name || `项目 ${row.id}`,
        detail: fields.join('；'),
      });
    }
  }

  if (tableExists('tasks')) {
    const taskRows = getDatabase()
      .prepare<[string, string], { id: number; category: string; model_name: string | null }>(
        'SELECT id, category, model_name FROM tasks WHERE status = ? AND model_name LIKE ? ORDER BY id ASC',
      )
      .all(TASK_STATUS.RUNNING, modelIdLike);
    for (const row of taskRows) {
      references.push({
        type: 'task',
        name: `${row.category} #${row.id}`,
        detail: row.model_name ?? connectionId,
      });
    }
  }

  return references;
}

function assertNoConnectionReferences(connectionId: string): void {
  const first = listConnectionReferences(connectionId)[0];
  if (!first) {
    return;
  }

  throw createError(VT_STATUS.CONFLICT, `当前连接仍被 ${first.name} 引用：${first.detail}，请先解除引用`);
}

function makeIssue(input: Omit<ModelConnectionConsistencyIssue, 'repaired' | 'repairAction'> & Partial<Pick<ModelConnectionConsistencyIssue, 'repaired' | 'repairAction'>>): ModelConnectionConsistencyIssue {
  return {
    repaired: false,
    repairAction: 'none',
    ...input,
  };
}

function parseModelId(modelId: string | null | undefined): { connectionId: string; modelName: string } | null {
  const normalized = modelId?.trim();
  if (!normalized) {
    return null;
  }

  const [connectionId, modelName] = normalized.split(/:(.+)/);
  if (!connectionId || !modelName) {
    return null;
  }

  return { connectionId, modelName };
}

function isModelReferenceValid(connections: ApiConnection[], modelId: string | null | undefined, capability?: ModelCapability): boolean {
  const parsed = parseModelId(modelId);
  if (!parsed) {
    return false;
  }

  const connection = connections.find((item) => item.id === parsed.connectionId);
  const model = connection?.models.find((item) => item.modelName === parsed.modelName);
  if (!connection || connection.status !== 'ready' || !model) {
    return false;
  }

  return capability ? model.type === capability : true;
}

function collectInvalidAgentIssues(connections: ApiConnection[]): ModelConnectionConsistencyIssue[] {
  const rows = getDatabase()
    .prepare<[], { key: string; name: string | null; model_id: string | null; vendor_id: string | null }>(
      'SELECT key, name, model_id, vendor_id FROM agent_model_configs WHERE model_id IS NOT NULL OR vendor_id IS NOT NULL ORDER BY id ASC',
    )
    .all();

  return rows
    .filter((row) => !isModelReferenceValid(connections, row.model_id, 'text'))
    .map((row) =>
      makeIssue({
        type: 'invalid-agent-model',
        severity: 'error',
        connectionId: row.vendor_id ?? parseModelId(row.model_id)?.connectionId ?? undefined,
        message: `Agent 模型引用已失效：${row.name ?? row.key} / ${row.model_id ?? row.vendor_id ?? '空模型'}`,
      }),
    );
}

function collectInvalidProjectIssues(connections: ApiConnection[]): ModelConnectionConsistencyIssue[] {
  if (!tableExists('projects')) {
    return [];
  }

  const rows = getDatabase()
    .prepare<[], { id: number; name: string; image_model_id: string; video_model_id: string }>(
      'SELECT id, name, image_model_id, video_model_id FROM projects ORDER BY id ASC',
    )
    .all();
  const issues: ModelConnectionConsistencyIssue[] = [];

  for (const row of rows) {
    if (!isModelReferenceValid(connections, row.image_model_id, 'image')) {
      issues.push(
        makeIssue({
          type: 'invalid-project-model',
          severity: 'error',
          connectionId: parseModelId(row.image_model_id)?.connectionId,
          message: `项目图片模型引用已失效：${row.name || `项目 ${row.id}`} / ${row.image_model_id}`,
        }),
      );
    }

    if (!isModelReferenceValid(connections, row.video_model_id, 'video')) {
      issues.push(
        makeIssue({
          type: 'invalid-project-model',
          severity: 'error',
          connectionId: parseModelId(row.video_model_id)?.connectionId,
          message: `项目视频模型引用已失效：${row.name || `项目 ${row.id}`} / ${row.video_model_id}`,
        }),
      );
    }
  }

  return issues;
}

function collectInvalidBindingIssues(connections: ApiConnection[], repair: boolean): ModelConnectionConsistencyIssue[] {
  const bindings = getBindings();
  const issues: ModelConnectionConsistencyIssue[] = [];
  let changed = false;

  for (const capability of Object.keys(bindings) as ModelCapability[]) {
    const binding = bindings[capability];
    if (!binding || isBindingValid(connections, capability, binding)) {
      continue;
    }

    if (repair) {
      delete bindings[capability];
      changed = true;
    }

    issues.push(
      makeIssue({
        type: 'invalid-capability-binding',
        severity: 'error',
        connectionId: binding.connectionId,
        message: `默认${CAPABILITY_LABELS[capability]}绑定已失效：${binding.connectionId}:${binding.modelName}`,
        repaired: repair,
        repairAction: repair ? 'cleared' : 'none',
      }),
    );
  }

  if (changed) {
    saveBindings(bindings);
  }

  return issues;
}

export function diagnoseModelConnectionConsistency(options: { repair?: boolean } = {}): ModelConnectionConsistencyReport {
  const repair = options.repair === true;
  const connections = readStoredConnections();
  const connectionIds = new Set(connections.map((connection) => connection.id));
  const vendorRows = getVendorRows();
  const rowById = new Map(vendorRows.map((row) => [row.id, row]));
  const projectionRows = vendorRows.filter((row) => isConnectionProjectionId(row.id) || Boolean(getConnectionProjectionMeta(row)));
  const issues: ModelConnectionConsistencyIssue[] = [];

  for (const connection of connections) {
    const row = rowById.get(connection.id);
    if (!row) {
      if (repair) {
        syncConnectionToVendor(connection);
      }

      issues.push(
        makeIssue({
          type: 'missing-vendor-projection',
          severity: 'error',
          connectionId: connection.id,
          vendorId: connection.id,
          message: `模型连接缺少运行投影：${connection.name} / ${connection.id}`,
          repaired: repair,
          repairAction: repair ? 'synced' : 'none',
        }),
      );
      continue;
    }

    const mismatchFields = getProjectionMismatchFields(connection, row);
    if (mismatchFields.length > 0) {
      if (repair) {
        syncConnectionToVendor(connection);
      }

      issues.push(
        makeIssue({
          type: 'stale-vendor-projection',
          severity: 'warning',
          connectionId: connection.id,
          vendorId: connection.id,
          message: `模型连接运行投影不一致：${connection.name} / ${mismatchFields.join(', ')}`,
          repaired: repair,
          repairAction: repair ? 'synced' : 'none',
        }),
      );
    }
  }

  for (const row of projectionRows) {
    if (connectionIds.has(row.id)) {
      continue;
    }

    if (repair && row.enabled === 1) {
      getDatabase()
        .prepare<[number, number, string]>('UPDATE model_vendors SET enabled = ?, updated_at = ? WHERE id = ?')
        .run(0, Date.now(), row.id);
    }

    issues.push(
      makeIssue({
        type: 'orphan-vendor-projection',
        severity: 'warning',
        vendorId: row.id,
        message: `发现没有来源连接的运行投影：${row.id}`,
        repaired: repair && row.enabled === 1,
        repairAction: repair && row.enabled === 1 ? 'disabled' : 'none',
      }),
    );
  }

  issues.push(...collectInvalidBindingIssues(connections, repair));
  issues.push(...collectInvalidAgentIssues(connections));
  issues.push(...collectInvalidProjectIssues(connections));

  const unresolvedIssues = issues.filter((issue) => !issue.repaired);
  const repairedCount = issues.filter((issue) => issue.repaired).length;

  return {
    ok: unresolvedIssues.length === 0,
    connectionCount: connections.length,
    projectionCount: projectionRows.length,
    issueCount: issues.length,
    repairedCount,
    issues,
  };
}

export function getApiConnectionList(): ApiConnectionListResult {
  return { connections: toPublicConnections(getStoredConnections()) };
}

export function saveApiConnection(payload: ApiConnectionSavePayload): ApiConnectionSaveResult {
  const connections = getStoredConnections();
  const previous = payload.connection.id ? connections.find((item) => item.id === payload.connection.id) : undefined;
  const connection = normalizeDraft(payload.connection, previous);
  const nextConnections = previous
    ? connections.map((item) => (item.id === connection.id ? connection : item))
    : [...connections, connection];

  syncConnectionToVendor(connection);
  saveConnections(nextConnections);
  ensureDefaultBindings(nextConnections);

  return { connection: toPublicConnection(connection) };
}

export function deleteApiConnection(payload: ApiConnectionDeletePayload): ApiConnectionDeleteResult {
  const connections = getStoredConnections();
  const connection = connections.find((item) => item.id === payload.connectionId);
  if (!connection) {
    throw createError(VT_STATUS.NOT_FOUND, '连接不存在');
  }

  assertNoConnectionReferences(connection.id);
  getDatabase().prepare<[string]>('DELETE FROM model_vendors WHERE id = ?').run(connection.id);
  const nextConnections = connections.filter((item) => item.id !== connection.id);
  saveConnections(nextConnections);
  ensureDefaultBindings(nextConnections);

  return { connectionId: connection.id };
}

export async function testApiConnection(payload: ApiConnectionTestPayload): Promise<ApiConnectionTestResult> {
  const connection = findConnection(payload.connectionId);
  const model = findModel(connection, payload.modelName);

  assertConnectionReady(connection);
  syncConnectionToVendor(connection);

  if (model.type === 'text') {
    return runVendorTextTest({
      vendorId: connection.id,
      modelName: model.modelName,
      prompt: payload.prompt,
    });
  }

  if (model.type === 'image') {
    return runVendorImageTest({
      vendorId: connection.id,
      modelName: model.modelName,
      prompt: payload.prompt,
    });
  }

  if (model.type === 'video') {
    const modeKeys = getRegisteredModelModeKeys(model);
    return runVendorVideoTest({
      vendorId: connection.id,
      modelName: model.modelName,
      mode: modeKeys.includes('text') ? 'text' : getDefaultRegisteredModelModeKey(model),
      prompt: payload.prompt,
    });
  }

  throw createError(VT_STATUS.MODEL_VENDOR_INVALID, 'TTS 测试入口尚未接入');
}

export function getResourceConfig(): ResourceConfigResult {
  const connections = getStoredConnections();
  const bindings = getBindings();
  return {
    connections: toPublicConnections(connections),
    bindings,
    capabilities: buildCapabilitySummaries(connections, bindings),
    capabilityMatrix: buildCapabilityMatrixForConnections(connections),
  };
}

export function saveResourceBinding(payload: ResourceBindingSavePayload): ResourceBindingSaveResult {
  const bindings = getBindings();
  if (!payload.binding) {
    delete bindings[payload.capability];
    saveBindings(bindings);
    return { bindings };
  }

  const connection = findConnection(payload.binding.connectionId);
  const model = findModel(connection, payload.binding.modelName);
  if (model.type !== payload.capability) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模型类型和能力不匹配');
  }

  bindings[payload.capability] = payload.binding;
  saveBindings(bindings);
  return { bindings };
}

export async function testResourceBinding(payload: ResourceTestPayload): Promise<ResourceTestResult> {
  const binding = getBindings()[payload.capability];
  if (!binding) {
    throw createError(VT_STATUS.MODEL_NOT_CONFIGURED, `${CAPABILITY_LABELS[payload.capability]}未配置`);
  }

  return testApiConnection({
    connectionId: binding.connectionId,
    modelName: binding.modelName,
    prompt: payload.prompt,
  });
}

export function getConnectionTemplates(): { services: Array<{ serviceType: ApiServiceType; name: string; defaultBaseUrl: string; capabilities: ModelCapability[]; models: RegisteredModel[] }> } {
  return {
    services: (Object.keys(SERVICE_META) as ApiServiceType[]).map((serviceType) => {
      const meta = SERVICE_META[serviceType];
      return {
        serviceType,
        name: meta.name,
        defaultBaseUrl: meta.defaultBaseUrl,
        capabilities: meta.capabilities,
        models: meta.models.map(normalizeRegisteredModel),
      };
    }),
  };
}
