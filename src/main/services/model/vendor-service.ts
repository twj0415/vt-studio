import { VT_STATUS } from '@shared/constants/status';
import { getDatabase } from '../database/connection';
import { createError } from '../result';
import { parseJsonObject, parseModelList, readVendorCode, upsertVendorRecord, writeVendorCode, type VendorRow } from './storage';
import type { VendorManifest, VendorModelConfig, VendorRecord, VendorRuntime } from './types';
import { assertVendorRequiredInputs, normalizeVendorManifest } from './validation';
import { runVendorCode, validateVendorRuntime, type VendorRunnerPolicy } from './vendor-runner';
import { createBuiltinVendorRuntime, getBuiltinVendorDefinition, isBuiltinVendor } from './builtin-vendors';
import { CONNECTION_PROJECTION_ADAPTER_KEY, CONNECTION_PROJECTION_NAME_KEY } from './connection-projection';

function mergeModels(baseModels: VendorModelConfig[], customModels: VendorModelConfig[]): VendorModelConfig[] {
  const map = new Map<string, VendorModelConfig>();

  for (const model of [...baseModels, ...customModels]) {
    map.set(model.modelName, model);
  }

  return [...map.values()];
}

function applyRuntimeVendorManifest(runtime: VendorRuntime, manifest: VendorManifest): VendorRuntime {
  const normalized = normalizeVendorManifest(manifest);

  if (runtime.vendor) {
    Object.assign(runtime.vendor, normalized);
  } else {
    runtime.vendor = normalized;
  }

  return runtime;
}

function normalizeConnectionBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? '').trim().replace(/\/+$/, '');
}

function normalizeOpenAiCompatibleBaseUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    let pathname = parsed.pathname.replace(/\/+$/, '');
    pathname = pathname.replace(/\/(chat\/completions|responses|completions|images\/generations|images\/edits)$/i, '');

    if (!pathname || pathname === '/') {
      pathname = '/v1';
    }

    return `${parsed.origin}${pathname}`;
  } catch {
    return baseUrl;
  }
}

function toAtlasCloudChatBaseUrl(baseUrl: string | undefined): string {
  const normalized = normalizeConnectionBaseUrl(baseUrl);
  if (!normalized) {
    return 'https://api.atlascloud.ai/v1';
  }

  if (/\/api\/v1$/i.test(normalized)) {
    return normalized.replace(/\/api\/v1$/i, '/v1');
  }

  return normalizeOpenAiCompatibleBaseUrl(normalized);
}

function toAtlasCloudMediaBaseUrl(baseUrl: string | undefined): string {
  const normalized = normalizeConnectionBaseUrl(baseUrl);
  if (!normalized) {
    return 'https://api.atlascloud.ai/api/v1';
  }

  if (/\/api\/v1$/i.test(normalized)) {
    return normalized;
  }

  if (/\/v1$/i.test(normalized)) {
    return normalized.replace(/\/v1$/i, '/api/v1');
  }

  return `${normalized}/api/v1`;
}

function enrichConnectionInputValues(adapterVendorId: string, inputValues: Record<string, string>): Record<string, string> {
  if (adapterVendorId !== 'atlascloud') {
    return inputValues;
  }

  const baseUrl = inputValues.baseUrl || inputValues.endpoint;
  return {
    ...inputValues,
    chatBaseUrl: inputValues.chatBaseUrl || toAtlasCloudChatBaseUrl(baseUrl),
    mediaBaseUrl: inputValues.mediaBaseUrl || toAtlasCloudMediaBaseUrl(baseUrl),
  };
}

function parseAllowedHosts(inputValues: Record<string, string>): string[] {
  const raw = inputValues.allowHosts || inputValues.__allowHosts || '';
  return raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).hostname;
      } catch {
        return value;
      }
    });
}

function createVendorRunnerPolicy(inputValues: Record<string, string>): VendorRunnerPolicy {
  return {
    allowedHosts: parseAllowedHosts(inputValues),
  };
}

function createConnectionRuntimeFromAdapter(input: {
  connectionId: string;
  connectionName: string;
  adapterVendorId: string;
  inputValues: Record<string, string>;
  models: VendorManifest['models'];
}): { runtime: VendorRuntime; codeReady: boolean } | null {
  const inputValues = enrichConnectionInputValues(input.adapterVendorId, input.inputValues);
  const adapterRow = getDatabase().prepare<[string], VendorRow>('SELECT * FROM model_vendors WHERE id = ? LIMIT 1').get(input.adapterVendorId);
  const adapterRuntime = adapterRow
    ? getVendorRuntimeFromRow(adapterRow)
    : {
        code: '',
        codeReady: false,
        runtime: createBuiltinVendorRuntime(input.adapterVendorId, inputValues, getBuiltinVendorDefinition(input.adapterVendorId)?.manifest.models ?? []),
      };
  const builtin = getBuiltinVendorDefinition(input.adapterVendorId);

  if (builtin && !adapterRuntime.codeReady) {
    adapterRuntime.runtime = createBuiltinVendorRuntime(
      input.adapterVendorId,
      inputValues,
      mergeModels(builtin.manifest.models, adapterRow ? parseModelList(adapterRow.models) : []),
    )!;
  }

  if (!adapterRuntime.runtime?.vendor) {
    return null;
  }

  return {
    runtime: applyRuntimeVendorManifest(adapterRuntime.runtime, {
      ...adapterRuntime.runtime.vendor,
      id: input.connectionId,
      name: input.connectionName,
      inputValues,
      models: input.models,
    }),
    codeReady: adapterRuntime.codeReady,
  };
}

function getVendorRuntimeFromRow(row: VendorRow): { code: string; runtime: VendorRuntime; codeReady: boolean } {
  const inputValues = parseJsonObject(row.input_values);

  try {
    const code = readVendorCode(row.id);
    return {
      code,
      codeReady: true,
      runtime: validateVendorRuntime(runVendorCode(code, createVendorRunnerPolicy(inputValues))),
    };
  } catch (error) {
    const builtin = getBuiltinVendorDefinition(row.id);
    if (!builtin) {
      const adapterVendorId = inputValues[CONNECTION_PROJECTION_ADAPTER_KEY];
      const connectionName = inputValues[CONNECTION_PROJECTION_NAME_KEY] || row.id;
      const connectionRuntime = adapterVendorId
        ? createConnectionRuntimeFromAdapter({
            connectionId: row.id,
            connectionName,
            adapterVendorId,
            inputValues,
            models: parseModelList(row.models),
          })
        : null;

      if (connectionRuntime) {
        return {
          code: '',
          codeReady: false,
          runtime: connectionRuntime.runtime,
        };
      }

      throw error;
    }

    return {
      code: '',
      codeReady: false,
      runtime: createBuiltinVendorRuntime(row.id, parseJsonObject(row.input_values), mergeModels(builtin.manifest.models, parseModelList(row.models)))!,
    };
  }
}

function rowToVendorRecord(row: VendorRow): VendorRecord {
  const { code, runtime, codeReady } = getVendorRuntimeFromRow(row);
  const manifest = normalizeVendorManifest(runtime.vendor);
  const inputValues = { ...manifest.inputValues, ...parseJsonObject(row.input_values) };
  const models = mergeModels(manifest.models, parseModelList(row.models));

  return {
    id: row.id,
    inputValues,
    models,
    enabled: row.enabled === 1,
    code,
    codeReady,
    builtin: isBuiltinVendor(row.id),
    manifest: {
      ...manifest,
      inputValues,
      models,
    },
  };
}

export function validateVendorCode(code: string): VendorManifest {
  return validateVendorRuntime(runVendorCode(code)).vendor!;
}

export function addVendorFromCode(code: string): VendorManifest {
  const manifest = validateVendorCode(code);
  const existing = getDatabase().prepare<[string], { id: string } | undefined>('SELECT id FROM model_vendors WHERE id = ? LIMIT 1').get(manifest.id);

  if (existing) {
    throw createError(VT_STATUS.CONFLICT, '供应商 ID 已存在');
  }

  writeVendorCode(manifest.id, code);
  upsertVendorRecord({
    id: manifest.id,
    inputValues: manifest.inputValues,
    models: [],
    enabled: manifest.id === 'toonflow',
  });

  return manifest;
}

export function updateVendorCode(vendorId: string, code: string): VendorManifest {
  const manifest = validateVendorCode(code);
  const row = getVendorRowRequired(vendorId);

  if (isBuiltinVendor(row.id) && manifest.id !== row.id) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '内置供应商 adapter 的 id 不能变更');
  }

  writeVendorCode(row.id, code);
  getDatabase()
    .prepare<[string, number, string]>('UPDATE model_vendors SET models = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(manifest.models ?? []), Date.now(), row.id);

  return manifest;
}

export function getVendorRowRequired(vendorId: string): VendorRow {
  const row = getDatabase().prepare<[string], VendorRow>('SELECT * FROM model_vendors WHERE id = ? LIMIT 1').get(vendorId);

  if (!row) {
    throw createError(VT_STATUS.MODEL_VENDOR_NOT_FOUND);
  }

  return row;
}

export function getVendor(vendorId: string): VendorRecord {
  return rowToVendorRecord(getVendorRowRequired(vendorId));
}

export function getVendorRuntime(vendorId: string): VendorRuntime {
  const row = getVendorRowRequired(vendorId);
  const vendor = rowToVendorRecord(row);
  const runtime = getVendorRuntimeFromRow(row).runtime;

  if (!runtime) {
    throw createError(VT_STATUS.MODEL_VENDOR_NOT_FOUND);
  }

  applyRuntimeVendorManifest(runtime, {
    ...vendor.manifest,
    inputValues: vendor.inputValues,
    models: vendor.models,
  });

  if (!runtime.vendor) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '供应商运行时缺少 vendor 配置');
  }

  assertVendorRequiredInputs(runtime.vendor, vendor.inputValues);

  return runtime;
}

export function getVendorModelList(vendorId: string): VendorModelConfig[] {
  return getVendor(vendorId).models;
}

export function listVendors(): VendorRecord[] {
  const rows = getDatabase().prepare<[], VendorRow>('SELECT * FROM model_vendors').all();
  return rows.map(rowToVendorRecord);
}

export function updateVendorInputs(vendorId: string, inputValues: Record<string, string>): void {
  const row = getVendorRowRequired(vendorId);
  const vendor = rowToVendorRecord(row);
  const nextInputValues = { ...vendor.inputValues, ...inputValues };

  getDatabase()
    .prepare<[string, number, string]>('UPDATE model_vendors SET input_values = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(nextInputValues), Date.now(), vendorId);
}

export function setVendorEnabled(vendorId: string, enabled: boolean): void {
  getVendorRowRequired(vendorId);
  getDatabase()
    .prepare<[number, number, string]>('UPDATE model_vendors SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, Date.now(), vendorId);
}
