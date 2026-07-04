import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  ASSET_TYPE_VALUES,
  COMMON_VIDEO_RESOLUTIONS,
  DEPENDENCY_STATUSES,
  PROJECT_IMAGE_QUALITY_VALUES,
  PROJECT_VIDEO_RATIOS,
} from '@shared/constants/dictionaries';
import { parseVideoModeKey, serializeVideoMode } from '@shared/constants/model-capabilities';
import { VT_STATUS } from '@shared/constants/status';
import { normalizeUnknownError } from '@shared/errors';
import { ASSET_IMAGE_USAGES, ASSET_IMAGE_VIEW_MODES, type AssetTaskStatus, type AssetType } from '@shared/types/assets';
import { SCRIPT_EXTRACT_STATUS } from '@shared/types/script-agent';
import {
  PRODUCTION_IMAGE_FLOW_OWNER_TYPES,
  PRODUCTION_AGENT_TOOL_NAMES,
  PRODUCTION_AGENT_WORKSPACE_PATCH_FIELDS,
  PRODUCTION_REFERENCE_FILE_TYPES,
  PRODUCTION_REFERENCE_SOURCES,
  PRODUCTION_TASK_STATUS,
  type ProductionAgentContextResult,
  type ProductionAgentDerivedAssetPayload,
  type ProductionAgentDerivedAssetResult,
  type ProductionAgentStoryboardPayload,
  type ProductionAgentStoryboardResult,
  type ProductionAgentToolDescriptor,
  type ProductionAgentToolsResult,
  type ProductionAgentWorkspacePatch,
  type ProductionAgentWorkspacePatchField,
  type ProductionAgentWorkspacePatchPayload,
  type ProductionAgentWorkspacePatchResult,
  type ProductionAssetSummary,
  type ProductionBatchDeleteStoryboardsPayload,
  type ProductionDeleteResult,
  type ProductionDerivedAssetDeletePayload,
  type ProductionDerivedAssetPollResult,
  type ProductionDerivedAssetSavePayload,
  type ProductionGenerateAcceptedResult,
  type ProductionGenerateDerivedAssetsPayload,
  type ProductionGenerateStoryboardsPayload,
  type ProductionGenerateVideoPayload,
  type ProductionGenerateVideoPromptPayload,
  type ProductionFlowData,
  type ProductionImageFlowApplyPayload,
  type ProductionImageFlowApplyResult,
  type ProductionImageFlowData,
  type ProductionImageFlowGetPayload,
  type ProductionImageFlowGetResult,
  type ProductionImageFlowItem,
  type ProductionImageFlowOwnerType,
  type ProductionImageFlowSavePayload,
  type ProductionImageFlowSaveResult,
  type ProductionPollPayload,
  type ProductionReferenceFileType,
  type ProductionReferenceInput,
  type ProductionReferenceSource,
  type ProductionSaveWorkspacePayload,
  type ProductionSaveWorkspaceResult,
  type ProductionSelectVideoPayload,
  type ProductionSelectVideoResult,
  type ProductionScriptOption,
  type ProductionScriptPayload,
  type ProductionStoryboardDeletePayload,
  type ProductionStoryboardItem,
  type ProductionStoryboardPollResult,
  type ProductionStoryboardSavePayload,
  type ProductionStoryboardSaveResult,
  type ProductionTaskStatus,
  type ProductionVideoDeletePayload,
  type ProductionVideoItem,
  type ProductionVideoModeValue,
  type ProductionVideoPollResult,
  type ProductionVideoPromptPollResult,
  type ProductionVideoTrackDeletePayload,
  type ProductionVideoTrackItem,
  type ProductionVideoTrackSavePayload,
  type ProductionVideoTrackSaveResult,
  type ProductionWorkbenchResult,
  type ProductionWorkspaceResult,
} from '@shared/types/production';
import { getDatabase, withTransaction } from '../database';
import { getRuntimeDirectories, readManagedFile, writeManagedFile } from '../file-system';
import { logger } from '../logger';
import { createMediaUrl, createThumbnailMediaUrl, resolveMediaUrlToPath } from '../media';
import { createModelRequestId, generateImageByModel, generateVideoByModel, invokeText, type ReferenceItem, type VideoGenerateInput } from '../model';
import { createError } from '../result';
import { createGenerationSnapshot, createPromptTemplateSnapshot } from '../generation/snapshot';
import { formatManualPromptSection, readManualPromptBundle, toManualPromptSnapshot, type ManualPromptBundle, type ManualPromptSnapshot } from '../project/manual-prompt';
import { getBusinessSettings } from '../settings/business-settings';
import { resolveModelPromptTemplate } from '../settings/model-prompt';
import { getEffectivePromptByType } from '../settings/prompt';
import { stripThink } from '../socket/stripThink';
import { createTask, failTask, isTaskCancelled, succeedTask } from '../task';
import {
  DEPENDENCY_REASON,
  assertDependencyStatus,
  markAssetsDependencyStatus,
  markProductionForAssetsChanged,
  markProductionForScriptsChanged,
  markStoryboardsDependencyStatus,
  markTracksDependencyStatus,
  markVideosDependencyStatus,
  markVideosForStoryboardsChanged,
} from '../dependency-state';

const STORYBOARD_IMAGE_CATEGORY = '生产分镜图片生成';
const DERIVED_ASSET_IMAGE_CATEGORY = '生产衍生资产图片生成';
const VIDEO_PROMPT_CATEGORY = '生产视频提示词生成';
const VIDEO_CATEGORY = '生产视频生成';
const SECRET_REPLACEMENT = '[hidden]';
const DEFAULT_VIDEO_RESOLUTION = COMMON_VIDEO_RESOLUTIONS[0];

const GENERATED_MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
};

const REFERENCE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

type ImageReferenceItem = Extract<ReferenceItem, { type: 'image' }>;

const PRODUCTION_AGENT_TOOLS: ProductionAgentToolDescriptor[] = [
  { name: 'get_flowData', status: 'ready', writes: [], inputKeys: ['projectId', 'scriptId'] },
  { name: 'add_deriveAsset', status: 'ready', writes: ['assets', 'script_asset_links'], inputKeys: ['projectId', 'scriptId', 'parentAssetId', 'name', 'description', 'prompt'] },
  { name: 'del_deriveAsset', status: 'ready', writes: ['assets', 'script_asset_links', 'production_storyboard_asset_links', 'production_image_flows'], inputKeys: ['projectId', 'scriptId', 'assetId'] },
  { name: 'generate_deriveAsset', status: 'ready', writes: ['tasks', 'assets.image_status'], inputKeys: ['projectId', 'scriptId', 'assetIds'] },
  { name: 'generate_storyboard', status: 'ready', writes: ['tasks', 'production_storyboards.image_status'], inputKeys: ['projectId', 'scriptId', 'storyboardIds', 'compulsory'] },
  { name: 'add_flowData_storyboard', status: 'ready', writes: ['production_storyboards', 'production_storyboard_asset_links'], inputKeys: ['projectId', 'scriptId', 'storyboard'] },
  { name: 'run_sub_agent_derive_assets', status: 'reserved', writes: ['assets'], inputKeys: ['projectId', 'scriptId', 'instruction'] },
  { name: 'run_sub_agent_generate_assets', status: 'reserved', writes: ['tasks', 'assets.image_status'], inputKeys: ['projectId', 'scriptId', 'instruction'] },
  { name: 'run_sub_agent_director_plan', status: 'reserved', writes: ['production_workspaces.script_plan'], inputKeys: ['projectId', 'scriptId', 'instruction'] },
  { name: 'run_sub_agent_storyboard_gen', status: 'reserved', writes: ['production_storyboards'], inputKeys: ['projectId', 'scriptId', 'instruction'] },
  { name: 'run_sub_agent_storyboard_panel', status: 'reserved', writes: ['production_storyboards', 'production_storyboard_asset_links'], inputKeys: ['projectId', 'scriptId', 'instruction'] },
  { name: 'run_sub_agent_storyboard_table', status: 'reserved', writes: ['production_workspaces.storyboard_table'], inputKeys: ['projectId', 'scriptId', 'instruction'] },
  { name: 'run_sub_agent_supervision', status: 'reserved', writes: [], inputKeys: ['projectId', 'scriptId', 'instruction'] },
];

interface ProjectRow {
  id: number;
  name: string;
  genre: string;
  description: string;
  video_model_id: string;
  video_mode: string;
  video_ratio: string;
  image_model_id: string;
  image_quality: string;
  visual_manual_id: number;
  director_manual_id: number;
}

interface ScriptRow {
  id: number;
  project_id: number;
  episode_key: string;
  name: string;
  content: string;
}

interface WorkspaceRow {
  id: number;
  project_id: number;
  script_id: number;
  script_plan: string;
  storyboard_table: string;
  positions_json: string;
  created_at: number;
  updated_at: number;
}

interface AssetRow {
  id: number;
  project_id: number;
  parent_id: number | null;
  type: string;
  name: string;
  description: string;
  prompt: string;
  media_id: number | null;
  image_status: string;
  image_error_reason: string | null;
  dependency_status: string;
  dependency_reason: string | null;
}

interface AssetMediaRow {
  id: number;
  project_id: number;
  asset_id: number;
  kind: string;
  relative_path: string | null;
  source: string;
  status: string;
  error_reason: string | null;
}

interface StoryboardRow {
  id: number;
  project_id: number;
  script_id: number;
  sort_index: number;
  prompt: string;
  video_desc: string;
  duration: number;
  relative_path: string | null;
  image_status: string;
  image_error_reason: string | null;
  flow_id: string | null;
  should_generate_image: number;
  track_id: number | null;
  task_id?: number | null;
  generation_metadata?: string | null;
  dependency_status: string;
  dependency_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface VideoTrackRow {
  id: number;
  project_id: number;
  script_id: number;
  sort_index?: number;
  prompt: string;
  duration: number;
  status: string;
  error_reason: string | null;
  mode_json?: string | null;
  selected_video_id: number | null;
  task_id?: number | null;
  generation_metadata?: string | null;
  dependency_status: string;
  dependency_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface VideoRow {
  id: number;
  project_id: number;
  script_id: number;
  track_id: number;
  relative_path: string | null;
  prompt: string;
  duration: number;
  status: string;
  error_reason: string | null;
  mode_json?: string | null;
  reference_json?: string | null;
  resolution?: string | null;
  audio_enabled?: number;
  cover_relative_path?: string | null;
  task_id?: number | null;
  generation_metadata?: string | null;
  dependency_status: string;
  dependency_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface ImageFlowRow {
  id: string;
  project_id: number;
  script_id: number;
  owner_type?: string;
  owner_id?: number | null;
  flow_data: string;
  created_at: number;
  updated_at: number;
}

interface ProductionManualBundles {
  visual: ManualPromptBundle;
  director: ManualPromptBundle;
}

interface ProductionManualSnapshots {
  visual: ManualPromptSnapshot;
  director: ManualPromptSnapshot;
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

function normalizeScriptId(scriptId: number): number {
  if (!Number.isInteger(scriptId) || scriptId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '剧本 ID 无效');
  }

  return scriptId;
}

function normalizeIds(ids: number[], label: string): number[] {
  const normalized = Array.from(new Set((ids ?? []).map((id) => Number(id))));
  if (normalized.length === 0 || normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}无效`);
  }

  return normalized;
}

function normalizeOptionalIds(ids: number[] | undefined | null): number[] {
  if (!ids?.length) {
    return [];
  }

  return normalizeIds(ids, 'ID');
}

function hasSameNumberSet(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const values = new Set(left);
  return right.every((item) => values.has(item));
}

function normalizeRequiredText(value: string | null | undefined, label: string): string {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}不能为空`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function normalizeAgentWorkspacePatches(patches: ProductionAgentWorkspacePatch[] | undefined | null): ProductionAgentWorkspacePatch[] {
  if (!Array.isArray(patches) || patches.length === 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, 'Production Agent 写入内容不能为空');
  }

  return patches.map((patch) => {
    const field = String(patch?.field ?? '') as ProductionAgentWorkspacePatchField;
    if (!PRODUCTION_AGENT_WORKSPACE_PATCH_FIELDS.includes(field)) {
      throw createError(VT_STATUS.INVALID_PARAMS, 'Production Agent 写入字段无效');
    }
    const content = typeof patch.content === 'string' ? patch.content : '';
    if (field === 'script' && !content.trim()) {
      throw createError(VT_STATUS.INVALID_PARAMS, '剧本正文不能为空');
    }

    return { field, content };
  });
}

function normalizeDuration(value: number | null | undefined): number {
  const duration = Number(value ?? 4);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) {
    throw createError(VT_STATUS.INVALID_PARAMS, '时长无效');
  }

  return duration;
}

function assertProject(projectId: number): ProjectRow {
  const id = normalizeProjectId(projectId);
  const row = getDatabase()
    .prepare<[number], ProjectRow>(
      `
      SELECT id, name, genre, description, video_model_id, video_mode, video_ratio, image_model_id, image_quality, visual_manual_id, director_manual_id
      FROM projects
      WHERE id = ?
      LIMIT 1
      `,
    )
    .get(id);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '项目不存在');
  }

  return row;
}

function assertScript(projectId: number, scriptId: number): ScriptRow {
  const row = getDatabase()
    .prepare<[number, number], ScriptRow>('SELECT id, project_id, episode_key, name, content FROM scripts WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, scriptId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '剧本不存在');
  }

  return row;
}

function assertProductionContext(payload: ProductionScriptPayload): { project: ProjectRow; script: ScriptRow } {
  const projectId = normalizeProjectId(payload.projectId);
  const scriptId = normalizeScriptId(payload.scriptId);
  return {
    project: assertProject(projectId),
    script: assertScript(projectId, scriptId),
  };
}

function assertScriptEditableForAgent(projectId: number, scriptId: number): void {
  const row = getDatabase()
    .prepare<[number, number], { extract_status: string }>('SELECT extract_status FROM scripts WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, scriptId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '剧本不存在');
  }
  if (row.extract_status === SCRIPT_EXTRACT_STATUS.WAITING || row.extract_status === SCRIPT_EXTRACT_STATUS.RUNNING) {
    throw createError(VT_STATUS.CONFLICT, '剧本正在资产提取中，暂不能由 Production Agent 改写正文');
  }
}

function assertStatus(value: string): ProductionTaskStatus {
  if (Object.values(PRODUCTION_TASK_STATUS).includes(value as ProductionTaskStatus)) {
    return value as ProductionTaskStatus;
  }

  return PRODUCTION_TASK_STATUS.IDLE;
}

function assertAssetStatus(value: string): AssetTaskStatus {
  if (Object.values(PRODUCTION_TASK_STATUS).includes(value as ProductionTaskStatus)) {
    return value as AssetTaskStatus;
  }

  return PRODUCTION_TASK_STATUS.IDLE as AssetTaskStatus;
}

function toAssetType(value: string): AssetType {
  if (ASSET_TYPE_VALUES.includes(value as AssetType)) {
    return value as AssetType;
  }

  return 'role';
}

function serializeJson(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(value, {});
}

function normalizeMode(value: ProductionVideoModeValue | null | undefined): ProductionVideoModeValue | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length ? items : null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeOwnerType(value: ProductionImageFlowOwnerType | null | undefined): ProductionImageFlowOwnerType {
  if (value && PRODUCTION_IMAGE_FLOW_OWNER_TYPES.includes(value)) {
    return value;
  }

  return 'free';
}

function normalizeReferenceSource(value: string | null | undefined): ProductionReferenceSource {
  if (value && PRODUCTION_REFERENCE_SOURCES.includes(value as ProductionReferenceSource)) {
    return value as ProductionReferenceSource;
  }

  return 'storyboard';
}

function normalizeReferenceFileType(value: string | null | undefined): ProductionReferenceFileType {
  if (value && PRODUCTION_REFERENCE_FILE_TYPES.includes(value as ProductionReferenceFileType)) {
    return value as ProductionReferenceFileType;
  }

  return 'image';
}

function normalizeReferences(value: ProductionReferenceInput[] | undefined | null): ProductionReferenceInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    id: item.id === null || item.id === undefined ? null : Number(item.id),
    source: normalizeReferenceSource(item.source),
    fileType: normalizeReferenceFileType(item.fileType),
    url: item.url ?? null,
    prompt: item.prompt ?? null,
    index: item.index ?? null,
  }));
}

function mediaUrls(relativePath: string | null, kind: 'image' | 'video' | 'audio' = 'image'): { url: string | null; thumbnailUrl: string | null } {
  if (!relativePath) {
    return { url: null, thumbnailUrl: null };
  }

  try {
    return {
      url: createMediaUrl({ root: 'project', relativePath }).url,
      thumbnailUrl: kind === 'image' ? createThumbnailMediaUrl({ root: 'project', relativePath, size: 'list' }).url : null,
    };
  } catch {
    return { url: null, thumbnailUrl: null };
  }
}

function mediaRelativePathFromUrl(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  try {
    const resolved = resolveMediaUrlToPath({ url: normalized });
    if (resolved.root !== 'project') {
      throw createError(VT_STATUS.INVALID_PARAMS, '生产媒体只能保存到项目目录');
    }
    return resolved.relativePath;
  } catch {
    return normalized.replace(/\\/g, '/').replace(/^\/+/, '') || null;
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
  return maskSensitiveText(normalized.message || 'Production generation failed');
}

function normalizeGenerationConcurrency(): number {
  return Math.min(Math.max(getBusinessSettings().config.assetsBatchGenerateSize, 1), 8);
}

function escapeXmlAttribute(value: string | number | boolean | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clampText(value: string, maxLength: number): string {
  const normalized = normalizeOptionalText(value).replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function readProductionStoryboardManuals(project: ProjectRow): ProductionManualBundles {
  return {
    visual: readManualPromptBundle('visual', project.visual_manual_id, ['prefix', 'storyboard']),
    director: readManualPromptBundle('director', project.director_manual_id, ['planning', 'storyboardTable']),
  };
}

function readProductionVideoManuals(project: ProjectRow): ProductionManualBundles {
  return {
    visual: readManualPromptBundle('visual', project.visual_manual_id, ['prefix', 'storyboardVideo']),
    director: readManualPromptBundle('director', project.director_manual_id, ['planning', 'storyboardTable']),
  };
}

function toProductionManualSnapshots(manuals: ProductionManualBundles): ProductionManualSnapshots {
  return {
    visual: toManualPromptSnapshot(manuals.visual),
    director: toManualPromptSnapshot(manuals.director),
  };
}

function formatProductionManuals(title: string, manuals: ProductionManualBundles): string {
  return [
    `【${title}】`,
    formatManualPromptSection('视觉手册', manuals.visual),
    '',
    formatManualPromptSection('导演手册', manuals.director),
  ].join('\n');
}

function buildStoryboardImagePrompt(project: ProjectRow, script: ScriptRow, storyboard: StoryboardRow, basePrompt: string, manuals: ProductionManualBundles): string {
  return [
    '请根据以下生产信息生成分镜首帧图片。',
    '',
    `项目名称：${project.name}`,
    `项目类型：${project.genre}`,
    `项目简介：${project.description || '无'}`,
    `剧本名称：${script.name}`,
    `分镜序号：${storyboard.sort_index + 1}`,
    `分镜描述：${storyboard.video_desc || '无'}`,
    `分镜提示词：${basePrompt}`,
    `画面比例：${project.video_ratio}`,
    `图片规格：${project.image_quality}`,
    '',
    formatProductionManuals('分镜图片生成手册规范', manuals),
    '',
    '输出要求：直接生成符合分镜描述、视觉风格和导演叙事规则的首帧画面。',
  ].join('\n');
}

function getModelNameFromModelId(modelId: string): string {
  const [, modelName] = normalizeOptionalText(modelId).split(/:(.+)/);
  return modelName || modelId;
}

function getAssetRowsByIds(projectId: number, assetIds: number[]): AssetRow[] {
  const uniqueIds = Array.from(new Set(assetIds)).filter((id) => Number.isInteger(id) && id > 0);
  if (!uniqueIds.length) {
    return [];
  }

  const placeholders = uniqueIds.map(() => '?').join(', ');
  return getDatabase()
    .prepare<Array<number>, AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ? AND id IN (${placeholders})
      ORDER BY CASE type WHEN 'role' THEN 1 WHEN 'scene' THEN 2 WHEN 'tool' THEN 3 ELSE 9 END, name COLLATE NOCASE ASC, id ASC
      `,
    )
    .all(projectId, ...uniqueIds);
}

function formatAssetType(type: string): string {
  const labels: Record<string, string> = {
    role: '角色',
    scene: '场景',
    tool: '道具',
    clip: '片段素材',
    audio: '音频',
  };

  return labels[type] ?? type;
}

function buildVideoPromptInput(project: ProjectRow, script: ScriptRow, track: VideoTrackRow, modelName: string, modeKey: string): string {
  const storyboardIds = listStoryboardIdsByTrack(track.id);
  const storyboards = storyboardIds.map((storyboardId) => getStoryboardRow(project.id, script.id, storyboardId));
  if (storyboards.length === 0 && !normalizeOptionalText(track.prompt)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '视频轨道没有关联分镜，无法生成提示词');
  }

  const assetIdsByStoryboard = getStoryboardAssetIds(storyboardIds);
  const allAssetIds = Array.from(new Set([...assetIdsByStoryboard.values()].flat()));
  const assetRows = getAssetRowsByIds(project.id, allAssetIds);
  const assetMap = new Map(assetRows.map((asset) => [asset.id, asset]));
  const assetText = assetRows
    .map((asset) => {
      const parent = asset.parent_id ? `，父资产=${asset.parent_id}` : '';
      return `- A${asset.id}｜${formatAssetType(asset.type)}｜${asset.name}${parent}｜描述：${clampText(asset.description, 180) || '无'}｜图片提示词：${clampText(asset.prompt, 240) || '无'}`;
    })
    .join('\n');
  const storyboardXml = storyboards
    .map((storyboard) => {
      const associatedAssets = (assetIdsByStoryboard.get(storyboard.id) ?? [])
        .map((assetId) => assetMap.get(assetId))
        .filter((asset): asset is AssetRow => Boolean(asset))
        .map((asset) => `A${asset.id}:${asset.name}`)
        .join('/');
      return `<storyboardItem id="${storyboard.id}" index="${storyboard.sort_index + 1}" duration="${storyboard.duration}" shouldGenerateImage="${storyboard.should_generate_image === 1}" associatedAssets="${escapeXmlAttribute(associatedAssets)}" prompt="${escapeXmlAttribute(storyboard.prompt)}" videoDesc="${escapeXmlAttribute(storyboard.video_desc)}"></storyboardItem>`;
    })
    .join('\n');

  return [
    `项目名称：${project.name}`,
    `项目类型：${project.genre}`,
    `项目简介：${project.description}`,
    `剧本名称：${script.name}`,
    `剧本集数：${script.episode_key}`,
    `剧本正文节选：${clampText(script.content, 2000) || '无'}`,
    `视频模型：${modelName}`,
    `视频模式：${modeKey || 'text'}`,
    `轨道 ID：${track.id}`,
    `轨道时长：${track.duration} 秒`,
    `当前轨道提示词：${track.prompt || '无'}`,
    '',
    '关联资产信息：',
    assetText || '无',
    '',
    '分镜信息：',
    storyboardXml || '无',
    '',
    '输出要求：只返回最终可直接交给视频模型的视频提示词正文，不要解释、不要标题、不要 Markdown 分隔线。',
  ].join('\n');
}

function resolveVideoPromptSystem(project: ProjectRow, modeKey: string): { system: string; promptTemplate: ReturnType<typeof createPromptTemplateSnapshot> } {
  const modelId = normalizeRequiredText(project.video_model_id, '视频模型');
  const resolved = resolveModelPromptTemplate({
    modelId,
    modelType: 'video',
    modelMode: modeKey,
  });
  const fallback = getEffectivePromptByType('videoPromptGeneration');

  return {
    system: resolved?.template.content ?? fallback,
    promptTemplate: createPromptTemplateSnapshot(resolved, resolved ? null : fallback, 'videoPromptGeneration'),
  };
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
    }),
  );

  return results;
}

function createFileStem(value: string, fallback: string): string {
  const normalized = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  return normalized.replace(/^\.+$/, '').slice(0, 80).trim() || fallback;
}

function createStoredFileName(fileName: string, fallbackExt: string): string {
  const originalExt = extname(fileName).replace(/^\./, '').toLowerCase();
  const ext = originalExt || fallbackExt;
  return `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;
}

function defaultMimeForKind(kind: 'image' | 'video' | 'audio'): string {
  if (kind === 'image') {
    return 'image/jpeg';
  }
  if (kind === 'audio') {
    return 'audio/mpeg';
  }
  return 'video/mp4';
}

function defaultExtensionForKind(kind: 'image' | 'video' | 'audio'): string {
  return GENERATED_MEDIA_EXTENSIONS[defaultMimeForKind(kind)] ?? 'bin';
}

function imageQualityForModel(value: string): '1K' | '2K' | '4K' {
  if (PROJECT_IMAGE_QUALITY_VALUES.includes(value as '1K' | '2K' | '4K')) {
    return value as '1K' | '2K' | '4K';
  }
  return '1K';
}

function aspectRatioForModel(value: string): VideoGenerateInput['aspectRatio'] {
  return value === PROJECT_VIDEO_RATIOS.PORTRAIT ? PROJECT_VIDEO_RATIOS.PORTRAIT : PROJECT_VIDEO_RATIOS.LANDSCAPE;
}

function decodeGeneratedMedia(content: string, kind: 'image' | 'video' | 'audio'): { buffer: Buffer; extension: string } {
  const normalized = content.trim();
  if (!normalized) {
    throw createError(VT_STATUS.MODEL_ERROR, 'Model returned empty media');
  }

  const dataUrlMatch = normalized.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
    const mime = dataUrlMatch[1].toLowerCase();
    return {
      buffer: Buffer.from(dataUrlMatch[2].replace(/\s/g, ''), 'base64'),
      extension: GENERATED_MEDIA_EXTENSIONS[mime] ?? defaultExtensionForKind(kind),
    };
  }

  const compact = normalized.replace(/\s/g, '');
  if (!/^[a-z0-9+/]+={0,2}$/i.test(compact)) {
    throw createError(VT_STATUS.MODEL_ERROR, 'Model did not return base64 media');
  }

  return {
    buffer: Buffer.from(compact, 'base64'),
    extension: defaultExtensionForKind(kind),
  };
}

function productionMediaRelativePath(projectId: number, folder: 'storyboards' | 'videos' | 'assets', fileName: string): string {
  return `${projectId}/production/${folder}/${fileName}`.replace(/\\/g, '/');
}

function saveGeneratedProductionMedia(projectId: number, folder: 'storyboards' | 'videos' | 'assets', kind: 'image' | 'video' | 'audio', content: string, name: string): string {
  const decoded = decodeGeneratedMedia(content, kind);
  const storedFileName = createStoredFileName(`${createFileStem(name, kind)}.${decoded.extension}`, decoded.extension);
  const relativePath = productionMediaRelativePath(projectId, folder, storedFileName);
  writeManagedFile(getRuntimeDirectories().projects, relativePath, decoded.buffer);
  return relativePath;
}

function runtimeRootPath(root: string): string {
  const directories = getRuntimeDirectories();
  if (root === 'project') {
    return directories.projects;
  }

  const value = (directories as unknown as Record<string, string>)[root];
  if (!value) {
    throw createError(VT_STATUS.INVALID_PARAMS, 'Unsupported media root');
  }

  return value;
}

function inferReferenceMime(fileType: ProductionReferenceFileType, relativePath: string): string {
  const ext = extname(relativePath).replace(/^\./, '').toLowerCase();
  if (REFERENCE_MIME_BY_EXTENSION[ext]) {
    return REFERENCE_MIME_BY_EXTENSION[ext];
  }

  if (fileType === 'video') {
    return 'video/mp4';
  }
  if (fileType === 'audio') {
    return 'audio/mpeg';
  }
  return 'image/jpeg';
}

function readReferenceDataUrl(root: string, relativePath: string, fileType: ProductionReferenceFileType): string {
  const buffer = readManagedFile(runtimeRootPath(root), relativePath);
  return `data:${inferReferenceMime(fileType, relativePath)};base64,${buffer.toString('base64')}`;
}

function referenceTypeForFileType(fileType: ProductionReferenceFileType): ReferenceItem['type'] | null {
  if (fileType === 'image' || fileType === 'video' || fileType === 'audio') {
    return fileType;
  }

  return null;
}

function referenceItemFromRelativePath(relativePath: string, fileType: ProductionReferenceFileType): ReferenceItem | null {
  const type = referenceTypeForFileType(fileType);
  if (!type) {
    return null;
  }

  return {
    type,
    sourceType: 'base64',
    base64: readReferenceDataUrl('project', relativePath, fileType),
  } as ReferenceItem;
}

function imageReferenceItemFromRelativePath(relativePath: string): ImageReferenceItem {
  const item = referenceItemFromRelativePath(relativePath, 'image');
  if (!item || item.type !== 'image') {
    throw createError(VT_STATUS.UNSUPPORTED_FILE_TYPE, 'Image reference is invalid');
  }

  return item;
}

function getAssetRow(projectId: number, assetId: number): AssetRow {
  const row = getDatabase()
    .prepare<[number, number], AssetRow>('SELECT * FROM assets WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, assetId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, 'Asset not found');
  }

  return row;
}

function getSucceededAssetMedia(projectId: number, assetId: number, fileType: ProductionReferenceFileType = 'image'): AssetMediaRow | null {
  const asset = getAssetRow(projectId, assetId);
  if (!tableExists('asset_media')) {
    return null;
  }

  const mediaKind = referenceTypeForFileType(fileType);
  if (!mediaKind) {
    return null;
  }

  return getDatabase()
    .prepare<[number, number, string, string, number], AssetMediaRow>(
      `
      SELECT *
      FROM asset_media
      WHERE project_id = ?
        AND asset_id = ?
        AND kind = ?
        AND status = ?
        AND relative_path IS NOT NULL
      ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, created_at DESC, id DESC
      LIMIT 1
      `,
    )
    .get(projectId, assetId, mediaKind, PRODUCTION_TASK_STATUS.SUCCEEDED, asset.media_id ?? 0) ?? null;
}

function insertAssetMedia(
  projectId: number,
  assetId: number,
  relativePath: string | null,
  status: AssetTaskStatus,
  model: string | null,
  resolution: string | null,
  errorReason: string | null = null,
  options: { prompt?: string | null; taskId?: number | null; metadata?: Record<string, unknown> } = {}
): number {
  const now = Date.now();
  const result = getDatabase()
    .prepare<[number, number, 'image', string | null, 'generated', string, string, AssetTaskStatus, string | null, string | null, string | null, null, string | null, number | null, string, number, number]>(
      `
      INSERT INTO asset_media (
        project_id, asset_id, kind, relative_path, source, usage, view_mode, status,
        error_reason, prompt, model, model_mode, resolution, task_id, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      projectId,
      assetId,
      'image',
      relativePath,
      'generated',
      ASSET_IMAGE_USAGES.DERIVED,
      ASSET_IMAGE_VIEW_MODES.DERIVED,
      status,
      errorReason,
      options.prompt ?? null,
      model,
      null,
      resolution,
      options.taskId ?? null,
      serializeJson(options.metadata, '{}'),
      now,
      now
    );

  return Number(result.lastInsertRowid);
}

function updateAssetImageStatus(projectId: number, assetId: number, status: AssetTaskStatus, errorReason: string | null = null, mediaId?: number | null): void {
  if (mediaId === undefined) {
    getDatabase()
      .prepare<[AssetTaskStatus, string | null, number, number, number]>(
        'UPDATE assets SET image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      )
      .run(status, errorReason, Date.now(), projectId, assetId);
    return;
  }

  getDatabase()
    .prepare<[number | null, AssetTaskStatus, string | null, number, number, number]>(
      'UPDATE assets SET media_id = ?, image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
    )
    .run(mediaId, status, errorReason, Date.now(), projectId, assetId);
}

function buildStoryboardImageReferences(projectId: number, storyboardId: number): ImageReferenceItem[] {
  const assetIds = getStoryboardAssetIds([storyboardId]).get(storyboardId) ?? [];
  return assetIds
    .map((assetId) => getSucceededAssetMedia(projectId, assetId, 'image')?.relative_path ?? null)
    .filter((relativePath): relativePath is string => Boolean(relativePath))
    .map((relativePath) => imageReferenceItemFromRelativePath(relativePath));
}

function createAutoTrackReferences(projectId: number, scriptId: number, trackId: number): ProductionReferenceInput[] {
  return listStoryboardIdsByTrack(trackId)
    .map((storyboardId) => getStoryboardRow(projectId, scriptId, storyboardId))
    .filter((storyboard) => Boolean(storyboard.relative_path))
    .map((storyboard) => ({
      id: storyboard.id,
      source: 'storyboard',
      fileType: 'image',
      url: null,
      prompt: storyboard.prompt || storyboard.video_desc || null,
      index: storyboard.sort_index,
    }));
}

function modelModeFromValue(value: ProductionVideoModeValue | null): VideoGenerateInput['mode'] {
  if (Array.isArray(value)) {
    return value as VideoGenerateInput['mode'];
  }

  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return 'text';
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed as VideoGenerateInput['mode'];
    }
  } catch {
    // Non-JSON modes are valid simple mode values.
  }

  return parseVideoModeKey(normalized) as VideoGenerateInput['mode'];
}

function referenceToModelReference(projectId: number, scriptId: number, reference: ProductionReferenceInput, strict: boolean): ReferenceItem | null {
  const fileType = normalizeReferenceFileType(reference.fileType);
  if (!referenceTypeForFileType(fileType)) {
    return null;
  }

  try {
    if (reference.url) {
      const resolved = resolveMediaUrlToPath({ url: reference.url });
      const dataUrl = readReferenceDataUrl(resolved.root, resolved.relativePath, fileType);
      return { type: referenceTypeForFileType(fileType)!, sourceType: 'base64', base64: dataUrl } as ReferenceItem;
    }

    if (reference.source === 'storyboard' && reference.id) {
      const storyboard = getStoryboardRow(projectId, scriptId, reference.id);
      if (!storyboard.relative_path) {
        throw createError(VT_STATUS.FILE_NOT_FOUND, 'Storyboard reference image is missing');
      }
      return referenceItemFromRelativePath(storyboard.relative_path, 'image');
    }

    if (reference.source === 'assets' && reference.id) {
      const media = getSucceededAssetMedia(projectId, reference.id, fileType);
      if (!media?.relative_path) {
        throw createError(VT_STATUS.FILE_NOT_FOUND, 'Asset reference media is missing');
      }
      return referenceItemFromRelativePath(media.relative_path, fileType);
    }

    if (strict) {
      throw createError(VT_STATUS.INVALID_PARAMS, 'Reference media is invalid');
    }
    return null;
  } catch (error) {
    if (strict) {
      throw error;
    }

    logger.warn('production', 'Skipped unavailable production reference', normalizeUnknownError(error));
    return null;
  }
}

function buildModelReferences(projectId: number, scriptId: number, references: ProductionReferenceInput[], strict: boolean): ReferenceItem[] {
  return references
    .map((reference) => referenceToModelReference(projectId, scriptId, reference, strict))
    .filter((item): item is ReferenceItem => Boolean(item));
}

function safeSucceedTask(taskId: number): void {
  try {
    succeedTask(taskId);
  } catch (error) {
    logger.warn('production', 'Task succeed update skipped', normalizeUnknownError(error));
  }
}

function safeFailTask(taskId: number, error: unknown): void {
  try {
    failTask(taskId, error);
  } catch (taskError) {
    logger.warn('production', 'Task fail update skipped', normalizeUnknownError(taskError));
  }
}

function isStoryboardImageCancelled(projectId: number, storyboardId: number, taskId: number): boolean {
  if (isTaskCancelled(taskId)) {
    return true;
  }

  const row = getDatabase()
    .prepare<[number, number], { image_status: string }>('SELECT image_status FROM production_storyboards WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, storyboardId);

  return row?.image_status === PRODUCTION_TASK_STATUS.CANCELLED;
}

function isDerivedAssetImageCancelled(projectId: number, assetId: number, mediaId: number | null, taskId: number): boolean {
  if (isTaskCancelled(taskId)) {
    return true;
  }

  if (mediaId) {
    const media = getDatabase()
      .prepare<[number, number], { status: string }>('SELECT status FROM asset_media WHERE project_id = ? AND id = ? LIMIT 1')
      .get(projectId, mediaId);
    if (media?.status === PRODUCTION_TASK_STATUS.CANCELLED) {
      return true;
    }
  }

  const asset = getDatabase()
    .prepare<[number, number], { image_status: string }>('SELECT image_status FROM assets WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, assetId);

  return asset?.image_status === PRODUCTION_TASK_STATUS.CANCELLED;
}

function isProductionVideoCancelled(projectId: number, videoId: number, taskId: number): boolean {
  if (isTaskCancelled(taskId)) {
    return true;
  }

  const row = getDatabase()
    .prepare<[number, number], { status: string }>('SELECT status FROM production_videos WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, videoId);

  return row?.status === PRODUCTION_TASK_STATUS.CANCELLED;
}

function validateFlowData(value: ProductionImageFlowData): ProductionImageFlowData {
  const nodes = Array.isArray(value?.nodes) ? value.nodes : [];
  const edges = Array.isArray(value?.edges) ? value.edges : [];
  return {
    nodes: nodes.map((node) => ({
      id: String(node.id),
      type: String(node.type),
      position: {
        x: Number.isFinite(node.position?.x) ? Number(node.position.x) : 0,
        y: Number.isFinite(node.position?.y) ? Number(node.position.y) : 0,
      },
      data: node.data && typeof node.data === 'object' ? node.data : {},
    })),
    edges: edges.map((edge) => ({
      id: String(edge.id),
      source: String(edge.source),
      target: String(edge.target),
    })),
  };
}

function getWorkspaceRow(projectId: number, scriptId: number): WorkspaceRow | null {
  return getDatabase()
    .prepare<[number, number], WorkspaceRow>('SELECT * FROM production_workspaces WHERE project_id = ? AND script_id = ? LIMIT 1')
    .get(projectId, scriptId) ?? null;
}

function ensureWorkspace(projectId: number, scriptId: number): WorkspaceRow {
  const existing = getWorkspaceRow(projectId, scriptId);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  getDatabase()
    .prepare<[number, number, number, number]>(
      `
      INSERT INTO production_workspaces (project_id, script_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      `,
    )
    .run(projectId, scriptId, now, now);

  return getWorkspaceRow(projectId, scriptId)!;
}

function listScriptOptions(projectId: number): ProductionScriptOption[] {
  return getDatabase()
    .prepare<[number], ScriptRow>(
      `
      SELECT id, project_id, episode_key, name, content
      FROM scripts
      WHERE project_id = ?
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(projectId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      episodeKey: row.episode_key,
      content: row.content,
    }));
}

function loadAssetMedia(assetIds: number[]): Map<number, AssetMediaRow | null> {
  const result = new Map<number, AssetMediaRow | null>();
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
      `,
    )
    .all(...assetIds);

  for (const row of rows) {
    if (!result.has(row.asset_id)) {
      result.set(row.asset_id, row);
    }
  }

  return result;
}

function loadAssetFlowIds(projectId: number, scriptId: number, assetIds: number[]): Map<number, string> {
  const result = new Map<number, string>();
  if (assetIds.length === 0 || !tableExists('production_image_flows')) {
    return result;
  }

  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number | string>, { id: string; owner_id: number }>(
      `
      SELECT id, owner_id
      FROM production_image_flows
      WHERE project_id = ?
        AND script_id = ?
        AND owner_type = ?
        AND owner_id IN (${placeholders})
      ORDER BY updated_at DESC
      `,
    )
    .all(projectId, scriptId, 'derivedAsset', ...assetIds);

  for (const row of rows) {
    if (!result.has(row.owner_id)) {
      result.set(row.owner_id, row.id);
    }
  }

  return result;
}

function listProductionAssets(projectId: number, scriptId: number): ProductionAssetSummary[] {
  if (!tableExists('assets') || !tableExists('script_asset_links')) {
    return [];
  }

  const linkedRows = getDatabase()
    .prepare<[number], { asset_id: number }>('SELECT asset_id FROM script_asset_links WHERE script_id = ? ORDER BY created_at ASC, asset_id ASC')
    .all(scriptId);
  const linkedIds = linkedRows.map((row) => row.asset_id);
  if (!linkedIds.length) {
    return [];
  }

  const placeholders = linkedIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ?
        AND (id IN (${placeholders}) OR parent_id IN (${placeholders}))
      ORDER BY parent_id IS NOT NULL, type ASC, name COLLATE NOCASE ASC, id ASC
      `,
    )
    .all(projectId, ...linkedIds, ...linkedIds);
  const mediaByAsset = loadAssetMedia(rows.map((row) => row.id));
  const flowIdByAsset = loadAssetFlowIds(projectId, scriptId, rows.map((row) => row.id));
  const childrenByParent = new Map<number, ProductionAssetSummary[]>();

  const mapRow = (row: AssetRow): ProductionAssetSummary => {
    const selectedMedia = row.media_id ? mediaByAsset.get(row.id) : null;
    const fallbackMedia = mediaByAsset.get(row.id);
    const media = selectedMedia ?? fallbackMedia ?? null;
    const urls = mediaUrls(media?.relative_path ?? null, media?.kind === 'audio' ? 'audio' : media?.kind === 'video' ? 'video' : 'image');
    return {
      id: row.id,
      parentId: row.parent_id,
      type: toAssetType(row.type),
      name: row.name,
      description: row.description,
      prompt: row.prompt,
      imageUrl: urls.thumbnailUrl ?? urls.url,
      imageStatus: assertAssetStatus(row.image_status),
      imageErrorReason: row.image_error_reason,
      dependencyStatus: assertDependencyStatus(row.dependency_status),
      dependencyReason: row.dependency_reason,
      flowId: flowIdByAsset.get(row.id) ?? null,
      children: [],
    };
  };

  for (const row of rows.filter((item) => item.parent_id !== null)) {
    const child = mapRow(row);
    const list = childrenByParent.get(row.parent_id!) ?? [];
    list.push(child);
    childrenByParent.set(row.parent_id!, list);
  }

  return rows
    .filter((row) => row.parent_id === null && linkedIds.includes(row.id))
    .map((row) => ({
      ...mapRow(row),
      children: childrenByParent.get(row.id) ?? [],
    }));
}

function getStoryboardAssetIds(storyboardIds: number[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  if (storyboardIds.length === 0) {
    return result;
  }

  const placeholders = storyboardIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, { storyboard_id: number; asset_id: number }>(
      `
      SELECT storyboard_id, asset_id
      FROM production_storyboard_asset_links
      WHERE storyboard_id IN (${placeholders})
      ORDER BY sort_index ASC, created_at ASC
      `,
    )
    .all(...storyboardIds);

  for (const row of rows) {
    const list = result.get(row.storyboard_id) ?? [];
    list.push(row.asset_id);
    result.set(row.storyboard_id, list);
  }

  return result;
}

function mapStoryboardRow(row: StoryboardRow, associatedAssetIds: number[] = []): ProductionStoryboardItem {
  const urls = mediaUrls(row.relative_path, 'image');
  return {
    id: row.id,
    projectId: row.project_id,
    scriptId: row.script_id,
    index: row.sort_index,
    prompt: row.prompt,
    videoDesc: row.video_desc,
    duration: Number(row.duration),
    trackId: row.track_id,
    flowId: row.flow_id,
    shouldGenerateImage: row.should_generate_image === 1,
    imageStatus: assertStatus(row.image_status),
    imageErrorReason: row.image_error_reason,
    dependencyStatus: assertDependencyStatus(row.dependency_status),
    dependencyReason: row.dependency_reason,
    imageUrl: urls.thumbnailUrl ?? urls.url,
    associatedAssetIds,
    generationMetadata: parseMetadata(row.generation_metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listStoryboards(projectId: number, scriptId: number): ProductionStoryboardItem[] {
  const rows = getDatabase()
    .prepare<[number, number], StoryboardRow>(
      `
      SELECT *
      FROM production_storyboards
      WHERE project_id = ? AND script_id = ?
      ORDER BY sort_index ASC, id ASC
      `,
    )
    .all(projectId, scriptId);
  const assetIds = getStoryboardAssetIds(rows.map((row) => row.id));
  return rows.map((row) => mapStoryboardRow(row, assetIds.get(row.id) ?? []));
}

function getStoryboardRow(projectId: number, scriptId: number, storyboardId: number): StoryboardRow {
  const row = getDatabase()
    .prepare<[number, number, number], StoryboardRow>(
      'SELECT * FROM production_storyboards WHERE project_id = ? AND script_id = ? AND id = ? LIMIT 1',
    )
    .get(projectId, scriptId, storyboardId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '分镜不存在');
  }

  return row;
}

function listStoryboardIdsByTrack(trackId: number): number[] {
  return getDatabase()
    .prepare<[number], { id: number }>('SELECT id FROM production_storyboards WHERE track_id = ? ORDER BY sort_index ASC, id ASC')
    .all(trackId)
    .map((row) => row.id);
}

function mapVideoRow(row: VideoRow): ProductionVideoItem {
  const urls = mediaUrls(row.relative_path, 'video');
  return {
    id: row.id,
    projectId: row.project_id,
    scriptId: row.script_id,
    trackId: row.track_id,
    status: assertStatus(row.status),
    errorReason: row.error_reason,
    dependencyStatus: assertDependencyStatus(row.dependency_status),
    dependencyReason: row.dependency_reason,
    videoUrl: urls.url,
    relativePath: row.relative_path,
    prompt: row.prompt,
    duration: Number(row.duration),
    mode: parseJson<ProductionVideoModeValue | null>(row.mode_json, null),
    resolution: row.resolution ?? null,
    audioEnabled: row.audio_enabled === 1,
    references: normalizeReferences(parseJson<ProductionReferenceInput[]>(row.reference_json, [])),
    taskId: row.task_id ?? null,
    generationMetadata: parseMetadata(row.generation_metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listVideosForTracks(trackIds: number[]): Map<number, ProductionVideoItem[]> {
  const result = new Map<number, ProductionVideoItem[]>();
  if (!trackIds.length) {
    return result;
  }

  const placeholders = trackIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, VideoRow>(
      `
      SELECT *
      FROM production_videos
      WHERE track_id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
      `,
    )
    .all(...trackIds);

  for (const row of rows) {
    const list = result.get(row.track_id) ?? [];
    list.push(mapVideoRow(row));
    result.set(row.track_id, list);
  }

  return result;
}

function mapTrackRow(row: VideoTrackRow, videos: ProductionVideoItem[] = []): ProductionVideoTrackItem {
  return {
    id: row.id,
    projectId: row.project_id,
    scriptId: row.script_id,
    sortIndex: row.sort_index ?? 0,
    prompt: row.prompt,
    duration: Number(row.duration),
    status: assertStatus(row.status),
    errorReason: row.error_reason,
    dependencyStatus: assertDependencyStatus(row.dependency_status),
    dependencyReason: row.dependency_reason,
    mode: parseJson<ProductionVideoModeValue | null>(row.mode_json, null),
    selectedVideoId: row.selected_video_id,
    storyboardIds: listStoryboardIdsByTrack(row.id),
    videos,
    taskId: row.task_id ?? null,
    generationMetadata: parseMetadata(row.generation_metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listVideoTracks(projectId: number, scriptId: number): ProductionVideoTrackItem[] {
  const rows = getDatabase()
    .prepare<[number, number], VideoTrackRow>(
      `
      SELECT *
      FROM production_video_tracks
      WHERE project_id = ? AND script_id = ?
      ORDER BY sort_index ASC, id ASC
      `,
    )
    .all(projectId, scriptId);
  const videosByTrack = listVideosForTracks(rows.map((row) => row.id));
  return rows.map((row) => mapTrackRow(row, videosByTrack.get(row.id) ?? []));
}

function getTrackRow(projectId: number, scriptId: number, trackId: number): VideoTrackRow {
  const row = getDatabase()
    .prepare<[number, number, number], VideoTrackRow>(
      'SELECT * FROM production_video_tracks WHERE project_id = ? AND script_id = ? AND id = ? LIMIT 1',
    )
    .get(projectId, scriptId, trackId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '视频轨道不存在');
  }

  return row;
}

function getTrackDetail(projectId: number, scriptId: number, trackId: number): ProductionVideoTrackItem {
  const row = getTrackRow(projectId, scriptId, trackId);
  return mapTrackRow(row, listVideosForTracks([trackId]).get(trackId) ?? []);
}

function getVideoRow(projectId: number, scriptId: number, videoId: number): VideoRow {
  const row = getDatabase()
    .prepare<[number, number, number], VideoRow>(
      'SELECT * FROM production_videos WHERE project_id = ? AND script_id = ? AND id = ? LIMIT 1',
    )
    .get(projectId, scriptId, videoId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '视频候选不存在');
  }

  return row;
}

function syncStoryboardAssetLinks(database: ReturnType<typeof getDatabase>, storyboardId: number, assetIds: number[], now: number): void {
  database.prepare<[number]>('DELETE FROM production_storyboard_asset_links WHERE storyboard_id = ?').run(storyboardId);
  const insert = database.prepare<[number, number, number, number]>(
    'INSERT OR IGNORE INTO production_storyboard_asset_links (storyboard_id, asset_id, sort_index, created_at) VALUES (?, ?, ?, ?)',
  );
  assetIds.forEach((assetId, index) => insert.run(storyboardId, assetId, index, now));
}

function assertAssetsExist(projectId: number, assetIds: number[]): void {
  if (!assetIds.length) {
    return;
  }

  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, { id: number }>(`SELECT id FROM assets WHERE project_id = ? AND id IN (${placeholders})`)
    .all(projectId, ...assetIds);
  if (rows.length !== assetIds.length) {
    throw createError(VT_STATUS.NOT_FOUND, '部分资产不存在');
  }
}

function normalizeFlowId(value: string | null | undefined): string {
  const normalized = normalizeOptionalText(value);
  return normalized || randomUUID();
}

function mapImageFlowRow(row: ImageFlowRow): ProductionImageFlowItem {
  return {
    id: row.id,
    projectId: row.project_id,
    scriptId: row.script_id,
    ownerType: normalizeOwnerType(row.owner_type as ProductionImageFlowOwnerType),
    ownerId: row.owner_id ?? null,
    flowData: validateFlowData(parseJson<ProductionImageFlowData>(row.flow_data, { nodes: [], edges: [] })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getImageFlowRow(projectId: number, scriptId: number, flowId: string): ImageFlowRow | null {
  return getDatabase()
    .prepare<[number, number, string], ImageFlowRow>(
      'SELECT * FROM production_image_flows WHERE project_id = ? AND script_id = ? AND id = ? LIMIT 1',
    )
    .get(projectId, scriptId, flowId) ?? null;
}

export function getProductionWorkspace(payload: ProductionScriptPayload | { projectId: number; scriptId?: number | null }): ProductionWorkspaceResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const scripts = listScriptOptions(projectId);
  const requestedScriptId = payload.scriptId ? normalizeScriptId(payload.scriptId) : scripts[0]?.id ?? null;
  if (!requestedScriptId) {
    return {
      scripts,
      currentScriptId: null,
      flowData: null,
    };
  }

  const script = assertScript(projectId, requestedScriptId);
  const workspace = ensureWorkspace(projectId, script.id);
  return {
    scripts,
    currentScriptId: script.id,
    flowData: {
      script: script.content,
      scriptPlan: workspace.script_plan,
      storyboardTable: workspace.storyboard_table,
      positions: parseJson(workspace.positions_json, {}),
      assets: listProductionAssets(projectId, script.id),
      storyboards: listStoryboards(projectId, script.id),
      videoTracks: listVideoTracks(projectId, script.id),
    },
  };
}

export function saveProductionWorkspace(payload: ProductionSaveWorkspacePayload): ProductionSaveWorkspaceResult {
  const { script } = assertProductionContext(payload);
  const now = Date.now();
  const positionsJson = serializeJson(payload.positions ?? {}, '{}');

  withTransaction((database) => {
    database
      .prepare<[number, number, string, string, string, number, number, string, string, string, number]>(
        `
        INSERT INTO production_workspaces (
          project_id, script_id, script_plan, storyboard_table, positions_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, script_id) DO UPDATE SET
          script_plan = ?,
          storyboard_table = ?,
          positions_json = ?,
          updated_at = ?
        `,
      )
      .run(
        script.project_id,
        script.id,
        payload.scriptPlan ?? '',
        payload.storyboardTable ?? '',
        positionsJson,
        now,
        now,
        payload.scriptPlan ?? '',
        payload.storyboardTable ?? '',
        positionsJson,
        now,
      );
  });

  return { savedAt: now };
}

export function getProductionAgentTools(): ProductionAgentToolsResult {
  const knownToolNames = new Set(PRODUCTION_AGENT_TOOL_NAMES);
  return {
    tools: PRODUCTION_AGENT_TOOLS.filter((tool) => knownToolNames.has(tool.name)),
    xmlTags: [
      { tag: 'script', writes: 'script', status: 'ready' },
      { tag: 'scriptPlan', writes: 'scriptPlan', status: 'ready' },
      { tag: 'storyboardTable', writes: 'storyboardTable', status: 'ready' },
      { tag: 'storyboardItem', writes: 'storyboard', status: 'ready' },
    ],
  };
}

export function getProductionAgentContext(payload: ProductionScriptPayload): ProductionAgentContextResult {
  const { script, project } = assertProductionContext(payload);
  const workspace = getProductionWorkspace({ projectId: script.project_id, scriptId: script.id });
  if (!workspace.flowData) {
    throw createError(VT_STATUS.NOT_FOUND, '生产工作区不存在');
  }
  const tools = getProductionAgentTools();
  const manuals = readProductionStoryboardManuals(project);
  return {
    projectId: script.project_id,
    scriptId: script.id,
    scriptName: script.name,
    flowData: workspace.flowData,
    manuals: {
      visual: {
        ...toManualPromptSnapshot(manuals.visual),
        content: manuals.visual.content,
      },
      director: {
        ...toManualPromptSnapshot(manuals.director),
        content: manuals.director.content,
      },
    },
    ...tools,
  };
}

function loadFlowData(projectId: number, scriptId: number): ProductionFlowData {
  const workspace = getProductionWorkspace({ projectId, scriptId });
  if (!workspace.flowData) {
    throw createError(VT_STATUS.NOT_FOUND, '生产工作区不存在');
  }

  return workspace.flowData;
}

export function applyProductionAgentWorkspacePatch(payload: ProductionAgentWorkspacePatchPayload): ProductionAgentWorkspacePatchResult {
  const { script } = assertProductionContext(payload);
  const patches = normalizeAgentWorkspacePatches(payload.patches);
  const workspace = ensureWorkspace(script.project_id, script.id);
  const scriptPatch = patches.find((patch) => patch.field === 'script');
  const scriptPlanPatch = patches.find((patch) => patch.field === 'scriptPlan');
  const storyboardTablePatch = patches.find((patch) => patch.field === 'storyboardTable');
  const now = Date.now();

  withTransaction((database) => {
    if (scriptPatch) {
      assertScriptEditableForAgent(script.project_id, script.id);
      const contentChanged = script.content !== scriptPatch.content;
      database
        .prepare<[string, string, null, string, null, number, number, number]>(
          `
          UPDATE scripts
          SET content = ?, extract_status = ?, error_reason = ?, dependency_status = ?, dependency_reason = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `,
        )
        .run(scriptPatch.content, SCRIPT_EXTRACT_STATUS.IDLE, null, DEPENDENCY_STATUSES.VALID, null, now, script.project_id, script.id);
      if (contentChanged) {
        markProductionForScriptsChanged({
          projectId: script.project_id,
          scriptIds: [script.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.SCRIPT_CHANGED,
          database,
        });
      }
    }
    if (scriptPlanPatch || storyboardTablePatch) {
      database
        .prepare<[string, string, number, number, number]>(
          `
          UPDATE production_workspaces
          SET script_plan = ?,
              storyboard_table = ?,
              updated_at = ?
          WHERE project_id = ? AND script_id = ?
          `,
        )
        .run(
          scriptPlanPatch?.content ?? workspace.script_plan,
          storyboardTablePatch?.content ?? workspace.storyboard_table,
          now,
          script.project_id,
          script.id,
        );
    }
  });

  return {
    appliedCount: patches.length,
    patches: patches.map((patch) => ({ field: patch.field })),
    flowData: loadFlowData(script.project_id, script.id),
  };
}

export function saveProductionStoryboard(payload: ProductionStoryboardSavePayload): ProductionStoryboardSaveResult {
  const { script } = assertProductionContext(payload);
  const assetIds = normalizeOptionalIds(payload.associatedAssetIds);
  assertAssetsExist(script.project_id, assetIds);
  const now = Date.now();
  const prompt = normalizeOptionalText(payload.prompt);
  const videoDesc = normalizeRequiredText(payload.videoDesc, '分镜描述');
  const duration = normalizeDuration(payload.duration);
  const shouldGenerateImage = payload.shouldGenerateImage === false ? 0 : 1;
  const sortIndex = payload.index === undefined || payload.index === null ? null : Number(payload.index);

  const storyboardId = withTransaction((database) => {
    if (payload.id) {
      const existing = getStoryboardRow(script.project_id, script.id, payload.id);
      const linkedBefore = getStoryboardAssetIds([existing.id]).get(existing.id) ?? [];
      const changed =
        existing.prompt !== prompt ||
        existing.video_desc !== videoDesc ||
        Number(existing.duration) !== duration ||
        existing.should_generate_image !== shouldGenerateImage ||
        !hasSameNumberSet(linkedBefore, assetIds);
      database
        .prepare<[number | null, string, string, number, number, number, number, number]>(
          `
          UPDATE production_storyboards
          SET sort_index = COALESCE(?, sort_index),
              prompt = ?,
              video_desc = ?,
              duration = ?,
              should_generate_image = ?,
              updated_at = ?
          WHERE project_id = ? AND id = ?
          `,
        )
        .run(sortIndex, prompt, videoDesc, duration, shouldGenerateImage, now, script.project_id, existing.id);
      syncStoryboardAssetLinks(database, existing.id, assetIds, now);
      markStoryboardsDependencyStatus({
        projectId: script.project_id,
        scriptId: script.id,
        storyboardIds: [existing.id],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      if (changed) {
        markVideosForStoryboardsChanged({
          projectId: script.project_id,
          scriptId: script.id,
          storyboardIds: [existing.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.STORYBOARD_CHANGED,
          database,
        });
      }
      return existing.id;
    }

    const finalSortIndex = sortIndex ?? getDatabase()
      .prepare<[number, number], { next_index: number }>(
        'SELECT COALESCE(MAX(sort_index), -1) + 1 AS next_index FROM production_storyboards WHERE project_id = ? AND script_id = ?',
      )
      .get(script.project_id, script.id)?.next_index ?? 0;
    const insert = database
      .prepare<[number, number, number, string, string, number, number, ProductionTaskStatus, number, number]>(
        `
        INSERT INTO production_storyboards (
          project_id, script_id, sort_index, prompt, video_desc, duration, should_generate_image, image_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(script.project_id, script.id, finalSortIndex, prompt, videoDesc, duration, shouldGenerateImage, PRODUCTION_TASK_STATUS.IDLE, now, now);
    const insertedId = Number(insert.lastInsertRowid);
    syncStoryboardAssetLinks(database, insertedId, assetIds, now);
    return insertedId;
  });

  const associated = getStoryboardAssetIds([storyboardId]).get(storyboardId) ?? [];
  return {
    storyboard: mapStoryboardRow(getStoryboardRow(script.project_id, script.id, storyboardId), associated),
  };
}

export function createProductionAgentStoryboard(payload: ProductionAgentStoryboardPayload): ProductionAgentStoryboardResult {
  const { script } = assertProductionContext(payload);
  const result = saveProductionStoryboard({
    projectId: script.project_id,
    scriptId: script.id,
    id: payload.storyboard.id ?? null,
    prompt: payload.storyboard.prompt ?? '',
    videoDesc: payload.storyboard.videoDesc,
    duration: payload.storyboard.duration ?? 4,
    associatedAssetIds: payload.storyboard.associatedAssetIds,
    index: payload.storyboard.index,
    shouldGenerateImage: payload.storyboard.shouldGenerateImage,
  });

  return {
    storyboard: result.storyboard,
    flowData: loadFlowData(script.project_id, script.id),
  };
}

export function deleteProductionStoryboards(payload: ProductionBatchDeleteStoryboardsPayload): ProductionDeleteResult {
  const { script } = assertProductionContext(payload);
  const storyboardIds = normalizeIds(payload.storyboardIds, '分镜 ID');
  const rows = storyboardIds.map((id) => getStoryboardRow(script.project_id, script.id, id));
  const trackIds = Array.from(new Set(rows.map((row) => row.track_id).filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)));
  const deletedCount = withTransaction((database) => {
    const placeholders = rows.map(() => '?').join(', ');
    database.prepare<Array<number>>(`DELETE FROM production_storyboard_asset_links WHERE storyboard_id IN (${placeholders})`).run(...storyboardIds);
    database.prepare<Array<number>>(`DELETE FROM production_image_flows WHERE owner_type = 'storyboard' AND owner_id IN (${placeholders})`).run(...storyboardIds);
    const result = database
      .prepare<Array<number>, { changes: number }>(
        `DELETE FROM production_storyboards WHERE project_id = ? AND script_id = ? AND id IN (${placeholders})`,
      )
      .run(script.project_id, script.id, ...storyboardIds);
    markTracksDependencyStatus({
      projectId: script.project_id,
      scriptId: script.id,
      trackIds,
      status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
      reason: DEPENDENCY_REASON.STORYBOARD_DELETED,
      database,
    });
    markVideosDependencyStatus({
      projectId: script.project_id,
      scriptId: script.id,
      trackIds,
      status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
      reason: DEPENDENCY_REASON.STORYBOARD_DELETED,
      database,
    });
    return result.changes;
  });

  return { deletedCount };
}

export function deleteProductionStoryboard(payload: ProductionStoryboardDeletePayload): ProductionDeleteResult {
  return deleteProductionStoryboards({
    projectId: payload.projectId,
    scriptId: payload.scriptId,
    storyboardIds: [payload.storyboardId],
  });
}

async function generateProductionStoryboardImage(project: ProjectRow, script: ScriptRow, storyboardId: number, model: string, taskId: number): Promise<boolean> {
  try {
    const storyboard = getStoryboardRow(script.project_id, script.id, storyboardId);
    const basePrompt = normalizeRequiredText(storyboard.prompt || storyboard.video_desc, 'Storyboard image prompt');
    const manuals = readProductionStoryboardManuals(project);
    const prompt = buildStoryboardImagePrompt(project, script, storyboard, basePrompt, manuals);
    const requestId = createModelRequestId();
    const generationMetadata = createGenerationSnapshot({
      source: 'production.storyboardImage',
      model,
      taskId,
      requestId,
      userPrompt: basePrompt,
      finalPrompt: prompt,
      manuals,
      references: {
        assetIds: getStoryboardAssetIds([storyboard.id]).get(storyboard.id) ?? [],
      },
      extra: {
        storyboardId: storyboard.id,
        scriptId: script.id,
        imageQuality: project.image_quality,
        aspectRatio: project.video_ratio,
      },
    });
    getDatabase()
      .prepare<[string, number, number, number]>(
        'UPDATE production_storyboards SET generation_metadata = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      )
      .run(serializeJson(generationMetadata, '{}'), Date.now(), script.project_id, storyboard.id);
    const result = await generateImageByModel(model, {
      requestId,
      prompt,
      size: imageQualityForModel(project.image_quality),
      aspectRatio: aspectRatioForModel(project.video_ratio),
      referenceList: buildStoryboardImageReferences(script.project_id, storyboard.id),
      task: {
        taskId,
        projectId: script.project_id,
        category: STORYBOARD_IMAGE_CATEGORY,
        description: `Generate storyboard image ${storyboard.id}`,
        relatedObjects: { scriptId: script.id, storyboardId: storyboard.id, manuals: toProductionManualSnapshots(manuals) },
        isCancelled: () => isStoryboardImageCancelled(script.project_id, storyboard.id, taskId),
      },
    });
    if (isStoryboardImageCancelled(script.project_id, storyboard.id, taskId)) {
      return false;
    }
    const relativePath = saveGeneratedProductionMedia(script.project_id, 'storyboards', 'image', result, `storyboard_${storyboard.sort_index + 1}`);

    withTransaction((database) => {
      database
        .prepare<[string, ProductionTaskStatus, null, number, string, null, number, number, number]>(
          `
          UPDATE production_storyboards
          SET relative_path = ?, image_status = ?, image_error_reason = ?, should_generate_image = ?,
              dependency_status = ?, dependency_reason = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `,
        )
        .run(relativePath, PRODUCTION_TASK_STATUS.SUCCEEDED, null, 1, DEPENDENCY_STATUSES.VALID, null, Date.now(), script.project_id, storyboard.id);
      markVideosForStoryboardsChanged({
        projectId: script.project_id,
        scriptId: script.id,
        storyboardIds: [storyboard.id],
        status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
        reason: DEPENDENCY_REASON.STORYBOARD_CHANGED,
        database,
      });
    });
    return true;
  } catch (error) {
    const reason = normalizeErrorReason(error);
    getDatabase()
      .prepare<[ProductionTaskStatus, string, number, number, number]>(
        'UPDATE production_storyboards SET image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      )
      .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, storyboardId);
    logger.error('production', `Storyboard image generation failed: ${storyboardId}`, normalizeUnknownError(error));
    return false;
  }
}

async function runProductionStoryboardImageGeneration(project: ProjectRow, script: ScriptRow, storyboardIds: number[], taskId: number, model: string): Promise<void> {
  try {
    const modelKey = normalizeRequiredText(model, 'Image model');
    const results = await runWithConcurrency(storyboardIds, normalizeGenerationConcurrency(), (storyboardId) => generateProductionStoryboardImage(project, script, storyboardId, modelKey, taskId));
    const failedCount = results.filter((result) => !result).length;
    if (failedCount > 0) {
      safeFailTask(taskId, new Error(`${failedCount} storyboard image generations failed`));
      return;
    }

    safeSucceedTask(taskId);
  } catch (error) {
    const reason = normalizeErrorReason(error);
    const placeholders = storyboardIds.map(() => '?').join(', ');
    getDatabase()
      .prepare<Array<number | string>, { changes: number }>(
        `UPDATE production_storyboards SET image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id IN (${placeholders})`,
      )
      .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, ...storyboardIds);
    safeFailTask(taskId, error);
    logger.error('production', 'Storyboard image generation batch failed', normalizeUnknownError(error));
  }
}

export function generateProductionStoryboardImages(payload: ProductionGenerateStoryboardsPayload): ProductionGenerateAcceptedResult {
  const { script, project } = assertProductionContext(payload);
  const storyboardIds = normalizeIds(payload.storyboardIds, '分镜 ID');
  const rows = storyboardIds.map((id) => getStoryboardRow(script.project_id, script.id, id));
  const idsToGenerate = payload.compulsory
    ? storyboardIds
    : rows.filter((row) => row.should_generate_image === 1).map((row) => row.id);
  const skippedIds = storyboardIds.filter((id) => !idsToGenerate.includes(id));
  if (skippedIds.length) {
    const placeholders = skippedIds.map(() => '?').join(', ');
    getDatabase()
      .prepare<Array<number | string | null>, { changes: number }>(
        `UPDATE production_storyboards SET image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND script_id = ? AND id IN (${placeholders})`,
      )
      .run(PRODUCTION_TASK_STATUS.IDLE, null, Date.now(), script.project_id, script.id, ...skippedIds);
  }
  if (!idsToGenerate.length) {
    throw createError(VT_STATUS.INVALID_PARAMS, '没有需要生成图片的分镜');
  }

  const model = normalizeOptionalText(project.image_model_id);
  const manuals = toProductionManualSnapshots(readProductionStoryboardManuals(project));
  const task = createTask({
    projectId: script.project_id,
    category: STORYBOARD_IMAGE_CATEGORY,
    relatedObjects: { ids: idsToGenerate, manuals },
    modelName: model || null,
    description: `Generate ${idsToGenerate.length} storyboard images`,
  });
  const placeholders = idsToGenerate.map(() => '?').join(', ');
  getDatabase()
    .prepare<Array<number | string | null>, { changes: number }>(
      `UPDATE production_storyboards SET image_status = ?, image_error_reason = ?, task_id = ?, updated_at = ? WHERE project_id = ? AND script_id = ? AND id IN (${placeholders})`,
    )
    .run(PRODUCTION_TASK_STATUS.RUNNING, null, task.taskId, Date.now(), script.project_id, script.id, ...idsToGenerate);
  void runProductionStoryboardImageGeneration(project, script, idsToGenerate, task.taskId, model);

  return {
    accepted: true,
    taskId: task.taskId,
    ids: idsToGenerate,
  };
}

export function generateProductionAgentStoryboardImages(payload: ProductionGenerateStoryboardsPayload): ProductionGenerateAcceptedResult {
  return generateProductionStoryboardImages(payload);
}

export function pollProductionStoryboards(payload: ProductionPollPayload): ProductionStoryboardPollResult {
  const { script } = assertProductionContext(payload);
  const ids = normalizeIds(payload.ids, '分镜 ID');
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number | string>, StoryboardRow>(
      `
      SELECT *
      FROM production_storyboards
      WHERE project_id = ? AND script_id = ? AND id IN (${placeholders}) AND image_status != ?
      ORDER BY sort_index ASC, id ASC
      `,
    )
    .all(script.project_id, script.id, ...ids, PRODUCTION_TASK_STATUS.RUNNING);
  const assetIds = getStoryboardAssetIds(rows.map((row) => row.id));
  return {
    storyboards: rows.map((row) => mapStoryboardRow(row, assetIds.get(row.id) ?? [])),
  };
}

export function saveProductionDerivedAsset(payload: ProductionDerivedAssetSavePayload): ProductionDerivedAssetPollResult {
  const { script } = assertProductionContext(payload);
  const parent = getDatabase()
    .prepare<[number, number], AssetRow>('SELECT * FROM assets WHERE project_id = ? AND id = ? LIMIT 1')
    .get(script.project_id, payload.parentAssetId);
  if (!parent) {
    throw createError(VT_STATUS.NOT_FOUND, '父资产不存在');
  }
  const name = normalizeRequiredText(payload.name, '衍生资产名称');
  const now = Date.now();
  const assetId = withTransaction((database) => {
    if (payload.id) {
      const existing = database.prepare<[number, number], AssetRow>('SELECT * FROM assets WHERE project_id = ? AND id = ? LIMIT 1').get(script.project_id, payload.id);
      if (!existing || existing.parent_id !== parent.id) {
        throw createError(VT_STATUS.NOT_FOUND, '衍生资产不存在');
      }
      const description = normalizeOptionalText(payload.description);
      const prompt = normalizeOptionalText(payload.prompt);
      const changed = existing.name !== name || existing.description !== description || existing.prompt !== prompt;
      database
        .prepare<[string, string, string, number, number, number]>(
          `
          UPDATE assets
          SET name = ?, description = ?, prompt = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `,
        )
        .run(name, description, prompt, now, script.project_id, existing.id);
      markAssetsDependencyStatus({
        projectId: script.project_id,
        assetIds: [existing.id],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      if (changed) {
        markProductionForAssetsChanged({
          projectId: script.project_id,
          assetIds: [existing.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.ASSET_CHANGED,
          database,
        });
      }
      return existing.id;
    }

    const insert = database
      .prepare<[number, number, AssetType, string, string, string, 'manual', number, number]>(
        `
        INSERT INTO assets (project_id, parent_id, type, name, description, prompt, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(script.project_id, parent.id, toAssetType(parent.type), name, normalizeOptionalText(payload.description), normalizeOptionalText(payload.prompt), 'manual', now, now);
    const insertedId = Number(insert.lastInsertRowid);
    database.prepare<[number, number, number]>('INSERT OR IGNORE INTO script_asset_links (script_id, asset_id, created_at) VALUES (?, ?, ?)').run(script.id, insertedId, now);
    return insertedId;
  });

  return {
    assets: listProductionAssets(script.project_id, script.id).flatMap((asset) => [asset, ...asset.children]).filter((asset) => asset.id === assetId || asset.id === parent.id),
  };
}

export function createProductionAgentDerivedAsset(payload: ProductionAgentDerivedAssetPayload): ProductionAgentDerivedAssetResult {
  const { script } = assertProductionContext(payload);
  const result = saveProductionDerivedAsset({
    projectId: script.project_id,
    scriptId: script.id,
    id: payload.asset.id ?? null,
    parentAssetId: payload.asset.parentAssetId,
    name: payload.asset.name,
    description: payload.asset.description,
    prompt: payload.asset.prompt,
  });

  return {
    assets: result.assets,
    flowData: loadFlowData(script.project_id, script.id),
  };
}

export function deleteProductionDerivedAsset(payload: ProductionDerivedAssetDeletePayload): ProductionDeleteResult {
  const { script } = assertProductionContext(payload);
  const assetId = normalizeIds([payload.assetId], '资产 ID')[0]!;
  const asset = getDatabase().prepare<[number, number], AssetRow>('SELECT * FROM assets WHERE project_id = ? AND id = ? LIMIT 1').get(script.project_id, assetId);
  if (!asset || !asset.parent_id) {
    throw createError(VT_STATUS.NOT_FOUND, '衍生资产不存在');
  }

  const deletedCount = withTransaction((database) => {
    markProductionForAssetsChanged({
      projectId: script.project_id,
      assetIds: [assetId],
      status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
      reason: DEPENDENCY_REASON.ASSET_DELETED,
      database,
    });
    database.prepare<[number]>('DELETE FROM script_asset_links WHERE asset_id = ?').run(assetId);
    database.prepare<[number]>('DELETE FROM production_storyboard_asset_links WHERE asset_id = ?').run(assetId);
    database.prepare<[string, number]>('DELETE FROM production_image_flows WHERE owner_type = ? AND owner_id = ?').run('derivedAsset', assetId);
    if (tableExists('asset_media')) {
      database.prepare<[number, number]>('DELETE FROM asset_media WHERE project_id = ? AND asset_id = ?').run(script.project_id, assetId);
    }
    const result = database.prepare<[number, number], { changes: number }>('DELETE FROM assets WHERE project_id = ? AND id = ?').run(script.project_id, assetId);
    return result.changes;
  });

  return { deletedCount };
}

async function generateProductionDerivedAssetImage(project: ProjectRow, script: ScriptRow, assetId: number, model: string, taskId: number): Promise<boolean> {
  let mediaId: number | null = null;
  try {
    const asset = getAssetRow(script.project_id, assetId);
    if (!asset.parent_id) {
      throw createError(VT_STATUS.NOT_FOUND, 'Derived asset not found');
    }

    const basePrompt = normalizeRequiredText(asset.prompt || asset.description, 'Derived asset image prompt');
    const manuals = readProductionStoryboardManuals(project);
    const prompt = [
      basePrompt,
      '',
      formatProductionManuals('衍生资产图片生成手册规范', manuals),
    ].join('\n');
    const requestId = createModelRequestId();
    mediaId = withTransaction((database) => {
      const resolution = imageQualityForModel(project.image_quality);
      const insertedMediaId = insertAssetMedia(script.project_id, asset.id, null, PRODUCTION_TASK_STATUS.RUNNING, model, resolution, null, {
        prompt,
        taskId,
        metadata: {
          schemaVersion: 1,
          assetId: asset.id,
          assetType: asset.type,
          parentAssetId: asset.parent_id,
          usage: ASSET_IMAGE_USAGES.DERIVED,
          viewMode: ASSET_IMAGE_VIEW_MODES.DERIVED,
          promptSources: ['asset.prompt', 'parentAsset.image', 'project.imageQuality', 'visualManual', 'directorManual'],
          manuals: toProductionManualSnapshots(manuals),
          sourcePrompt: basePrompt,
          requestId,
          model,
          resolution,
          taskId,
          generationSnapshot: createGenerationSnapshot({
            source: 'production.derivedAssetImage',
            model,
            taskId,
            requestId,
            userPrompt: basePrompt,
            finalPrompt: prompt,
            manuals,
            references: {
              parentAssetId: asset.parent_id,
              parentReferenceCount: 1,
            },
            extra: {
              assetId: asset.id,
              assetType: asset.type,
              resolution,
              aspectRatio: project.video_ratio,
            },
          }),
        },
      });
      database
        .prepare<[number, AssetTaskStatus, null, number, number, number]>(
          'UPDATE assets SET media_id = ?, image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
        )
        .run(insertedMediaId, PRODUCTION_TASK_STATUS.RUNNING, null, Date.now(), script.project_id, asset.id);
      return insertedMediaId;
    });
    getDatabase()
      .prepare<[number, number, number, number]>('UPDATE asset_media SET task_id = ?, updated_at = ? WHERE project_id = ? AND id = ?')
      .run(taskId, Date.now(), script.project_id, mediaId);

    const parentReference = getSucceededAssetMedia(script.project_id, asset.parent_id, 'image')?.relative_path ?? null;
    const result = await generateImageByModel(model, {
      requestId,
      prompt,
      size: imageQualityForModel(project.image_quality),
      aspectRatio: aspectRatioForModel(project.video_ratio),
      referenceList: parentReference ? [imageReferenceItemFromRelativePath(parentReference)] : [],
      task: {
        taskId,
        projectId: script.project_id,
        category: DERIVED_ASSET_IMAGE_CATEGORY,
        description: `Generate derived asset image ${asset.id}`,
        relatedObjects: { scriptId: script.id, assetId: asset.id, mediaId },
        isCancelled: () => isDerivedAssetImageCancelled(script.project_id, asset.id, mediaId, taskId),
      },
    });
    if (isDerivedAssetImageCancelled(script.project_id, asset.id, mediaId, taskId)) {
      return false;
    }
    const relativePath = saveGeneratedProductionMedia(script.project_id, 'assets', 'image', result, asset.name);

    withTransaction((database) => {
      database
        .prepare<[string, AssetTaskStatus, null, number, number, number]>(
          'UPDATE asset_media SET relative_path = ?, status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
        )
        .run(relativePath, PRODUCTION_TASK_STATUS.SUCCEEDED, null, Date.now(), script.project_id, mediaId!);
      database
        .prepare<[number, AssetTaskStatus, null, string, null, number, number, number]>(
          'UPDATE assets SET media_id = ?, image_status = ?, image_error_reason = ?, dependency_status = ?, dependency_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
        )
        .run(mediaId!, PRODUCTION_TASK_STATUS.SUCCEEDED, null, DEPENDENCY_STATUSES.VALID, null, Date.now(), script.project_id, asset.id);
      markProductionForAssetsChanged({
        projectId: script.project_id,
        assetIds: [asset.id],
        status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
        reason: DEPENDENCY_REASON.ASSET_CHANGED,
        database,
      });
    });
    return true;
  } catch (error) {
    const reason = normalizeErrorReason(error);
    withTransaction((database) => {
      if (mediaId) {
        database
          .prepare<[AssetTaskStatus, string, number, number, number]>(
            'UPDATE asset_media SET status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
          )
          .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, mediaId);
      }
      updateAssetImageStatus(script.project_id, assetId, PRODUCTION_TASK_STATUS.FAILED, reason);
    });
    logger.error('production', `Derived asset image generation failed: ${assetId}`, normalizeUnknownError(error));
    return false;
  }
}

async function runProductionDerivedAssetImageGeneration(project: ProjectRow, script: ScriptRow, assetIds: number[], taskId: number, model: string): Promise<void> {
  try {
    const modelKey = normalizeRequiredText(model, 'Image model');
    const results = await runWithConcurrency(assetIds, normalizeGenerationConcurrency(), (assetId) => generateProductionDerivedAssetImage(project, script, assetId, modelKey, taskId));
    const failedCount = results.filter((result) => !result).length;
    if (failedCount > 0) {
      safeFailTask(taskId, new Error(`${failedCount} derived asset image generations failed`));
      return;
    }

    safeSucceedTask(taskId);
  } catch (error) {
    const reason = normalizeErrorReason(error);
    const placeholders = assetIds.map(() => '?').join(', ');
    getDatabase()
      .prepare<Array<number | string>, { changes: number }>(
        `UPDATE assets SET image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id IN (${placeholders})`,
      )
      .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, ...assetIds);
    safeFailTask(taskId, error);
    logger.error('production', 'Derived asset image generation batch failed', normalizeUnknownError(error));
  }
}

export function generateProductionDerivedAssetImages(payload: ProductionGenerateDerivedAssetsPayload): ProductionGenerateAcceptedResult {
  const { script, project } = assertProductionContext(payload);
  const assetIds = normalizeIds(payload.assetIds, '资产 ID');
  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, AssetRow>(`SELECT * FROM assets WHERE project_id = ? AND id IN (${placeholders})`)
    .all(script.project_id, ...assetIds);
  if (rows.length !== assetIds.length || rows.some((row) => !row.parent_id)) {
    throw createError(VT_STATUS.NOT_FOUND, '部分衍生资产不存在');
  }

  const model = normalizeOptionalText(project.image_model_id);
  const manuals = toProductionManualSnapshots(readProductionStoryboardManuals(project));
  const task = createTask({
    projectId: script.project_id,
    category: DERIVED_ASSET_IMAGE_CATEGORY,
    relatedObjects: { ids: assetIds, manuals },
    modelName: model || null,
    description: `Generate ${assetIds.length} derived asset images`,
  });
  getDatabase()
    .prepare<Array<number | string | null>, { changes: number }>(
      `UPDATE assets SET image_status = ?, image_error_reason = ?, updated_at = ? WHERE project_id = ? AND id IN (${placeholders})`,
    )
    .run(PRODUCTION_TASK_STATUS.RUNNING, null, Date.now(), script.project_id, ...assetIds);
  void runProductionDerivedAssetImageGeneration(project, script, assetIds, task.taskId, model);

  return {
    accepted: true,
    taskId: task.taskId,
    ids: assetIds,
  };
}

export function generateProductionAgentDerivedAssetImages(payload: ProductionGenerateDerivedAssetsPayload): ProductionGenerateAcceptedResult {
  return generateProductionDerivedAssetImages(payload);
}

export function pollProductionDerivedAssets(payload: ProductionPollPayload): ProductionDerivedAssetPollResult {
  const { script } = assertProductionContext(payload);
  const ids = normalizeIds(payload.ids, '资产 ID');
  const assets = listProductionAssets(script.project_id, script.id)
    .flatMap((asset) => [asset, ...asset.children])
    .filter((asset) => ids.includes(asset.id) && asset.imageStatus !== PRODUCTION_TASK_STATUS.RUNNING);
  return { assets };
}

export function saveProductionImageFlow(payload: ProductionImageFlowSavePayload): ProductionImageFlowSaveResult {
  const { script } = assertProductionContext(payload);
  const flowId = normalizeFlowId(payload.flowId);
  const flowData = validateFlowData(payload.flowData);
  const ownerType = normalizeOwnerType(payload.ownerType);
  const ownerId = payload.ownerId === undefined || payload.ownerId === null ? null : Number(payload.ownerId);
  const now = Date.now();

  withTransaction((database) => {
    database
      .prepare<[string, number, number, string, number | null, string, number, number, string, number | null, string, number]>(
        `
        INSERT INTO production_image_flows (
          id, project_id, script_id, owner_type, owner_id, flow_data, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          owner_type = ?,
          owner_id = ?,
          flow_data = ?,
          updated_at = ?
        `,
      )
      .run(flowId, script.project_id, script.id, ownerType, ownerId, serializeJson(flowData, '{"nodes":[],"edges":[]}'), now, now, ownerType, ownerId, serializeJson(flowData, '{"nodes":[],"edges":[]}'), now);
  });

  const row = getImageFlowRow(script.project_id, script.id, flowId)!;
  return { flow: mapImageFlowRow(row) };
}

export function getProductionImageFlow(payload: ProductionImageFlowGetPayload): ProductionImageFlowGetResult {
  const { script } = assertProductionContext(payload);
  const row = getImageFlowRow(script.project_id, script.id, normalizeRequiredText(payload.flowId, '工作流 ID'));
  return {
    flow: row ? mapImageFlowRow(row) : null,
  };
}

export function applyProductionImageFlowResult(payload: ProductionImageFlowApplyPayload): ProductionImageFlowApplyResult {
  const { script } = assertProductionContext(payload);
  const flow = getImageFlowRow(script.project_id, script.id, normalizeRequiredText(payload.flowId, '工作流 ID'));
  if (!flow) {
    throw createError(VT_STATUS.NOT_FOUND, '图片工作流不存在');
  }
  const relativePath = mediaRelativePathFromUrl(payload.imageUrl);
  const now = Date.now();

  withTransaction((database) => {
    database.prepare<[string, number, number, string]>(
      'UPDATE production_image_flows SET owner_type = ?, owner_id = ?, updated_at = ? WHERE id = ?',
    ).run(payload.ownerType, payload.ownerId, now, payload.flowId);
    if (payload.ownerType === 'storyboard') {
      getStoryboardRow(script.project_id, script.id, payload.ownerId);
      database
        .prepare<[string | null, string, ProductionTaskStatus, null, number, string, null, number, number, number]>(
          `
          UPDATE production_storyboards
          SET relative_path = ?, flow_id = ?, image_status = ?, image_error_reason = ?, should_generate_image = ?,
              dependency_status = ?, dependency_reason = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `,
        )
        .run(relativePath, payload.flowId, PRODUCTION_TASK_STATUS.SUCCEEDED, null, 1, DEPENDENCY_STATUSES.VALID, null, now, script.project_id, payload.ownerId);
      markVideosForStoryboardsChanged({
        projectId: script.project_id,
        scriptId: script.id,
        storyboardIds: [payload.ownerId],
        status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
        reason: DEPENDENCY_REASON.STORYBOARD_CHANGED,
        database,
      });
    } else {
      const asset = database.prepare<[number, number], AssetRow>('SELECT * FROM assets WHERE project_id = ? AND id = ? LIMIT 1').get(script.project_id, payload.ownerId);
      if (!asset || !asset.parent_id) {
        throw createError(VT_STATUS.NOT_FOUND, '衍生资产不存在');
      }
      const mediaInsert = database
        .prepare<[number, number, 'image', string | null, 'generated', string, string, ProductionTaskStatus, null, null, null, null, null, null, string, number, number]>(
          `
          INSERT INTO asset_media (
            project_id, asset_id, kind, relative_path, source, usage, view_mode, status, error_reason, prompt, model, model_mode, resolution, task_id, metadata, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          script.project_id,
          asset.id,
          'image',
          relativePath,
          'generated',
          ASSET_IMAGE_USAGES.DERIVED,
          ASSET_IMAGE_VIEW_MODES.DERIVED,
          PRODUCTION_TASK_STATUS.SUCCEEDED,
          null,
          null,
          null,
          null,
          null,
          null,
          serializeJson({
            schemaVersion: 1,
            assetId: asset.id,
            assetType: asset.type,
            parentAssetId: asset.parent_id,
            usage: ASSET_IMAGE_USAGES.DERIVED,
            viewMode: ASSET_IMAGE_VIEW_MODES.DERIVED,
            source: 'production.imageFlow',
            flowId: payload.flowId,
          }, '{}'),
          now,
          now
        );
      database
        .prepare<[number, ProductionTaskStatus, null, string, null, number, number, number]>(
          'UPDATE assets SET media_id = ?, image_status = ?, image_error_reason = ?, dependency_status = ?, dependency_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
        )
        .run(Number(mediaInsert.lastInsertRowid), PRODUCTION_TASK_STATUS.SUCCEEDED, null, DEPENDENCY_STATUSES.VALID, null, now, script.project_id, asset.id);
      markProductionForAssetsChanged({
        projectId: script.project_id,
        assetIds: [asset.id],
        status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
        reason: DEPENDENCY_REASON.ASSET_CHANGED,
        database,
      });
    }
  });

  return {
    flowId: payload.flowId,
    ownerType: payload.ownerType,
    ownerId: payload.ownerId,
  };
}

export function saveProductionVideoTrack(payload: ProductionVideoTrackSavePayload): ProductionVideoTrackSaveResult {
  const { script } = assertProductionContext(payload);
  const storyboardIds = normalizeOptionalIds(payload.storyboardIds);
  storyboardIds.forEach((id) => getStoryboardRow(script.project_id, script.id, id));
  const now = Date.now();
  const duration = payload.duration === undefined || payload.duration === null ? 4 : normalizeDuration(payload.duration);
  const mode = normalizeMode(payload.mode);
  const sortIndex = payload.sortIndex === undefined || payload.sortIndex === null ? null : Number(payload.sortIndex);

  const trackId = withTransaction((database) => {
    if (payload.id) {
      const existing = getTrackRow(script.project_id, script.id, payload.id);
      const linkedBefore = listStoryboardIdsByTrack(existing.id);
      const nextPrompt = normalizeOptionalText(payload.prompt);
      const nextMode = mode ? serializeJson(mode, 'null') : null;
      const changed =
        (existing.sort_index ?? 0) !== (sortIndex ?? existing.sort_index ?? 0) ||
        existing.prompt !== nextPrompt ||
        Number(existing.duration) !== duration ||
        (existing.mode_json ?? null) !== nextMode ||
        !hasSameNumberSet(linkedBefore, storyboardIds);
      database
        .prepare<[number | null, string, number, string | null, number | null, number, number, number]>(
          `
          UPDATE production_video_tracks
          SET sort_index = COALESCE(?, sort_index),
              prompt = ?,
              duration = ?,
              mode_json = ?,
              updated_at = ?
          WHERE project_id = ? AND script_id = ? AND id = ?
          `,
        )
        .run(sortIndex, nextPrompt, duration, nextMode, now, script.project_id, script.id, existing.id);
      database.prepare<[null, number]>('UPDATE production_storyboards SET track_id = ? WHERE track_id = ?').run(null, existing.id);
      storyboardIds.forEach((storyboardId) => {
        database.prepare<[number, number, number, number]>('UPDATE production_storyboards SET track_id = ?, updated_at = ? WHERE project_id = ? AND id = ?').run(existing.id, now, script.project_id, storyboardId);
      });
      markTracksDependencyStatus({
        projectId: script.project_id,
        scriptId: script.id,
        trackIds: [existing.id],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      if (changed) {
        markVideosDependencyStatus({
          projectId: script.project_id,
          scriptId: script.id,
          trackIds: [existing.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.TRACK_CHANGED,
          database,
        });
      }
      return existing.id;
    }

    const finalSortIndex = sortIndex ?? getDatabase()
      .prepare<[number, number], { next_index: number }>(
        'SELECT COALESCE(MAX(sort_index), -1) + 1 AS next_index FROM production_video_tracks WHERE project_id = ? AND script_id = ?',
      )
      .get(script.project_id, script.id)?.next_index ?? 0;
    const insert = database
      .prepare<[number, number, number, string, number, string | null, ProductionTaskStatus, number, number]>(
        `
        INSERT INTO production_video_tracks (
          project_id, script_id, sort_index, prompt, duration, mode_json, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(script.project_id, script.id, finalSortIndex, normalizeOptionalText(payload.prompt), duration, mode ? serializeJson(mode, 'null') : null, PRODUCTION_TASK_STATUS.IDLE, now, now);
    const insertedId = Number(insert.lastInsertRowid);
    storyboardIds.forEach((storyboardId) => {
      database.prepare<[number, number, number, number]>('UPDATE production_storyboards SET track_id = ?, updated_at = ? WHERE project_id = ? AND id = ?').run(insertedId, now, script.project_id, storyboardId);
    });
    return insertedId;
  });

  return {
    track: getTrackDetail(script.project_id, script.id, trackId),
  };
}

export function deleteProductionVideoTrack(payload: ProductionVideoTrackDeletePayload): ProductionDeleteResult {
  const { script } = assertProductionContext(payload);
  const track = getTrackRow(script.project_id, script.id, payload.trackId);
  const deletedCount = withTransaction((database) => {
    database.prepare<[null, number, number, number]>('UPDATE production_storyboards SET track_id = ?, updated_at = ? WHERE project_id = ? AND track_id = ?').run(null, Date.now(), script.project_id, track.id);
    database.prepare<[number, number]>('DELETE FROM production_videos WHERE project_id = ? AND track_id = ?').run(script.project_id, track.id);
    const result = database.prepare<[number, number], { changes: number }>('DELETE FROM production_video_tracks WHERE project_id = ? AND id = ?').run(script.project_id, track.id);
    return result.changes;
  });

  return { deletedCount };
}

async function generateVideoPromptForTrack(project: ProjectRow, script: ScriptRow, trackId: number, taskId: number): Promise<boolean> {
  try {
    const track = getTrackRow(script.project_id, script.id, trackId);
    const modeValue =
      normalizeMode(track.mode_json ? parseJson<ProductionVideoModeValue | null>(track.mode_json, null) : null) ??
      normalizeMode(project.video_mode) ??
      'text';
    const modeKey = serializeVideoMode(modeValue);
    const { system, promptTemplate } = resolveVideoPromptSystem(project, modeKey);
    const manuals = readProductionVideoManuals(project);
    const manualPrompt = formatProductionManuals('视频提示词生成手册规范', manuals);
    const modelName = getModelNameFromModelId(project.video_model_id);
    const userPrompt = buildVideoPromptInput(project, script, track, modelName, modeKey);
    const requestId = createModelRequestId();
    const messages = [
      { role: 'assistant' as const, content: manualPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const result = await invokeText({
      requestId,
      modelKey: 'universalAi',
      system,
      messages,
    });
    const prompt = stripThink(result.text ?? '').trim();
    if (!prompt) {
      throw createError(VT_STATUS.MODEL_ERROR, '模型返回了空视频提示词');
    }

    getDatabase()
      .prepare<[string, ProductionTaskStatus, null, string, string, null, number, number, number]>(
        'UPDATE production_video_tracks SET prompt = ?, status = ?, error_reason = ?, generation_metadata = ?, dependency_status = ?, dependency_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      )
      .run(
        prompt,
        PRODUCTION_TASK_STATUS.SUCCEEDED,
        null,
        serializeJson(createGenerationSnapshot({
          source: 'production.videoPrompt',
          model: 'universalAi',
          modelMode: modeKey,
          taskId,
          requestId,
          userPrompt,
          finalPrompt: prompt,
          promptTemplate,
          manuals,
          references: {
            storyboardIds: listStoryboardIdsByTrack(track.id),
          },
          extra: {
            trackId: track.id,
            scriptId: script.id,
            systemPrompt: system,
          },
        }), '{}'),
        DEPENDENCY_STATUSES.VALID,
        null,
        Date.now(),
        script.project_id,
        track.id,
      );
    markVideosDependencyStatus({
      projectId: script.project_id,
      scriptId: script.id,
    trackIds: [track.id],
    status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
    reason: DEPENDENCY_REASON.TRACK_CHANGED,
  });
    return true;
  } catch (error) {
    const reason = normalizeErrorReason(error);
    getDatabase()
      .prepare<[ProductionTaskStatus, string, number, number, number]>(
        'UPDATE production_video_tracks SET status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      )
      .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, trackId);
    logger.error('production', `Video prompt generation failed: ${trackId}`, normalizeUnknownError(error));
    return false;
  }
}

async function runProductionVideoPromptGeneration(project: ProjectRow, script: ScriptRow, trackIds: number[], taskId: number): Promise<void> {
  try {
    const results = await runWithConcurrency(trackIds, normalizeGenerationConcurrency(), (trackId) => generateVideoPromptForTrack(project, script, trackId, taskId));
    const failedCount = results.filter((result) => !result).length;
    if (failedCount > 0) {
      safeFailTask(taskId, new Error(`${failedCount} video prompt generations failed`));
      return;
    }

    safeSucceedTask(taskId);
  } catch (error) {
    const reason = normalizeErrorReason(error);
    const placeholders = trackIds.map(() => '?').join(', ');
    getDatabase()
      .prepare<Array<number | string>, { changes: number }>(
        `UPDATE production_video_tracks SET status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id IN (${placeholders})`,
      )
      .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, ...trackIds);
    safeFailTask(taskId, error);
    logger.error('production', 'Video prompt generation batch failed', normalizeUnknownError(error));
  }
}

export function generateProductionVideoPrompts(payload: ProductionGenerateVideoPromptPayload): ProductionGenerateAcceptedResult {
  const { script, project } = assertProductionContext(payload);
  const trackIds = normalizeIds(payload.trackIds, '轨道 ID');
  trackIds.forEach((id) => getTrackRow(script.project_id, script.id, id));
  const manuals = toProductionManualSnapshots(readProductionVideoManuals(project));
  const task = createTask({
    projectId: script.project_id,
    category: VIDEO_PROMPT_CATEGORY,
    relatedObjects: { ids: trackIds, manuals },
    modelName: 'universalAi',
    description: `生成 ${trackIds.length} 条视频提示词`,
  });
  const placeholders = trackIds.map(() => '?').join(', ');
  getDatabase()
    .prepare<Array<number | string | null>, { changes: number }>(
      `UPDATE production_video_tracks SET status = ?, error_reason = ?, task_id = ?, updated_at = ? WHERE project_id = ? AND id IN (${placeholders})`,
    )
    .run(PRODUCTION_TASK_STATUS.RUNNING, null, task.taskId, Date.now(), script.project_id, ...trackIds);
  void runProductionVideoPromptGeneration(project, script, trackIds, task.taskId);

  return {
    accepted: true,
    taskId: task.taskId,
    ids: trackIds,
  };
}

export function pollProductionVideoPrompts(payload: ProductionPollPayload): ProductionVideoPromptPollResult {
  const { script } = assertProductionContext(payload);
  const trackIds = normalizeIds(payload.ids, '轨道 ID');
  const tracks = listVideoTracks(script.project_id, script.id).filter((track) => trackIds.includes(track.id) && track.status !== PRODUCTION_TASK_STATUS.RUNNING);
  return { tracks };
}

async function generateProductionVideoCandidate(project: ProjectRow, script: ScriptRow, videoId: number, model: string, taskId: number): Promise<boolean> {
  try {
    const video = getVideoRow(script.project_id, script.id, videoId);
    const prompt = normalizeRequiredText(video.prompt, 'Video prompt');
    const references = normalizeReferences(parseJson<ProductionReferenceInput[]>(video.reference_json, []));
    const modelReferences = buildModelReferences(script.project_id, script.id, references, references.length > 0);
    const mode = modelModeFromValue(parseJson<ProductionVideoModeValue | null>(video.mode_json, null));
    const requestId = createModelRequestId();
    const generationMetadata = createGenerationSnapshot({
      source: 'production.video',
      model,
      modelMode: Array.isArray(mode) ? mode.join(',') : String(mode ?? ''),
      taskId,
      requestId,
      userPrompt: prompt,
      finalPrompt: prompt,
      manuals: {},
      references: {
        references,
        referenceCount: modelReferences.length,
      },
      extra: {
        videoId: video.id,
        trackId: video.track_id,
        scriptId: script.id,
        duration: normalizeDuration(video.duration),
        resolution: normalizeOptionalText(video.resolution) || DEFAULT_VIDEO_RESOLUTION,
        aspectRatio: project.video_ratio,
        audioEnabled: video.audio_enabled === 1,
      },
    });
    getDatabase()
      .prepare<[string, number, number, number]>(
        'UPDATE production_videos SET generation_metadata = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      )
      .run(serializeJson(generationMetadata, '{}'), Date.now(), script.project_id, video.id);
    const result = await generateVideoByModel(model, {
      requestId,
      duration: normalizeDuration(video.duration),
      resolution: normalizeOptionalText(video.resolution) || DEFAULT_VIDEO_RESOLUTION,
      aspectRatio: aspectRatioForModel(project.video_ratio),
      prompt,
      referenceList: modelReferences,
      audio: video.audio_enabled === 1,
      mode,
      task: {
        taskId,
        projectId: script.project_id,
        category: VIDEO_CATEGORY,
        description: `Generate video candidate ${video.id}`,
        relatedObjects: { scriptId: script.id, videoId: video.id, trackId: video.track_id },
        isCancelled: () => isProductionVideoCancelled(script.project_id, video.id, taskId),
      },
    });
    if (isProductionVideoCancelled(script.project_id, video.id, taskId)) {
      return false;
    }
    const relativePath = saveGeneratedProductionMedia(script.project_id, 'videos', 'video', result, `video_${video.id}`);

    withTransaction((database) => {
      database
        .prepare<[string, ProductionTaskStatus, null, string, null, number, number, number]>(
          'UPDATE production_videos SET relative_path = ?, status = ?, error_reason = ?, dependency_status = ?, dependency_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
        )
        .run(relativePath, PRODUCTION_TASK_STATUS.SUCCEEDED, null, DEPENDENCY_STATUSES.VALID, null, Date.now(), script.project_id, video.id);
      database
        .prepare<[ProductionTaskStatus, null, string, null, number, number, number]>(
          'UPDATE production_video_tracks SET status = ?, error_reason = ?, dependency_status = ?, dependency_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
        )
        .run(PRODUCTION_TASK_STATUS.SUCCEEDED, null, DEPENDENCY_STATUSES.VALID, null, Date.now(), script.project_id, video.track_id);
    });
    return true;
  } catch (error) {
    const reason = normalizeErrorReason(error);
    const video = getVideoRow(script.project_id, script.id, videoId);
    withTransaction((database) => {
      database
        .prepare<[ProductionTaskStatus, string, number, number, number]>(
          'UPDATE production_videos SET status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
        )
        .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, video.id);
      database
        .prepare<[ProductionTaskStatus, string, number, number, number]>(
          'UPDATE production_video_tracks SET status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
        )
        .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, video.track_id);
    });
    logger.error('production', `Video candidate generation failed: ${videoId}`, normalizeUnknownError(error));
    return false;
  }
}

async function runProductionVideoGeneration(project: ProjectRow, script: ScriptRow, videoIds: number[], taskId: number, model: string): Promise<void> {
  try {
    const modelKey = normalizeRequiredText(model, 'Video model');
    const results = await runWithConcurrency(videoIds, normalizeGenerationConcurrency(), (videoId) => generateProductionVideoCandidate(project, script, videoId, modelKey, taskId));
    const failedCount = results.filter((result) => !result).length;
    if (failedCount > 0) {
      safeFailTask(taskId, new Error(`${failedCount} video generations failed`));
      return;
    }

    safeSucceedTask(taskId);
  } catch (error) {
    const reason = normalizeErrorReason(error);
    const placeholders = videoIds.map(() => '?').join(', ');
    const rows = getDatabase()
      .prepare<Array<number>, VideoRow>(`SELECT * FROM production_videos WHERE project_id = ? AND id IN (${placeholders})`)
      .all(script.project_id, ...videoIds);
    const trackIds = Array.from(new Set(rows.map((row) => row.track_id)));
    const trackPlaceholders = trackIds.map(() => '?').join(', ');
    withTransaction((database) => {
      database
        .prepare<Array<number | string>, { changes: number }>(
          `UPDATE production_videos SET status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id IN (${placeholders})`,
        )
        .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, ...videoIds);
      if (trackIds.length) {
        database
          .prepare<Array<number | string>, { changes: number }>(
            `UPDATE production_video_tracks SET status = ?, error_reason = ?, updated_at = ? WHERE project_id = ? AND id IN (${trackPlaceholders})`,
          )
          .run(PRODUCTION_TASK_STATUS.FAILED, reason, Date.now(), script.project_id, ...trackIds);
      }
    });
    safeFailTask(taskId, error);
    logger.error('production', 'Video generation batch failed', normalizeUnknownError(error));
  }
}

export function generateProductionVideos(payload: ProductionGenerateVideoPayload): ProductionGenerateAcceptedResult {
  const { script, project } = assertProductionContext(payload);
  const trackIds = normalizeIds(payload.trackIds, '轨道 ID');
  const tracks = trackIds.map((id) => getTrackRow(script.project_id, script.id, id));
  const now = Date.now();
  const model = normalizeOptionalText(payload.model) || project.video_model_id;
  const resolution = normalizeOptionalText(payload.resolution) || null;
  const durationOverride = payload.duration === undefined || payload.duration === null ? null : normalizeDuration(payload.duration);
  const audioEnabled = Boolean(payload.audioEnabled);
  const videoIds = withTransaction((database) => tracks.map((track) => {
    const explicitReferences = normalizeReferences(payload.referencesByTrackId?.[track.id]);
    const references = explicitReferences.length ? explicitReferences : createAutoTrackReferences(script.project_id, script.id, track.id);
    const mode = normalizeMode(payload.mode) ?? normalizeMode(track.mode_json ? parseJson<ProductionVideoModeValue | null>(track.mode_json, null) : null) ?? normalizeMode(project.video_mode);
    const insert = database
      .prepare<[number, number, number, string | null, string, number, ProductionTaskStatus, string | null, string, string | null, number, number, number]>(
        `
        INSERT INTO production_videos (
          project_id, script_id, track_id, relative_path, prompt, duration, status,
          mode_json, reference_json, resolution, audio_enabled, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        script.project_id,
        script.id,
        track.id,
        null,
        track.prompt,
        durationOverride ?? Number(track.duration),
        PRODUCTION_TASK_STATUS.RUNNING,
        mode ? serializeJson(mode, 'null') : null,
        serializeJson(references, '[]'),
        resolution,
        audioEnabled ? 1 : 0,
        now,
        now,
      );
    return Number(insert.lastInsertRowid);
  }));

  const task = createTask({
    projectId: script.project_id,
    category: VIDEO_CATEGORY,
    relatedObjects: { ids: videoIds, trackIds },
    modelName: model || null,
    description: `Generate ${videoIds.length} video candidates`,
  });
  const placeholders = videoIds.map(() => '?').join(', ');
  const trackPlaceholders = trackIds.map(() => '?').join(', ');
  withTransaction((database) => {
    database
      .prepare<Array<number | string | null>, { changes: number }>(
        `UPDATE production_videos SET status = ?, error_reason = ?, task_id = ?, updated_at = ? WHERE project_id = ? AND id IN (${placeholders})`,
      )
      .run(PRODUCTION_TASK_STATUS.RUNNING, null, task.taskId, Date.now(), script.project_id, ...videoIds);
    database
      .prepare<Array<number | string | null>, { changes: number }>(
        `UPDATE production_video_tracks SET status = ?, error_reason = ?, task_id = ?, updated_at = ? WHERE project_id = ? AND id IN (${trackPlaceholders})`,
      )
      .run(PRODUCTION_TASK_STATUS.RUNNING, null, task.taskId, Date.now(), script.project_id, ...trackIds);
  });
  void runProductionVideoGeneration(project, script, videoIds, task.taskId, model);

  return {
    accepted: true,
    taskId: task.taskId,
    ids: videoIds,
  };
}

export function pollProductionVideos(payload: ProductionPollPayload): ProductionVideoPollResult {
  const { script } = assertProductionContext(payload);
  const ids = normalizeIds(payload.ids, '视频候选 ID');
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number | string>, VideoRow>(
      `
      SELECT *
      FROM production_videos
      WHERE project_id = ? AND script_id = ? AND id IN (${placeholders}) AND status != ?
      ORDER BY created_at DESC, id DESC
      `,
    )
    .all(script.project_id, script.id, ...ids, PRODUCTION_TASK_STATUS.RUNNING);
  const trackIds = Array.from(new Set(rows.map((row) => row.track_id)));
  const tracks = listVideoTracks(script.project_id, script.id).filter((track) => trackIds.includes(track.id));
  return { tracks };
}

export function selectProductionVideo(payload: ProductionSelectVideoPayload): ProductionSelectVideoResult {
  const { script } = assertProductionContext(payload);
  const track = getTrackRow(script.project_id, script.id, payload.trackId);
  const videoId = payload.videoId === null || payload.videoId === undefined ? null : normalizeIds([payload.videoId], '视频候选 ID')[0]!;
  if (videoId) {
    const video = getVideoRow(script.project_id, script.id, videoId);
    if (video.track_id !== track.id) {
      throw createError(VT_STATUS.INVALID_PARAMS, '视频候选不属于当前轨道');
    }
    if (video.status !== PRODUCTION_TASK_STATUS.SUCCEEDED) {
      throw createError(VT_STATUS.CONFLICT, '只能选择已完成的视频候选');
    }
  }

  withTransaction((database) => {
    database
      .prepare<[number | null, string, string | null, number, number, number]>(
        'UPDATE production_video_tracks SET selected_video_id = ?, dependency_status = ?, dependency_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      )
      .run(
        videoId,
        videoId ? DEPENDENCY_STATUSES.VALID : DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
        videoId ? null : DEPENDENCY_REASON.VIDEO_DELETED,
        Date.now(),
        script.project_id,
        track.id,
      );
    if (videoId) {
      markVideosDependencyStatus({
        projectId: script.project_id,
        scriptId: script.id,
        videoIds: [videoId],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
    }
  });

  return {
    track: getTrackDetail(script.project_id, script.id, track.id),
  };
}

export function deleteProductionVideo(payload: ProductionVideoDeletePayload): ProductionDeleteResult {
  const { script } = assertProductionContext(payload);
  const video = getVideoRow(script.project_id, script.id, payload.videoId);
  const track = getTrackRow(script.project_id, script.id, video.track_id);
  const deletedCount = withTransaction((database) => {
    database
      .prepare<[null, number, number, number]>(
        'UPDATE production_video_tracks SET selected_video_id = ?, updated_at = ? WHERE project_id = ? AND selected_video_id = ?',
      )
      .run(null, Date.now(), script.project_id, video.id);
    const result = database.prepare<[number, number], { changes: number }>('DELETE FROM production_videos WHERE project_id = ? AND id = ?').run(script.project_id, video.id);
    if (track.selected_video_id === video.id) {
      markTracksDependencyStatus({
        projectId: script.project_id,
        scriptId: script.id,
        trackIds: [track.id],
        status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
        reason: DEPENDENCY_REASON.VIDEO_DELETED,
        database,
      });
    }
    return result.changes;
  });

  return { deletedCount };
}

export function getProductionWorkbench(payload: ProductionScriptPayload): ProductionWorkbenchResult {
  const { script } = assertProductionContext(payload);
  return {
    tracks: listVideoTracks(script.project_id, script.id),
    storyboards: listStoryboards(script.project_id, script.id),
    assets: listProductionAssets(script.project_id, script.id),
  };
}

export function recoverProductionTaskStatus(reason = '软件退出导致生产任务中断'): { recovered: number } {
  if (!tableExists('production_storyboards')) {
    return { recovered: 0 };
  }

  const now = Date.now();
  const storyboard = getDatabase()
    .prepare<[ProductionTaskStatus, string, number, ProductionTaskStatus], { changes: number }>(
      'UPDATE production_storyboards SET image_status = ?, image_error_reason = ?, updated_at = ? WHERE image_status = ?',
    )
    .run(PRODUCTION_TASK_STATUS.FAILED, reason, now, PRODUCTION_TASK_STATUS.RUNNING);
  const tracks = getDatabase()
    .prepare<[ProductionTaskStatus, string, number, ProductionTaskStatus], { changes: number }>(
      'UPDATE production_video_tracks SET status = ?, error_reason = ?, updated_at = ? WHERE status = ?',
    )
    .run(PRODUCTION_TASK_STATUS.FAILED, reason, now, PRODUCTION_TASK_STATUS.RUNNING);
  const videos = getDatabase()
    .prepare<[ProductionTaskStatus, string, number, ProductionTaskStatus], { changes: number }>(
      'UPDATE production_videos SET status = ?, error_reason = ?, updated_at = ? WHERE status = ?',
    )
    .run(PRODUCTION_TASK_STATUS.FAILED, reason, now, PRODUCTION_TASK_STATUS.RUNNING);

  return { recovered: storyboard.changes + tracks.changes + videos.changes };
}
