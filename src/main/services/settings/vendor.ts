import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { VT_STATUS } from '@shared/constants/status';
import { hasConfiguredSecret, isSensitiveInput, maskSecret } from '@shared/security/secrets';
import type {
  VendorAddCodePayload,
  VendorAddCodeResult,
  VendorCodePayload,
  VendorCodeResult,
  VendorDeleteModelPayload,
  VendorDeleteModelResult,
  VendorDeletePayload,
  VendorDeleteResult,
  VendorListItem,
  VendorListResult,
  VendorModelPayload,
  VendorModelSaveResult,
  VendorSetEnabledPayload,
  VendorSetEnabledResult,
  VendorTestImagePayload,
  VendorTestMediaResult,
  VendorTestTextPayload,
  VendorTestTextResult,
  VendorTestVideoPayload,
  VendorUpdateCodeResult,
  VendorUpdateInputsPayload,
  VendorUpdateInputsResult,
} from '@shared/types/vendor';
import { getDatabase } from '../database';
import { deleteManagedFile, getRuntimeDirectories } from '../file-system';
import { createError } from '../result';
import {
  addVendorFromCode,
  getVendor,
  setVendorEnabled,
  updateVendorCode,
  updateVendorInputs,
  validateVendorCode,
} from '../model/vendor-service';
import { getBuiltinVendorDefinition, getBuiltinVendorIds, isBuiltinVendor } from '../model/builtin-vendors';
import { getConnectionProjectionMeta, isConnectionProjectionId } from '../model/connection-projection';
import { getVendorCodePath, getVendorCodeRelativePath, getVendorRows, parseJsonObject, parseModelList } from '../model/storage';
import type { VendorManifest, VendorModelConfig, VideoMode } from '../model/types';
import { normalizeVendorManifest } from '../model/validation';

interface ReferenceItem {
  type: 'agent' | 'project' | 'modelPrompt';
  name: string;
  detail: string;
}

function ensureBuiltinVendorRows(): void {
  const now = Date.now();
  const stmt = getDatabase().prepare<[string, string, string, number, number, number]>(
    'INSERT INTO model_vendors (id, input_values, models, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );

  for (const id of getBuiltinVendorIds()) {
    const exists = getDatabase().prepare<[string], { n: number }>('SELECT COUNT(*) as n FROM model_vendors WHERE id = ?').get(id);
    if (!exists || exists.n === 0) {
      stmt.run(id, '{}', '[]', 0, now, now);
    }
  }
}

function toStatusText(error: unknown): string {
  return error instanceof Error ? error.message : '供应商配置不可用';
}

function getVendorCapabilities(vendorId: string, models: VendorModelConfig[]): VendorListItem['capabilities'] {
  const builtin = getBuiltinVendorDefinition(vendorId);
  if (builtin) {
    return [...builtin.capabilities];
  }

  return [...new Set(models.map((model) => model.type))] as VendorListItem['capabilities'];
}

function getAdapterMd5(vendorId: string): string | null {
  const codePath = getVendorCodePath(vendorId);
  if (!existsSync(codePath)) {
    return null;
  }

  return createHash('md5').update(readFileSync(codePath)).digest('hex');
}

function manifestToListItem(
  manifest: VendorManifest,
  row: { id: string; enabled: number; input_values: string; models: string; updated_at: number },
  status: VendorListItem['status'],
  codeReady: boolean,
  statusText: string,
): VendorListItem {
  const inputValues = { ...manifest.inputValues, ...parseJsonObject(row.input_values) };
  const publicInputValues: Record<string, string> = {};
  const inputConfigured: Record<string, boolean> = {};
  const inputMasked: Record<string, string> = {};

  for (const input of manifest.inputs) {
    const value = inputValues[input.key] ?? '';
    if (isSensitiveInput(input)) {
      publicInputValues[input.key] = '';
      inputConfigured[input.key] = hasConfiguredSecret(value);
      inputMasked[input.key] = maskSecret(value);
    } else {
      publicInputValues[input.key] = value;
    }
  }

  const models = parseModelList(row.models);
  const mergedModels = mergeModels(manifest.models, models);
  const builtin = isBuiltinVendor(manifest.id);
  const projectionMeta = getConnectionProjectionMeta(row);
  const readOnly = Boolean(projectionMeta) || isConnectionProjectionId(row.id);

  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    icon: manifest.icon,
    author: manifest.author,
    version: manifest.version,
    enabled: row.enabled === 1,
    builtin,
    managedBy: readOnly ? 'model-service' : null,
    readOnly,
    codeEditable: readOnly ? false : !builtin || codeReady,
    codeReady,
    status,
    statusText: readOnly ? '由模型服务生成，请到模型服务里修改' : statusText,
    adapterMd5: getAdapterMd5(row.id),
    adapterUpdatedAt: row.updated_at,
    lastError: status === 'ready' ? null : statusText,
    capabilities: getVendorCapabilities(manifest.id, mergedModels),
    inputs: manifest.inputs,
    inputValues: publicInputValues,
    inputConfigured,
    inputMasked,
    models: mergedModels,
  };
}

function mergeModels(baseModels: VendorModelConfig[], customModels: VendorModelConfig[]): VendorModelConfig[] {
  const map = new Map<string, VendorModelConfig>();
  for (const model of [...baseModels, ...customModels]) {
    map.set(model.modelName, model);
  }

  return [...map.values()];
}

function toSerializableVendorListResult(result: VendorListResult): VendorListResult {
  return JSON.parse(JSON.stringify(result)) as VendorListResult;
}

function getFallbackManifest(vendorId: string): VendorManifest {
  const builtin = getBuiltinVendorDefinition(vendorId);
  if (builtin) {
    return normalizeVendorManifest(builtin.manifest);
  }

  return {
    id: vendorId,
    name: vendorId,
    author: 'Unknown',
    description: '供应商 adapter 不可用',
    inputs: [],
    inputValues: {},
    models: [],
  };
}

function getVendorReferences(vendorId: string, modelName?: string): ReferenceItem[] {
  const references: ReferenceItem[] = [];
  const rows = getDatabase()
    .prepare<[string, string], { key: string; name: string | null; model_id: string | null }>(
      'SELECT key, name, model_id FROM agent_model_configs WHERE vendor_id = ? OR model_id LIKE ?',
    )
    .all(vendorId, `${vendorId}:%`);

  for (const row of rows) {
    if (modelName && row.model_id !== `${vendorId}:${modelName}`) {
      continue;
    }

    references.push({
      type: 'agent',
      name: row.name ?? row.key,
      detail: row.model_id ?? vendorId,
    });
  }

  return references;
}

function assertNoReferences(vendorId: string, modelName?: string): void {
  const references = getVendorReferences(vendorId, modelName);
  if (references.length === 0) {
    return;
  }

  const first = references[0];
  throw createError(VT_STATUS.CONFLICT, `当前配置仍被 ${first.name} 引用，请先解除引用后再删除`);
}

function assertEditableVendor(vendorId: string): void {
  if (isBuiltinVendor(vendorId)) {
    throw createError(VT_STATUS.FORBIDDEN, '内置供应商不能删除，请使用禁用');
  }
}

function getConnectionProjectionVendorMeta(vendorId: string): ReturnType<typeof getConnectionProjectionMeta> {
  const row = getDatabase()
    .prepare<[string], { id: string; input_values: string } | undefined>('SELECT id, input_values FROM model_vendors WHERE id = ? LIMIT 1')
    .get(vendorId);

  return row ? getConnectionProjectionMeta(row) : null;
}

function assertNotConnectionProjection(vendorId: string, action: string): void {
  if (isConnectionProjectionId(vendorId) || getConnectionProjectionVendorMeta(vendorId)) {
    throw createError(VT_STATUS.FORBIDDEN, `模型服务生成的运行投影不能直接${action}，请到模型服务里修改连接`);
  }
}

function assertModelPayload(model: VendorModelConfig): VendorModelConfig {
  const normalized = normalizeVendorManifest({
    id: 'payload',
    name: 'payload',
    author: 'payload',
    inputs: [],
    inputValues: {},
    models: [model],
  });

  return normalized.models[0];
}

function normalizeOpenAiVendorBaseUrl(baseUrl: string): string {
  const value = baseUrl.trim();
  if (!value) {
    return value;
  }

  try {
    const parsed = new URL(value);
    let pathname = parsed.pathname.replace(/\/+$/, '');
    pathname = pathname.replace(/\/(chat\/completions|responses|completions)$/i, '');

    if (!pathname || pathname === '/') {
      pathname = '/v1';
    }

    return `${parsed.origin}${pathname}`;
  } catch {
    return value;
  }
}

function normalizeVendorInputValues(vendorId: string, inputValues: Record<string, string>): Record<string, string> {
  if (vendorId !== 'openai' || typeof inputValues.baseUrl !== 'string') {
    return inputValues;
  }

  return {
    ...inputValues,
    baseUrl: normalizeOpenAiVendorBaseUrl(inputValues.baseUrl),
  };
}

function normalizeModelPayload(model: VendorModelPayload['model']): VendorModelConfig {
  if (model.type !== 'video') {
    return assertModelPayload(model as VendorModelConfig);
  }

  const videoModel: VendorModelConfig = {
    ...model,
    mode: model.mode.map((mode) => {
      if (Array.isArray(mode)) {
        return mode as VideoMode;
      }

      return mode as VideoMode;
    }),
  };

  return assertModelPayload(videoModel);
}

function updateVendorModels(vendorId: string, updater: (models: VendorModelConfig[]) => VendorModelConfig[]): void {
  const vendor = getVendor(vendorId);
  const nextModels = updater(vendor.models);
  getDatabase()
    .prepare<[string, number, string]>('UPDATE model_vendors SET models = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(nextModels), Date.now(), vendorId);
}

export function getVendorList(): VendorListResult {
  ensureBuiltinVendorRows();

  const rows = getVendorRows();
  const vendors: VendorListItem[] = rows.map((row) => {
    try {
      const vendor = getVendor(row.id);
      return manifestToListItem(vendor.manifest, row, 'ready', vendor.codeReady, vendor.codeReady ? 'adapter 已加载' : '内置 adapter');
    } catch (error) {
      const codePath = getVendorCodePath(row.id);
      return manifestToListItem(
        getFallbackManifest(row.id),
        row,
        existsSync(codePath) ? 'invalid' : 'missing-code',
        false,
        toStatusText(error),
      );
    }
  });

  return toSerializableVendorListResult({ vendors });
}

export function saveVendorInputs(payload: VendorUpdateInputsPayload): VendorUpdateInputsResult {
  assertNotConnectionProjection(payload.vendorId, '保存参数');
  const vendor = getVendor(payload.vendorId);
  const sanitized: Record<string, string> = {};
  for (const input of vendor.manifest.inputs) {
    const value = payload.inputValues[input.key];
    if (typeof value !== 'string') {
      continue;
    }

    if (isSensitiveInput(input) && value.trim() === '' && hasConfiguredSecret(vendor.inputValues[input.key])) {
      continue;
    }

    sanitized[input.key] = value;
  }

  updateVendorInputs(payload.vendorId, normalizeVendorInputValues(payload.vendorId, sanitized));
  return { vendorId: payload.vendorId };
}

export function saveVendorEnabled(payload: VendorSetEnabledPayload): VendorSetEnabledResult {
  assertNotConnectionProjection(payload.vendorId, payload.enabled ? '启用' : '禁用');
  getVendor(payload.vendorId);
  setVendorEnabled(payload.vendorId, payload.enabled);
  return { vendorId: payload.vendorId, enabled: payload.enabled };
}

export function saveVendorModel(payload: VendorModelPayload): VendorModelSaveResult {
  assertNotConnectionProjection(payload.vendorId, '编辑模型');
  const model = normalizeModelPayload(payload.model);

  updateVendorModels(payload.vendorId, (models) => {
    const originalModelName = payload.originalModelName ?? model.modelName;
    const duplicate = models.find((item) => item.modelName === model.modelName && item.modelName !== originalModelName);
    if (duplicate) {
      throw createError(VT_STATUS.CONFLICT, '同一供应商下模型 ID 已存在');
    }

    const exists = models.some((item) => item.modelName === originalModelName);
    if (!exists) {
      return [...models, model];
    }

    return models.map((item) => (item.modelName === originalModelName ? model : item));
  });

  return { vendorId: payload.vendorId, modelName: model.modelName };
}

export function deleteVendorModel(payload: VendorDeleteModelPayload): VendorDeleteModelResult {
  assertNotConnectionProjection(payload.vendorId, '删除模型');
  assertNoReferences(payload.vendorId, payload.modelName);

  updateVendorModels(payload.vendorId, (models) => {
    if (!models.some((item) => item.modelName === payload.modelName)) {
      throw createError(VT_STATUS.MODEL_NOT_FOUND, '模型不存在');
    }

    return models.filter((item) => item.modelName !== payload.modelName);
  });

  return { vendorId: payload.vendorId, modelName: payload.modelName };
}

export function getVendorCode(payload: VendorDeletePayload): VendorCodeResult {
  assertNotConnectionProjection(payload.vendorId, '编辑 adapter');
  const vendor = getVendor(payload.vendorId);
  if (!vendor.codeReady && isBuiltinVendor(vendor.id)) {
    throw createError(VT_STATUS.FORBIDDEN, '内置供应商当前使用固定 adapter，不提供代码编辑');
  }

  return {
    vendorId: vendor.id,
    code: vendor.code,
    editable: !isBuiltinVendor(vendor.id) || vendor.codeReady,
  };
}

export function addVendorCode(payload: VendorAddCodePayload): VendorAddCodeResult {
  const manifest = validateVendorCode(payload.code);
  if (isConnectionProjectionId(manifest.id)) {
    throw createError(VT_STATUS.FORBIDDEN, '自定义供应商 ID 不能使用 conn_ 前缀');
  }

  addVendorFromCode(payload.code);
  return { vendorId: manifest.id };
}

export function saveVendorCode(payload: VendorCodePayload): VendorUpdateCodeResult {
  assertNotConnectionProjection(payload.vendorId, '保存 adapter');
  updateVendorCode(payload.vendorId, payload.code);
  return { vendorId: payload.vendorId };
}

export function deleteVendor(payload: VendorDeletePayload): VendorDeleteResult {
  assertNotConnectionProjection(payload.vendorId, '删除');
  assertEditableVendor(payload.vendorId);
  assertNoReferences(payload.vendorId);
  getVendor(payload.vendorId);

  getDatabase().prepare<[string]>('DELETE FROM model_vendors WHERE id = ?').run(payload.vendorId);
  const codePath = getVendorCodePath(payload.vendorId);
  if (existsSync(codePath)) {
    deleteManagedFile(getRuntimeDirectories().vendors, getVendorCodeRelativePath(payload.vendorId));
  }
  return { vendorId: payload.vendorId };
}

export async function runVendorTextTest(payload: VendorTestTextPayload): Promise<VendorTestTextResult> {
  const { testTextModel } = await import('../model/test');
  const startedAt = Date.now();
  const result = await testTextModel({
    vendorId: payload.vendorId,
    modelName: payload.modelName,
    messages: [{ role: 'user', content: payload.prompt }],
    think: payload.reasoningEnabled,
    reasoningEffort: payload.reasoningEffort,
  });

  return { ...result, durationMs: Date.now() - startedAt };
}

export async function runVendorImageTest(payload: VendorTestImagePayload): Promise<VendorTestMediaResult> {
  const { testImageModel } = await import('../model/test');
  const startedAt = Date.now();
  const result = await testImageModel(payload);
  return { ...result, durationMs: Date.now() - startedAt };
}

export async function runVendorVideoTest(payload: VendorTestVideoPayload): Promise<VendorTestMediaResult> {
  const { testVideoModel } = await import('../model/test');
  const startedAt = Date.now();
  const result = await testVideoModel({
    vendorId: payload.vendorId,
    modelName: payload.modelName,
    mode: payload.mode,
    prompt: payload.prompt,
    duration: payload.duration,
    resolution: payload.resolution,
    aspectRatio: payload.aspectRatio,
    audio: payload.audio,
    referenceImages: payload.referenceImages,
    images: [],
    videos: [],
    audios: [],
  });
  return { ...result, durationMs: Date.now() - startedAt };
}
