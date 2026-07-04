import { VT_STATUS } from '@shared/constants/status';
import type { ModelCapabilityMatrixItem } from '@shared/types/model-capability';
import type {
  ModelPromptBindPayload,
  ModelPromptBindResult,
  ModelPromptBinding,
  ModelPromptClearBindingPayload,
  ModelPromptClearBindingResult,
  ModelPromptConfigResult,
  ModelPromptConnectionGroup,
  ModelPromptInvalidMapping,
  ModelPromptModelItem,
  ModelPromptModelType,
  ModelPromptTemplate,
  ModelPromptTemplateDeletePayload,
  ModelPromptTemplateDeleteResult,
  ModelPromptTemplateSavePayload,
  ModelPromptTemplateSaveResult,
  ModelPromptTemplateType,
} from '@shared/types/model-prompt';
import type { ApiConnection } from '@shared/types/model-config';
import { getDatabase } from '../database';
import { createError } from '../result';
import { getResourceConfig } from './model-config';

interface TemplateRow {
  id: number;
  name: string;
  type: string;
  content: string;
  is_builtin: number;
  created_at: number;
  updated_at: number;
  reference_count?: number;
}

interface MappingRow {
  id: number;
  connection_id: string;
  model_name: string;
  model_type: string;
  model_mode: string;
  template_id: number;
  created_at: number;
  updated_at: number;
}

export interface ResolvedModelPromptTemplate {
  template: ModelPromptTemplate;
  source: 'mapping' | 'default';
  connectionId: string;
  modelName: string;
  modelType: ModelPromptModelType;
  modelMode: string;
}

const MODEL_TYPES: ModelPromptModelType[] = ['image', 'video'];
const TEMPLATE_TYPES: ModelPromptTemplateType[] = ['imagePrompt', 'videoPrompt'];
const DEFAULT_VIDEO_TEMPLATE_NAMES = {
  SEEDANCE_2_MULTI_PARAMETER: 'Seedance 2.0 多参数模式',
  UNIVERSAL_START_END: '通用首尾帧模式',
  UNIVERSAL_MULTI_PARAMETER: '通用多参数模式',
  WAN_26_SINGLE_IMAGE: 'Wan 2.6 单图首帧模式',
} as const;

function isModelPromptModelType(value: string): value is ModelPromptModelType {
  return MODEL_TYPES.includes(value as ModelPromptModelType);
}

function isModelPromptTemplateType(value: string): value is ModelPromptTemplateType {
  return TEMPLATE_TYPES.includes(value as ModelPromptTemplateType);
}

function templateTypeForModel(modelType: ModelPromptModelType): ModelPromptTemplateType {
  return modelType === 'image' ? 'imagePrompt' : 'videoPrompt';
}

function modelTypeForTemplate(templateType: ModelPromptTemplateType): ModelPromptModelType {
  return templateType === 'imagePrompt' ? 'image' : 'video';
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\r\n/g, '\n').trim();
}

function normalizeMode(value: string | null | undefined): string {
  return normalizeText(value);
}

function toTemplate(row: TemplateRow): ModelPromptTemplate {
  if (!isModelPromptTemplateType(row.type)) {
    throw createError(VT_STATUS.DATABASE_ERROR, `模型模板类型无效：${row.type}`);
  }

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    content: row.content,
    isBuiltin: row.is_builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    referenceCount: row.reference_count ?? 0,
  };
}

function toBinding(row: MappingRow, template: ModelPromptTemplate): ModelPromptBinding {
  if (!isModelPromptModelType(row.model_type)) {
    throw createError(VT_STATUS.DATABASE_ERROR, `模型类型无效：${row.model_type}`);
  }

  return {
    id: row.id,
    connectionId: row.connection_id,
    modelName: row.model_name,
    modelType: row.model_type,
    modelMode: row.model_mode,
    templateId: row.template_id,
    templateName: template.name,
    templateType: template.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function makeMappingKey(connectionId: string, modelName: string, modelType: string, modelMode = ''): string {
  return `${connectionId}\n${modelName}\n${modelType}\n${modelMode}`;
}

function parseModelId(modelId: string): { connectionId: string; modelName: string } {
  const [connectionId, modelName] = normalizeText(modelId).split(/:(.+)/);
  if (!connectionId || !modelName) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模型 ID 格式必须是 connectionId:modelName');
  }

  return { connectionId, modelName };
}

function getTemplates(): ModelPromptTemplate[] {
  const rows = getDatabase()
    .prepare<[], TemplateRow>(
      `
      SELECT
        t.id,
        t.name,
        t.type,
        t.content,
        t.is_builtin,
        t.created_at,
        t.updated_at,
        COUNT(m.id) as reference_count
      FROM model_prompt_templates t
      LEFT JOIN model_prompt_mappings m ON m.template_id = t.id
      GROUP BY t.id
      ORDER BY t.type ASC, t.id ASC
      `,
    )
    .all();

  return rows.map(toTemplate);
}

function getMappings(): MappingRow[] {
  return getDatabase()
    .prepare<[], MappingRow>('SELECT id, connection_id, model_name, model_type, model_mode, template_id, created_at, updated_at FROM model_prompt_mappings ORDER BY id ASC')
    .all();
}

function getTemplateById(id: number): ModelPromptTemplate | null {
  const row = getDatabase()
    .prepare<[number], TemplateRow>(
      `
      SELECT
        t.id,
        t.name,
        t.type,
        t.content,
        t.is_builtin,
        t.created_at,
        t.updated_at,
        COUNT(m.id) as reference_count
      FROM model_prompt_templates t
      LEFT JOIN model_prompt_mappings m ON m.template_id = t.id
      WHERE t.id = ?
      GROUP BY t.id
      LIMIT 1
      `,
    )
    .get(id);

  return row ? toTemplate(row) : null;
}

function getTemplateByName(type: ModelPromptTemplateType, name: string): ModelPromptTemplate | null {
  const row = getDatabase()
    .prepare<[string, string], TemplateRow>(
      `
      SELECT
        t.id,
        t.name,
        t.type,
        t.content,
        t.is_builtin,
        t.created_at,
        t.updated_at,
        COUNT(m.id) as reference_count
      FROM model_prompt_templates t
      LEFT JOIN model_prompt_mappings m ON m.template_id = t.id
      WHERE t.type = ? AND lower(t.name) = lower(?)
      GROUP BY t.id
      LIMIT 1
      `,
    )
    .get(type, name);

  return row ? toTemplate(row) : null;
}

function requireTemplate(id: number): ModelPromptTemplate {
  const template = getTemplateById(id);
  if (!template) {
    throw createError(VT_STATUS.NOT_FOUND, '模型提示词模板不存在');
  }

  return template;
}

function assertTemplateNameAvailable(name: string, type: ModelPromptTemplateType, excludeId?: number): void {
  const row = getDatabase()
    .prepare<[string, string, number], { id: number }>(
      'SELECT id FROM model_prompt_templates WHERE type = ? AND lower(name) = lower(?) AND id != ? LIMIT 1',
    )
    .get(type, name, excludeId ?? 0);

  if (row) {
    throw createError(VT_STATUS.CONFLICT, '同类型模板名称已存在');
  }
}

function validateTemplatePayload(payload: ModelPromptTemplateSavePayload): { id: number | null; name: string; type: ModelPromptTemplateType; content: string } {
  const id = payload.id === undefined ? null : Number(payload.id);
  if (id !== null && (!Number.isInteger(id) || id <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模板 id 无效');
  }

  const name = normalizeText(payload.name);
  if (!name) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模板名称不能为空');
  }

  if (!isModelPromptTemplateType(payload.type)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模板类型只支持 imagePrompt 或 videoPrompt');
  }

  const content = normalizeText(payload.content);
  if (!content) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模板内容不能为空');
  }

  return { id, name, type: payload.type, content };
}

function getReferences(templateId: number): MappingRow[] {
  return getDatabase()
    .prepare<[number], MappingRow>('SELECT id, connection_id, model_name, model_type, model_mode, template_id, created_at, updated_at FROM model_prompt_mappings WHERE template_id = ? ORDER BY id ASC')
    .all(templateId);
}

function getMappingByTarget(connectionId: string, modelName: string, modelType: ModelPromptModelType, modelMode: string): MappingRow | null {
  return getDatabase()
    .prepare<[string, string, string, string], MappingRow>(
      'SELECT id, connection_id, model_name, model_type, model_mode, template_id, created_at, updated_at FROM model_prompt_mappings WHERE connection_id = ? AND model_name = ? AND model_type = ? AND model_mode = ? LIMIT 1',
    )
    .get(connectionId, modelName, modelType, modelMode) ?? null;
}

function getTemplateForMapping(mapping: MappingRow, modelType: ModelPromptModelType): ModelPromptTemplate {
  const template = getTemplateById(mapping.template_id);
  if (!template) {
    throw createError(VT_STATUS.NOT_FOUND, '模型提示词映射指向的模板不存在');
  }

  if (modelTypeForTemplate(template.type) !== modelType) {
    throw createError(VT_STATUS.CONFLICT, '模型提示词模板类型和模型类型不匹配');
  }

  return template;
}

function findDefaultVideoPromptTemplate(modelName: string, modelMode: string): ModelPromptTemplate | null {
  const lowerModelName = modelName.toLowerCase();
  const lowerMode = modelMode.toLowerCase();
  const candidates: string[] = [];

  if (lowerModelName.includes('wan') && /2[._-]?6/.test(lowerModelName)) {
    candidates.push(DEFAULT_VIDEO_TEMPLATE_NAMES.WAN_26_SINGLE_IMAGE);
  }

  if (lowerModelName.includes('seedance') && (lowerModelName.includes('2.0') || lowerModelName.includes('2-0'))) {
    candidates.push(DEFAULT_VIDEO_TEMPLATE_NAMES.SEEDANCE_2_MULTI_PARAMETER);
  }

  if (
    lowerMode.includes(',') ||
    lowerMode.includes('imagereference') ||
    lowerMode.includes('videoreference') ||
    lowerMode.includes('audioreference') ||
    lowerMode === 'multireference'
  ) {
    candidates.push(DEFAULT_VIDEO_TEMPLATE_NAMES.UNIVERSAL_MULTI_PARAMETER);
  }

  if (['startendrequired', 'endframeoptional', 'startframeoptional'].includes(lowerMode)) {
    candidates.push(DEFAULT_VIDEO_TEMPLATE_NAMES.UNIVERSAL_START_END);
  }

  for (const name of candidates) {
    const template = getTemplateByName('videoPrompt', name);
    if (template) {
      return template;
    }
  }

  return null;
}

function formatReferenceList(rows: MappingRow[]): string {
  return rows
    .slice(0, 3)
    .map((row) => `${row.connection_id}/${row.model_name}${row.model_mode ? `/${row.model_mode}` : ''}`)
    .join('、');
}

function getModel(connectionId: string, modelName: string, modelType: ModelPromptModelType, modelMode: string): { connection: ApiConnection; matrixItem: ModelCapabilityMatrixItem } {
  const resource = getResourceConfig();
  const connection = resource.connections.find((item) => item.id === connectionId);
  if (!connection) {
    throw createError(VT_STATUS.NOT_FOUND, '模型连接不存在');
  }

  const modeMatched = resource.capabilityMatrix.find((item) =>
    item.connectionId === connectionId &&
    item.modelName === modelName &&
    item.modelType === modelType &&
    (item.modeKey === modelMode || !modelMode),
  );
  if (!modeMatched) {
    throw createError(VT_STATUS.MODEL_NOT_FOUND, '模型不存在或类型不匹配');
  }

  return { connection, matrixItem: modeMatched };
}

function buildModelItem(item: ModelCapabilityMatrixItem, mappings: Map<string, MappingRow>, templates: Map<number, ModelPromptTemplate>): ModelPromptModelItem {
  const modelType = item.modelType as ModelPromptModelType;
  const modelMode = item.modeKey;
  const mapping =
    mappings.get(makeMappingKey(item.connectionId, item.modelName, modelType, modelMode)) ??
    mappings.get(makeMappingKey(item.connectionId, item.modelName, modelType, ''));

  if (!mapping) {
    return {
      connectionId: item.connectionId,
      connectionName: item.connectionName,
      modelName: item.modelName,
      modelDisplayName: item.modelDisplayName,
      modelType,
      modelMode,
      binding: null,
      status: 'fallback',
      statusText: modelType === 'video' ? '使用视频默认提示词 fallback' : '未绑定专用模板',
    };
  }

  const template = templates.get(mapping.template_id);
  if (!template) {
    return {
      connectionId: item.connectionId,
      connectionName: item.connectionName,
      modelName: item.modelName,
      modelDisplayName: item.modelDisplayName,
      modelType,
      modelMode,
      binding: null,
      status: 'invalid-template',
      statusText: '绑定模板不存在',
    };
  }

  if (modelTypeForTemplate(template.type) !== modelType) {
    return {
      connectionId: item.connectionId,
      connectionName: item.connectionName,
      modelName: item.modelName,
      modelDisplayName: item.modelDisplayName,
      modelType,
      modelMode,
      binding: toBinding(mapping, template),
      status: 'type-mismatch',
      statusText: '模板类型不匹配',
    };
  }

  return {
    connectionId: item.connectionId,
    connectionName: item.connectionName,
    modelName: item.modelName,
    modelDisplayName: item.modelDisplayName,
    modelType,
    modelMode,
    binding: toBinding(mapping, template),
    status: 'bound',
    statusText: '已绑定专用模板',
  };
}

function buildInvalidMappings(mappings: MappingRow[], templates: Map<number, ModelPromptTemplate>, currentKeys: Set<string>): ModelPromptInvalidMapping[] {
  const invalid: ModelPromptInvalidMapping[] = [];

  for (const mapping of mappings) {
    const template = templates.get(mapping.template_id);
    const key = makeMappingKey(mapping.connection_id, mapping.model_name, mapping.model_type, mapping.model_mode);
    if (!isModelPromptModelType(mapping.model_type)) {
      invalid.push({
        id: mapping.id,
        connectionId: mapping.connection_id,
        modelName: mapping.model_name,
        modelType: 'image',
        modelMode: mapping.model_mode,
        templateId: mapping.template_id,
        templateName: template?.name ?? '模板不存在',
        reason: 'type-mismatch',
        reasonText: '映射模型类型无效',
      });
      continue;
    }

    if (!currentKeys.has(key)) {
      invalid.push({
        id: mapping.id,
        connectionId: mapping.connection_id,
        modelName: mapping.model_name,
        modelType: mapping.model_type,
        modelMode: mapping.model_mode,
        templateId: mapping.template_id,
        templateName: template?.name ?? '模板不存在',
        reason: 'model-missing',
        reasonText: '模型或连接不存在',
      });
      continue;
    }

    if (!template) {
      invalid.push({
        id: mapping.id,
        connectionId: mapping.connection_id,
        modelName: mapping.model_name,
        modelType: mapping.model_type,
        modelMode: mapping.model_mode,
        templateId: mapping.template_id,
        templateName: '模板不存在',
        reason: 'template-missing',
        reasonText: '绑定模板不存在',
      });
      continue;
    }

    if (modelTypeForTemplate(template.type) !== mapping.model_type) {
      invalid.push({
        id: mapping.id,
        connectionId: mapping.connection_id,
        modelName: mapping.model_name,
        modelType: mapping.model_type,
        modelMode: mapping.model_mode,
        templateId: mapping.template_id,
        templateName: template.name,
        reason: 'type-mismatch',
        reasonText: '模板类型和模型类型不匹配',
      });
    }
  }

  return invalid;
}

export function getModelPromptConfig(): ModelPromptConfigResult {
  const templates = getTemplates();
  const mappings = getMappings();
  const templateMap = new Map(templates.map((template) => [template.id, template]));
  const mappingMap = new Map(mappings.map((mapping) => [makeMappingKey(mapping.connection_id, mapping.model_name, mapping.model_type, mapping.model_mode), mapping]));
  const currentKeys = new Set<string>();
  const connectionMap = new Map<string, ModelPromptConnectionGroup>();
  const resource = getResourceConfig();

  for (const item of resource.capabilityMatrix) {
    if (!isModelPromptModelType(item.modelType)) {
      continue;
    }

    currentKeys.add(makeMappingKey(item.connectionId, item.modelName, item.modelType, item.modeKey));
    currentKeys.add(makeMappingKey(item.connectionId, item.modelName, item.modelType, ''));

    let group = connectionMap.get(item.connectionId);
    if (!group) {
      const connection = resource.connections.find((current) => current.id === item.connectionId);
      group = {
        connectionId: item.connectionId,
        connectionName: item.connectionName,
        connectionStatus: connection?.status ?? item.status,
        connectionStatusText: connection?.statusText ?? item.statusText,
        models: [],
      };
      connectionMap.set(item.connectionId, group);
    }

    group.models.push(buildModelItem(item, mappingMap, templateMap));
  }

  return {
    templates,
    connections: [...connectionMap.values()],
    invalidMappings: buildInvalidMappings(mappings, templateMap, currentKeys),
  };
}

export function resolveModelPromptTemplate(input: {
  modelId: string;
  modelType: ModelPromptModelType;
  modelMode?: string | null;
}): ResolvedModelPromptTemplate | null {
  if (!isModelPromptModelType(input.modelType)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模型类型只支持 image/video');
  }

  const { connectionId, modelName } = parseModelId(input.modelId);
  const modelMode = normalizeMode(input.modelMode);
  getModel(connectionId, modelName, input.modelType, modelMode);

  const mapping =
    getMappingByTarget(connectionId, modelName, input.modelType, modelMode) ??
    (modelMode ? getMappingByTarget(connectionId, modelName, input.modelType, '') : null);

  if (mapping) {
    return {
      template: getTemplateForMapping(mapping, input.modelType),
      source: 'mapping',
      connectionId,
      modelName,
      modelType: input.modelType,
      modelMode,
    };
  }

  if (input.modelType === 'video') {
    const defaultTemplate = findDefaultVideoPromptTemplate(modelName, modelMode);
    if (defaultTemplate) {
      return {
        template: defaultTemplate,
        source: 'default',
        connectionId,
        modelName,
        modelType: input.modelType,
        modelMode,
      };
    }
  }

  return null;
}

export function saveModelPromptTemplate(payload: ModelPromptTemplateSavePayload): ModelPromptTemplateSaveResult {
  const draft = validateTemplatePayload(payload);
  assertTemplateNameAvailable(draft.name, draft.type, draft.id ?? undefined);
  const now = Date.now();

  if (draft.id === null) {
    const result = getDatabase()
      .prepare<[string, string, string, number, number, number]>(
        'INSERT INTO model_prompt_templates (name, type, content, is_builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(draft.name, draft.type, draft.content, 0, now, now);

    return { template: requireTemplate(Number(result.lastInsertRowid)) };
  }

  const current = requireTemplate(draft.id);
  if (current.isBuiltin) {
    throw createError(VT_STATUS.FORBIDDEN, '内置模型模板不能编辑');
  }

  const references = getReferences(current.id);
  if (references.length > 0 && current.type !== draft.type) {
    throw createError(VT_STATUS.CONFLICT, '模板已被模型引用，不能修改类型');
  }

  getDatabase()
    .prepare<[string, string, string, number, number]>('UPDATE model_prompt_templates SET name = ?, type = ?, content = ?, updated_at = ? WHERE id = ?')
    .run(draft.name, draft.type, draft.content, now, draft.id);

  return { template: requireTemplate(draft.id) };
}

export function deleteModelPromptTemplate(payload: ModelPromptTemplateDeletePayload): ModelPromptTemplateDeleteResult {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模板 id 无效');
  }

  const template = requireTemplate(id);
  if (template.isBuiltin) {
    throw createError(VT_STATUS.FORBIDDEN, '内置模型模板不能删除');
  }

  const references = getReferences(id);
  if (references.length > 0) {
    throw createError(VT_STATUS.CONFLICT, `模板正在被 ${formatReferenceList(references)} 引用，请先清除绑定`);
  }

  getDatabase().prepare<[number]>('DELETE FROM model_prompt_templates WHERE id = ?').run(id);
  return { templateId: id };
}

export function bindModelPromptTemplate(payload: ModelPromptBindPayload): ModelPromptBindResult {
  if (!isModelPromptModelType(payload.modelType)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模型类型只支持 image/video');
  }

  const connectionId = normalizeText(payload.connectionId);
  const modelName = normalizeText(payload.modelName);
  const modelMode = normalizeMode(payload.modelMode);
  if (!connectionId || !modelName) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模型连接和模型名称不能为空');
  }

  getModel(connectionId, modelName, payload.modelType, modelMode);
  const template = requireTemplate(Number(payload.templateId));
  if (template.type !== templateTypeForModel(payload.modelType)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模板类型和模型类型不匹配');
  }

  const now = Date.now();
  getDatabase()
    .prepare<[string, string, string, string, number, number, number]>(
      `
      INSERT INTO model_prompt_mappings
        (connection_id, model_name, model_type, model_mode, template_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(connection_id, model_name, model_type, model_mode)
      DO UPDATE SET template_id = excluded.template_id, updated_at = excluded.updated_at
      `,
    )
    .run(connectionId, modelName, payload.modelType, modelMode, template.id, now, now);

  const row = getDatabase()
    .prepare<[string, string, string, string], MappingRow>(
      'SELECT id, connection_id, model_name, model_type, model_mode, template_id, created_at, updated_at FROM model_prompt_mappings WHERE connection_id = ? AND model_name = ? AND model_type = ? AND model_mode = ? LIMIT 1',
    )
    .get(connectionId, modelName, payload.modelType, modelMode);
  if (!row) {
    throw createError(VT_STATUS.DATABASE_ERROR, '模型模板绑定保存失败');
  }

  return { binding: toBinding(row, template) };
}

export function clearModelPromptBinding(payload: ModelPromptClearBindingPayload): ModelPromptClearBindingResult {
  if (!isModelPromptModelType(payload.modelType)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模型类型只支持 image/video');
  }

  const result = getDatabase()
    .prepare<[string, string, string, string]>(
      'DELETE FROM model_prompt_mappings WHERE connection_id = ? AND model_name = ? AND model_type = ? AND model_mode = ?',
    )
    .run(normalizeText(payload.connectionId), normalizeText(payload.modelName), payload.modelType, normalizeMode(payload.modelMode));

  return { cleared: result.changes > 0 };
}
