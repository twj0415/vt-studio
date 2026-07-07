import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { dialog } from 'electron';
import { jsonSchema, tool } from 'ai';
import { DEPENDENCY_STATUSES } from '@shared/constants/dictionaries';
import { VT_STATUS } from '@shared/constants/status';
import { normalizeUnknownError } from '@shared/errors';
import {
  SCRIPT_EXTRACT_STATUS,
  SCRIPT_EXTRACT_STATUS_VALUES,
  type ScriptExtractStatus,
} from '@shared/types/script-agent';
import {
  SCRIPT_ASSET_TYPE_VALUES,
  type ScriptAssetItem,
  type ScriptAssetType,
  type ScriptBatchCreatePayload,
  type ScriptBatchCreateResult,
  type ScriptBatchDeletePayload,
  type ScriptDeletePayload,
  type ScriptDeleteResult,
  type ScriptExportZipPayload,
  type ScriptExportZipResult,
  type ScriptExtractAssetsPayload,
  type ScriptExtractAssetsResult,
  type ScriptGenerateParseRegexPayload,
  type ScriptGenerateParseRegexResult,
  type ScriptItem,
  type ScriptListPayload,
  type ScriptListResult,
  type ScriptPollExtractStatusPayload,
  type ScriptPollExtractStatusResult,
  type ScriptRecoverExtractStatusResult,
  type ScriptSavePayload,
  type ScriptSaveResult,
} from '@shared/types/script';
import { getDatabase, withTransaction } from '../database';
import { createModelRequestId, invokeText } from '../model';
import { createError } from '../result';
import { getBusinessSettings } from '../settings/business-settings';
import { getEffectivePromptByType } from '../settings/prompt';
import { stripThink } from '../socket/stripThink';
import { createTask, failTask, succeedTask, updateTaskMeta } from '../task';
import { logger } from '../logger';
import {
  DEPENDENCY_REASON,
  assertDependencyStatus,
  markProductionForScriptsChanged,
  markScriptsDependencyStatus,
} from '../dependency-state';
import { createStoredZip } from './zip';

const MAX_SCRIPT_NAME_LENGTH = 80;
const MAX_AI_REGEX_CONTENT_LENGTH = 2000;
const MAX_MODEL_DIAGNOSTIC_TEXT_LENGTH = 12000;
const MAX_MODEL_DIAGNOSTIC_ARRAY_ITEMS = 30;
const MAX_MODEL_DIAGNOSTIC_OBJECT_KEYS = 80;
const MAX_MODEL_DIAGNOSTIC_DEPTH = 5;
const SCRIPT_ASSET_EXTRACTION_TASK_CATEGORY = '剧本资产提取';
const RECOVER_REASON = '软件退出导致资产提取中断';
const SECRET_REPLACEMENT = '[已隐藏]';

interface ProjectRow {
  id: number;
  source_type: string;
  name: string;
}

interface ScriptRow {
  id: number;
  project_id: number;
  episode_key: string;
  name: string;
  content: string;
  extract_status: string;
  error_reason: string | null;
  dependency_status: string;
  dependency_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface AssetRow {
  id: number;
  project_id: number;
  type: string;
  name: string;
  description: string;
  prompt: string;
  source: string;
  created_at: number;
  updated_at: number;
}

interface ExtractedAsset {
  name: string;
  desc: string;
  prompt?: string;
  type: ScriptAssetType;
  scriptIds: number[];
}

interface ExtractedAssetInput {
  id?: number;
  assetId?: number;
  name?: string;
  desc?: string;
  description?: string;
  prompt?: string;
  type?: string;
  scriptIds?: number[];
}

interface ExtractAssetsToolResult {
  assetsList?: ExtractedAssetInput[];
  newAssets?: ExtractedAssetInput[];
  existingAssetRefs?: ExtractedAssetInput[];
}

interface ToolResultRecord {
  toolName?: string;
  toolCallId?: string;
  output?: unknown;
  result?: unknown;
}

interface ExtractAssetsModelDiagnostics {
  requestId: string;
  modelKey: 'universalAi';
  status: 'running' | 'returned' | 'parse_failed' | 'normalized' | 'failed';
  rawText?: string;
  finishReason?: unknown;
  usage?: unknown;
  warnings?: unknown;
  response?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  steps?: unknown;
  parsed?: {
    hasOutput: boolean;
    assetsList: number;
    newAssets: number;
    existingAssetRefs: number;
    normalizedAssets?: number;
    normalizedTypes?: Partial<Record<ScriptAssetType, number>>;
  };
  error?: string;
  recordedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function tableExists(tableName: string): boolean {
  const row = getDatabase()
    .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);

  return Boolean(row);
}

function normalizeProjectId(projectId: number): number {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }

  return projectId;
}

function assertProject(projectId: number): ProjectRow {
  const id = normalizeProjectId(projectId);
  const row = getDatabase().prepare<[number], ProjectRow>('SELECT id, source_type, name FROM projects WHERE id = ? LIMIT 1').get(id);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '项目不存在');
  }

  return row;
}

function normalizeRequiredText(value: string | null | undefined, label: string): string {
  const normalized = (value ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}不能为空`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim();
  return normalized || null;
}

function normalizeScriptName(value: string | null | undefined): string {
  const name = normalizeRequiredText(value, '剧本名称');
  if (name.length > MAX_SCRIPT_NAME_LENGTH) {
    throw createError(VT_STATUS.INVALID_PARAMS, `剧本名称不能超过 ${MAX_SCRIPT_NAME_LENGTH} 字`);
  }

  return name;
}

function assertScriptLength(content: string): void {
  const limit = getBusinessSettings().config.scriptEpisodeLength;
  if (content.length > limit) {
    throw createError(VT_STATUS.INVALID_PARAMS, `剧本内容不能超过 ${limit} 字`);
  }
}

function normalizeScriptIds(scriptIds: number[]): number[] {
  const normalized = Array.from(new Set((scriptIds ?? []).map((id) => Number(id))));
  if (normalized.length === 0 || normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '剧本 ID 无效');
  }

  return normalized;
}

function normalizeAssetIds(assetIds: number[] | undefined): number[] {
  if (!assetIds) {
    return [];
  }

  const normalized = Array.from(new Set(assetIds.map((id) => Number(id))));
  if (normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '资产 ID 无效');
  }

  return normalized;
}

function assertExtractStatus(value: string): ScriptExtractStatus {
  if (SCRIPT_EXTRACT_STATUS_VALUES.includes(value as ScriptExtractStatus)) {
    return value as ScriptExtractStatus;
  }

  return SCRIPT_EXTRACT_STATUS.IDLE;
}

function assertAssetType(value: string): ScriptAssetType {
  if (SCRIPT_ASSET_TYPE_VALUES.includes(value as ScriptAssetType)) {
    return value as ScriptAssetType;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '资产类型无效');
}

function normalizeAssetType(value: string | undefined): ScriptAssetType | null {
  return value && SCRIPT_ASSET_TYPE_VALUES.includes(value as ScriptAssetType) ? (value as ScriptAssetType) : null;
}

function createEpisodeKey(): string {
  return `episode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapAssetRow(row: AssetRow): ScriptAssetItem {
  return {
    id: row.id,
    projectId: row.project_id,
    type: assertAssetType(row.type),
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    source: row.source === 'extract' ? 'extract' : 'manual',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getAssetsByProject(projectId: number): ScriptAssetItem[] {
  if (!tableExists('assets')) {
    return [];
  }

  return getDatabase()
    .prepare<[number], AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ?
        AND type IN ('role', 'scene', 'tool')
      ORDER BY type ASC, name COLLATE NOCASE ASC, id ASC
      `,
    )
    .all(projectId)
    .map(mapAssetRow);
}

function getAssetsForScripts(scriptIds: number[]): Map<number, ScriptAssetItem[]> {
  const result = new Map<number, ScriptAssetItem[]>();
  if (scriptIds.length === 0 || !tableExists('assets') || !tableExists('script_asset_links')) {
    return result;
  }

  const placeholders = scriptIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, AssetRow & { script_id: number }>(
      `
      SELECT a.*, l.script_id
      FROM script_asset_links l
      JOIN assets a ON a.id = l.asset_id
      WHERE l.script_id IN (${placeholders})
        AND a.type IN ('role', 'scene', 'tool')
      ORDER BY a.type ASC, a.name COLLATE NOCASE ASC, a.id ASC
      `,
    )
    .all(...scriptIds);

  for (const row of rows) {
    const list = result.get(row.script_id) ?? [];
    list.push(mapAssetRow(row));
    result.set(row.script_id, list);
  }

  return result;
}

function getLinkedAssetIdsForScript(scriptId: number): number[] {
  if (!tableExists('script_asset_links')) {
    return [];
  }

  return getDatabase()
    .prepare<[number], { asset_id: number }>('SELECT asset_id FROM script_asset_links WHERE script_id = ? ORDER BY asset_id ASC')
    .all(scriptId)
    .map((row) => row.asset_id);
}

function hasSameNumberSet(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const values = new Set(left);
  return right.every((item) => values.has(item));
}

function mapScriptRow(row: ScriptRow, assetsByScript: Map<number, ScriptAssetItem[]>): ScriptItem {
  return {
    id: row.id,
    projectId: row.project_id,
    episodeKey: row.episode_key,
    name: row.name,
    content: row.content,
    extractStatus: assertExtractStatus(row.extract_status),
    errorReason: row.error_reason,
    dependencyStatus: assertDependencyStatus(row.dependency_status),
    dependencyReason: row.dependency_reason,
    relatedAssets: assetsByScript.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getScriptRows(projectId: number, scriptIds: number[]): ScriptRow[] {
  const ids = normalizeScriptIds(scriptIds);
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, ScriptRow>(
      `
      SELECT *
      FROM scripts
      WHERE project_id = ?
        AND id IN (${placeholders})
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(projectId, ...ids);

  if (rows.length !== ids.length) {
    throw createError(VT_STATUS.NOT_FOUND, '部分剧本不存在');
  }

  return rows;
}

function getScriptRow(projectId: number, scriptId: number): ScriptRow {
  const row = getDatabase().prepare<[number, number], ScriptRow>('SELECT * FROM scripts WHERE project_id = ? AND id = ? LIMIT 1').get(projectId, scriptId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '剧本不存在');
  }

  return row;
}

function assertAssetsExist(projectId: number, assetIds: number[]): void {
  if (assetIds.length === 0) {
    return;
  }

  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, { id: number }>(`SELECT id FROM assets WHERE project_id = ? AND type IN ('role', 'scene', 'tool') AND id IN (${placeholders})`)
    .all(projectId, ...assetIds);
  if (rows.length !== assetIds.length) {
    throw createError(VT_STATUS.NOT_FOUND, '部分资产不存在');
  }
}

function syncScriptAssets(scriptId: number, assetIds: number[], now: number): void {
  getDatabase().prepare<[number]>('DELETE FROM script_asset_links WHERE script_id = ?').run(scriptId);

  const insert = getDatabase().prepare<[number, number, number]>('INSERT OR IGNORE INTO script_asset_links (script_id, asset_id, created_at) VALUES (?, ?, ?)');
  for (const assetId of assetIds) {
    insert.run(scriptId, assetId, now);
  }
}

function isExtractLocked(status: string): boolean {
  return status === SCRIPT_EXTRACT_STATUS.WAITING || status === SCRIPT_EXTRACT_STATUS.RUNNING;
}

function assertNotExtractLocked(rows: ScriptRow[], action: string): void {
  const lockedCount = rows.filter((row) => isExtractLocked(row.extract_status)).length;
  if (lockedCount > 0) {
    throw createError(VT_STATUS.TASK_STATUS_CONFLICT, `有 ${lockedCount} 个剧本正在资产提取，不能${action}`);
  }
}

function maskSensitiveText(value: string): string {
  return value
    .replace(/(api[_-]?key|authorization|password|secret|token)(\s*[:=]\s*)[^\s,;]+/gi, `$1$2${SECRET_REPLACEMENT}`)
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, `Bearer ${SECRET_REPLACEMENT}`)
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, SECRET_REPLACEMENT)
    .replace(/([a-zA-Z]:\\Users\\)[^\\\s]+/g, `$1***`);
}

function isSensitiveDiagnosticKey(key: string): boolean {
  return /(api[_-]?key|authorization|password|passwd|secret|token|credential|private[_-]?key|access[_-]?key|signature|sign|cookie)/i.test(key);
}

function clampDiagnosticText(value: string, maxLength = MAX_MODEL_DIAGNOSTIC_TEXT_LENGTH): string {
  const sanitized = maskSensitiveText(value);
  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  return `${sanitized.slice(0, maxLength)}... [truncated ${sanitized.length - maxLength} chars]`;
}

function sanitizeDiagnosticValue(value: unknown, key = '', depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (key && isSensitiveDiagnosticKey(key)) {
    return SECRET_REPLACEMENT;
  }

  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return clampDiagnosticText(value);
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'function') {
    return value.name ? `[Function ${value.name}]` : '[Function]';
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (depth >= MAX_MODEL_DIAGNOSTIC_DEPTH) {
    return '[Max depth reached]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_MODEL_DIAGNOSTIC_ARRAY_ITEMS).map((item) => sanitizeDiagnosticValue(item, key, depth + 1, seen));
    if (value.length > MAX_MODEL_DIAGNOSTIC_ARRAY_ITEMS) {
      items.push(`[truncated ${value.length - MAX_MODEL_DIAGNOSTIC_ARRAY_ITEMS} items]`);
    }
    return items;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};
  for (const [itemKey, itemValue] of entries.slice(0, MAX_MODEL_DIAGNOSTIC_OBJECT_KEYS)) {
    result[itemKey] = sanitizeDiagnosticValue(itemValue, itemKey, depth + 1, seen);
  }
  if (entries.length > MAX_MODEL_DIAGNOSTIC_OBJECT_KEYS) {
    result.__truncatedKeys = entries.length - MAX_MODEL_DIAGNOSTIC_OBJECT_KEYS;
  }

  return result;
}

function normalizeErrorReason(error: unknown): string {
  const normalized = normalizeUnknownError(error);
  return maskSensitiveText(normalized.message || '资产提取失败');
}

function buildExtractAssetsTaskRelatedObjects(scriptIds: number[], modelDiagnostics: ExtractAssetsModelDiagnostics | null): Record<string, unknown> {
  return {
    scriptIds,
    ...(modelDiagnostics ? { modelDiagnostics } : {}),
  };
}

function updateAssetExtractionTaskDiagnostics(taskId: number, scriptIds: number[], modelDiagnostics: ExtractAssetsModelDiagnostics | null): void {
  try {
    updateTaskMeta({
      taskId,
      relatedObjects: buildExtractAssetsTaskRelatedObjects(scriptIds, modelDiagnostics),
    });
  } catch (error) {
    logger.warn('剧本资产提取', '任务诊断记录更新失败', normalizeUnknownError(error));
  }
}

function summarizeExtractAssetsOutput(output: ExtractAssetsToolResult | null): ExtractAssetsModelDiagnostics['parsed'] {
  return {
    hasOutput: Boolean(output),
    assetsList: output?.assetsList?.length ?? 0,
    newAssets: output?.newAssets?.length ?? 0,
    existingAssetRefs: output?.existingAssetRefs?.length ?? 0,
  };
}

function countAssetTypes(assets: ExtractedAsset[]): Partial<Record<ScriptAssetType, number>> {
  return assets.reduce<Partial<Record<ScriptAssetType, number>>>((counts, asset) => {
    counts[asset.type] = (counts[asset.type] ?? 0) + 1;
    return counts;
  }, {});
}

function buildExtractAssetsModelDiagnostics(
  requestId: string,
  result: unknown,
  output: ExtractAssetsToolResult | null,
): ExtractAssetsModelDiagnostics {
  const record = isRecord(result) ? result : {};

  return {
    requestId,
    modelKey: 'universalAi',
    status: output ? 'returned' : 'parse_failed',
    rawText: clampDiagnosticText(String(record.text ?? '')),
    finishReason: sanitizeDiagnosticValue(record.finishReason),
    usage: sanitizeDiagnosticValue(record.usage),
    warnings: sanitizeDiagnosticValue(record.warnings),
    response: sanitizeDiagnosticValue(record.response),
    toolCalls: sanitizeDiagnosticValue(record.toolCalls),
    toolResults: sanitizeDiagnosticValue(record.toolResults),
    steps: sanitizeDiagnosticValue(record.steps),
    parsed: summarizeExtractAssetsOutput(output),
    recordedAt: Date.now(),
  };
}

function updateScriptsExtractStatus(projectId: number, scriptIds: number[], status: ScriptExtractStatus, errorReason: string | null = null): void {
  const ids = normalizeScriptIds(scriptIds);
  const placeholders = ids.map(() => '?').join(', ');
  getDatabase()
    .prepare<Array<number | string | null>, { changes: number }>(
      `
      UPDATE scripts
      SET extract_status = ?, error_reason = ?, updated_at = ?
      WHERE project_id = ?
        AND id IN (${placeholders})
      `,
    )
    .run(status, errorReason, Date.now(), projectId, ...ids);
}

function sanitizeFileStem(value: string, fallback: string): string {
  const normalized = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  const safe = basename(normalized).replace(/^\.+$/, '').slice(0, 80).trim();
  return safe || fallback;
}

function createExportEntries(rows: ScriptRow[]): Array<{ name: string; content: Buffer }> {
  const used = new Map<string, number>();
  return rows.map((row, index) => {
    const stem = sanitizeFileStem(row.name, `script_${index + 1}`);
    const count = used.get(stem) ?? 0;
    used.set(stem, count + 1);
    const fileName = `${stem}${count > 0 ? `_${count + 1}` : ''}.txt`;
    return {
      name: fileName,
      content: Buffer.from(row.content, 'utf-8'),
    };
  });
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseRegexFromText(text: string): string {
  const normalized = stripThink(text).trim();
  const slashMatch = normalized.match(/\/(?:\\.|[^/])+\/[a-z]*/i);
  if (slashMatch) {
    return slashMatch[0];
  }

  return normalized.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith('/') && line.lastIndexOf('/') > 0) ?? '';
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectJsonCandidates(text: string): string[] {
  const normalized = stripThink(text).trim();
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>();
  for (const match of normalized.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const content = match[1]?.trim();
    if (content) {
      candidates.add(content);
    }
  }
  candidates.add(normalized);

  const objectStart = normalized.indexOf('{');
  const objectEnd = normalized.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.add(normalized.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = normalized.indexOf('[');
  const arrayEnd = normalized.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.add(normalized.slice(arrayStart, arrayEnd + 1));
  }

  return [...candidates];
}

function toAssetInputList(value: unknown): ExtractedAssetInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord) as ExtractedAssetInput[];
}

function coerceExtractAssetsToolResult(value: unknown): ExtractAssetsToolResult | null {
  if (Array.isArray(value)) {
    return { assetsList: toAssetInputList(value) };
  }
  if (!isRecord(value)) {
    return null;
  }

  const assetsList = toAssetInputList(value.assetsList ?? value.assetList ?? value.assets);
  const newAssets = toAssetInputList(value.newAssets);
  const existingAssetRefs = toAssetInputList(value.existingAssetRefs ?? value.existingAssets);
  if (assetsList.length === 0 && newAssets.length === 0 && existingAssetRefs.length === 0) {
    return null;
  }

  return { assetsList, newAssets, existingAssetRefs };
}

function parseExtractAssetsTextResult(text: string): ExtractAssetsToolResult | null {
  for (const candidate of collectJsonCandidates(text)) {
    const parsed = tryParseJson(candidate);
    const output = coerceExtractAssetsToolResult(parsed);
    if (output) {
      return output;
    }
  }

  return null;
}

function getResultToolOutput(result: { toolResults?: ToolResultRecord[]; text?: string | null }): ExtractAssetsToolResult | null {
  const toolResult = result.toolResults?.find((item) => item.toolName === 'resultTool');
  const toolOutput = coerceExtractAssetsToolResult(toolResult?.output ?? toolResult?.result);
  if (toolOutput) {
    return toolOutput;
  }

  return parseExtractAssetsTextResult(result.text ?? '');
}

function buildRegexPrompt(content: string): string {
  return [
    '请根据下面剧本文本的分集格式，返回一个 JavaScript 正则字符串。',
    '要求：',
    '1. 只返回正则字符串，不要解释。',
    '2. 正则必须有两个捕获组：集数/编号、标题/名称。',
    '3. 如果没有明显分集模式，返回空字符串。',
    '',
    '剧本文本片段：',
    content.slice(0, MAX_AI_REGEX_CONTENT_LENGTH),
  ].join('\n');
}

function normalizeAssetScriptIds(value: number[] | undefined, validScriptIds: number[]): number[] {
  if (!value || value.length === 0) {
    return validScriptIds;
  }

  const validSet = new Set(validScriptIds);
  const normalized = Array.from(new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && validSet.has(id))));
  return normalized.length > 0 ? normalized : validScriptIds;
}

function resolveExistingAsset(input: ExtractedAssetInput, existingAssets: ScriptAssetItem[]): ExtractedAsset | null {
  const id = Number(input.assetId ?? input.id ?? 0);
  const name = normalizeOptionalText(input.name);
  const matchedById = Number.isInteger(id) && id > 0 ? existingAssets.find((asset) => asset.id === id) : null;
  const matchedByName = !matchedById && name ? existingAssets.filter((asset) => asset.name.toLowerCase() === name.toLowerCase()) : [];
  const matched = matchedById ?? (matchedByName.length === 1 ? matchedByName[0] : null);
  if (!matched) {
    return null;
  }

  return {
    name: matched.name,
    desc: normalizeOptionalText(input.desc ?? input.description) ?? matched.description,
    prompt: normalizeOptionalText(input.prompt) ?? matched.prompt,
    type: matched.type,
    scriptIds: [],
  };
}

function normalizeExtractedAssets(value: ExtractAssetsToolResult, validScriptIds: number[], existingAssets: ScriptAssetItem[]): ExtractedAsset[] {
  const directAssets = Array.isArray(value.assetsList) ? value.assetsList : [];
  const newAssets = Array.isArray(value.newAssets) ? value.newAssets : [];
  const existingAssetRefs = Array.isArray(value.existingAssetRefs) ? value.existingAssetRefs : [];
  if (directAssets.length === 0 && newAssets.length === 0 && existingAssetRefs.length === 0) {
    throw createError(VT_STATUS.MODEL_ERROR, '资产提取结果结构无效');
  }

  const seen = new Set<string>();
  const assets: ExtractedAsset[] = [];
  for (const item of [...directAssets, ...newAssets]) {
    const name = normalizeOptionalText(item.name);
    const desc = normalizeOptionalText(item.desc ?? item.description);
    const type = normalizeAssetType(item.type);
    if (!name || !desc || !type) {
      continue;
    }

    const scriptIds = normalizeAssetScriptIds(item.scriptIds, validScriptIds);
    const key = `${type}:${name.toLowerCase()}:${scriptIds.join(',')}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    assets.push({
      name,
      desc,
      prompt: normalizeOptionalText(item.prompt) ?? '',
      type,
      scriptIds,
    });
  }
  for (const item of existingAssetRefs) {
    const asset = resolveExistingAsset(item, existingAssets);
    if (!asset) {
      continue;
    }
    asset.scriptIds = normalizeAssetScriptIds(item.scriptIds, validScriptIds);
    const key = `${asset.type}:${asset.name.toLowerCase()}:${asset.scriptIds.join(',')}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    assets.push(asset);
  }

  if (assets.length === 0) {
    throw createError(VT_STATUS.MODEL_ERROR, '模型没有提取到可用资产');
  }

  return assets;
}

function upsertExtractedAssets(projectId: number, assets: ExtractedAsset[], scriptIds: number[]): void {
  const now = Date.now();
  const select = getDatabase().prepare<[number, string, string], { id: number }>('SELECT id FROM assets WHERE project_id = ? AND type = ? AND lower(name) = lower(?) LIMIT 1');
  const insert = getDatabase().prepare<[number, ScriptAssetType, string, string, string, 'extract', number, number]>(
    `
    INSERT INTO assets (project_id, type, name, description, prompt, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const update = getDatabase().prepare<[string, string, number, number]>(
    `
    UPDATE assets
    SET description = ?, prompt = ?, updated_at = ?
    WHERE id = ?
    `,
  );
  const link = getDatabase().prepare<[number, number, number]>('INSERT OR IGNORE INTO script_asset_links (script_id, asset_id, created_at) VALUES (?, ?, ?)');

  for (const asset of assets) {
    const existing = select.get(projectId, asset.type, asset.name);
    const assetId = existing?.id ?? Number(insert.run(projectId, asset.type, asset.name, asset.desc, asset.prompt ?? '', 'extract', now, now).lastInsertRowid);
    if (existing) {
      update.run(asset.desc, asset.prompt ?? '', now, assetId);
    }

    for (const scriptId of scriptIds) {
      link.run(scriptId, assetId, now);
    }
  }
}

async function runAssetExtraction(projectId: number, scriptIds: number[], taskId: number): Promise<void> {
  const requestId = createModelRequestId();
  let modelDiagnostics: ExtractAssetsModelDiagnostics | null = {
    requestId,
    modelKey: 'universalAi',
    status: 'running',
    recordedAt: Date.now(),
  };

  try {
    updateScriptsExtractStatus(projectId, scriptIds, SCRIPT_EXTRACT_STATUS.RUNNING);
    updateAssetExtractionTaskDiagnostics(taskId, scriptIds, modelDiagnostics);
    const rows = getScriptRows(projectId, scriptIds);
    const existingAssets = getAssetsByProject(projectId);
    const prompt = getEffectivePromptByType('scriptAssetExtraction');
    const result = await invokeText({
      requestId,
      modelKey: 'universalAi',
      system: prompt,
      messages: [
        {
          role: 'user',
          content: [
            '已有资产：',
            JSON.stringify(existingAssets.map((asset) => ({ id: asset.id, type: asset.type, name: asset.name, desc: asset.description }))),
            '',
            '待提取剧本：',
            rows.map((script) => `# ${script.id} ${script.name}\n${script.content}`).join('\n\n---\n\n'),
            '',
            '请在每个资产对象里返回 scriptIds，表示该资产属于哪些剧本；如果是已有资产，优先返回 existingAssetRefs 的 id 和 scriptIds。',
            '优先调用 resultTool 返回结果；如果当前模型或供应商无法调用工具，则只输出一个 JSON 对象，不要解释，格式为 {"assetsList":[{"name":"","desc":"","prompt":"","type":"role|scene|tool","scriptIds":[剧本ID]}]}。',
          ].join('\n'),
        },
      ],
      tools: {
        resultTool: tool<ExtractAssetsToolResult, ExtractAssetsToolResult>({
          description: '返回剧本中提取到的角色、场景和道具资产列表。',
          inputSchema: jsonSchema<ExtractAssetsToolResult>({
            type: 'object',
            properties: {
              assetsList: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    desc: { type: 'string' },
                    prompt: { type: 'string' },
                    type: { type: 'string', enum: ['role', 'scene', 'tool'] },
                    scriptIds: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['name', 'desc', 'type', 'scriptIds'],
                  additionalProperties: false,
                },
              },
              newAssets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    desc: { type: 'string' },
                    prompt: { type: 'string' },
                    type: { type: 'string', enum: ['role', 'scene', 'tool'] },
                    scriptIds: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['name', 'desc', 'type', 'scriptIds'],
                  additionalProperties: false,
                },
              },
              existingAssetRefs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    name: { type: 'string' },
                    type: { type: 'string', enum: ['role', 'scene', 'tool'] },
                    scriptIds: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['scriptIds'],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          }),
          execute: (input) => input,
        }),
      },
    });
    const output = getResultToolOutput(result);
    modelDiagnostics = buildExtractAssetsModelDiagnostics(requestId, result, output);
    updateAssetExtractionTaskDiagnostics(taskId, scriptIds, modelDiagnostics);
    if (!output) {
      throw createError(VT_STATUS.MODEL_ERROR, '模型没有返回可用资产，请重试或切换支持工具调用的文本模型');
    }

    const assets = normalizeExtractedAssets(output, scriptIds, existingAssets);
    modelDiagnostics = {
      ...modelDiagnostics,
      status: 'normalized',
      parsed: {
        hasOutput: true,
        assetsList: modelDiagnostics.parsed?.assetsList ?? 0,
        newAssets: modelDiagnostics.parsed?.newAssets ?? 0,
        existingAssetRefs: modelDiagnostics.parsed?.existingAssetRefs ?? 0,
        normalizedAssets: assets.length,
        normalizedTypes: countAssetTypes(assets),
      },
      recordedAt: Date.now(),
    };
    updateAssetExtractionTaskDiagnostics(taskId, scriptIds, modelDiagnostics);
    withTransaction(() => {
      const placeholders = scriptIds.map(() => '?').join(', ');
      getDatabase().prepare<Array<number>>(`DELETE FROM script_asset_links WHERE script_id IN (${placeholders})`).run(...scriptIds);
      upsertExtractedAssets(projectId, assets, scriptIds);
      updateScriptsExtractStatus(projectId, scriptIds, SCRIPT_EXTRACT_STATUS.SUCCEEDED, null);
    });
    succeedTask(taskId);
  } catch (error) {
    modelDiagnostics = {
      ...(modelDiagnostics ?? {
        requestId,
        modelKey: 'universalAi',
        recordedAt: Date.now(),
      }),
      status: 'failed',
      error: normalizeErrorReason(error),
      recordedAt: Date.now(),
    };
    updateAssetExtractionTaskDiagnostics(taskId, scriptIds, modelDiagnostics);
    updateScriptsExtractStatus(projectId, scriptIds, SCRIPT_EXTRACT_STATUS.FAILED, normalizeErrorReason(error));
    try {
      failTask(taskId, error);
    } catch (taskError) {
      logger.error('剧本资产提取', '任务状态更新失败', taskError);
    }
    logger.error('剧本资产提取', '资产提取失败', normalizeUnknownError(error));
  }
}

export function listScripts(payload: ScriptListPayload): ScriptListResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const keyword = normalizeOptionalText(payload.keyword);
  const where = ['project_id = ?'];
  const params: Array<string | number> = [projectId];
  if (keyword) {
    where.push('name LIKE ?');
    params.push(`%${keyword}%`);
  }

  const rows = getDatabase()
    .prepare<Array<string | number>, ScriptRow>(
      `
      SELECT *
      FROM scripts
      WHERE ${where.join(' AND ')}
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(...params);
  const assetsByScript = getAssetsForScripts(rows.map((row) => row.id));

  return {
    scripts: rows.map((row) => mapScriptRow(row, assetsByScript)),
    assets: getAssetsByProject(projectId),
    scriptEpisodeLength: getBusinessSettings().config.scriptEpisodeLength,
  };
}

export function saveScript(payload: ScriptSavePayload): ScriptSaveResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const scriptId = payload.script.id && Number.isInteger(payload.script.id) ? payload.script.id : null;
  const name = normalizeScriptName(payload.script.name);
  const content = normalizeRequiredText(payload.script.content, '剧本内容');
  assertScriptLength(content);
  const assetIds = normalizeAssetIds(payload.script.assetIds);
  assertAssetsExist(projectId, assetIds);
  const now = Date.now();

  const savedId = withTransaction((database) => {
    if (scriptId) {
      const existing = getScriptRow(projectId, scriptId);
      assertNotExtractLocked([existing], '编辑');
      const linkedBefore = getLinkedAssetIdsForScript(existing.id);
      const shouldInvalidateProduction = existing.content !== content || !hasSameNumberSet(linkedBefore, assetIds);
      database
        .prepare<[string, string, ScriptExtractStatus, null, number, number]>(
          `
          UPDATE scripts
          SET name = ?, content = ?, extract_status = ?, error_reason = ?, updated_at = ?
          WHERE id = ?
          `,
        )
        .run(name, content, SCRIPT_EXTRACT_STATUS.IDLE, null, now, existing.id);
      syncScriptAssets(existing.id, assetIds, now);
      markScriptsDependencyStatus({
        projectId,
        scriptIds: [existing.id],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      if (shouldInvalidateProduction) {
        markProductionForScriptsChanged({
          projectId,
          scriptIds: [existing.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.SCRIPT_CHANGED,
          database,
        });
      }
      return existing.id;
    }

    const insert = database
      .prepare<[number, string, string, string, ScriptExtractStatus, null, number, number]>(
        `
        INSERT INTO scripts (project_id, episode_key, name, content, extract_status, error_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(projectId, createEpisodeKey(), name, content, SCRIPT_EXTRACT_STATUS.IDLE, null, now, now);
    const insertedId = Number(insert.lastInsertRowid);
    syncScriptAssets(insertedId, assetIds, now);
    return insertedId;
  });

  return {
    script: listScripts({ projectId }).scripts.find((script) => script.id === savedId)!,
  };
}

export function batchCreateScripts(payload: ScriptBatchCreatePayload): ScriptBatchCreateResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  if (!Array.isArray(payload.scripts) || payload.scripts.length === 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '请至少选择一个剧本');
  }

  const drafts = payload.scripts.map((script) => {
    const content = normalizeRequiredText(script.content, '剧本内容');
    assertScriptLength(content);
    return {
      name: normalizeScriptName(script.name),
      content,
    };
  });
  const now = Date.now();
  const ids = withTransaction((database) => {
    const insert = database.prepare<[number, string, string, string, ScriptExtractStatus, null, number, number]>(
      `
      INSERT INTO scripts (project_id, episode_key, name, content, extract_status, error_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );
    return drafts.map((draft) => Number(insert.run(projectId, createEpisodeKey(), draft.name, draft.content, SCRIPT_EXTRACT_STATUS.IDLE, null, now, now).lastInsertRowid));
  });

  const scripts = listScripts({ projectId }).scripts.filter((script) => ids.includes(script.id));
  return { scripts };
}

export function deleteScripts(payload: ScriptBatchDeletePayload): ScriptDeleteResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const scriptIds = normalizeScriptIds(payload.scriptIds);
  const rows = getScriptRows(projectId, scriptIds);
  assertNotExtractLocked(rows, '删除');
  const placeholders = scriptIds.map(() => '?').join(', ');
  const deletedCount = withTransaction((database) => {
    markProductionForScriptsChanged({
      projectId,
      scriptIds,
      status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
      reason: DEPENDENCY_REASON.SCRIPT_DELETED,
      database,
    });
    database.prepare<Array<number>>(`DELETE FROM script_asset_links WHERE script_id IN (${placeholders})`).run(...scriptIds);
    const result = database.prepare<Array<number>, { changes: number }>(`DELETE FROM scripts WHERE project_id = ? AND id IN (${placeholders})`).run(projectId, ...scriptIds);
    return result.changes;
  });

  return { deletedCount };
}

export function deleteScript(payload: ScriptDeletePayload): ScriptDeleteResult {
  return deleteScripts({
    projectId: payload.projectId,
    scriptIds: [payload.scriptId],
  });
}

export async function exportScriptsZip(payload: ScriptExportZipPayload): Promise<ScriptExportZipResult> {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const scriptIds = normalizeScriptIds(payload.scriptIds);
  const rows = getScriptRows(projectId, scriptIds);
  const zip = createStoredZip(createExportEntries(rows));
  const result = await dialog.showSaveDialog({
    title: '导出剧本 zip',
    defaultPath: `script_${todayStamp()}.zip`,
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  });

  if (result.canceled || !result.filePath) {
    return {
      canceled: true,
      filePath: null,
      exportedCount: 0,
    };
  }

  writeFileSync(result.filePath, zip);
  return {
    canceled: false,
    filePath: result.filePath,
    exportedCount: rows.length,
  };
}

export async function generateScriptParseRegex(payload: ScriptGenerateParseRegexPayload): Promise<ScriptGenerateParseRegexResult> {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const content = normalizeRequiredText(payload.content, '剧本文本');
  const result = await invokeText({
    modelKey: 'universalAi',
    messages: [{ role: 'user', content: buildRegexPrompt(content) }],
  });
  const regex = parseRegexFromText(result.text ?? '');
  if (!regex) {
    throw createError(VT_STATUS.MODEL_ERROR, 'AI 未能生成可用正则');
  }

  return { regex };
}

export function extractScriptAssets(payload: ScriptExtractAssetsPayload): ScriptExtractAssetsResult {
  const projectId = normalizeProjectId(payload.projectId);
  const project = assertProject(projectId);
  const scriptIds = normalizeScriptIds(payload.scriptIds);
  const rows = getScriptRows(projectId, scriptIds);
  assertNotExtractLocked(rows, '重新提取');
  const task = createTask({
    projectId,
    category: SCRIPT_ASSET_EXTRACTION_TASK_CATEGORY,
    relatedObjects: { scriptIds },
    modelName: 'universalAi',
    description: `提取 ${project.name} 的 ${scriptIds.length} 个剧本资产`,
  });

  updateScriptsExtractStatus(projectId, scriptIds, SCRIPT_EXTRACT_STATUS.WAITING);
  void runAssetExtraction(projectId, scriptIds, task.taskId);

  return {
    accepted: true,
    taskId: task.taskId,
    scriptIds,
  };
}

export function pollScriptExtractStatus(payload: ScriptPollExtractStatusPayload): ScriptPollExtractStatusResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const scriptIds = normalizeScriptIds(payload.scriptIds);
  const placeholders = scriptIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number | string>, ScriptRow>(
      `
      SELECT *
      FROM scripts
      WHERE project_id = ?
        AND id IN (${placeholders})
        AND extract_status NOT IN (?, ?)
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(projectId, ...scriptIds, SCRIPT_EXTRACT_STATUS.WAITING, SCRIPT_EXTRACT_STATUS.RUNNING);
  const assetsByScript = getAssetsForScripts(rows.map((row) => row.id));

  return {
    scripts: rows.map((row) => mapScriptRow(row, assetsByScript)),
  };
}

export function recoverScriptExtractStatus(reason = RECOVER_REASON): ScriptRecoverExtractStatusResult {
  if (!tableExists('scripts')) {
    return { recovered: 0 };
  }

  const result = getDatabase()
    .prepare<[ScriptExtractStatus, string, number, ScriptExtractStatus, ScriptExtractStatus]>(
      `
      UPDATE scripts
      SET extract_status = ?, error_reason = ?, updated_at = ?
      WHERE extract_status IN (?, ?)
      `,
    )
    .run(SCRIPT_EXTRACT_STATUS.FAILED, reason, Date.now(), SCRIPT_EXTRACT_STATUS.WAITING, SCRIPT_EXTRACT_STATUS.RUNNING);

  return {
    recovered: result.changes,
  };
}
