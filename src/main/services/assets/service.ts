import { extname } from 'node:path';
import { jsonSchema, tool } from 'ai';
import { DEPENDENCY_STATUSES, PROJECT_IMAGE_QUALITY_VALUES } from '@shared/constants/dictionaries';
import { VT_STATUS } from '@shared/constants/status';
import { normalizeUnknownError } from '@shared/errors';
import {
  ASSET_MEDIA_KIND_VALUES,
  ASSET_IMAGE_USAGES,
  ASSET_IMAGE_USAGE_VALUES,
  ASSET_IMAGE_VIEW_MODES,
  ASSET_IMAGE_VIEW_MODE_VALUES,
  ASSET_TASK_STATUS,
  ASSET_TASK_STATUS_VALUES,
  ASSET_TYPES,
  ASSET_TYPE_VALUES,
  GENERATABLE_ASSET_TYPES,
  type AssetImageUsage,
  type AssetImageViewMode,
  type AssetAudioBindingPayload,
  type AssetAudioBindingResult,
  type AssetAudioSummary,
  type AssetBatchAudioBindingPayload,
  type AssetBatchDeletePayload,
  type AssetBatchImagePayload,
  type AssetBatchPromptPayload,
  type AssetCancelImagePayload,
  type AssetDeletePayload,
  type AssetDeleteResult,
  type AssetGenerateAcceptedResult,
  type AssetImagePayload,
  type AssetItem,
  type AssetListPayload,
  type AssetListResult,
  type AssetMediaDeletePayload,
  type AssetMediaItem,
  type AssetMediaKind,
  type AssetMediaSelectPayload,
  type AssetPollPayload,
  type AssetPollResult,
  type AssetProjectPayload,
  type AssetSavePayload,
  type AssetSaveResult,
  type AssetSource,
  type AssetTaskStatus,
  type AssetType,
  type AssetUploadPayload,
  type AssetUploadResult,
  type CornerAssetListPayload,
  type CornerAssetListResult,
  type GeneratableAssetType,
} from '@shared/types/assets';
import type { ProjectImageQuality } from '@shared/types/project';
import { getDatabase, withTransaction } from '../database';
import { deleteManagedFile, getRuntimeDirectories, writeManagedFile } from '../file-system';
import { createMediaUrl, createThumbnailMediaUrl } from '../media/url';
import { createModelRequestId, generateImageByModel, invokeText } from '../model';
import { createError } from '../result';
import { getBusinessSettings } from '../settings/business-settings';
import { getEffectivePromptByType } from '../settings/prompt';
import { stripThink } from '../socket/stripThink';
import { cancelTask, createTask, failTask, getTaskDetail, isTaskCancelled, succeedTask } from '../task';
import { logger } from '../logger';
import { formatManualPromptSection, readManualPromptBundle, toManualPromptSnapshot, type ManualPromptBundle } from '../project/manual-prompt';
import { createGenerationSnapshot } from '../generation/snapshot';
import {
  DEPENDENCY_REASON,
  assertDependencyStatus,
  markAssetsDependencyStatus,
  markProductionForAssetsChanged,
} from '../dependency-state';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const IMAGE_TASK_CATEGORY = '资产图片生成';
const PROMPT_TASK_CATEGORY = '资产提示词生成';
const AUDIO_BIND_TASK_CATEGORY = '角景音色绑定';
const RECOVER_REASON = '软件退出导致资产任务中断';
const SECRET_REPLACEMENT = '[已隐藏]';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);
const DATA_URL_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

interface ProjectRow {
  id: number;
  name: string;
  description: string;
  image_model_id: string;
  image_quality: ProjectImageQuality;
  visual_manual_id: number;
}

interface AssetRow {
  id: number;
  project_id: number;
  parent_id: number | null;
  type: string;
  name: string;
  description: string;
  remark: string;
  prompt: string;
  source: string;
  media_id: number | null;
  prompt_status: string;
  prompt_error_reason: string | null;
  image_status: string;
  image_error_reason: string | null;
  audio_bind_status: string;
  audio_bind_error_reason: string | null;
  dependency_status: string;
  dependency_reason: string | null;
  voice_gender: string | null;
  metadata: string;
  created_at: number;
  updated_at: number;
}

interface AssetMediaRow {
  id: number;
  project_id: number;
  asset_id: number;
  kind: string;
  relative_path: string | null;
  source: string;
  usage: string;
  view_mode: string;
  status: string;
  error_reason: string | null;
  prompt: string | null;
  model: string | null;
  model_mode: string | null;
  resolution: string | null;
  task_id: number | null;
  metadata: string;
  created_at: number;
  updated_at: number;
}

interface AudioBindResult {
  audioId?: number | null;
}

interface AssetImageRule {
  usage: AssetImageUsage;
  viewMode: AssetImageViewMode;
  label: string;
  promptTitle: string;
  promptEnd: string;
  aspectRatio: '16:9';
}

interface AssetMediaInsertOptions {
  usage?: AssetImageUsage;
  viewMode?: AssetImageViewMode;
  prompt?: string | null;
  modelMode?: string | null;
  taskId?: number | null;
  metadata?: Record<string, unknown>;
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
  const row = getDatabase()
    .prepare<[number], ProjectRow>('SELECT id, name, description, image_model_id, image_quality, visual_manual_id FROM projects WHERE id = ? LIMIT 1')
    .get(id);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '项目不存在');
  }

  return row;
}

function assertAssetType(value: string): AssetType {
  if (ASSET_TYPE_VALUES.includes(value as AssetType)) {
    return value as AssetType;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '资产类型无效');
}

function assertGeneratableType(value: string): GeneratableAssetType {
  if (GENERATABLE_ASSET_TYPES.includes(value as GeneratableAssetType)) {
    return value as GeneratableAssetType;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '当前资产类型不支持生成');
}

function assertMediaKind(value: string): AssetMediaKind {
  if (ASSET_MEDIA_KIND_VALUES.includes(value as AssetMediaKind)) {
    return value as AssetMediaKind;
  }

  return 'image';
}

function assertImageUsage(value: string): AssetImageUsage {
  if (ASSET_IMAGE_USAGE_VALUES.includes(value as AssetImageUsage)) {
    return value as AssetImageUsage;
  }

  return ASSET_IMAGE_USAGES.PRIMARY;
}

function assertImageViewMode(value: string): AssetImageViewMode {
  if (ASSET_IMAGE_VIEW_MODE_VALUES.includes(value as AssetImageViewMode)) {
    return value as AssetImageViewMode;
  }

  return ASSET_IMAGE_VIEW_MODES.STANDARD;
}

function assertTaskStatus(value: string): AssetTaskStatus {
  if (ASSET_TASK_STATUS_VALUES.includes(value as AssetTaskStatus)) {
    return value as AssetTaskStatus;
  }

  return ASSET_TASK_STATUS.IDLE;
}

function assertImageQuality(value: string): ProjectImageQuality {
  if (PROJECT_IMAGE_QUALITY_VALUES.includes(value as ProjectImageQuality)) {
    return value as ProjectImageQuality;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '图片分辨率无效');
}

function normalizeOptionalText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function normalizeRequiredText(value: string | null | undefined, label: string): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}不能为空`);
  }

  return normalized;
}

function normalizePage(value: number | undefined): number {
  const page = value ?? DEFAULT_PAGE;
  if (!Number.isInteger(page) || page <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '分页页码无效');
  }

  return page;
}

function normalizeLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
    throw createError(VT_STATUS.INVALID_PARAMS, `分页数量必须在 1-${MAX_LIMIT} 之间`);
  }

  return limit;
}

function normalizeIds(ids: number[], label: string): number[] {
  const normalized = Array.from(new Set((ids ?? []).map((id) => Number(id))));
  if (normalized.length === 0 || normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}无效`);
  }

  return normalized;
}

function normalizeConcurrentCount(value?: number | null): number {
  if (value === undefined || value === null) {
    return getBusinessSettings().config.assetsBatchGenerateSize;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '并发数无效');
  }

  return Math.min(value, 20);
}

function createFileStem(value: string, fallback: string): string {
  const normalized = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  return normalized.replace(/^\.+$/, '').slice(0, 80).trim() || fallback;
}

function createStoredFileName(fileName: string, fallbackExt: string): string {
  const originalExt = extname(fileName).replace(/^\./, '').toLowerCase();
  const ext = originalExt || fallbackExt;
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw createError(VT_STATUS.INVALID_PARAMS, '文件数据无效');
  }

  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function inferMediaKind(fileName: string, mime?: string): AssetMediaKind {
  const lowerMime = mime?.toLowerCase() ?? '';
  if (lowerMime.startsWith('image/')) {
    return 'image';
  }
  if (lowerMime.startsWith('audio/')) {
    return 'audio';
  }
  if (lowerMime.startsWith('video/')) {
    return 'video';
  }

  const ext = extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return 'audio';
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }

  throw createError(VT_STATUS.UNSUPPORTED_FILE_TYPE, '不支持的素材格式');
}

function mediaRootRelativePath(projectId: number, assetType: 'images' | 'audio' | 'video' | 'clips', relativePath: string): string {
  return `${projectId}/assets/${assetType}/${relativePath}`.replace(/\\/g, '/');
}

function createMediaUrls(row: AssetMediaRow): Pick<AssetMediaItem, 'url' | 'thumbnailUrl'> {
  if (!row.relative_path || row.status !== ASSET_TASK_STATUS.SUCCEEDED) {
    return { url: null, thumbnailUrl: null };
  }

  try {
    const url = createMediaUrl({ root: 'project', relativePath: row.relative_path }).url;
    const thumbnailUrl = row.kind === 'image'
      ? createThumbnailMediaUrl({ root: 'project', relativePath: row.relative_path, size: 'list' }).url
      : null;
    return { url, thumbnailUrl };
  } catch {
    return { url: null, thumbnailUrl: null };
  }
}

function maskSensitiveText(value: string): string {
  return value
    .replace(/(api[_-]?key|authorization|password|secret|token)(\s*[:=]\s*)[^\s,;]+/gi, `$1$2${SECRET_REPLACEMENT}`)
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, `Bearer ${SECRET_REPLACEMENT}`)
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, SECRET_REPLACEMENT)
    .replace(/([a-zA-Z]:\\Users\\)[^\\\s]+/g, `$1***`);
}

function normalizeErrorReason(error: unknown): string {
  const normalized = normalizeUnknownError(error);
  return maskSensitiveText(normalized.message || '资产任务失败');
}

function serializeMetadata(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {});
}

function resolveAssetImageRule(asset: AssetRow): AssetImageRule {
  const isDerivative = Boolean(asset.parent_id);
  const baseRules: Record<GeneratableAssetType, Omit<AssetImageRule, 'usage' | 'viewMode'>> = {
    role: {
      label: '角色',
      promptTitle: '角色标准四视图',
      promptEnd: '人物角色四视图',
      aspectRatio: '16:9',
    },
    scene: {
      label: '场景',
      promptTitle: '标准场景图',
      promptEnd: '标准场景图',
      aspectRatio: '16:9',
    },
    tool: {
      label: '道具',
      promptTitle: '标准道具图',
      promptEnd: '标准道具图',
      aspectRatio: '16:9',
    },
  };
  const base = baseRules[assertGeneratableType(asset.type)];

  if (isDerivative) {
    return {
      ...base,
      usage: ASSET_IMAGE_USAGES.DERIVED,
      viewMode: ASSET_IMAGE_VIEW_MODES.DERIVED,
    };
  }

  return {
    ...base,
    usage: ASSET_IMAGE_USAGES.PRIMARY,
    viewMode: asset.type === ASSET_TYPES.ROLE ? ASSET_IMAGE_VIEW_MODES.FOUR_VIEW : ASSET_IMAGE_VIEW_MODES.STANDARD,
  };
}

function buildAssetImagePrompt(project: ProjectRow, asset: AssetRow, prompt: string, rule: AssetImageRule, resolution: ProjectImageQuality, visualManual: ManualPromptBundle): string {
  return [
    `请根据以下参数生成${rule.promptTitle}：`,
    '',
    '**基础参数：**',
    `- 项目名称: ${project.name}`,
    `- 项目简介: ${project.description || '未指定'}`,
    `- 图片规格: ${resolution}`,
    '',
    `**${rule.label}设定：**`,
    `- 名称: ${asset.name}`,
    `- 描述: ${asset.description || '未指定'}`,
    `- 提示词: ${prompt}`,
    '',
    '**视觉手册规范：**',
    formatManualPromptSection('资产图片生成视觉规范', visualManual),
    '',
    `请严格按照系统规范生成${rule.promptEnd}。`,
  ].join('\n');
}

function createGenerationMetadata(
  asset: AssetRow,
  rule: AssetImageRule,
  sourcePrompt: string,
  resolution: ProjectImageQuality,
  model: string,
  taskId: number,
  requestId: string,
  visualManual: ManualPromptBundle,
  finalPrompt: string,
  referenceImageDataUrl?: string | null
): Record<string, unknown> {
  const generationSnapshot = createGenerationSnapshot({
    source: 'asset.image',
    model,
    taskId,
    requestId,
    userPrompt: sourcePrompt,
    finalPrompt,
    promptTemplate: null,
    manuals: { visual: visualManual },
    references: {
      referenceImageCount: referenceImageDataUrl ? 1 : 0,
    },
    extra: {
      asset: {
        id: asset.id,
        type: asset.type,
        parentId: asset.parent_id,
        usage: rule.usage,
        viewMode: rule.viewMode,
      },
      resolution,
      aspectRatio: rule.aspectRatio,
    },
  });

  return {
    schemaVersion: 1,
    assetId: asset.id,
    assetType: asset.type,
    parentAssetId: asset.parent_id,
    usage: rule.usage,
    viewMode: rule.viewMode,
    promptTitle: rule.promptTitle,
    promptEnd: rule.promptEnd,
    promptSources: ['asset.prompt', 'asset.imageRule', 'project.imageQuality', 'visualManual'],
    manuals: {
      visual: toManualPromptSnapshot(visualManual),
    },
    sourcePrompt,
    requestId,
    model,
    resolution,
    aspectRatio: rule.aspectRatio,
    taskId,
    referenceImageCount: referenceImageDataUrl ? 1 : 0,
    generationSnapshot,
  };
}

function safeSucceedTask(taskId: number): void {
  try {
    succeedTask(taskId);
  } catch (error) {
    logger.warn('任务状态', `任务 ${taskId} 标记成功失败`, normalizeUnknownError(error));
  }
}

function safeFailTask(taskId: number, error: unknown): void {
  try {
    failTask(taskId, error);
  } catch (taskError) {
    logger.warn('任务状态', `任务 ${taskId} 标记失败失败`, normalizeUnknownError(taskError));
  }
}

function safeCancelTask(taskId: number, reason: string): void {
  try {
    const task = getTaskDetail(taskId);
    if (task.status === ASSET_TASK_STATUS.RUNNING) {
      cancelTask(taskId, reason);
    }
  } catch (error) {
    logger.warn('任务状态', `任务 ${taskId} 标记取消失败`, normalizeUnknownError(error));
  }
}

function safeParseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function mapMediaRow(row: AssetMediaRow): AssetMediaItem {
  const urls = createMediaUrls(row);
  return {
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    kind: assertMediaKind(row.kind),
    relativePath: row.relative_path,
    source: toAssetSource(row.source),
    usage: assertImageUsage(row.usage),
    viewMode: assertImageViewMode(row.view_mode),
    status: assertTaskStatus(row.status),
    errorReason: row.error_reason,
    prompt: row.prompt,
    model: row.model,
    modelMode: row.model_mode,
    resolution: row.resolution ? assertImageQuality(row.resolution) : null,
    taskId: row.task_id,
    metadata: safeParseMetadata(row.metadata),
    url: urls.url,
    thumbnailUrl: urls.thumbnailUrl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAssetSource(value: string): AssetSource {
  if (value === 'manual' || value === 'extract' || value === 'upload' || value === 'generated') {
    return value;
  }

  return 'manual';
}

function mapAssetRow(
  row: AssetRow,
  mediaByAsset: Map<number, AssetMediaItem[]>,
  childrenByParent: Map<number, AssetItem[]>,
  audioByAsset: Map<number, AssetAudioSummary>
): AssetItem {
  const mediaHistory = mediaByAsset.get(row.id) ?? [];
  const media = mediaHistory.find((item) => item.id === row.media_id) ?? mediaHistory[0] ?? null;
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    type: assertAssetType(row.type),
    name: row.name,
    description: row.description,
    remark: row.remark ?? '',
    prompt: row.prompt ?? '',
    source: toAssetSource(row.source),
    mediaId: row.media_id,
    promptStatus: assertTaskStatus(row.prompt_status),
    promptErrorReason: row.prompt_error_reason,
    imageStatus: assertTaskStatus(row.image_status),
    imageErrorReason: row.image_error_reason,
    audioBindStatus: assertTaskStatus(row.audio_bind_status),
    audioBindErrorReason: row.audio_bind_error_reason,
    dependencyStatus: assertDependencyStatus(row.dependency_status),
    dependencyReason: row.dependency_reason,
    voiceGender: row.voice_gender,
    metadata: safeParseMetadata(row.metadata),
    media,
    mediaHistory,
    children: childrenByParent.get(row.id) ?? [],
    boundAudio: audioByAsset.get(row.id) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadMediaForAssets(assetIds: number[]): Map<number, AssetMediaItem[]> {
  const result = new Map<number, AssetMediaItem[]>();
  if (assetIds.length === 0 || !tableExists('asset_media')) {
    return result;
  }

  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, AssetMediaRow>(
      `
      SELECT *
      FROM asset_media
      WHERE asset_id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
      `
    )
    .all(...assetIds);

  for (const row of rows) {
    const list = result.get(row.asset_id) ?? [];
    list.push(mapMediaRow(row));
    result.set(row.asset_id, list);
  }

  return result;
}

function loadAudioBindings(assetIds: number[]): Map<number, AssetAudioSummary> {
  const result = new Map<number, AssetAudioSummary>();
  if (assetIds.length === 0 || !tableExists('asset_audio_links')) {
    return result;
  }

  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, { asset_id: number; id: number; name: string; description: string; voice_gender: string | null }>(
      `
      SELECT l.asset_id, a.id, a.name, a.description, a.voice_gender
      FROM asset_audio_links l
      JOIN assets a ON a.id = l.audio_asset_id
      WHERE l.asset_id IN (${placeholders})
      `
    )
    .all(...assetIds);

  for (const row of rows) {
    result.set(row.asset_id, {
      id: row.id,
      name: row.name,
      description: row.description,
      voiceGender: row.voice_gender,
    });
  }

  return result;
}

function mapAssetRows(rows: AssetRow[]): AssetItem[] {
  const ids = rows.map((row) => row.id);
  const mediaByAsset = loadMediaForAssets(ids);
  const audioByAsset = loadAudioBindings(ids);
  const itemById = new Map<number, AssetItem>();
  const childrenByParent = new Map<number, AssetItem[]>();

  for (const row of rows.filter((item) => item.parent_id !== null)) {
    const child = mapAssetRow(row, mediaByAsset, new Map(), audioByAsset);
    const list = childrenByParent.get(row.parent_id!) ?? [];
    list.push(child);
    childrenByParent.set(row.parent_id!, list);
    itemById.set(child.id, child);
  }

  for (const row of rows.filter((item) => item.parent_id === null)) {
    const item = mapAssetRow(row, mediaByAsset, childrenByParent, audioByAsset);
    itemById.set(item.id, item);
  }

  return rows.filter((row) => row.parent_id === null).map((row) => itemById.get(row.id)!);
}

function getAssetRowsByIds(projectId: number, assetIds: number[]): AssetRow[] {
  const ids = normalizeIds(assetIds, '资产 ID');
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ?
        AND id IN (${placeholders})
      ORDER BY type ASC, name COLLATE NOCASE ASC, id ASC
      `
    )
    .all(projectId, ...ids);

  if (rows.length !== ids.length) {
    throw createError(VT_STATUS.NOT_FOUND, '部分资产不存在');
  }

  return rows;
}

function getAssetRow(projectId: number, assetId: number): AssetRow {
  const id = normalizeIds([assetId], '资产 ID')[0]!;
  const row = getDatabase().prepare<[number, number], AssetRow>('SELECT * FROM assets WHERE project_id = ? AND id = ? LIMIT 1').get(projectId, id);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '资产不存在');
  }

  return row;
}

function getAssetDetail(projectId: number, assetId: number): AssetItem {
  const rows = getDatabase()
    .prepare<[number, number, number], AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ?
        AND (id = ? OR parent_id = ?)
      ORDER BY parent_id IS NOT NULL, type ASC, name COLLATE NOCASE ASC, id ASC
      `
    )
    .all(projectId, assetId, assetId);
  const [asset] = mapAssetRows(rows);
  if (!asset) {
    throw createError(VT_STATUS.NOT_FOUND, '资产不存在');
  }

  return asset;
}

function assertNotRunningAsset(row: AssetRow, action: string): void {
  if (row.prompt_status === ASSET_TASK_STATUS.RUNNING || row.image_status === ASSET_TASK_STATUS.RUNNING || row.audio_bind_status === ASSET_TASK_STATUS.RUNNING) {
    throw createError(VT_STATUS.TASK_STATUS_CONFLICT, `资产正在生成，不能${action}`);
  }
}

function assertUniqueAssetName(projectId: number, type: AssetType, name: string, id?: number | null): void {
  const row = getDatabase()
    .prepare<[number, string, string, number], { id: number }>(
      `
      SELECT id
      FROM assets
      WHERE project_id = ?
        AND type = ?
        AND lower(name) = lower(?)
        AND id != ?
      LIMIT 1
      `
    )
    .get(projectId, type, name, id ?? 0);
  if (row) {
    throw createError(VT_STATUS.CONFLICT, '同项目同类型资产名称已存在');
  }
}

function assertParent(projectId: number, parentId: number | null, type: AssetType): void {
  if (!parentId) {
    return;
  }

  const row = getAssetRow(projectId, parentId);
  if (row.type !== type) {
    throw createError(VT_STATUS.INVALID_PARAMS, '子资产类型必须和父资产一致');
  }
}

function updateAssetPromptStatus(projectId: number, assetIds: number[], status: AssetTaskStatus, errorReason: string | null = null): void {
  const placeholders = assetIds.map(() => '?').join(', ');
  getDatabase()
    .prepare<Array<number | string | null>, { changes: number }>(
      `
      UPDATE assets
      SET prompt_status = ?, prompt_error_reason = ?, updated_at = ?
      WHERE project_id = ?
        AND id IN (${placeholders})
      `
    )
    .run(status, errorReason, Date.now(), projectId, ...assetIds);
}

function updateAssetImageStatus(projectId: number, assetId: number, status: AssetTaskStatus, errorReason: string | null = null): void {
  getDatabase()
    .prepare<[AssetTaskStatus, string | null, number, number, number]>(
      `
      UPDATE assets
      SET image_status = ?, image_error_reason = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
      `
    )
    .run(status, errorReason, Date.now(), projectId, assetId);
}

function updateAssetAudioBindStatus(projectId: number, assetIds: number[], status: AssetTaskStatus, errorReason: string | null = null): void {
  const placeholders = assetIds.map(() => '?').join(', ');
  getDatabase()
    .prepare<Array<number | string | null>, { changes: number }>(
      `
      UPDATE assets
      SET audio_bind_status = ?, audio_bind_error_reason = ?, updated_at = ?
      WHERE project_id = ?
        AND id IN (${placeholders})
      `
    )
    .run(status, errorReason, Date.now(), projectId, ...assetIds);
}

function insertMedia(
  projectId: number,
  assetId: number,
  kind: AssetMediaKind,
  relativePath: string | null,
  source: AssetSource,
  status: AssetTaskStatus,
  model: string | null,
  resolution: ProjectImageQuality | null,
  errorReason: string | null = null,
  options: AssetMediaInsertOptions = {}
): number {
  const now = Date.now();
  const usage = options.usage ?? (source === 'generated' ? ASSET_IMAGE_USAGES.PRIMARY : ASSET_IMAGE_USAGES.CUSTOM);
  const viewMode = options.viewMode ?? ASSET_IMAGE_VIEW_MODES.STANDARD;
  const result = getDatabase()
    .prepare<[
      number,
      number,
      AssetMediaKind,
      string | null,
      AssetSource,
      AssetImageUsage,
      AssetImageViewMode,
      AssetTaskStatus,
      string | null,
      string | null,
      string | null,
      string | null,
      ProjectImageQuality | null,
      number | null,
      string,
      number,
      number,
    ]>(
      `
      INSERT INTO asset_media (
        project_id, asset_id, kind, relative_path, source, usage, view_mode, status,
        error_reason, prompt, model, model_mode, resolution, task_id, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      projectId,
      assetId,
      kind,
      relativePath,
      source,
      usage,
      viewMode,
      status,
      errorReason,
      options.prompt ?? null,
      model,
      options.modelMode ?? null,
      resolution,
      options.taskId ?? null,
      serializeMetadata(options.metadata),
      now,
      now
    );

  return Number(result.lastInsertRowid);
}

function attachMediaTask(projectId: number, mediaId: number, taskId: number): void {
  getDatabase()
    .prepare<[number, number, number, number]>('UPDATE asset_media SET task_id = ?, updated_at = ? WHERE project_id = ? AND id = ?')
    .run(taskId, Date.now(), projectId, mediaId);
}

function isMediaGenerationCancelled(projectId: number, mediaId: number | null, taskId: number): boolean {
  if (isTaskCancelled(taskId)) {
    return true;
  }

  if (!mediaId) {
    return false;
  }

  const row = getDatabase()
    .prepare<[number, number], { status: string }>('SELECT status FROM asset_media WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, mediaId);

  return row?.status === ASSET_TASK_STATUS.CANCELLED;
}

function saveGeneratedImage(projectId: number, dataUrl: string, assetName: string): string {
  const storedFileName = createStoredFileName(`${createFileStem(assetName, 'asset')}.jpg`, 'jpg');
  const relativePath = mediaRootRelativePath(projectId, 'images', storedFileName);
  writeManagedFile(getRuntimeDirectories().projects, relativePath, parseDataUrl(dataUrl).buffer);
  return relativePath;
}

function tryDeleteProjectMedia(relativePath: string | null): void {
  if (!relativePath) {
    return;
  }

  try {
    deleteManagedFile(getRuntimeDirectories().projects, relativePath);
  } catch (error) {
    logger.warn('资产文件清理', `删除文件失败：${relativePath}`, error);
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, handler: (item: T) => Promise<boolean>): Promise<boolean[]> {
  const results: boolean[] = new Array(items.length).fill(false);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await handler(items[currentIndex]!);
      }
    })
  );

  return results;
}

function getVisualManualKeys(type: GeneratableAssetType, isDerivative: boolean): string[] {
  const keyMap: Record<GeneratableAssetType, { parent: string; derivative: string }> = {
    role: { parent: 'character', derivative: 'characterDerivative' },
    scene: { parent: 'scene', derivative: 'sceneDerivative' },
    tool: { parent: 'prop', derivative: 'propDerivative' },
  };
  const targetKey = isDerivative ? keyMap[type].derivative : keyMap[type].parent;

  return ['prefix', targetKey];
}

function readAssetVisualManual(project: ProjectRow, type: GeneratableAssetType, isDerivative: boolean): ManualPromptBundle {
  return readManualPromptBundle('visual', project.visual_manual_id, getVisualManualKeys(type, isDerivative));
}

function buildAssetManualTaskRefs(project: ProjectRow, assets: AssetRow[]): Array<{ assetId: number; visual: ReturnType<typeof toManualPromptSnapshot> }> {
  return assets.map((asset) => {
    const type = assertGeneratableType(asset.type);
    return {
      assetId: asset.id,
      visual: toManualPromptSnapshot(readAssetVisualManual(project, type, Boolean(asset.parent_id))),
    };
  });
}

function readVisualManualPrompt(project: ProjectRow, type: GeneratableAssetType, isDerivative: boolean, extraInstruction?: string | null): string {
  const visualManual = readAssetVisualManual(project, type, isDerivative);
  return [formatManualPromptSection('资产提示词生成视觉规范', visualManual), extraInstruction?.trim() ?? ''].filter(Boolean).join('\n\n');
}

function buildAssetPromptInput(project: ProjectRow, asset: AssetRow): string {
  return [
    `项目名称：${project.name}`,
    `项目简介：${project.description}`,
    `资产类型：${asset.type}`,
    `资产名称：${asset.name}`,
    `资产描述：${asset.description || '无'}`,
    `当前提示词：${asset.prompt || '无'}`,
    '',
    '请生成可直接用于图片模型的视觉提示词，只返回提示词正文。',
  ].join('\n');
}

async function generatePromptForAsset(project: ProjectRow, asset: AssetRow, extraInstruction?: string | null): Promise<boolean> {
  try {
    const type = assertGeneratableType(asset.type);
    const system = readVisualManualPrompt(project, type, Boolean(asset.parent_id), extraInstruction);
    const result = await invokeText({
      modelKey: 'universalAi',
      system,
      messages: [{ role: 'user', content: buildAssetPromptInput(project, asset) }],
    });
    const prompt = stripThink(result.text ?? '').trim();
    if (!prompt) {
      throw createError(VT_STATUS.MODEL_ERROR, '模型返回了空提示词');
    }

    withTransaction((database) => {
      database
        .prepare<[string, AssetTaskStatus, null, number, number, number]>(
          `
          UPDATE assets
          SET prompt = ?, prompt_status = ?, prompt_error_reason = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `
        )
        .run(prompt, ASSET_TASK_STATUS.SUCCEEDED, null, Date.now(), project.id, asset.id);
      markAssetsDependencyStatus({
        projectId: project.id,
        assetIds: [asset.id],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      if (asset.prompt !== prompt) {
        markProductionForAssetsChanged({
          projectId: project.id,
          assetIds: [asset.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.ASSET_CHANGED,
          database,
        });
      }
    });
    return true;
  } catch (error) {
    getDatabase()
      .prepare<[AssetTaskStatus, string, number, number, number]>(
        `
        UPDATE assets
        SET prompt_status = ?, prompt_error_reason = ?, updated_at = ?
        WHERE project_id = ? AND id = ?
        `
      )
      .run(ASSET_TASK_STATUS.FAILED, normalizeErrorReason(error), Date.now(), project.id, asset.id);
    logger.error('资产提示词生成', `资产 ${asset.id} 生成失败`, normalizeUnknownError(error));
    return false;
  }
}

async function runPromptGeneration(projectId: number, assetIds: number[], taskId: number, extraInstruction?: string | null, concurrentCount?: number | null): Promise<void> {
  try {
    const project = assertProject(projectId);
    const rows = getAssetRowsByIds(projectId, assetIds);
    const results = await runWithConcurrency(rows, normalizeConcurrentCount(concurrentCount), (asset) => generatePromptForAsset(project, asset, extraInstruction));
    const failedCount = results.filter((result) => !result).length;
    if (failedCount > 0) {
      safeFailTask(taskId, new Error(`${failedCount} 个资产提示词生成失败`));
      return;
    }

    safeSucceedTask(taskId);
  } catch (error) {
    updateAssetPromptStatus(projectId, assetIds, ASSET_TASK_STATUS.FAILED, normalizeErrorReason(error));
    safeFailTask(taskId, error);
    logger.error('资产提示词生成', '批量任务失败', normalizeUnknownError(error));
  }
}

async function generateImageForAsset(projectId: number, assetId: number, model: string, resolution: ProjectImageQuality, taskId: number, promptOverride?: string | null, referenceImageDataUrl?: string | null): Promise<boolean> {
  let mediaId: number | null = null;
  try {
    const project = assertProject(projectId);
    const asset = getAssetRow(projectId, assetId);
    const type = assertGeneratableType(asset.type);
    const rule = resolveAssetImageRule(asset);
    const visualManual = readAssetVisualManual(project, type, Boolean(asset.parent_id));
    const sourcePrompt = normalizeRequiredText(promptOverride ?? asset.prompt, '图片提示词');
    const prompt = buildAssetImagePrompt(project, asset, sourcePrompt, rule, resolution, visualManual);
    const requestId = createModelRequestId();
    mediaId = withTransaction((database) => {
      const insertedMediaId = insertMedia(projectId, assetId, 'image', null, 'generated', ASSET_TASK_STATUS.RUNNING, model, resolution, null, {
        usage: rule.usage,
        viewMode: rule.viewMode,
        prompt,
        taskId,
        metadata: {
          ...createGenerationMetadata(asset, rule, sourcePrompt, resolution, model, taskId, requestId, visualManual, prompt, referenceImageDataUrl),
        },
      });
      database
        .prepare<[number, AssetTaskStatus, null, number, number, number]>(
          `
          UPDATE assets
          SET media_id = ?, image_status = ?, image_error_reason = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `
        )
        .run(insertedMediaId, ASSET_TASK_STATUS.RUNNING, null, Date.now(), projectId, assetId);
      return insertedMediaId;
    });
    attachMediaTask(projectId, mediaId, taskId);
    const result = await generateImageByModel(model, {
      requestId,
      prompt,
      size: resolution,
      aspectRatio: rule.aspectRatio,
      referenceList: referenceImageDataUrl ? [{ type: 'image', sourceType: 'base64', base64: referenceImageDataUrl }] : undefined,
      task: {
        taskId,
        projectId,
        category: IMAGE_TASK_CATEGORY,
        description: `生成${type}资产图片：${asset.name}`,
        relatedObjects: { assetId, mediaId },
        isCancelled: () => isMediaGenerationCancelled(projectId, mediaId, taskId),
      },
    });

    const mediaRow = getDatabase()
      .prepare<[number, number], { status: string }>('SELECT status FROM asset_media WHERE project_id = ? AND id = ? LIMIT 1')
      .get(projectId, mediaId);
    if (mediaRow?.status === ASSET_TASK_STATUS.CANCELLED || mediaRow?.status === ASSET_TASK_STATUS.FAILED || isTaskCancelled(taskId)) {
      return false;
    }

    const relativePath = saveGeneratedImage(projectId, result, asset.name);
    withTransaction((database) => {
      database
        .prepare<[string, AssetTaskStatus, null, number, number, number]>(
          `
          UPDATE asset_media
          SET relative_path = ?, status = ?, error_reason = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `
        )
        .run(relativePath, ASSET_TASK_STATUS.SUCCEEDED, null, Date.now(), projectId, mediaId!);
      database
        .prepare<[number, AssetTaskStatus, null, number, number, number]>(
          `
          UPDATE assets
          SET media_id = ?, image_status = ?, image_error_reason = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `
        )
        .run(mediaId!, ASSET_TASK_STATUS.SUCCEEDED, null, Date.now(), projectId, assetId);
      markAssetsDependencyStatus({
        projectId,
        assetIds: [assetId],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      markProductionForAssetsChanged({
        projectId,
        assetIds: [assetId],
        status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
        reason: DEPENDENCY_REASON.ASSET_CHANGED,
        database,
      });
    });
    return true;
  } catch (error) {
    const errorReason = normalizeErrorReason(error);
    withTransaction((database) => {
      if (mediaId) {
        database
          .prepare<[AssetTaskStatus, string, number, number, number]>(
            `
            UPDATE asset_media
            SET status = ?, error_reason = ?, updated_at = ?
            WHERE project_id = ? AND id = ?
            `
          )
          .run(ASSET_TASK_STATUS.FAILED, errorReason, Date.now(), projectId, mediaId);
      }
      updateAssetImageStatus(projectId, assetId, ASSET_TASK_STATUS.FAILED, errorReason);
    });
    logger.error('资产图片生成', `资产 ${assetId} 生成失败`, normalizeUnknownError(error));
    return false;
  }
}

async function runImageGeneration(projectId: number, assetIds: number[], model: string, resolution: ProjectImageQuality, taskId: number, concurrentCount?: number | null): Promise<void> {
  try {
    const results = await runWithConcurrency(assetIds, normalizeConcurrentCount(concurrentCount), (assetId) => generateImageForAsset(projectId, assetId, model, resolution, taskId));
    const failedCount = results.filter((result) => !result).length;
    if (failedCount > 0) {
      if (isTaskCancelled(taskId)) {
        return;
      }
      safeFailTask(taskId, new Error(`${failedCount} 个资产图片生成失败`));
      return;
    }

    safeSucceedTask(taskId);
  } catch (error) {
    for (const assetId of assetIds) {
      updateAssetImageStatus(projectId, assetId, ASSET_TASK_STATUS.FAILED, normalizeErrorReason(error));
    }
    safeFailTask(taskId, error);
    logger.error('资产图片生成', '批量任务失败', normalizeUnknownError(error));
  }
}

async function runSingleImageGeneration(projectId: number, assetId: number, model: string, resolution: ProjectImageQuality, taskId: number, prompt?: string | null, referenceImageDataUrl?: string | null): Promise<void> {
  try {
    const succeeded = await generateImageForAsset(projectId, assetId, model, resolution, taskId, prompt, referenceImageDataUrl);
    if (succeeded) {
      safeSucceedTask(taskId);
      return;
    }

    if (!isTaskCancelled(taskId)) {
      safeFailTask(taskId, new Error('资产图片生成失败'));
    }
  } catch (error) {
    updateAssetImageStatus(projectId, assetId, ASSET_TASK_STATUS.FAILED, normalizeErrorReason(error));
    safeFailTask(taskId, error);
    logger.error('资产图片生成', '单项任务失败', normalizeUnknownError(error));
  }
}

function getAudioCandidates(projectId: number): AssetAudioSummary[] {
  const rows = getDatabase()
    .prepare<[number], AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ?
        AND type = 'audio'
        AND parent_id IS NULL
      ORDER BY name COLLATE NOCASE ASC, id ASC
      `
    )
    .all(projectId);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    voiceGender: row.voice_gender,
  }));
}

function buildAudioBindPrompt(asset: AssetRow, candidates: AssetAudioSummary[]): string {
  return [
    '待匹配资产：',
    `- ID:${asset.id} | 类型:${asset.type} | 名称:${asset.name} | 描述:${asset.description || '无'}`,
    '',
    '候选音频：',
    candidates.map((audio) => `- ID:${audio.id} | 名称:${audio.name} | 性别:${audio.voiceGender || '未设置'} | 描述:${audio.description || '无'}`).join('\n'),
    '',
    '请只通过 resultTool 返回最合适的单个 audioId；没有合适音色可以返回空值。',
  ].join('\n');
}

function saveAudioBinding(projectId: number, assetId: number, audioAssetId: number | null): void {
  const now = Date.now();
  withTransaction((database) => {
    database.prepare<[number]>('DELETE FROM asset_audio_links WHERE asset_id = ?').run(assetId);
    if (audioAssetId) {
      database
        .prepare<[number, number, number]>('INSERT INTO asset_audio_links (asset_id, audio_asset_id, created_at) VALUES (?, ?, ?)')
        .run(assetId, audioAssetId, now);
    }
    database
      .prepare<[AssetTaskStatus, null, number, number, number]>(
        `
        UPDATE assets
        SET audio_bind_status = ?, audio_bind_error_reason = ?, updated_at = ?
        WHERE project_id = ? AND id = ?
        `
      )
      .run(ASSET_TASK_STATUS.SUCCEEDED, null, now, projectId, assetId);
  });
}

async function bindAudioForAsset(projectId: number, asset: AssetRow, candidates: AssetAudioSummary[], systemPrompt: string): Promise<boolean> {
  try {
    const result = await invokeText({
      modelKey: 'universalAi',
      system: systemPrompt,
      messages: [{ role: 'user', content: buildAudioBindPrompt(asset, candidates) }],
      tools: {
        resultTool: tool<AudioBindResult, AudioBindResult>({
          description: '返回最适合当前资产的单个音色 ID。没有合适音色时 audioId 可为空。',
          inputSchema: jsonSchema<AudioBindResult>({
            type: 'object',
            properties: {
              audioId: {
                type: ['number', 'null'],
                description: '候选音频父资产 ID，只能返回一个。',
              },
            },
            additionalProperties: false,
          }),
          execute: (input) => input,
        }),
      },
    });
    const output = result.toolResults?.find((item) => item.toolName === 'resultTool')?.output as AudioBindResult | undefined;
    const audioId = output?.audioId ? Number(output.audioId) : null;
    if (audioId && !candidates.some((candidate) => candidate.id === audioId)) {
      throw createError(VT_STATUS.MODEL_ERROR, '模型返回了不存在的音色 ID');
    }

    saveAudioBinding(projectId, asset.id, audioId);
    return true;
  } catch (error) {
    getDatabase()
      .prepare<[AssetTaskStatus, string, number, number, number]>(
        `
        UPDATE assets
        SET audio_bind_status = ?, audio_bind_error_reason = ?, updated_at = ?
        WHERE project_id = ? AND id = ?
        `
      )
      .run(ASSET_TASK_STATUS.FAILED, normalizeErrorReason(error), Date.now(), projectId, asset.id);
    logger.error('角景音色绑定', `资产 ${asset.id} 绑定失败`, normalizeUnknownError(error));
    return false;
  }
}

async function runAudioBinding(projectId: number, assetIds: number[], taskId: number, concurrentCount?: number | null): Promise<void> {
  try {
    const candidates = getAudioCandidates(projectId);
    if (candidates.length === 0) {
      throw createError(VT_STATUS.NOT_FOUND, '暂无音频素材，请先在资产中心新增音频');
    }
    const assets = getAssetRowsByIds(projectId, assetIds);
    const systemPrompt = getEffectivePromptByType('audioBindPrompt');
    const results = await runWithConcurrency(assets, normalizeConcurrentCount(concurrentCount), (asset) => bindAudioForAsset(projectId, asset, candidates, systemPrompt));
    const failedCount = results.filter((result) => !result).length;
    if (failedCount > 0) {
      safeFailTask(taskId, new Error(`${failedCount} 个角景资产音色绑定失败`));
      return;
    }

    safeSucceedTask(taskId);
  } catch (error) {
    updateAssetAudioBindStatus(projectId, assetIds, ASSET_TASK_STATUS.FAILED, normalizeErrorReason(error));
    safeFailTask(taskId, error);
    logger.error('角景音色绑定', '批量任务失败', normalizeUnknownError(error));
  }
}

export function listAssets(payload: AssetListPayload): AssetListResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const type = assertAssetType(payload.type);
  const page = normalizePage(payload.page);
  const limit = normalizeLimit(payload.limit);
  const keyword = normalizeOptionalText(payload.keyword);
  const where = ['project_id = ?', 'type = ?', 'parent_id IS NULL'];
  const params: Array<string | number> = [projectId, type];
  if (keyword) {
    where.push('name LIKE ?');
    params.push(`%${keyword}%`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const totalRow = getDatabase().prepare<Array<string | number>, { total: number }>(`SELECT COUNT(*) AS total FROM assets ${whereSql}`).get(...params);
  const parents = getDatabase()
    .prepare<Array<string | number>, AssetRow>(
      `
      SELECT *
      FROM assets
      ${whereSql}
      ORDER BY updated_at DESC, id DESC
      LIMIT ? OFFSET ?
      `
    )
    .all(...params, limit, (page - 1) * limit);
  const parentIds = parents.map((row) => row.id);
  const children = parentIds.length > 0
    ? getDatabase()
        .prepare<Array<number>, AssetRow>(`SELECT * FROM assets WHERE project_id = ? AND parent_id IN (${parentIds.map(() => '?').join(', ')}) ORDER BY created_at DESC, id DESC`)
        .all(projectId, ...parentIds)
    : [];

  return {
    data: mapAssetRows([...parents, ...children]),
    total: totalRow?.total ?? 0,
    page,
    limit,
  };
}

export function saveAsset(payload: AssetSavePayload): AssetSaveResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const id = payload.asset.id ? normalizeIds([payload.asset.id], '资产 ID')[0]! : null;
  const type = assertAssetType(payload.asset.type);
  const parentId = payload.asset.parentId ? normalizeIds([payload.asset.parentId], '父资产 ID')[0]! : null;
  const name = normalizeRequiredText(payload.asset.name, '资产名称');
  const description = normalizeOptionalText(payload.asset.description);
  const remark = normalizeOptionalText(payload.asset.remark);
  const prompt = normalizeOptionalText(payload.asset.prompt);
  const voiceGender = normalizeOptionalText(payload.asset.voiceGender) || null;
  assertUniqueAssetName(projectId, type, name, id);
  assertParent(projectId, parentId, type);
  const now = Date.now();

  const savedId = withTransaction((database) => {
    if (id) {
      const existing = getAssetRow(projectId, id);
      assertNotRunningAsset(existing, '编辑');
      const changed =
        existing.parent_id !== parentId ||
        existing.type !== type ||
        existing.name !== name ||
        existing.description !== description ||
        (existing.remark ?? '') !== remark ||
        (existing.prompt ?? '') !== prompt ||
        (existing.voice_gender ?? null) !== voiceGender;
      database
        .prepare<[number | null, AssetType, string, string, string, string, string | null, number, number, number]>(
          `
          UPDATE assets
          SET parent_id = ?, type = ?, name = ?, description = ?, remark = ?, prompt = ?, voice_gender = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `
        )
        .run(parentId, type, name, description, remark, prompt, voiceGender, now, projectId, id);
      markAssetsDependencyStatus({
        projectId,
        assetIds: [id],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      if (changed) {
        markProductionForAssetsChanged({
          projectId,
          assetIds: [id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.ASSET_CHANGED,
          database,
        });
      }
      return id;
    }

    const result = database
      .prepare<[number, number | null, AssetType, string, string, string, string, AssetSource, string | null, number, number]>(
        `
        INSERT INTO assets (
          project_id, parent_id, type, name, description, remark, prompt, source, voice_gender, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(projectId, parentId, type, name, description, remark, prompt, 'manual', voiceGender, now, now);
    return Number(result.lastInsertRowid);
  });

  return {
    asset: getAssetDetail(projectId, parentId ?? savedId),
  };
}

function collectCascadeAssetIds(projectId: number, assetIds: number[]): number[] {
  const ids = normalizeIds(assetIds, '资产 ID');
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, { id: number }>(
      `
      SELECT id
      FROM assets
      WHERE project_id = ?
        AND (id IN (${placeholders}) OR parent_id IN (${placeholders}))
      `
    )
    .all(projectId, ...ids, ...ids);
  return rows.map((row) => row.id);
}

export function deleteAssets(payload: AssetBatchDeletePayload): AssetDeleteResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const requestedIds = normalizeIds(payload.assetIds, '资产 ID');
  const rows = getAssetRowsByIds(projectId, requestedIds);
  rows.forEach((row) => assertNotRunningAsset(row, '删除'));
  const cascadeIds = collectCascadeAssetIds(projectId, requestedIds);
  const placeholders = cascadeIds.map(() => '?').join(', ');
  const mediaRows = cascadeIds.length > 0
    ? getDatabase().prepare<Array<number>, AssetMediaRow>(`SELECT * FROM asset_media WHERE project_id = ? AND asset_id IN (${placeholders})`).all(projectId, ...cascadeIds)
    : [];

  const deletedCount = withTransaction((database) => {
    if (cascadeIds.length === 0) {
      return 0;
    }
    markProductionForAssetsChanged({
      projectId,
      assetIds: cascadeIds,
      status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
      reason: DEPENDENCY_REASON.ASSET_DELETED,
      database,
    });
    database.prepare<Array<number>>(`DELETE FROM script_asset_links WHERE asset_id IN (${placeholders})`).run(...cascadeIds);
    database.prepare<Array<number>>(`DELETE FROM asset_audio_links WHERE asset_id IN (${placeholders}) OR audio_asset_id IN (${placeholders})`).run(...cascadeIds, ...cascadeIds);
    database.prepare<Array<number>>(`DELETE FROM asset_media WHERE project_id = ? AND asset_id IN (${placeholders})`).run(projectId, ...cascadeIds);
    const result = database.prepare<Array<number>, { changes: number }>(`DELETE FROM assets WHERE project_id = ? AND id IN (${placeholders})`).run(projectId, ...cascadeIds);
    return result.changes;
  });

  mediaRows.forEach((row) => tryDeleteProjectMedia(row.relative_path));
  return { deletedCount };
}

export function deleteAsset(payload: AssetDeletePayload): AssetDeleteResult {
  return deleteAssets({ projectId: payload.projectId, assetIds: [payload.assetId] });
}

export function uploadAssetMedia(payload: AssetUploadPayload): AssetUploadResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const parsed = parseDataUrl(payload.dataUrl);
  const kind = inferMediaKind(payload.fileName, parsed.mime);
  if (payload.type === 'audio' && kind !== 'audio') {
    throw createError(VT_STATUS.UNSUPPORTED_FILE_TYPE, '音频素材只能上传音频文件');
  }
  const assetType = payload.type === 'audio' ? 'audio' : 'clip';
  const parentId = payload.parentId ? normalizeIds([payload.parentId], '父资产 ID')[0]! : null;
  if (parentId) {
    assertParent(projectId, parentId, assetType);
  }
  const name = normalizeRequiredText(payload.name ?? payload.fileName, '资产名称');
  const mediaAssetType = payload.type === 'audio' ? 'audio' : 'clips';
  const fileName = createStoredFileName(payload.fileName, DATA_URL_MIME_EXTENSIONS[parsed.mime] ?? 'bin');
  const relativePath = mediaRootRelativePath(projectId, mediaAssetType, fileName);
  writeManagedFile(getRuntimeDirectories().projects, relativePath, parsed.buffer);
  const now = Date.now();

  const assetId = withTransaction((database) => {
    const existingId = payload.assetId ? normalizeIds([payload.assetId], '资产 ID')[0]! : null;
    if (existingId) {
      const existing = getAssetRow(projectId, existingId);
      assertNotRunningAsset(existing, '上传媒体');
      const mediaId = insertMedia(projectId, existingId, kind, relativePath, 'upload', ASSET_TASK_STATUS.SUCCEEDED, null, null);
      database.prepare<[number, AssetTaskStatus, null, number, number, number]>('UPDATE assets SET media_id = ?, image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?').run(mediaId, ASSET_TASK_STATUS.SUCCEEDED, null, now, projectId, existingId);
      markAssetsDependencyStatus({
        projectId,
        assetIds: [existingId],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      markProductionForAssetsChanged({
        projectId,
        assetIds: [existingId],
        status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
        reason: DEPENDENCY_REASON.ASSET_CHANGED,
        database,
      });
      return existing.parent_id ?? existing.id;
    }

    assertUniqueAssetName(projectId, assetType, name, null);
    const insert = database
      .prepare<[number, number | null, AssetType, string, string, string, string, AssetSource, string | null, number, number]>(
        `
        INSERT INTO assets (
          project_id, parent_id, type, name, description, remark, prompt, source, voice_gender, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(projectId, parentId, assetType, name, normalizeOptionalText(payload.description), normalizeOptionalText(payload.remark), normalizeOptionalText(payload.prompt), 'upload', normalizeOptionalText(payload.voiceGender) || null, now, now);
    const insertedId = Number(insert.lastInsertRowid);
    const mediaId = insertMedia(projectId, insertedId, kind, relativePath, 'upload', ASSET_TASK_STATUS.SUCCEEDED, null, null);
    database.prepare<[number, AssetTaskStatus, null, number, number, number]>('UPDATE assets SET media_id = ?, image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?').run(mediaId, ASSET_TASK_STATUS.SUCCEEDED, null, now, projectId, insertedId);
    return parentId ?? insertedId;
  });

  return {
    asset: getAssetDetail(projectId, assetId),
  };
}

export function generateAssetPrompt(payload: AssetProjectPayload & { assetId: number; extraInstruction?: string | null }): AssetGenerateAcceptedResult {
  const projectId = normalizeProjectId(payload.projectId);
  const project = assertProject(projectId);
  const asset = getAssetRow(projectId, payload.assetId);
  assertGeneratableType(asset.type);
  assertNotRunningAsset(asset, '生成提示词');
  const manuals = buildAssetManualTaskRefs(project, [asset]);
  const task = createTask({
    projectId,
    category: PROMPT_TASK_CATEGORY,
    relatedObjects: { assetIds: [asset.id], manuals },
    modelName: 'universalAi',
    description: `生成 ${project.name} 的资产提示词：${asset.name}`,
  });
  updateAssetPromptStatus(projectId, [asset.id], ASSET_TASK_STATUS.RUNNING, null);
  void runPromptGeneration(projectId, [asset.id], task.taskId, payload.extraInstruction, 1);
  return { accepted: true, taskId: task.taskId, assetIds: [asset.id] };
}

export function batchGenerateAssetPrompts(payload: AssetBatchPromptPayload): AssetGenerateAcceptedResult {
  const projectId = normalizeProjectId(payload.projectId);
  const project = assertProject(projectId);
  const assetIds = normalizeIds(payload.assetIds, '资产 ID');
  const rows = getAssetRowsByIds(projectId, assetIds);
  rows.forEach((row) => {
    assertGeneratableType(row.type);
    assertNotRunningAsset(row, '生成提示词');
  });
  const manuals = buildAssetManualTaskRefs(project, rows);
  const task = createTask({
    projectId,
    category: PROMPT_TASK_CATEGORY,
    relatedObjects: { assetIds, manuals },
    modelName: 'universalAi',
    description: `批量生成 ${project.name} 的 ${assetIds.length} 个资产提示词`,
  });
  updateAssetPromptStatus(projectId, assetIds, ASSET_TASK_STATUS.RUNNING, null);
  void runPromptGeneration(projectId, assetIds, task.taskId, payload.extraInstruction, payload.concurrentCount);
  return { accepted: true, taskId: task.taskId, assetIds };
}

export function generateAssetImage(payload: AssetImagePayload): AssetGenerateAcceptedResult {
  const projectId = normalizeProjectId(payload.projectId);
  const project = assertProject(projectId);
  const asset = getAssetRow(projectId, payload.assetId);
  assertGeneratableType(asset.type);
  assertNotRunningAsset(asset, '生成图片');
  const resolution = assertImageQuality(payload.resolution);
  const manuals = buildAssetManualTaskRefs(project, [asset]);
  const task = createTask({
    projectId,
    category: IMAGE_TASK_CATEGORY,
    relatedObjects: { assetIds: [asset.id], manuals },
    modelName: payload.model,
    description: `生成资产图片：${asset.name}`,
  });
  updateAssetImageStatus(projectId, asset.id, ASSET_TASK_STATUS.RUNNING, null);
  void runSingleImageGeneration(projectId, asset.id, payload.model, resolution, task.taskId, payload.prompt, payload.referenceImageDataUrl);
  return { accepted: true, taskId: task.taskId, assetIds: [asset.id] };
}

export function batchGenerateAssetImages(payload: AssetBatchImagePayload): AssetGenerateAcceptedResult {
  const projectId = normalizeProjectId(payload.projectId);
  const project = assertProject(projectId);
  const assetIds = normalizeIds(payload.assetIds, '资产 ID');
  const rows = getAssetRowsByIds(projectId, assetIds);
  rows.forEach((row) => {
    assertGeneratableType(row.type);
    assertNotRunningAsset(row, '生成图片');
    normalizeRequiredText(row.prompt, '图片提示词');
  });
  const resolution = assertImageQuality(payload.resolution);
  const manuals = buildAssetManualTaskRefs(project, rows);
  const task = createTask({
    projectId,
    category: IMAGE_TASK_CATEGORY,
    relatedObjects: { assetIds, manuals },
    modelName: payload.model,
    description: `批量生成 ${project.name} 的 ${assetIds.length} 个资产图片`,
  });
  assetIds.forEach((assetId) => updateAssetImageStatus(projectId, assetId, ASSET_TASK_STATUS.RUNNING, null));
  void runImageGeneration(projectId, assetIds, payload.model, resolution, task.taskId, payload.concurrentCount);
  return { accepted: true, taskId: task.taskId, assetIds };
}

export function selectAssetMedia(payload: AssetMediaSelectPayload): AssetSaveResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const asset = getAssetRow(projectId, payload.assetId);
  const media = getDatabase()
    .prepare<[number, number, number], AssetMediaRow>('SELECT * FROM asset_media WHERE project_id = ? AND asset_id = ? AND id = ? LIMIT 1')
    .get(projectId, asset.id, payload.mediaId);
  if (!media) {
    throw createError(VT_STATUS.NOT_FOUND, '媒体记录不存在');
  }
  if (media.status !== ASSET_TASK_STATUS.SUCCEEDED) {
    throw createError(VT_STATUS.CONFLICT, '只能选择已完成的媒体');
  }

  withTransaction((database) => {
    database
      .prepare<[number, AssetTaskStatus, null, number, number, number]>('UPDATE assets SET media_id = ?, image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?')
      .run(media.id, ASSET_TASK_STATUS.SUCCEEDED, null, Date.now(), projectId, asset.id);
    markAssetsDependencyStatus({
      projectId,
      assetIds: [asset.id],
      status: DEPENDENCY_STATUSES.VALID,
      reason: null,
      database,
    });
    markProductionForAssetsChanged({
      projectId,
      assetIds: [asset.id],
      status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
      reason: DEPENDENCY_REASON.ASSET_CHANGED,
      database,
    });
  });

  return { asset: getAssetDetail(projectId, asset.parent_id ?? asset.id) };
}

export function deleteAssetMedia(payload: AssetMediaDeletePayload): AssetDeleteResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const media = getDatabase().prepare<[number, number], AssetMediaRow>('SELECT * FROM asset_media WHERE project_id = ? AND id = ? LIMIT 1').get(projectId, payload.mediaId);
  if (!media) {
    throw createError(VT_STATUS.NOT_FOUND, '媒体记录不存在');
  }
  const asset = getAssetRow(projectId, media.asset_id);
  if (asset.media_id === media.id && media.status === ASSET_TASK_STATUS.RUNNING) {
    throw createError(VT_STATUS.TASK_STATUS_CONFLICT, '媒体正在生成，不能删除');
  }

  withTransaction((database) => {
    if (asset.media_id === media.id) {
      database.prepare<[null, AssetTaskStatus, null, number, number, number]>('UPDATE assets SET media_id = ?, image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?').run(null, ASSET_TASK_STATUS.IDLE, null, Date.now(), projectId, asset.id);
      markAssetsDependencyStatus({
        projectId,
        assetIds: [asset.id],
        status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
        reason: DEPENDENCY_REASON.ASSET_IMAGE_MISSING,
        database,
      });
      markProductionForAssetsChanged({
        projectId,
        assetIds: [asset.id],
        status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
        reason: DEPENDENCY_REASON.ASSET_IMAGE_MISSING,
        database,
      });
    }
    database.prepare<[number, number]>('DELETE FROM asset_media WHERE project_id = ? AND id = ?').run(projectId, media.id);
  });
  tryDeleteProjectMedia(media.relative_path);

  return { deletedCount: 1 };
}

export function cancelAssetImage(payload: AssetCancelImagePayload): AssetSaveResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const media = getDatabase().prepare<[number, number], AssetMediaRow>('SELECT * FROM asset_media WHERE project_id = ? AND id = ? LIMIT 1').get(projectId, payload.mediaId);
  if (!media) {
    throw createError(VT_STATUS.NOT_FOUND, '媒体记录不存在');
  }
  if (media.status !== ASSET_TASK_STATUS.RUNNING) {
    throw createError(VT_STATUS.TASK_STATUS_CONFLICT, '只有生成中的图片可取消');
  }

  withTransaction((database) => {
    database.prepare<[AssetTaskStatus, string, number, number, number]>('UPDATE asset_media SET status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?').run(ASSET_TASK_STATUS.CANCELLED, '用户取消生成', Date.now(), projectId, media.id);
    updateAssetImageStatus(projectId, media.asset_id, ASSET_TASK_STATUS.CANCELLED, '用户取消生成');
  });
  if (media.task_id) {
    const runningCount = getDatabase()
      .prepare<[number, AssetTaskStatus], { count: number }>('SELECT COUNT(*) AS count FROM asset_media WHERE task_id = ? AND status = ?')
      .get(media.task_id, ASSET_TASK_STATUS.RUNNING)?.count ?? 0;
    if (runningCount === 0) {
      safeCancelTask(media.task_id, '用户取消资产图片生成');
    }
  }

  const asset = getAssetRow(projectId, media.asset_id);
  return { asset: getAssetDetail(projectId, asset.parent_id ?? asset.id) };
}

export function pollAssetPromptStatus(payload: AssetPollPayload): AssetPollResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const assetIds = normalizeIds(payload.assetIds, '资产 ID');
  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number | string>, AssetRow>(`SELECT * FROM assets WHERE project_id = ? AND id IN (${placeholders}) AND prompt_status != ? ORDER BY updated_at DESC, id DESC`)
    .all(projectId, ...assetIds, ASSET_TASK_STATUS.RUNNING);

  return { assets: mapAssetRows(rows) };
}

export function pollAssetImageStatus(payload: AssetPollPayload): AssetPollResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const assetIds = normalizeIds(payload.assetIds, '资产 ID');
  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number | string>, AssetRow>(`SELECT * FROM assets WHERE project_id = ? AND id IN (${placeholders}) AND image_status != ? ORDER BY updated_at DESC, id DESC`)
    .all(projectId, ...assetIds, ASSET_TASK_STATUS.RUNNING);

  return { assets: mapAssetRows(rows) };
}

export function listCornerAssets(payload: CornerAssetListPayload): CornerAssetListResult {
  const projectId = normalizeProjectId(payload.projectId);
  const project = assertProject(projectId);
  const types = (payload.types?.length ? payload.types : GENERATABLE_ASSET_TYPES).map(assertGeneratableType);
  const placeholders = types.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<string | number>, AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ?
        AND parent_id IS NULL
        AND type IN (${placeholders})
      ORDER BY CASE type WHEN 'role' THEN 1 WHEN 'scene' THEN 2 WHEN 'tool' THEN 3 ELSE 9 END, name COLLATE NOCASE ASC, id ASC
      `
    )
    .all(projectId, ...types);

  return {
    assets: mapAssetRows(rows),
    audioAssets: getAudioCandidates(projectId),
    imageModelId: project.image_model_id || null,
    imageQuality: project.image_quality,
    assetsBatchGenerateSize: getBusinessSettings().config.assetsBatchGenerateSize,
  };
}

export function updateAssetAudioBinding(payload: AssetAudioBindingPayload): AssetAudioBindingResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const asset = getAssetRow(projectId, payload.assetId);
  assertGeneratableType(asset.type);
  const audioAssetId = payload.audioAssetId ? normalizeIds([payload.audioAssetId], '音频资产 ID')[0]! : null;
  if (audioAssetId) {
    const audio = getAssetRow(projectId, audioAssetId);
    if (audio.type !== 'audio' || audio.parent_id !== null) {
      throw createError(VT_STATUS.INVALID_PARAMS, '只能绑定音频父资产');
    }
  }
  saveAudioBinding(projectId, asset.id, audioAssetId);
  return { asset: getAssetDetail(projectId, asset.id) };
}

export function batchBindAssetAudio(payload: AssetBatchAudioBindingPayload): AssetGenerateAcceptedResult {
  const projectId = normalizeProjectId(payload.projectId);
  const project = assertProject(projectId);
  const assetIds = normalizeIds(payload.assetIds, '资产 ID');
  const rows = getAssetRowsByIds(projectId, assetIds);
  rows.forEach((row) => {
    assertGeneratableType(row.type);
    assertNotRunningAsset(row, '绑定音色');
  });
  const task = createTask({
    projectId,
    category: AUDIO_BIND_TASK_CATEGORY,
    relatedObjects: { assetIds },
    modelName: 'universalAi',
    description: `批量绑定 ${project.name} 的 ${assetIds.length} 个角景音色`,
  });
  updateAssetAudioBindStatus(projectId, assetIds, ASSET_TASK_STATUS.RUNNING, null);
  void runAudioBinding(projectId, assetIds, task.taskId, payload.concurrentCount);
  return { accepted: true, taskId: task.taskId, assetIds };
}

export function pollAudioBindStatus(payload: AssetPollPayload): AssetPollResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const assetIds = normalizeIds(payload.assetIds, '资产 ID');
  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number | string>, AssetRow>(`SELECT * FROM assets WHERE project_id = ? AND id IN (${placeholders}) AND audio_bind_status != ? ORDER BY updated_at DESC, id DESC`)
    .all(projectId, ...assetIds, ASSET_TASK_STATUS.RUNNING);

  return { assets: mapAssetRows(rows) };
}

export function recoverAssetTaskStatus(reason = RECOVER_REASON): { recovered: number } {
  if (!tableExists('assets')) {
    return { recovered: 0 };
  }

  const now = Date.now();
  const prompt = getDatabase()
    .prepare<[AssetTaskStatus, string, number, AssetTaskStatus], { changes: number }>('UPDATE assets SET prompt_status = ?, prompt_error_reason = ?, updated_at = ? WHERE prompt_status = ?')
    .run(ASSET_TASK_STATUS.FAILED, reason, now, ASSET_TASK_STATUS.RUNNING);
  const image = getDatabase()
    .prepare<[AssetTaskStatus, string, number, AssetTaskStatus], { changes: number }>('UPDATE assets SET image_status = ?, image_error_reason = ?, updated_at = ? WHERE image_status = ?')
    .run(ASSET_TASK_STATUS.FAILED, reason, now, ASSET_TASK_STATUS.RUNNING);
  const audio = getDatabase()
    .prepare<[AssetTaskStatus, string, number, AssetTaskStatus], { changes: number }>('UPDATE assets SET audio_bind_status = ?, audio_bind_error_reason = ?, updated_at = ? WHERE audio_bind_status = ?')
    .run(ASSET_TASK_STATUS.FAILED, reason, now, ASSET_TASK_STATUS.RUNNING);
  if (tableExists('asset_media')) {
    getDatabase()
      .prepare<[AssetTaskStatus, string, number, AssetTaskStatus], { changes: number }>('UPDATE asset_media SET status = ?, error_reason = ?, updated_at = ? WHERE status = ?')
      .run(ASSET_TASK_STATUS.FAILED, reason, now, ASSET_TASK_STATUS.RUNNING);
  }

  return { recovered: prompt.changes + image.changes + audio.changes };
}
