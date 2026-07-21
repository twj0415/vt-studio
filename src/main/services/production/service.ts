import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type Database from 'better-sqlite3';
import {
  ASSET_TYPE_VALUES,
  DEPENDENCY_STATUSES,
  PROJECT_IMAGE_QUALITY_VALUES,
  PROJECT_TEMPLATE_TYPES,
  PROJECT_VIDEO_RATIOS,
  SCRIPT_EXTRACT_STATUSES,
  type ProjectImageQuality,
} from '@shared/constants/dictionaries';
import { MODEL_AUDIO_SUPPORTS, parseVideoModeKey, serializeVideoMode } from '@shared/constants/model-capabilities';
import { validateModelOperationReferences, validateModelOperationSelection } from '@shared/model-capability-options';
import { VT_STATUS } from '@shared/constants/status';
import { normalizeUnknownError } from '@shared/errors';
import type { ModelCapabilityMatrixItem } from '@shared/types/model-capability';
import { ASSET_IMAGE_USAGES, ASSET_IMAGE_VIEW_MODES, type AssetTaskStatus, type AssetType } from '@shared/types/assets';
import {
  PRODUCTION_IMAGE_FLOW_OWNER_TYPES,
  PRODUCTION_AGENT_WORKSPACE_PATCH_FIELDS,
  PRODUCTION_REFERENCE_FILE_TYPES,
  PRODUCTION_REFERENCE_SOURCES,
  PRODUCTION_RESOURCE_DRAFT_ACTIONS,
  PRODUCTION_RESOURCE_DRAFT_STATUSES,
  PRODUCTION_TASK_STATUS,
  type ProductionAgentContextResult,
  type ProductionAgentDerivedAssetPayload,
  type ProductionAgentDerivedAssetResult,
  type ProductionAgentStoryboardPayload,
  type ProductionAgentStoryboardResult,
  type ProductionAgentToolsResult,
  type ProductionAgentWorkspacePatch,
  type ProductionAgentWorkspacePatchField,
  type ProductionAgentWorkspacePatchPayload,
  type ProductionAgentWorkspacePatchResult,
  type ProductionAssetSummary,
  type ProductionBatchDeleteStoryboardsPayload,
  type ProductionContentScopedPayload,
  type ProductionContentDeletePayload,
  type ProductionContentItem,
  type ProductionContentListResult,
  type ProductionContentPayload,
  type ProductionContentResult,
  type ProductionContentSavePayload,
  type ProductionContentSaveResult,
  type ProductionDeleteResult,
  type ProductionDerivedAssetDeletePayload,
  type ProductionDerivedAssetPollResult,
  type ProductionDerivedAssetSavePayload,
  type ProductionExtractResourcesPayload,
  type ProductionExtractResourcesResult,
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
  type ProductionFlowDataResult,
  type ProductionPollPayload,
  type ProductionPollResourceExtractionPayload,
  type ProductionPollResourceExtractionResult,
  type ProductionProjectPayload,
  type ProductionReferenceFileType,
  type ProductionReferenceInput,
  type ProductionReferenceSource,
  type ProductionResourceDraft,
  type ProductionResourceDraftAction,
  type ProductionResourceDraftCommitPayload,
  type ProductionResourceDraftCommitResult,
  type ProductionResourceDraftDeletePayload,
  type ProductionResourceDraftListPayload,
  type ProductionResourceDraftListResult,
  type ProductionResourceDraftSavePayload,
  type ProductionResourceDraftSaveResult,
  type ProductionResourceDraftStatus,
  type ProductionResourceDraftType,
  type ProductionResourceExistingAsset,
  type ProductionRunWorkflowActionPayload,
  type ProductionRunWorkflowActionResult,
  type ProductionSaveWorkspacePayload,
  type ProductionSaveWorkspaceResult,
  type ProductionSaveDirectorPlanPayload,
  type ProductionSaveFlowPositionsPayload,
  type ProductionSaveStoryboardTablePayload,
  type ProductionSelectVideoPayload,
  type ProductionSelectVideoResult,
  type ProductionSmartSplitStoryboardsPayload,
  type ProductionSmartSplitStoryboardsResult,
  type ProductionContentOption,
  type ProductionStoryboardDeletePayload,
  type ProductionStoryboardItem,
  type ProductionStoryboardPollResult,
  type ProductionStoryboardSavePayload,
  type ProductionStoryboardSaveResult,
  type ProductionStepRuleReference,
  type ProductionStepRuleReferences,
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
  type ProductionToolRunPayload,
  type ProductionToolRunResult,
  type ProductionWorkflowStateResult,
  type ProductionWorkbenchResult,
  type ProductionWorkspaceResult,
} from '@shared/types/production';
import type { Tool } from 'ai';
import { getDatabase, withTransaction } from '../database';
import { getRuntimeDirectories, readManagedFile, writeManagedFile } from '../file-system';
import { logger } from '../logger';
import { createMediaUrl, createThumbnailMediaUrl, resolveMediaUrlToPath } from '../media';
import { createModelRequestId, generateImageByModel, generateVideoByModel, invokeStructuredResult, invokeText, type ReferenceItem, type StructuredResultDiagnostics, type VideoGenerateInput } from '../model';
import { resolveImageGenerationRequestOptions } from '../model-runtime';
import { createError } from '../result';
import { createGenerationSnapshot, createPromptTemplateSnapshot } from '../generation/snapshot';
import { formatManualPromptSection, readManualPromptBundle, toManualPromptSnapshot, type ManualPromptBundle, type ManualPromptSnapshot } from '../project/manual-prompt';
import { getBusinessSettings } from '../settings/business-settings';
import { getReadyModelOperationCapability } from '../settings/model-config';
import { resolveModelPromptTemplate } from '../settings/model-prompt';
import { getEffectivePromptByType } from '../settings/prompt';
import { extractContentResources } from '../script';
import { stripThink } from '../socket/stripThink';
import { failTask, isTaskCancelled, succeedTask } from '../task';
import { createProductionTask, recordProductionModelDiagnostics } from '../task/production';
import { createJianyingDraft, validateExportAssets } from '../export';
import {
  DEPENDENCY_REASON,
  assertDependencyStatus,
  markAssetsDependencyStatus,
  markProductionForAssetsChanged,
  markProductionForContentChanged,
  markStoryboardsDependencyStatus,
  markTracksDependencyStatus,
  markVideosDependencyStatus,
  markVideosForStoryboardsChanged,
} from '../dependency-state';
import { getProductionResourceContext, getProductionSkillBundle } from './resource-context';
import { createProductionToolRegistry, listProductionToolDescriptors, type ProductionToolContext, type ProductionToolExecutorServices } from './tools';
import { ProductionWorkflowOrchestrator } from './workflow-orchestrator';

const STORYBOARD_IMAGE_CATEGORY = '生成分镜图';
const STORYBOARD_SPLIT_CATEGORY = '智能拆分分镜';
const DERIVED_ASSET_IMAGE_CATEGORY = '生成资源图';
const VIDEO_PROMPT_CATEGORY = '生成视频提示词';
const VIDEO_CATEGORY = '生成视频';
const CONTENT_RESOURCE_EXTRACT_STATUS = SCRIPT_EXTRACT_STATUSES;
const SECRET_REPLACEMENT = '[hidden]';
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

interface ProjectRow {
  id: number;
  name: string;
  genre: string;
  description: string;
  video_model_id: string;
  video_mode: string;
  video_ratio: string;
  image_model_id: string;
  image_quality: ProjectImageQuality;
  visual_manual_id: number;
  director_manual_id: number;
}

type ProjectDatabaseRow = Omit<ProjectRow, 'image_quality'> & {
  image_quality: string;
};

interface ScriptRow {
  id: number;
  project_id: number;
  episode_key: string;
  name: string;
  content: string;
}

interface ContentRow {
  id: number;
  project_id: number;
  title: string;
  body: string;
  version: number;
  resource_status: string;
  resource_error_reason: string | null;
  dependency_status: string;
  dependency_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface ContentExtractRow {
  id: number;
  project_id: number;
  extract_status: string;
  error_reason: string | null;
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

interface ProductionResourceDraftRow {
  id: number;
  project_id: number;
  content_id: number;
  task_id: number | null;
  asset_id: number | null;
  matched_asset_id: number | null;
  type: string;
  name: string;
  description: string;
  prompt: string;
  action: string;
  status: string;
  error_reason: string | null;
  created_at: number;
  updated_at: number;
  matched_asset_name?: string | null;
  matched_asset_type?: string | null;
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

interface SmartSplitStoryboardDraft {
  videoDesc: string;
  prompt: string;
  duration: number;
  associatedAssetIds: number[];
  shouldGenerateImage: boolean;
}

interface SmartSplitStoryboardOutput {
  storyboards: SmartSplitStoryboardDraft[];
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

function normalizeContentId(contentId: number): number {
  if (!Number.isInteger(contentId) || contentId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '内容 ID 无效');
  }

  return contentId;
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

function normalizeContentTitle(value: string | null | undefined): string {
  const normalized = (value ?? '').trim();
  return normalized || '内容';
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
    if (field === 'content' && !content.trim()) {
      throw createError(VT_STATUS.INVALID_PARAMS, '内容正文不能为空');
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

function assertProjectImageQuality(value: string): ProjectImageQuality {
  if (PROJECT_IMAGE_QUALITY_VALUES.includes(value as ProjectImageQuality)) {
    return value as ProjectImageQuality;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, `项目图片规格无效：${value}`);
}

function assertProject(projectId: number): ProjectRow {
  const id = normalizeProjectId(projectId);
  const row = getDatabase()
    .prepare<[number], ProjectDatabaseRow>(
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

  return {
    ...row,
    image_quality: assertProjectImageQuality(row.image_quality),
  };
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

function mapContentRow(row: ContentRow): ProductionContentItem {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    version: row.version,
    resourceStatus: assertStatus(row.resource_status),
    resourceErrorReason: row.resource_error_reason,
    dependencyStatus: assertDependencyStatus(row.dependency_status),
    dependencyReason: row.dependency_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getContentRow(projectId: number, contentId: number): ContentRow | null {
  if (!tableExists('production_contents')) {
    return null;
  }

  return getDatabase()
    .prepare<[number, number], ContentRow>('SELECT * FROM production_contents WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, contentId) ?? null;
}

function assertContent(projectId: number, contentId: number): ContentRow {
  const row = getContentRow(projectId, normalizeContentId(contentId));
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '内容不存在');
  }

  return row;
}

function resolveScopedContentId(payload: ProductionProjectPayload & { contentId?: number | null }): number {
  return normalizeContentId(Number(payload.contentId));
}

function assertProductionContext(payload: ProductionContentScopedPayload): { project: ProjectRow; script: ScriptRow } {
  const projectId = normalizeProjectId(payload.projectId);
  const contentId = resolveScopedContentId(payload);
  return {
    project: assertProject(projectId),
    script: assertScript(projectId, contentId),
  };
}

function assertContentProductionContext(payload: ProductionContentPayload): { project: ProjectRow; content: ContentRow; script: ScriptRow } {
  const projectId = normalizeProjectId(payload.projectId);
  const contentId = normalizeContentId(payload.contentId);
  return {
    project: assertProject(projectId),
    content: assertContent(projectId, contentId),
    script: assertScript(projectId, contentId),
  };
}

export function extractProductionResources(payload: ProductionExtractResourcesPayload): ProductionExtractResourcesResult {
  const projectId = normalizeProjectId(payload.projectId);
  const contentId = normalizeContentId(Number(payload.contentId));
  assertProject(projectId);
  assertContent(projectId, contentId);
  try {
    assertScript(projectId, contentId);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw createError(VT_STATUS.NOT_FOUND, '内容不存在');
    }
    throw error;
  }
  const result = extractContentResources({
    projectId,
    contentIds: [contentId],
    writeMode: 'drafts',
  });
  getDatabase()
    .prepare<[ProductionTaskStatus, null, number, number, number]>(
      'UPDATE production_contents SET resource_status = ?, resource_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
    )
    .run(PRODUCTION_TASK_STATUS.RUNNING, null, Date.now(), projectId, contentId);
  return {
    accepted: result.accepted,
    taskId: result.taskId,
    contentIds: result.contentIds,
  };
}

function assertScriptEditableForAgent(projectId: number, scriptId: number): void {
  const row = getDatabase()
    .prepare<[number, number], { extract_status: string }>('SELECT extract_status FROM scripts WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, scriptId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '剧本不存在');
  }
  if (row.extract_status === CONTENT_RESOURCE_EXTRACT_STATUS.WAITING || row.extract_status === CONTENT_RESOURCE_EXTRACT_STATUS.RUNNING) {
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

function recordProductionAgentAudit(
  database: Database.Database,
  input: {
    projectId: number;
    contentId: number;
    toolName: string;
    source?: string | null;
    taskId?: number | null;
    input: unknown;
    result: unknown;
  },
): void {
  if (!tableExists('production_agent_audits')) {
    return;
  }

  database
    .prepare<[number, number, number | null, string, string, string, string, number]>(
      `
      INSERT INTO production_agent_audits (project_id, content_id, task_id, tool_name, source, input_json, result_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.projectId,
      input.contentId,
      input.taskId ?? null,
      input.toolName,
      input.source || 'tool',
      serializeJson(input.input, '{}'),
      serializeJson(input.result, '{}'),
      Date.now(),
    );
}

function recordProductionToolAudit(input: {
  projectId: number;
  contentId: number;
  toolName: string;
  source?: string | null;
  taskId?: number | null;
  input: unknown;
  result: unknown;
  error?: string | null;
}): void {
  recordProductionAgentAudit(getDatabase(), input);
}

function createProductionToolContext(projectId: number, contentId: number, taskId?: number | null): ProductionToolContext {
  assertProject(projectId);
  assertContent(projectId, contentId);
  const resourcePayload = { projectId, templateType: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA };
  return {
    projectId,
    contentId,
    taskId: taskId ?? null,
    templateType: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA,
    resourceContext: getProductionResourceContext(resourcePayload),
    skillBundle: getProductionSkillBundle(resourcePayload),
  };
}

function getProductionToolServices(): ProductionToolExecutorServices {
  return {
    getFlowData: getProductionFlowData,
    saveContent: saveProductionContent,
    extractResources: extractProductionResources,
    saveDirectorPlan: saveProductionDirectorPlan,
    saveStoryboardTable: saveProductionStoryboardTable,
    saveStoryboard: saveProductionStoryboard,
    deleteStoryboards: deleteProductionStoryboards,
    saveDerivedAsset: saveProductionDerivedAsset,
    deleteDerivedAsset: deleteProductionDerivedAsset,
    generateDerivedAssetImages: generateProductionDerivedAssetImages,
    generateStoryboardImages: generateProductionStoryboardImages,
    saveVideoTrack: saveProductionVideoTrack,
    generateVideoPrompts: generateProductionVideoPrompts,
    generateVideos: generateProductionVideos,
    selectVideo: selectProductionVideo,
    validateExport: validateExportAssets,
    createExport: createJianyingDraft,
    recordAudit: recordProductionToolAudit,
  };
}

function getProductionToolRegistryFor(projectId: number, contentId: number, taskId?: number | null) {
  return createProductionToolRegistry(createProductionToolContext(projectId, contentId, taskId), getProductionToolServices());
}

export function validateProductionToolInput(toolName: string, input: unknown): { valid: true } {
  if (!listProductionToolDescriptors().some((descriptor) => descriptor.name === toolName)) {
    throw createError(VT_STATUS.INVALID_PARAMS, 'Production Tool 名称无效');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError(VT_STATUS.INVALID_PARAMS, 'Production Tool 参数必须是对象');
  }

  return { valid: true };
}

export function applyProductionAgentToolResult(toolName: string, input: unknown, result: unknown): { toolName: string; input: unknown; result: unknown } {
  validateProductionToolInput(toolName, input);
  return { toolName, input, result };
}

export async function runProductionTool(payload: ProductionToolRunPayload): Promise<ProductionToolRunResult> {
  const projectId = normalizeProjectId(payload.projectId);
  const contentId = normalizeContentId(payload.contentId);
  return getProductionToolRegistryFor(projectId, contentId, payload.taskId).run({ ...payload, projectId, contentId });
}

export function getProductionAgentAiTools(payload: ProductionContentScopedPayload & { taskId?: number | null }): Record<string, Tool> {
  const projectId = normalizeProjectId(payload.projectId);
  const contentId = normalizeContentId(payload.contentId);
  return getProductionToolRegistryFor(projectId, contentId, payload.taskId).toAiTools();
}

function createWorkflowOrchestrator(): ProductionWorkflowOrchestrator {
  return new ProductionWorkflowOrchestrator({
    getFlowData: getProductionFlowData,
    getPendingResourceDraftCount: ({ projectId, contentId }) => listProductionResourceDraftRows(projectId, contentId).length,
    runTool: (payload) => runProductionTool(payload),
  });
}

export function getProductionWorkflowState(payload: ProductionContentPayload): ProductionWorkflowStateResult {
  return createWorkflowOrchestrator().getState(payload);
}

export async function runProductionWorkflowAction(payload: ProductionRunWorkflowActionPayload): Promise<ProductionRunWorkflowActionResult> {
  return createWorkflowOrchestrator().runStep(payload);
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
  const assetIdsByStoryboard = getStoryboardAssetIds(storyboardIds);
  const directContentAssetIds = storyboards.length === 0
    ? listProductionAssets(project.id, script.id).flatMap((asset) => [asset.id, ...asset.children.map((child) => child.id)])
    : [];
  const allAssetIds = Array.from(new Set([...assetIdsByStoryboard.values()].flat().concat(directContentAssetIds)));
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
    `生成范围：${storyboards.length > 0 ? '按关联分镜生成视频片段' : '兼容旧数据：根据整篇作品内容生成单条视频'}`,
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

function resolveVideoPromptSystem(
  project: ProjectRow,
  modeKey: string,
  targetModelId: string = project.video_model_id,
): { system: string; promptTemplate: ReturnType<typeof createPromptTemplateSnapshot> } {
  const modelId = normalizeRequiredText(targetModelId, '视频模型');
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

function aspectRatioForModel(value: string): VideoGenerateInput['aspectRatio'] {
  if (value === PROJECT_VIDEO_RATIOS.PORTRAIT || value === PROJECT_VIDEO_RATIOS.LANDSCAPE) return value;
  throw createError(VT_STATUS.INVALID_PARAMS, `视频比例无效：${value}`);
}

function getProductionVideoOperation(model: string, mode: ProductionVideoModeValue | null): ModelCapabilityMatrixItem {
  const modeKey = serializeVideoMode(mode ?? '');
  if (!modeKey) {
    throw createError(VT_STATUS.INVALID_PARAMS, '请选择视频生成模式');
  }

  try {
    return getReadyModelOperationCapability(model, modeKey, 'video');
  } catch (error) {
    throw createError(VT_STATUS.MODEL_NOT_FOUND, error instanceof Error ? error.message : '视频模型操作不可用');
  }
}

function getVideoOperationAspectRatio(capability: ModelCapabilityMatrixItem, projectRatio: string): VideoGenerateInput['aspectRatio'] | undefined {
  return capability.aspectRatioOptions.length > 0 ? aspectRatioForModel(projectRatio) : undefined;
}

function resolveVideoOperationAudio(capability: ModelCapabilityMatrixItem, requested: boolean | undefined): boolean {
  if (capability.audioSupport === MODEL_AUDIO_SUPPORTS.REQUIRED) return true;
  if (capability.audioSupport === MODEL_AUDIO_SUPPORTS.NONE) return false;
  return Boolean(requested);
}

function countProductionReferenceTypes(references: ProductionReferenceInput[]): Partial<Record<'text' | 'image' | 'video' | 'audio', number>> {
  return references.reduce<Partial<Record<'text' | 'image' | 'video' | 'audio', number>>>((counts, reference) => {
    if (reference.id || reference.url || reference.prompt) {
      counts[reference.fileType] = (counts[reference.fileType] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function operationSupportsReferenceType(capability: ModelCapabilityMatrixItem, type: 'image' | 'video' | 'audio'): boolean {
  return capability.referenceConstraints.some((constraint) => constraint.type === type && constraint.max > 0);
}

function assertProductionVideoOperation(input: {
  capability: ModelCapabilityMatrixItem;
  duration: number;
  resolution: string;
  projectRatio: string;
  audioEnabled: boolean;
  references: ProductionReferenceInput[];
}): void {
  try {
    validateModelOperationSelection(input.capability, {
      duration: input.duration,
      resolution: input.resolution,
      aspectRatio: input.capability.aspectRatioOptions.length > 0 ? input.projectRatio : undefined,
      audio: input.audioEnabled,
    });
    validateModelOperationReferences(input.capability, countProductionReferenceTypes(input.references));
  } catch (error) {
    throw createError(VT_STATUS.INVALID_PARAMS, error instanceof Error ? error.message : '视频模型参数无效');
  }
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

function createContentEpisodeKey(): string {
  return `content_${randomUUID().replace(/-/g, '')}`;
}

function createProductionContentRow(
  database: Database.Database,
  input: {
    projectId: number;
    title: string;
    body: string;
    now: number;
  },
): ContentRow {
  const scriptInsert = database
    .prepare<[number, string, string, string, string, null, number, number]>(
      `
      INSERT INTO scripts (project_id, episode_key, name, content, extract_status, error_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(input.projectId, createContentEpisodeKey(), input.title, input.body, CONTENT_RESOURCE_EXTRACT_STATUS.IDLE, null, input.now, input.now);
  const contentId = Number(scriptInsert.lastInsertRowid);
  database
    .prepare<[number, number, string, string, string, null, string, null, number, number]>(
      `
      INSERT INTO production_contents (
        id, project_id, title, body, resource_status, resource_error_reason,
        dependency_status, dependency_reason, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(contentId, input.projectId, input.title, input.body, PRODUCTION_TASK_STATUS.IDLE, null, DEPENDENCY_STATUSES.VALID, null, input.now, input.now);

  return getContentRow(input.projectId, contentId)!;
}

export function ensureDefaultProductionContent(projectId: number, database: Database.Database = getDatabase()): ProductionContentItem {
  const normalizedProjectId = normalizeProjectId(projectId);
  const existing = database
    .prepare<[number], ContentRow>('SELECT * FROM production_contents WHERE project_id = ? ORDER BY created_at ASC, id ASC LIMIT 1')
    .get(normalizedProjectId);
  if (existing) {
    return mapContentRow(existing);
  }

  const now = Date.now();
  return mapContentRow(
    createProductionContentRow(database, {
      projectId: normalizedProjectId,
      title: '内容',
      body: '',
      now,
    }),
  );
}

function listContentOptions(projectId: number): ProductionContentOption[] {
  if (!tableExists('production_contents')) {
    return [];
  }

  ensureDefaultProductionContent(projectId);
  return getDatabase()
    .prepare<[number], ContentRow>(
      `
      SELECT *
      FROM production_contents
      WHERE project_id = ?
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(projectId)
    .map((row) => ({
      id: row.id,
      name: row.title,
      episodeKey: `content_${row.id}`,
      content: row.body,
    }));
}

function listScriptOptions(projectId: number): ProductionContentOption[] {
  const contents = listContentOptions(projectId);
  if (contents.length > 0) {
    return contents;
  }

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

export function listProductionContents(payload: ProductionProjectPayload): ProductionContentListResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  ensureDefaultProductionContent(projectId);
  const contents = getDatabase()
    .prepare<[number], ContentRow>(
      `
      SELECT *
      FROM production_contents
      WHERE project_id = ?
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(projectId)
    .map(mapContentRow);

  return {
    contents,
    currentContentId: contents[0]?.id ?? null,
  };
}

export function getProductionContent(payload: ProductionContentPayload): ProductionContentResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  return {
    content: mapContentRow(assertContent(projectId, payload.contentId)),
  };
}

export function saveProductionContent(payload: ProductionContentSavePayload): ProductionContentSaveResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const title = normalizeContentTitle(payload.title);
  const body = payload.body ?? '';
  const now = Date.now();

  const contentId = withTransaction((database) => {
    if (!payload.contentId) {
      return createProductionContentRow(database, {
        projectId,
        title,
        body,
        now,
      }).id;
    }

    const existing = assertContent(projectId, payload.contentId);
    const bodyChanged = existing.body !== body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;
    database
      .prepare<[string, string, number, string, null, string, null, number, number, number]>(
        `
        UPDATE production_contents
        SET title = ?,
            body = ?,
            version = ?,
            resource_status = ?,
            resource_error_reason = ?,
            dependency_status = ?,
            dependency_reason = ?,
            updated_at = ?
        WHERE project_id = ? AND id = ?
        `,
      )
      .run(title, body, nextVersion, PRODUCTION_TASK_STATUS.IDLE, null, DEPENDENCY_STATUSES.VALID, null, now, projectId, existing.id);
    database
      .prepare<[string, string, string, null, string, null, number, number, number]>(
        `
        UPDATE scripts
        SET name = ?,
            content = ?,
            extract_status = ?,
            error_reason = ?,
            dependency_status = ?,
            dependency_reason = ?,
            updated_at = ?
        WHERE project_id = ? AND id = ?
        `,
      )
      .run(title, body, CONTENT_RESOURCE_EXTRACT_STATUS.IDLE, null, DEPENDENCY_STATUSES.VALID, null, now, projectId, existing.id);
    if (bodyChanged) {
      markProductionForContentChanged({
        projectId,
        contentIds: [existing.id],
        status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
        reason: DEPENDENCY_REASON.SCRIPT_CHANGED,
        database,
      });
    }
    return existing.id;
  });

  return {
    content: mapContentRow(assertContent(projectId, contentId)),
  };
}

function countContentDependencies(projectId: number, contentId: number): number {
  const tables: Array<{ table: string; where: string; params: number[] }> = [
    { table: 'production_resource_links', where: 'content_id = ?', params: [contentId] },
    { table: 'production_storyboards', where: 'project_id = ? AND script_id = ?', params: [projectId, contentId] },
    { table: 'production_video_tracks', where: 'project_id = ? AND script_id = ?', params: [projectId, contentId] },
    { table: 'production_videos', where: 'project_id = ? AND script_id = ?', params: [projectId, contentId] },
    { table: 'export_history', where: 'project_id = ? AND script_id = ?', params: [projectId, contentId] },
  ];

  return tables.reduce((total, item) => {
    if (!tableExists(item.table)) {
      return total;
    }

    const row = getDatabase()
      .prepare<number[], { count: number }>(`SELECT COUNT(*) AS count FROM ${item.table} WHERE ${item.where}`)
      .get(...item.params);
    return total + (row?.count ?? 0);
  }, 0);
}

export function deleteProductionContent(payload: ProductionContentDeletePayload): ProductionDeleteResult {
  const projectId = normalizeProjectId(payload.projectId);
  const contentId = normalizeContentId(payload.contentId);
  assertProject(projectId);
  assertContent(projectId, contentId);
  if (countContentDependencies(projectId, contentId) > 0) {
    throw createError(VT_STATUS.CONFLICT, '内容已有资源、分镜、视频或导出结果，暂不能删除');
  }

  const deletedCount = withTransaction((database) => {
    if (tableExists('production_image_flows')) {
      database.prepare<[number, number]>('DELETE FROM production_image_flows WHERE project_id = ? AND script_id = ?').run(projectId, contentId);
    }
    if (tableExists('production_agent_audits')) {
      database.prepare<[number, number]>('DELETE FROM production_agent_audits WHERE project_id = ? AND content_id = ?').run(projectId, contentId);
    }
    database.prepare<[number]>('DELETE FROM production_resource_links WHERE content_id = ?').run(contentId);
    database.prepare<[number, number]>('DELETE FROM production_workspaces WHERE project_id = ? AND script_id = ?').run(projectId, contentId);
    database.prepare<[number]>('DELETE FROM script_asset_links WHERE script_id = ?').run(contentId);
    database.prepare<[number, number]>('DELETE FROM scripts WHERE project_id = ? AND id = ?').run(projectId, contentId);
    return database.prepare<[number, number], { changes: number }>('DELETE FROM production_contents WHERE project_id = ? AND id = ?').run(projectId, contentId).changes;
  });

  return { deletedCount };
}

function toProductionResourceStatus(extractStatus: string): ProductionTaskStatus {
  if (extractStatus === CONTENT_RESOURCE_EXTRACT_STATUS.WAITING || extractStatus === CONTENT_RESOURCE_EXTRACT_STATUS.RUNNING) {
    return PRODUCTION_TASK_STATUS.RUNNING;
  }
  if (extractStatus === CONTENT_RESOURCE_EXTRACT_STATUS.SUCCEEDED) {
    return PRODUCTION_TASK_STATUS.SUCCEEDED;
  }
  if (extractStatus === CONTENT_RESOURCE_EXTRACT_STATUS.FAILED) {
    return PRODUCTION_TASK_STATUS.FAILED;
  }

  return PRODUCTION_TASK_STATUS.IDLE;
}

function syncProductionResourceLinks(database: Database.Database, contentIds: number[]): void {
  const ids = normalizeOptionalIds(contentIds);
  if (ids.length === 0 || !tableExists('production_resource_links')) {
    return;
  }

  const now = Date.now();
  for (const contentId of ids) {
    database
      .prepare<[number, number]>(
        `
        DELETE FROM production_resource_links
        WHERE content_id = ?
          AND asset_id NOT IN (SELECT asset_id FROM script_asset_links WHERE script_id = ?)
        `,
      )
      .run(contentId, contentId);
    database
      .prepare<[number, number]>(
        `
        INSERT OR IGNORE INTO production_resource_links (content_id, asset_id, created_at)
        SELECT script_id, asset_id, ?
        FROM script_asset_links
        WHERE script_id = ?
        `,
      )
      .run(now, contentId);
  }
}

export function pollProductionResourceExtraction(payload: ProductionPollResourceExtractionPayload): ProductionPollResourceExtractionResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const contentIds = normalizeIds(payload.contentIds, '内容 ID');
  const placeholders = contentIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, ContentExtractRow>(
      `
      SELECT id, project_id, extract_status, error_reason
      FROM scripts
      WHERE project_id = ?
        AND id IN (${placeholders})
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(projectId, ...contentIds);

  withTransaction((database) => {
    const update = database.prepare<[ProductionTaskStatus, string | null, number, number, number]>(
      'UPDATE production_contents SET resource_status = ?, resource_error_reason = ?, updated_at = ? WHERE project_id = ? AND id = ?',
    );
    for (const row of rows) {
      const status = toProductionResourceStatus(row.extract_status);
      update.run(status, row.error_reason, Date.now(), projectId, row.id);
    }
  });

  const contents = contentIds.map((contentId) => mapContentRow(assertContent(projectId, contentId)));
  return { contents };
}

export function getProductionFlowData(payload: ProductionContentPayload): ProductionFlowDataResult {
  const { script } = assertContentProductionContext(payload);
  const workspace = getProductionWorkspace({ projectId: script.project_id, contentId: script.id });
  if (!workspace.flowData) {
    throw createError(VT_STATUS.NOT_FOUND, '生产工作区不存在');
  }

  return {
    flowData: workspace.flowData,
  };
}

export function saveProductionFlowPositions(payload: ProductionSaveFlowPositionsPayload): ProductionSaveWorkspaceResult {
  const { script } = assertContentProductionContext(payload);
  const now = Date.now();
  const positionsJson = serializeJson(payload.positions ?? {}, '{}');
  ensureWorkspace(script.project_id, script.id);
  getDatabase()
    .prepare<[string, number, number, number]>(
      'UPDATE production_workspaces SET positions_json = ?, updated_at = ? WHERE project_id = ? AND script_id = ?',
    )
    .run(positionsJson, now, script.project_id, script.id);

  return { savedAt: now };
}

export function saveProductionDirectorPlan(payload: ProductionSaveDirectorPlanPayload): ProductionSaveWorkspaceResult {
  const { script } = assertContentProductionContext(payload);
  const now = Date.now();
  ensureWorkspace(script.project_id, script.id);
  getDatabase()
    .prepare<[string, number, number, number]>(
      'UPDATE production_workspaces SET script_plan = ?, updated_at = ? WHERE project_id = ? AND script_id = ?',
    )
    .run(payload.directorPlan ?? '', now, script.project_id, script.id);

  return { savedAt: now };
}

export function saveProductionStoryboardTable(payload: ProductionSaveStoryboardTablePayload): ProductionSaveWorkspaceResult {
  const { script } = assertContentProductionContext(payload);
  const now = Date.now();
  ensureWorkspace(script.project_id, script.id);
  getDatabase()
    .prepare<[string, number, number, number]>(
      'UPDATE production_workspaces SET storyboard_table = ?, updated_at = ? WHERE project_id = ? AND script_id = ?',
    )
    .run(payload.storyboardTable ?? '', now, script.project_id, script.id);

  return { savedAt: now };
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

function toResourceDraftType(value: string): ProductionResourceDraftType {
  if (value === 'role' || value === 'scene' || value === 'tool') {
    return value;
  }

  return 'role';
}

function normalizeResourceDraftType(value: unknown): ProductionResourceDraftType {
  if (value === 'role' || value === 'scene' || value === 'tool') {
    return value;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '资源类型无效');
}

function toResourceDraftAction(value: string): ProductionResourceDraftAction {
  return PRODUCTION_RESOURCE_DRAFT_ACTIONS.includes(value as ProductionResourceDraftAction) ? value as ProductionResourceDraftAction : 'create';
}

function normalizeResourceDraftAction(value: unknown): ProductionResourceDraftAction {
  if (PRODUCTION_RESOURCE_DRAFT_ACTIONS.includes(value as ProductionResourceDraftAction)) {
    return value as ProductionResourceDraftAction;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '资源草稿动作无效');
}

function toResourceDraftStatus(value: string): ProductionResourceDraftStatus {
  return PRODUCTION_RESOURCE_DRAFT_STATUSES.includes(value as ProductionResourceDraftStatus) ? value as ProductionResourceDraftStatus : 'draft';
}

function normalizeDraftId(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '资源草稿 ID 无效');
  }

  return value;
}

function mapProductionResourceDraftRow(row: ProductionResourceDraftRow): ProductionResourceDraft {
  return {
    id: row.id,
    projectId: row.project_id,
    contentId: row.content_id,
    taskId: row.task_id,
    assetId: row.asset_id,
    matchedAssetId: row.matched_asset_id,
    matchedAssetName: row.matched_asset_name ?? null,
    matchedAssetType: row.matched_asset_type ? toResourceDraftType(row.matched_asset_type) : null,
    type: toResourceDraftType(row.type),
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    action: toResourceDraftAction(row.action),
    status: toResourceDraftStatus(row.status),
    errorReason: row.error_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listProductionResourceDraftRows(projectId: number, contentId: number, draftIds?: number[], database: Database.Database = getDatabase()): ProductionResourceDraftRow[] {
  if (!tableExists('production_resource_drafts')) {
    return [];
  }

  const params: Array<number | string> = [projectId, contentId, 'draft'];
  const idClause = draftIds?.length ? ` AND d.id IN (${draftIds.map(() => '?').join(', ')})` : '';
  if (draftIds?.length) {
    params.push(...draftIds);
  }

  return database
    .prepare<Array<number | string>, ProductionResourceDraftRow>(
      `
      SELECT
        d.*,
        a.name AS matched_asset_name,
        a.type AS matched_asset_type
      FROM production_resource_drafts d
      LEFT JOIN assets a ON a.id = d.matched_asset_id AND a.project_id = d.project_id
      WHERE d.project_id = ?
        AND d.content_id = ?
        AND d.status = ?
        ${idClause}
      ORDER BY CASE d.type WHEN 'role' THEN 1 WHEN 'scene' THEN 2 WHEN 'tool' THEN 3 ELSE 9 END,
               d.created_at ASC,
               d.id ASC
      `,
    )
    .all(...params);
}

function getProductionResourceDraftRow(projectId: number, contentId: number, draftId: number, database: Database.Database = getDatabase()): ProductionResourceDraftRow {
  const row = listProductionResourceDraftRows(projectId, contentId, [draftId], database)[0];
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '资源草稿不存在');
  }

  return row;
}

function listProductionResourceExistingAssets(projectId: number): ProductionResourceExistingAsset[] {
  if (!tableExists('assets')) {
    return [];
  }

  const rows = getDatabase()
    .prepare<[number], AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ?
        AND parent_id IS NULL
        AND type IN ('role', 'scene', 'tool')
      ORDER BY CASE type WHEN 'role' THEN 1 WHEN 'scene' THEN 2 WHEN 'tool' THEN 3 ELSE 9 END,
               name COLLATE NOCASE ASC,
               id ASC
      `,
    )
    .all(projectId);
  const mediaByAsset = loadAssetMedia(rows.map((row) => row.id));
  return rows.map((row) => {
    const media = mediaByAsset.get(row.id);
    const urls = mediaUrls(media?.relative_path ?? null, media?.kind === 'audio' ? 'audio' : media?.kind === 'video' ? 'video' : 'image');
    return {
      id: row.id,
      type: toResourceDraftType(row.type),
      name: row.name,
      description: row.description,
      prompt: row.prompt,
      imageUrl: urls.thumbnailUrl ?? urls.url,
    };
  });
}

function assertProductionResourceAsset(database: Database.Database, projectId: number, assetId: number): AssetRow {
  const row = database.prepare<[number, number], AssetRow>('SELECT * FROM assets WHERE project_id = ? AND id = ? LIMIT 1').get(projectId, assetId);
  if (!row || row.parent_id !== null || !['role', 'scene', 'tool'].includes(row.type)) {
    throw createError(VT_STATUS.NOT_FOUND, '匹配资产不存在');
  }

  return row;
}

function resolveDraftMatchedAssetId(database: Database.Database, projectId: number, matchedAssetId: number | null | undefined): number | null {
  if (!matchedAssetId) {
    return null;
  }

  const normalized = normalizeIds([matchedAssetId], '匹配资产 ID')[0]!;
  assertProductionResourceAsset(database, projectId, normalized);
  return normalized;
}

function upsertCommittedResourceAsset(database: Database.Database, projectId: number, row: ProductionResourceDraftRow, now: number): number {
  const type = normalizeResourceDraftType(row.type);
  const name = normalizeRequiredText(row.name, '资源名称');
  const description = normalizeOptionalText(row.description);
  const prompt = normalizeOptionalText(row.prompt);
  const existing = database
    .prepare<[number, string, string], AssetRow>(
      `
      SELECT *
      FROM assets
      WHERE project_id = ?
        AND parent_id IS NULL
        AND type = ?
        AND lower(name) = lower(?)
      LIMIT 1
      `,
    )
    .get(projectId, type, name);

  if (existing) {
    const changed = existing.description !== description || existing.prompt !== prompt;
    database
      .prepare<[string, string, number, number, number]>(
        `
        UPDATE assets
        SET description = ?, prompt = ?, updated_at = ?
        WHERE project_id = ? AND id = ?
        `,
      )
      .run(description, prompt, now, projectId, existing.id);
    markAssetsDependencyStatus({
      projectId,
      assetIds: [existing.id],
      status: DEPENDENCY_STATUSES.VALID,
      reason: null,
      database,
    });
    if (changed) {
      markProductionForAssetsChanged({
        projectId,
        assetIds: [existing.id],
        status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
        reason: DEPENDENCY_REASON.ASSET_CHANGED,
        database,
      });
    }
    return existing.id;
  }

  const insert = database
    .prepare<[number, null, AssetType, string, string, string, 'extract', number, number]>(
      `
      INSERT INTO assets (project_id, parent_id, type, name, description, prompt, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(projectId, null, type, name, description, prompt, 'extract', now, now);
  return Number(insert.lastInsertRowid);
}

function replaceCommittedResourceAsset(database: Database.Database, projectId: number, row: ProductionResourceDraftRow, now: number): number {
  const assetId = resolveDraftMatchedAssetId(database, projectId, row.matched_asset_id ?? row.asset_id);
  if (!assetId) {
    throw createError(VT_STATUS.INVALID_PARAMS, '替换资源需要选择已有资产');
  }

  const existing = assertProductionResourceAsset(database, projectId, assetId);
  const type = normalizeResourceDraftType(row.type);
  const name = normalizeRequiredText(row.name, '资源名称');
  const description = normalizeOptionalText(row.description);
  const prompt = normalizeOptionalText(row.prompt);
  const changed = existing.type !== type || existing.name !== name || existing.description !== description || existing.prompt !== prompt;
  database
    .prepare<[AssetType, string, string, string, number, number, number]>(
      `
      UPDATE assets
      SET type = ?, name = ?, description = ?, prompt = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
      `,
    )
    .run(type, name, description, prompt, now, projectId, assetId);
  markAssetsDependencyStatus({
    projectId,
    assetIds: [assetId],
    status: DEPENDENCY_STATUSES.VALID,
    reason: null,
    database,
  });
  if (changed) {
    markProductionForAssetsChanged({
      projectId,
      assetIds: [assetId],
      status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
      reason: DEPENDENCY_REASON.ASSET_CHANGED,
      database,
    });
  }
  return assetId;
}

function commitProductionResourceDraftRow(database: Database.Database, projectId: number, contentId: number, row: ProductionResourceDraftRow, now: number): { saved: boolean } {
  const action = toResourceDraftAction(row.action);
  if (action === 'skip') {
    database
      .prepare<['skipped', number, number, number, number]>(
        'UPDATE production_resource_drafts SET status = ?, updated_at = ? WHERE project_id = ? AND content_id = ? AND id = ?',
      )
      .run('skipped', now, projectId, contentId, row.id);
    return { saved: false };
  }

  let assetId: number;
  if (action === 'merge') {
    const matchedAssetId = resolveDraftMatchedAssetId(database, projectId, row.matched_asset_id ?? row.asset_id);
    if (!matchedAssetId) {
      throw createError(VT_STATUS.INVALID_PARAMS, '合并资源需要选择已有资产');
    }
    assetId = matchedAssetId;
  } else if (action === 'replace') {
    assetId = replaceCommittedResourceAsset(database, projectId, row, now);
  } else {
    assetId = upsertCommittedResourceAsset(database, projectId, row, now);
  }

  database.prepare<[number, number, number]>('INSERT OR IGNORE INTO script_asset_links (script_id, asset_id, created_at) VALUES (?, ?, ?)').run(contentId, assetId, now);
  if (tableExists('production_resource_links')) {
    database.prepare<[number, number, number]>('INSERT OR IGNORE INTO production_resource_links (content_id, asset_id, created_at) VALUES (?, ?, ?)').run(contentId, assetId, now);
  }
  database
    .prepare<[number, 'saved', number, number, number, number]>(
      'UPDATE production_resource_drafts SET asset_id = ?, status = ?, updated_at = ? WHERE project_id = ? AND content_id = ? AND id = ?',
    )
    .run(assetId, 'saved', now, projectId, contentId, row.id);

  return { saved: true };
}

export function listProductionResourceDrafts(payload: ProductionResourceDraftListPayload): ProductionResourceDraftListResult {
  const { script } = assertContentProductionContext(payload);
  return {
    drafts: listProductionResourceDraftRows(script.project_id, script.id).map(mapProductionResourceDraftRow),
    existingAssets: listProductionResourceExistingAssets(script.project_id),
  };
}

export function saveProductionResourceDraft(payload: ProductionResourceDraftSavePayload): ProductionResourceDraftSaveResult {
  const { script } = assertContentProductionContext(payload);
  const draftId = normalizeDraftId(payload.draftId);
  const now = Date.now();
  const draft = withTransaction((database) => {
    const existing = getProductionResourceDraftRow(script.project_id, script.id, draftId, database);
    const type = payload.type === undefined ? toResourceDraftType(existing.type) : normalizeResourceDraftType(payload.type);
    const name = payload.name === undefined ? existing.name : normalizeRequiredText(payload.name, '资源名称');
    const description = payload.description === undefined ? existing.description : normalizeOptionalText(payload.description);
    const prompt = payload.prompt === undefined ? existing.prompt : normalizeOptionalText(payload.prompt);
    const action = payload.action === undefined ? toResourceDraftAction(existing.action) : normalizeResourceDraftAction(payload.action);
    const matchedAssetId = payload.matchedAssetId === undefined ? existing.matched_asset_id : resolveDraftMatchedAssetId(database, script.project_id, payload.matchedAssetId);
    if ((action === 'merge' || action === 'replace') && !matchedAssetId) {
      throw createError(VT_STATUS.INVALID_PARAMS, '合并或替换资源需要选择已有资产');
    }
    database
      .prepare<[ProductionResourceDraftType, string, string, string, ProductionResourceDraftAction, number | null, number, number, number, number]>(
        `
        UPDATE production_resource_drafts
        SET type = ?, name = ?, description = ?, prompt = ?, action = ?, matched_asset_id = ?, updated_at = ?
        WHERE project_id = ? AND content_id = ? AND id = ?
        `,
      )
      .run(type, name, description, prompt, action, matchedAssetId, now, script.project_id, script.id, draftId);
    return getProductionResourceDraftRow(script.project_id, script.id, draftId, database);
  });

  return {
    draft: mapProductionResourceDraftRow(draft),
  };
}

export function deleteProductionResourceDraft(payload: ProductionResourceDraftDeletePayload): ProductionDeleteResult {
  const { script } = assertContentProductionContext(payload);
  const draftId = normalizeDraftId(payload.draftId);
  const result = getDatabase()
    .prepare<[number, number, number, string], { changes: number }>('DELETE FROM production_resource_drafts WHERE project_id = ? AND content_id = ? AND id = ? AND status = ?')
    .run(script.project_id, script.id, draftId, 'draft');
  return { deletedCount: result.changes };
}

export function commitProductionResourceDrafts(payload: ProductionResourceDraftCommitPayload): ProductionResourceDraftCommitResult {
  const { script } = assertContentProductionContext(payload);
  const draftIds = payload.draftIds?.length ? normalizeIds(payload.draftIds, '资源草稿 ID') : undefined;
  const replaceAll = !draftIds?.length;
  const now = Date.now();
  const result = withTransaction((database) => {
    const rows = listProductionResourceDraftRows(script.project_id, script.id, draftIds, database);
    if (rows.length === 0) {
      throw createError(VT_STATUS.INVALID_PARAMS, '没有可入库的资源草稿');
    }
    if (replaceAll) {
      database.prepare<[number]>('DELETE FROM script_asset_links WHERE script_id = ?').run(script.id);
      if (tableExists('production_resource_links')) {
        database.prepare<[number]>('DELETE FROM production_resource_links WHERE content_id = ?').run(script.id);
      }
    }
    let savedCount = 0;
    let skippedCount = 0;
    for (const row of rows) {
      const committed = commitProductionResourceDraftRow(database, script.project_id, script.id, row, now);
      if (committed.saved) {
        savedCount += 1;
      } else {
        skippedCount += 1;
      }
    }
    syncProductionResourceLinks(database, [script.id]);
    return { savedCount, skippedCount };
  });

  return {
    ...result,
    assets: listProductionAssets(script.project_id, script.id),
    drafts: listProductionResourceDraftRows(script.project_id, script.id).map(mapProductionResourceDraftRow),
    flowData: loadFlowData(script.project_id, script.id),
  };
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
    contentId: row.script_id,
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
    contentId: row.script_id,
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
    .prepare<Array<number | string>, VideoRow>(
      `
      SELECT *
      FROM production_videos
      WHERE track_id IN (${placeholders})
        AND status = ?
        AND relative_path IS NOT NULL
      ORDER BY created_at DESC, id DESC
      `,
    )
    .all(...trackIds, PRODUCTION_TASK_STATUS.SUCCEEDED);

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
    contentId: row.script_id,
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
    contentId: row.script_id,
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

export function getProductionWorkspace(payload: ProductionProjectPayload & { contentId?: number | null }): ProductionWorkspaceResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertProject(projectId);
  const contents = listScriptOptions(projectId);
  const requestedContentId = payload.contentId ? resolveScopedContentId(payload) : contents[0]?.id ?? null;
  if (!requestedContentId) {
    return {
      contents,
      currentContentId: null,
      flowData: null,
    };
  }

  const script = assertScript(projectId, requestedContentId);
  const content = tableExists('production_contents') ? assertContent(projectId, script.id) : null;
  const workspace = ensureWorkspace(projectId, script.id);
  return {
    contents,
    currentContentId: script.id,
    flowData: {
      content: content ? mapContentRow(content) : undefined,
      contentBody: content?.body ?? script.content,
      directorPlan: workspace.script_plan,
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
        payload.directorPlan ?? '',
        payload.storyboardTable ?? '',
        positionsJson,
        now,
        now,
        payload.directorPlan ?? '',
        payload.storyboardTable ?? '',
        positionsJson,
        now,
      );
  });

  return { savedAt: now };
}

export function getProductionAgentTools(): ProductionAgentToolsResult {
  return {
    tools: listProductionToolDescriptors(),
    xmlTags: [
      { tag: 'content', writes: 'content', status: 'ready' },
      { tag: 'directorPlan', writes: 'directorPlan', status: 'ready' },
      { tag: 'storyboardTable', writes: 'storyboardTable', status: 'ready' },
      { tag: 'storyboardItem', writes: 'storyboard', status: 'ready' },
    ],
  };
}

function createManualRuleReference(key: string, bundle: ManualPromptBundle): ProductionStepRuleReference {
  return {
    key,
    source: 'manual',
    name: bundle.manualName,
    content: bundle.content,
    manualKind: bundle.kind,
    manualKeys: bundle.keys,
  };
}

function createPromptRuleReference(
  key: string,
  prompt: { name: string; content: string; type: string },
  modelId?: string,
): ProductionStepRuleReference {
  return {
    key,
    source: 'prompt',
    name: prompt.name,
    content: prompt.content,
    promptType: prompt.type,
    ...(modelId ? { modelId } : {}),
  };
}

function buildProductionStepRules(
  project: ProjectRow,
  script: ScriptRow,
  resourceContext: ReturnType<typeof getProductionResourceContext>,
  skillBundle: ReturnType<typeof getProductionSkillBundle>,
): ProductionStepRuleReferences {
  const extractionPrompts = resourceContext.promptTemplates
    .filter((prompt) => prompt.type === 'scriptAssetExtraction')
    .map((prompt) => createPromptRuleReference(`prompt-${prompt.id}`, prompt));
  const resourceManuals: ProductionStepRuleReference[] = [];
  const assetManualUsages = new Map<string, { type: 'role' | 'scene' | 'tool'; isDerivative: boolean }>();
  listProductionAssets(script.project_id, script.id)
    .flatMap((asset) => [asset, ...asset.children])
    .forEach((asset) => {
      if (asset.type !== 'role' && asset.type !== 'scene' && asset.type !== 'tool') return;
      const isDerivative = asset.parentId !== null;
      assetManualUsages.set(`${asset.type}:${isDerivative}`, { type: asset.type, isDerivative });
    });
  const assetManualKeys = {
    role: { parent: 'character', derivative: 'characterDerivative' },
    scene: { parent: 'scene', derivative: 'sceneDerivative' },
    tool: { parent: 'prop', derivative: 'propDerivative' },
  } as const;
  assetManualUsages.forEach(({ type, isDerivative }, usageKey) => {
    const targetKey = isDerivative ? assetManualKeys[type].derivative : assetManualKeys[type].parent;
    const bundle = readManualPromptBundle('visual', project.visual_manual_id, ['prefix', targetKey]);
    resourceManuals.push(createManualRuleReference(`manual-resource-${usageKey}`, bundle));
  });

  const storyboardManuals = readProductionStoryboardManuals(project);
  const videoManuals = readProductionVideoManuals(project);
  const splitSkill = skillBundle.skills.find((skill) => skill.name === 'production_execution_storyboard_split'
    || skill.content.includes('# 通用分镜拆分'));
  const splitRules: ProductionStepRuleReference[] = splitSkill ? [{
    key: `skill-${splitSkill.name}`,
    source: 'skill',
    name: splitSkill.name,
    description: splitSkill.description,
    content: splitSkill.content,
  }] : [];

  const videoPromptRules: ProductionStepRuleReference[] = [];

  return {
    content: [],
    resources: [...extractionPrompts, ...resourceManuals],
    storyboardTable: [
      ...splitRules,
      createManualRuleReference('manual-storyboard-table-visual', storyboardManuals.visual),
      createManualRuleReference('manual-storyboard-table-director', storyboardManuals.director),
    ],
    storyboardImages: [
      createManualRuleReference('manual-storyboard-image-visual', storyboardManuals.visual),
      createManualRuleReference('manual-storyboard-image-director', storyboardManuals.director),
    ],
    videoWorkbench: [
      ...videoPromptRules,
      createManualRuleReference('manual-video-visual', videoManuals.visual),
      createManualRuleReference('manual-video-director', videoManuals.director),
    ],
    export: [],
  };
}

export function getProductionAgentContext(payload: ProductionContentScopedPayload): ProductionAgentContextResult {
  const { script, project } = assertProductionContext(payload);
  const workspace = getProductionWorkspace({ projectId: script.project_id, contentId: script.id });
  if (!workspace.flowData) {
    throw createError(VT_STATUS.NOT_FOUND, '生产工作区不存在');
  }
  const tools = getProductionAgentTools();
  const manuals = readProductionStoryboardManuals(project);
  const resourceContextPayload = {
    projectId: script.project_id,
    templateType: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA,
  };
  const resourceContext = getProductionResourceContext(resourceContextPayload);
  const skillBundle = getProductionSkillBundle(resourceContextPayload);
  return {
    projectId: script.project_id,
    contentId: script.id,
    contentTitle: workspace.flowData.content?.title ?? script.name,
    flowData: workspace.flowData,
    resourceContext,
    skillBundle,
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
    stepRules: buildProductionStepRules(project, script, resourceContext, skillBundle),
    ...tools,
  };
}

function loadFlowData(projectId: number, scriptId: number): ProductionFlowData {
  const workspace = getProductionWorkspace({ projectId, contentId: scriptId });
  if (!workspace.flowData) {
    throw createError(VT_STATUS.NOT_FOUND, '生产工作区不存在');
  }

  return workspace.flowData;
}

export function applyProductionAgentWorkspacePatch(payload: ProductionAgentWorkspacePatchPayload): ProductionAgentWorkspacePatchResult {
  const { script } = assertProductionContext(payload);
  const patches = normalizeAgentWorkspacePatches(payload.patches);
  const workspace = ensureWorkspace(script.project_id, script.id);
  const contentPatch = patches.find((patch) => patch.field === 'content');
  const directorPlanPatch = patches.find((patch) => patch.field === 'directorPlan');
  const storyboardTablePatch = patches.find((patch) => patch.field === 'storyboardTable');
  const now = Date.now();

  withTransaction((database) => {
    if (contentPatch) {
      assertScriptEditableForAgent(script.project_id, script.id);
      const contentChanged = script.content !== contentPatch.content;
      const contentRow = tableExists('production_contents') ? getContentRow(script.project_id, script.id) : null;
      database
        .prepare<[string, string, null, string, null, number, number, number]>(
          `
          UPDATE scripts
          SET content = ?, extract_status = ?, error_reason = ?, dependency_status = ?, dependency_reason = ?, updated_at = ?
          WHERE project_id = ? AND id = ?
          `,
        )
        .run(contentPatch.content, CONTENT_RESOURCE_EXTRACT_STATUS.IDLE, null, DEPENDENCY_STATUSES.VALID, null, now, script.project_id, script.id);
      if (contentRow) {
        database
          .prepare<[string, number, string, null, string, null, number, number, number]>(
            `
            UPDATE production_contents
            SET body = ?,
                version = ?,
                resource_status = ?,
                resource_error_reason = ?,
                dependency_status = ?,
                dependency_reason = ?,
                updated_at = ?
            WHERE project_id = ? AND id = ?
            `,
          )
          .run(
            contentPatch.content,
            contentChanged ? contentRow.version + 1 : contentRow.version,
            PRODUCTION_TASK_STATUS.IDLE,
            null,
            DEPENDENCY_STATUSES.VALID,
            null,
            now,
            script.project_id,
            script.id,
          );
      }
      if (contentChanged) {
        markProductionForContentChanged({
          projectId: script.project_id,
          contentIds: [script.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.SCRIPT_CHANGED,
          database,
        });
      }
    }
    if (directorPlanPatch || storyboardTablePatch) {
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
          directorPlanPatch?.content ?? workspace.script_plan,
          storyboardTablePatch?.content ?? workspace.storyboard_table,
          now,
          script.project_id,
          script.id,
        );
    }
    recordProductionAgentAudit(database, {
      projectId: script.project_id,
      contentId: script.id,
      toolName: 'apply_workspace_patch',
      source: payload.source,
      input: payload,
      result: { appliedFields: patches.map((patch) => patch.field) },
    });
  });

  return {
    appliedCount: patches.length,
    patches: patches.map((patch) => ({ field: patch.field })),
    flowData: loadFlowData(script.project_id, script.id),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readSmartSplitItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isPlainRecord(value)) {
    return [];
  }

  const candidate = value.storyboards ?? value.items ?? value.shots ?? value.segments;
  return Array.isArray(candidate) ? candidate : [];
}

function readSmartSplitText(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value === undefined || value === null) {
      continue;
    }
    const text = normalizeOptionalText(String(value));
    if (text) {
      return text;
    }
  }

  return '';
}

function readSmartSplitAssetIds(value: unknown): number[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\s，、]+/).filter(Boolean)
      : [];

  return Array.from(new Set(rawItems
    .map((item) => (isPlainRecord(item) ? Number(item.id ?? item.assetId) : Number(item)))
    .filter((assetId) => Number.isInteger(assetId) && assetId > 0)));
}

function readSmartSplitBoolean(item: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
  }

  return fallback;
}

function coerceSmartSplitOutput(value: unknown, validAssetIds: Set<number>): SmartSplitStoryboardOutput | null {
  const rawItems = readSmartSplitItems(value);
  if (rawItems.length === 0 || rawItems.length > 100) {
    return null;
  }

  const storyboards: SmartSplitStoryboardDraft[] = [];
  for (const item of rawItems) {
    if (!isPlainRecord(item)) {
      return null;
    }
    const videoDesc = readSmartSplitText(item, ['videoDesc', 'visualDesc', 'description', 'desc', 'shotDesc', 'content']);
    if (!videoDesc) {
      return null;
    }
    const prompt = readSmartSplitText(item, ['prompt', 'imagePrompt', 'visualPrompt']) || videoDesc;
    let duration = 4;
    try {
      duration = normalizeDuration(Number(item.duration ?? item.durationSeconds ?? item.seconds ?? 4));
    } catch {
      return null;
    }
    const associatedAssetIds = readSmartSplitAssetIds(
      item.associatedAssetIds ?? item.associateAssetIds ?? item.associateAssetsIds ?? item.assetIds ?? item.resourceIds,
    );
    if (associatedAssetIds.some((assetId) => !validAssetIds.has(assetId))) {
      return null;
    }
    storyboards.push({
      videoDesc,
      prompt,
      duration,
      associatedAssetIds,
      shouldGenerateImage: readSmartSplitBoolean(item, ['shouldGenerateImage', 'generateImage', 'needImage'], true),
    });
  }

  return { storyboards };
}

function summarizeSmartSplitOutput(output: SmartSplitStoryboardOutput | null): Record<string, unknown> {
  return {
    hasOutput: Boolean(output),
    storyboardCount: output?.storyboards.length ?? 0,
    linkedAssetCount: output?.storyboards.reduce((count, item) => count + item.associatedAssetIds.length, 0) ?? 0,
  };
}

function toJsonSafeDiagnosticValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return String(value);
  }
}

function toStructuredDiagnosticsSnapshot(diagnostics: StructuredResultDiagnostics): Record<string, unknown> {
  return {
    requestId: diagnostics.requestId,
    fallbackRequestId: diagnostics.fallbackRequestId ?? null,
    modelKey: diagnostics.modelKey,
    status: diagnostics.status,
    source: diagnostics.source,
    usedJsonFallback: diagnostics.usedJsonFallback,
    parsed: diagnostics.parsed ?? null,
    recordedAt: diagnostics.recordedAt,
    attempts: diagnostics.attempts.map((attempt) => ({
      stage: attempt.stage,
      requestId: attempt.requestId,
      source: attempt.source,
      hasToolResult: attempt.hasToolResult,
      hasText: attempt.hasText,
      rawText: clampText(attempt.rawText ?? '', 4000),
      finishReason: toJsonSafeDiagnosticValue(attempt.finishReason),
      usage: toJsonSafeDiagnosticValue(attempt.usage),
      warnings: toJsonSafeDiagnosticValue(attempt.warnings),
    })),
  };
}

function clearProductionSegments(database: Database.Database, projectId: number, scriptId: number): void {
  const storyboardRows = database
    .prepare<[number, number], { id: number }>('SELECT id FROM production_storyboards WHERE project_id = ? AND script_id = ?')
    .all(projectId, scriptId);
  if (storyboardRows.length > 0) {
    const storyboardIds = storyboardRows.map((row) => row.id);
    const placeholders = storyboardIds.map(() => '?').join(', ');
    database.prepare<Array<number>>(`DELETE FROM production_storyboard_asset_links WHERE storyboard_id IN (${placeholders})`).run(...storyboardIds);
    database.prepare<Array<number>>(`DELETE FROM production_image_flows WHERE owner_type = 'storyboard' AND owner_id IN (${placeholders})`).run(...storyboardIds);
  }
  database.prepare<[number, number]>('DELETE FROM production_videos WHERE project_id = ? AND script_id = ?').run(projectId, scriptId);
  database.prepare<[number, number]>('UPDATE production_storyboards SET track_id = NULL WHERE project_id = ? AND script_id = ?').run(projectId, scriptId);
  database.prepare<[number, number]>('DELETE FROM production_video_tracks WHERE project_id = ? AND script_id = ?').run(projectId, scriptId);
  database.prepare<[number, number]>('DELETE FROM production_storyboards WHERE project_id = ? AND script_id = ?').run(projectId, scriptId);
}

export async function smartSplitProductionStoryboards(payload: ProductionSmartSplitStoryboardsPayload): Promise<ProductionSmartSplitStoryboardsResult> {
  const { script, project } = assertProductionContext(payload);
  const existingStoryboards = listStoryboards(script.project_id, script.id);
  const existingTracks = listVideoTracks(script.project_id, script.id);
  if ((existingStoryboards.length > 0 || existingTracks.length > 0) && !payload.replaceExisting) {
    throw createError(VT_STATUS.CONFLICT, '当前作品已有分镜或视频片段，重新拆分前需要确认替换');
  }

  const assets = listProductionAssets(script.project_id, script.id).flatMap((asset) => [asset, ...asset.children]);
  const validAssetIds = new Set(assets.map((asset) => asset.id));
  const skillBundle = getProductionSkillBundle({ projectId: script.project_id, templateType: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA });
  const splitSkill = skillBundle.skills.find((skill) => skill.name === 'production_execution_storyboard_split'
    || skill.content.includes('# 通用分镜拆分'));
  if (!splitSkill) {
    throw createError(VT_STATUS.FILE_NOT_FOUND, '通用分镜拆分规则不存在');
  }

  const manuals = readProductionStoryboardManuals(project);
  const userPrompt = [
    `项目名称：${project.name}`,
    `内容类型：${project.genre || '通用视频'}`,
    `作品名称：${script.name}`,
    '',
    '可引用资产：',
    JSON.stringify(assets.map((asset) => ({ id: asset.id, type: asset.type, name: asset.name, description: asset.description }))),
    '',
    '作品内容：',
    script.content,
  ].join('\n');
  const system = [
    splitSkill.content,
    '',
    formatProductionManuals('当前项目手册规范', manuals),
  ].join('\n');
  const task = createProductionTask({
    projectId: script.project_id,
    category: STORYBOARD_SPLIT_CATEGORY,
    relatedObjects: {
      contentId: script.id,
      rule: splitSkill.name,
      manuals: toProductionManualSnapshots(manuals),
    },
    modelName: 'productionAgent:storyboardTableAgent',
    description: `智能拆分作品《${script.name}》`,
  });

  try {
    const requestId = createModelRequestId();
    const structured = await invokeStructuredResult<SmartSplitStoryboardOutput>({
      requestId,
      modelKey: 'productionAgent:storyboardTableAgent',
      system,
      messages: [{ role: 'user', content: userPrompt }],
      toolDescription: '返回按顺序生成的视频分镜列表。',
      inputSchema: {
        type: 'object',
        properties: {
          storyboards: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              properties: {
                videoDesc: { type: 'string' },
                prompt: { type: 'string' },
                duration: { type: 'number', minimum: 1, maximum: 600 },
                associatedAssetIds: { type: 'array', items: { type: 'number' } },
                shouldGenerateImage: { type: 'boolean' },
              },
              required: ['videoDesc', 'prompt', 'duration', 'associatedAssetIds', 'shouldGenerateImage'],
              additionalProperties: false,
            },
          },
        },
        required: ['storyboards'],
        additionalProperties: false,
      },
      jsonFallbackExample: '{"storyboards":[{"videoDesc":"","prompt":"","duration":6,"associatedAssetIds":[],"shouldGenerateImage":true}]}',
      coerce: (value) => coerceSmartSplitOutput(value, validAssetIds),
      diagnosticSummary: summarizeSmartSplitOutput,
    });
    const modelDiagnostics = toStructuredDiagnosticsSnapshot(structured.diagnostics);
    recordProductionModelDiagnostics({
      taskId: task.taskId,
      relatedObjects: {
        contentId: script.id,
        rule: splitSkill.name,
        manuals: toProductionManualSnapshots(manuals),
      },
      modelDiagnostics,
    });

    const output = structured.output;
    if (!output) {
      throw createError(VT_STATUS.MODEL_ERROR, '模型没有返回可用的结构化分镜，已尝试工具结果和 JSON 兜底。');
    }

    const now = Date.now();
    const generationMetadata = serializeJson(createGenerationSnapshot({
      source: 'production.smartSplitStoryboards',
      model: 'productionAgent:storyboardTableAgent',
      taskId: task.taskId,
      requestId,
      userPrompt,
      finalPrompt: JSON.stringify(output),
      manuals,
      references: { assetIds: [...validAssetIds] },
      extra: { rule: splitSkill.name, contentId: script.id, modelDiagnostics },
    }), '{}');

    withTransaction((database) => {
      if (existingStoryboards.length > 0 || existingTracks.length > 0) {
        clearProductionSegments(database, script.project_id, script.id);
      }
      const insert = database.prepare<[number, number, number, string, string, number, number, ProductionTaskStatus, string, number, number]>(
        `
        INSERT INTO production_storyboards (
          project_id, script_id, sort_index, prompt, video_desc, duration,
          should_generate_image, image_status, generation_metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      );
      output.storyboards.forEach((storyboard, index) => {
        const result = insert.run(
          script.project_id,
          script.id,
          index,
          storyboard.prompt,
          storyboard.videoDesc,
          storyboard.duration,
          storyboard.shouldGenerateImage ? 1 : 0,
          PRODUCTION_TASK_STATUS.IDLE,
          generationMetadata,
          now,
          now,
        );
        syncStoryboardAssetLinks(database, Number(result.lastInsertRowid), storyboard.associatedAssetIds, now);
      });
      ensureWorkspace(script.project_id, script.id);
      database
        .prepare<[string, number, number, number]>(
          'UPDATE production_workspaces SET storyboard_table = ?, updated_at = ? WHERE project_id = ? AND script_id = ?',
        )
        .run(JSON.stringify(output), now, script.project_id, script.id);
    });
    safeSucceedTask(task.taskId);
    return {
      generatedCount: output.storyboards.length,
      storyboards: listStoryboards(script.project_id, script.id),
    };
  } catch (error) {
    safeFailTask(task.taskId, error);
    throw error;
  }
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
    contentId: script.id,
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
    contentId: resolveScopedContentId(payload),
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
    const referenceList = buildStoryboardImageReferences(script.project_id, storyboard.id);
    const imageOptions = resolveImageGenerationRequestOptions({
      model,
      referenceImageCount: referenceList.length,
      size: project.image_quality,
      aspectRatio: project.video_ratio,
    });
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
        imageQuality: imageOptions.size ?? null,
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
      size: imageOptions.size,
      aspectRatio: imageOptions.aspectRatio,
      referenceList,
      task: {
        taskId,
        projectId: script.project_id,
        category: STORYBOARD_IMAGE_CATEGORY,
        description: `Generate storyboard image ${storyboard.id}`,
        relatedObjects: { contentId: script.id, storyboardId: storyboard.id, manuals: toProductionManualSnapshots(manuals) },
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
  const task = createProductionTask({
    projectId: script.project_id,
    category: STORYBOARD_IMAGE_CATEGORY,
    relatedObjects: { contentId: script.id, storyboardIds: idsToGenerate, manuals },
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
    contentId: script.id,
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
    const parentReference = getSucceededAssetMedia(script.project_id, asset.parent_id, 'image')?.relative_path ?? null;
    const referenceList = parentReference ? [imageReferenceItemFromRelativePath(parentReference)] : [];
    const imageOptions = resolveImageGenerationRequestOptions({
      model,
      referenceImageCount: referenceList.length,
      size: project.image_quality,
      aspectRatio: project.video_ratio,
    });
    mediaId = withTransaction((database) => {
      const resolution = imageOptions.size ?? null;
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

    const result = await generateImageByModel(model, {
      requestId,
      prompt,
      size: imageOptions.size,
      aspectRatio: imageOptions.aspectRatio,
      referenceList,
      task: {
        taskId,
        projectId: script.project_id,
        category: DERIVED_ASSET_IMAGE_CATEGORY,
        description: `Generate derived asset image ${asset.id}`,
        relatedObjects: { contentId: script.id, assetId: asset.id, mediaId },
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
  const task = createProductionTask({
    projectId: script.project_id,
    category: DERIVED_ASSET_IMAGE_CATEGORY,
    relatedObjects: { contentId: script.id, assetIds, manuals },
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
  if (storyboardIds.length === 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '视频片段必须关联至少一个分镜；不拆分时请先把整篇内容创建为一个分镜');
  }
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

async function generateVideoPromptForTrack(
  project: ProjectRow,
  script: ScriptRow,
  trackId: number,
  taskId: number,
  targetModel: string,
  requestedMode: ProductionVideoModeValue | null,
): Promise<boolean> {
  try {
    const track = getTrackRow(script.project_id, script.id, trackId);
    const capability = getProductionVideoOperation(targetModel, requestedMode);
    const modeKey = capability.modeKey;
    const { system, promptTemplate } = resolveVideoPromptSystem(project, modeKey, targetModel);
    const manuals = readProductionVideoManuals(project);
    const manualPrompt = formatProductionManuals('视频提示词生成手册规范', manuals);
    const modelName = getModelNameFromModelId(targetModel);
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

async function runProductionVideoPromptGeneration(
  project: ProjectRow,
  script: ScriptRow,
  trackIds: number[],
  taskId: number,
  targetModel: string,
  requestedMode: ProductionVideoModeValue | null,
): Promise<void> {
  try {
    const results = await runWithConcurrency(trackIds, normalizeGenerationConcurrency(), (trackId) => (
      generateVideoPromptForTrack(project, script, trackId, taskId, targetModel, requestedMode)
    ));
    const failedCount = results.filter((result) => !result).length;
    if (failedCount > 0) {
      const placeholders = trackIds.map(() => '?').join(', ');
      const failureReasons = getDatabase()
        .prepare<Array<number | string>, Pick<VideoTrackRow, 'error_reason'>>(
          `SELECT error_reason FROM production_video_tracks WHERE project_id = ? AND id IN (${placeholders}) AND status = ?`,
        )
        .all(script.project_id, ...trackIds, PRODUCTION_TASK_STATUS.FAILED)
        .map((row) => normalizeOptionalText(row.error_reason))
        .filter(Boolean);
      const uniqueReasons = Array.from(new Set(failureReasons));
      const detail = uniqueReasons.length > 0 ? uniqueReasons.join('；') : '未记录具体失败原因，请查看应用日志';
      safeFailTask(taskId, new Error(`${failedCount} 条视频提示词生成失败：${detail}`));
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
  const targetModel = normalizeRequiredText(normalizeOptionalText(payload.model) || project.video_model_id, '视频模型');
  const requestedMode = normalizeMode(payload.mode);
  getProductionVideoOperation(targetModel, requestedMode);
  const manuals = toProductionManualSnapshots(readProductionVideoManuals(project));
  const task = createProductionTask({
    projectId: script.project_id,
    category: VIDEO_PROMPT_CATEGORY,
    relatedObjects: { contentId: script.id, trackIds, targetModel, requestedMode, manuals },
    modelName: 'universalAi',
    description: `生成 ${trackIds.length} 条视频提示词`,
  });
  const placeholders = trackIds.map(() => '?').join(', ');
  getDatabase()
    .prepare<Array<number | string | null>, { changes: number }>(
      `UPDATE production_video_tracks SET status = ?, error_reason = ?, task_id = ?, updated_at = ? WHERE project_id = ? AND id IN (${placeholders})`,
    )
    .run(PRODUCTION_TASK_STATUS.RUNNING, null, task.taskId, Date.now(), script.project_id, ...trackIds);
  void runProductionVideoPromptGeneration(project, script, trackIds, task.taskId, targetModel, requestedMode);

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
    const duration = normalizeDuration(video.duration);
    const resolution = normalizeRequiredText(video.resolution, 'Video resolution');
    const references = normalizeReferences(parseJson<ProductionReferenceInput[]>(video.reference_json, []));
    const modelReferences = buildModelReferences(script.project_id, script.id, references, references.length > 0);
    const mode = modelModeFromValue(parseJson<ProductionVideoModeValue | null>(video.mode_json, null));
    const capability = getProductionVideoOperation(model, mode as ProductionVideoModeValue);
    const audioEnabled = video.audio_enabled === 1;
    assertProductionVideoOperation({
      capability,
      duration,
      resolution,
      projectRatio: project.video_ratio,
      audioEnabled,
      references,
    });
    const aspectRatio = getVideoOperationAspectRatio(capability, project.video_ratio);
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
        duration,
        resolution,
        aspectRatio,
        audioEnabled,
        capability: {
          operationId: capability.operationId,
          modeKey: capability.modeKey,
          source: capability.source,
        },
      },
    });
    getDatabase()
      .prepare<[string, number, number, number]>(
        'UPDATE production_videos SET generation_metadata = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      )
      .run(serializeJson(generationMetadata, '{}'), Date.now(), script.project_id, video.id);
    const result = await generateVideoByModel(model, {
      requestId,
      duration,
      resolution,
      aspectRatio,
      prompt,
      referenceList: modelReferences,
      audio: audioEnabled,
      mode,
      task: {
        taskId,
        projectId: script.project_id,
        category: VIDEO_CATEGORY,
        description: `Generate video candidate ${video.id}`,
        relatedObjects: { contentId: script.id, videoId: video.id, trackId: video.track_id },
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
      const placeholders = videoIds.map(() => '?').join(', ');
      const failureReasons = getDatabase()
        .prepare<Array<number | string>, Pick<VideoRow, 'error_reason'>>(
          `SELECT error_reason FROM production_videos WHERE project_id = ? AND id IN (${placeholders}) AND status = ?`,
        )
        .all(script.project_id, ...videoIds, PRODUCTION_TASK_STATUS.FAILED)
        .map((row) => normalizeOptionalText(row.error_reason))
        .filter(Boolean);
      const uniqueReasons = Array.from(new Set(failureReasons));
      const detail = uniqueReasons.length > 0 ? uniqueReasons.join('；') : '未记录具体失败原因，请查看应用日志';
      safeFailTask(taskId, new Error(`${failedCount} 条视频生成失败：${detail}`));
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
  const model = normalizeRequiredText(normalizeOptionalText(payload.model) || project.video_model_id, '视频模型');
  const resolution = normalizeRequiredText(payload.resolution, '视频分辨率');
  if (payload.duration === undefined || payload.duration === null) {
    throw createError(VT_STATUS.INVALID_PARAMS, '请选择视频时长');
  }
  const duration = normalizeDuration(payload.duration);
  const requestedMode = normalizeMode(payload.mode);
  const capability = getProductionVideoOperation(model, requestedMode);
  const mode = parseVideoModeKey(capability.modeKey) as ProductionVideoModeValue;
  const audioEnabled = resolveVideoOperationAudio(capability, Boolean(payload.audioEnabled));
  const videoIds = withTransaction((database) => tracks.map((track) => {
    const explicitReferences = normalizeReferences(payload.referencesByTrackId?.[track.id]);
    const references = explicitReferences.length
      ? explicitReferences
      : operationSupportsReferenceType(capability, 'image')
        ? createAutoTrackReferences(script.project_id, script.id, track.id)
        : [];
    assertProductionVideoOperation({
      capability,
      duration,
      resolution,
      projectRatio: project.video_ratio,
      audioEnabled,
      references,
    });
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
        duration,
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

  const task = createProductionTask({
    projectId: script.project_id,
    category: VIDEO_CATEGORY,
    relatedObjects: { contentId: script.id, videoIds, trackIds },
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

export function getProductionWorkbench(payload: ProductionContentScopedPayload): ProductionWorkbenchResult {
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
