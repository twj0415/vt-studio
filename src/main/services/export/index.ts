import { createHash, randomUUID } from 'node:crypto';
import { accessSync, constants, copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { closeSync, openSync, readSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { shell } from 'electron';
import { APP_VERSION } from '@shared/constants/app';
import { DEPENDENCY_STATUSES, DEPENDENCY_STATUS_VALUES, PROJECT_VIDEO_RATIOS, type DependencyStatus } from '@shared/constants/dictionaries';
import { VT_STATUS } from '@shared/constants/status';
import { PRODUCTION_TASK_STATUS } from '@shared/types/production';
import { EXPORT_DRAFT_STATUS, EXPORT_DRAFT_STATUSES } from '@shared/types/export';
import type {
  ExportBuildTimelinePayload,
  ExportBuildTimelineResult,
  ExportCreateJianyingDraftPayload,
  ExportCreateJianyingDraftResult,
  ExportDraftStatus,
  ExportHistoryDetail,
  ExportHistoryDetailPayload,
  ExportHistoryDetailResult,
  ExportHistoryItem,
  ExportHistoryListPayload,
  ExportHistoryListResult,
  ExportHistoryType,
  ExportMediaSnapshot,
  ExportMediaSnapshotItem,
  ExportMediaType,
  ExportOpenDirectoryPayload,
  ExportOpenDirectoryResult,
  ExportContentPayload,
  ExportStaleConfirmationSnapshot,
  ExportStoryboardImagesPayload,
  ExportStoryboardImagesResult,
  ExportTimeline,
  ExportTimelineClip,
  ExportValidateAssetsPayload,
  ExportValidateAssetsResult,
  ExportValidationSnapshot,
  ExportValidationFailure,
  ExportValidationReason,
} from '@shared/types/export';
import { getDatabase } from '../database';
import { getRuntimeDirectories, safeJoin, assertInsideRoot } from '../file-system';
import { getMediaMimeInfo } from '../media/mime';
import { resolveMediaPath } from '../media/path';
import { createError } from '../result';
import { createStoredZip } from '../script/zip';
import { failTask, succeedTask } from '../task';
import { createProductionTask } from '../task/production';

const JIANYING_DRAFT_CATEGORY = '导出';
const STORYBOARD_ZIP_ROOT = 'storyboards';
const JIANYING_ROOT = 'jianying';

interface ProjectRow {
  id: number;
  name: string;
  video_ratio: string;
}

interface ScriptRow {
  id: number;
  project_id: number;
  name: string;
  episode_key: string;
}

interface VideoTrackRow {
  id: number;
  project_id: number;
  script_id: number;
  sort_index: number;
  prompt: string;
  duration: number;
  selected_video_id: number | null;
  dependency_status: string;
  dependency_reason: string | null;
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
  dependency_status: string;
  dependency_reason: string | null;
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
  dependency_status: string;
  dependency_reason: string | null;
}

interface ResolvedClip {
  clip: ExportTimelineClip;
  absolutePath: string | null;
}

interface ExportHistoryRow {
  id: number;
  project_id: number;
  project_name: string | null;
  script_id: number;
  script_name: string | null;
  task_id: number | null;
  export_type: string;
  draft_name: string;
  status: string;
  output_path: string | null;
  relative_path: string | null;
  clip_count: number;
  copied_asset_count: number;
  duration_ms: number;
  app_version: string;
  schema_version: number;
  timeline_json: string | null;
  selected_video_ids_json: string | null;
  media_snapshot_json: string | null;
  failures_json: string | null;
  validation_json: string | null;
  stale_confirmations_json: string | null;
  created_at: number;
  updated_at: number;
}

interface CreateExportHistoryInput {
  projectId: number;
  scriptId: number;
  taskId: number | null;
  exportType: ExportHistoryType;
  draftName: string;
  status: ExportDraftStatus;
  copyAssets: boolean;
}

interface UpdateExportHistoryInput {
  status?: ExportDraftStatus;
  outputPath?: string | null;
  relativePath?: string | null;
  clipCount?: number;
  copiedAssetCount?: number;
  durationMs?: number;
  timeline?: ExportTimeline | null;
  selectedVideoIds?: number[];
  mediaSnapshot?: ExportMediaSnapshot;
  failures?: ExportValidationFailure[];
  validation?: ExportValidationSnapshot | null;
  staleConfirmations?: ExportStaleConfirmationSnapshot[];
}

function normalizeProjectId(projectId: number): number {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }
  return projectId;
}

function normalizeScriptId(scriptId: number): number {
  if (!Number.isInteger(scriptId) || scriptId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '内容 ID 无效');
  }
  return scriptId;
}

function normalizeExportContentId(payload: ExportContentPayload): number {
  return normalizeScriptId(Number(payload.contentId));
}

function normalizeIds(ids: number[] | null | undefined, label: string): number[] {
  const normalized = Array.from(new Set((ids ?? []).map((id) => Number(id))));
  if (normalized.length === 0 || normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}无效`);
  }
  return normalized;
}

function normalizeDependencyStatus(value: string | null | undefined): DependencyStatus {
  if (DEPENDENCY_STATUS_VALUES.includes(value as DependencyStatus)) {
    return value as DependencyStatus;
  }

  return DEPENDENCY_STATUSES.VALID;
}

function dependencyFailureReason(status: DependencyStatus): ExportValidationReason | null {
  if (status === DEPENDENCY_STATUSES.STALE) {
    return 'dependencyStale';
  }
  if (status === DEPENDENCY_STATUSES.NEEDS_REVIEW) {
    return 'dependencyNeedsReview';
  }
  if (status === DEPENDENCY_STATUSES.MISSING_DEPENDENCY) {
    return 'dependencyMissing';
  }
  if (status === DEPENDENCY_STATUSES.BLOCKED) {
    return 'dependencyBlocked';
  }

  return null;
}

function dependencyFailureMessage(status: DependencyStatus, reason: string | null | undefined): string {
  const suffix = reason ? `：${reason}` : '';
  if (status === DEPENDENCY_STATUSES.STALE) {
    return `上游内容已变更，需要重新生成或确认${suffix}`;
  }
  if (status === DEPENDENCY_STATUSES.NEEDS_REVIEW) {
    return `当前结果需要复查后再导出${suffix}`;
  }
  if (status === DEPENDENCY_STATUSES.MISSING_DEPENDENCY) {
    return `当前结果缺少依赖，不能导出${suffix}`;
  }
  if (status === DEPENDENCY_STATUSES.BLOCKED) {
    return `当前结果被阻断，不能导出${suffix}`;
  }

  return '';
}

function assertProject(projectId: number): ProjectRow {
  const id = normalizeProjectId(projectId);
  const row = getDatabase()
    .prepare<[number], ProjectRow>('SELECT id, name, video_ratio FROM projects WHERE id = ? LIMIT 1')
    .get(id);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '项目不存在');
  }
  return row;
}

function assertScript(projectId: number, scriptId: number): ScriptRow {
  const row = getDatabase()
    .prepare<[number, number], ScriptRow>('SELECT id, project_id, name, episode_key FROM scripts WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, scriptId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '剧本不存在');
  }
  return row;
}

function assertExportContext(payload: ExportContentPayload): { project: ProjectRow; script: ScriptRow } {
  const project = assertProject(payload.projectId);
  const script = assertScript(project.id, normalizeExportContentId(payload));
  return { project, script };
}

function readVideoTracks(projectId: number, scriptId: number): VideoTrackRow[] {
  return getDatabase()
    .prepare<[number, number], VideoTrackRow>(
      `
      SELECT id, project_id, script_id, COALESCE(sort_index, 0) AS sort_index, prompt, duration, selected_video_id
           , dependency_status, dependency_reason
      FROM production_video_tracks
      WHERE project_id = ? AND script_id = ?
      ORDER BY sort_index ASC, id ASC
      `,
    )
    .all(projectId, scriptId);
}

function readSelectedVideo(projectId: number, scriptId: number, trackId: number, videoId: number): VideoRow {
  const row = getDatabase()
    .prepare<[number, number, number, number], VideoRow>(
      `
      SELECT id, project_id, script_id, track_id, relative_path, prompt, duration, status, dependency_status, dependency_reason
      FROM production_videos
      WHERE project_id = ? AND script_id = ? AND track_id = ? AND id = ?
      LIMIT 1
      `,
    )
    .get(projectId, scriptId, trackId, videoId);
  if (!row) {
    throw createError(VT_STATUS.EXPORT_MATERIAL_MISSING, `视频片段 ${trackId} 选择的候选不存在`);
  }
  return row;
}

function readStoryboardIdsByTrack(trackId: number): number[] {
  return getDatabase()
    .prepare<[number], { id: number }>('SELECT id FROM production_storyboards WHERE track_id = ? ORDER BY sort_index ASC, id ASC')
    .all(trackId)
    .map((row) => row.id);
}

function normalizeDurationMs(videoDuration: number, trackDuration: number): number {
  const seconds = Number.isFinite(videoDuration) && videoDuration > 0 ? videoDuration : trackDuration;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '导出片段时长无效');
  }
  return Math.round(seconds * 1000);
}

function safeFileStem(value: string, fallback: string): string {
  const normalized = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  const safe = basename(normalized).replace(/^\.+$/, '').slice(0, 80).trim();
  return safe || fallback;
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizeHistoryId(id: number): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '导出历史 ID 无效');
  }
  return id;
}

function normalizeHistoryLimit(limit: number | null | undefined): number {
  if (limit == null) {
    return 20;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '导出历史数量无效');
  }
  return Math.min(limit, 100);
}

function normalizeHistoryStatus(status: ExportDraftStatus | null | undefined): ExportDraftStatus | null {
  if (status == null) {
    return null;
  }
  if (!EXPORT_DRAFT_STATUSES.includes(status)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '导出历史状态无效');
  }
  return status;
}

function normalizeStoredExportStatus(status: string): ExportDraftStatus {
  if (EXPORT_DRAFT_STATUSES.includes(status as ExportDraftStatus)) {
    return status as ExportDraftStatus;
  }
  return EXPORT_DRAFT_STATUS.FAILED;
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<TValue>(value: string | null, fallback: TValue): TValue {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as TValue;
  } catch {
    return fallback;
  }
}

function buildClipId(trackId: number, videoId: number): string {
  return `track-${trackId}-video-${videoId}`;
}

function assertTimelineHasContent(timeline: ExportTimeline): void {
  if (timeline.clips.length === 0) {
    throw createError(VT_STATUS.EXPORT_MATERIAL_MISSING, '没有可导出的已选视频');
  }
}

function buildTimelineFromDatabase(payload: ExportBuildTimelinePayload): ExportTimeline {
  const { project, script } = assertExportContext(payload);
  const tracks = readVideoTracks(project.id, script.id);
  if (tracks.length === 0) {
    throw createError(VT_STATUS.EXPORT_MATERIAL_MISSING, '当前作品没有视频片段');
  }

  let cursorMs = 0;
  const clips: ExportTimelineClip[] = tracks.map((track) => {
    if (!track.selected_video_id) {
      throw createError(VT_STATUS.EXPORT_MATERIAL_MISSING, `视频片段 ${track.sort_index + 1} 没有已选择的候选`);
    }
    const video = readSelectedVideo(project.id, script.id, track.id, track.selected_video_id);
    if (video.status !== PRODUCTION_TASK_STATUS.SUCCEEDED) {
      throw createError(VT_STATUS.CONFLICT, `轨道 ${track.sort_index + 1} 选择的视频还未生成成功`);
    }
    const durationMs = normalizeDurationMs(Number(video.duration), Number(track.duration));
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs;

    return {
      id: buildClipId(track.id, video.id),
      trackId: track.id,
      trackSortIndex: track.sort_index,
      selectedVideoId: video.id,
      storyboardIds: readStoryboardIdsByTrack(track.id),
      mediaType: 'video',
      sourceKind: 'production_video',
      sourceId: video.id,
      relativePath: video.relative_path,
      filePath: video.relative_path,
      prompt: video.prompt || track.prompt,
      trackDependencyStatus: normalizeDependencyStatus(track.dependency_status),
      trackDependencyReason: track.dependency_reason,
      videoDependencyStatus: normalizeDependencyStatus(video.dependency_status),
      videoDependencyReason: video.dependency_reason,
      startMs,
      durationMs,
      endMs,
    };
  });

  return {
    projectId: project.id,
    projectName: project.name,
    contentId: script.id,
    contentName: script.name,
    source: 'productionVideoTracks',
    timebase: 'ms',
    durationMs: cursorMs,
    clips,
  };
}

function failure(input: {
  clip?: ExportTimelineClip;
  trackId?: number | null;
  mediaType?: ExportMediaType;
  sourceKind?: ExportValidationFailure['sourceKind'];
  sourceId?: number | null;
  path?: string | null;
  reason: ExportValidationReason;
  message: string;
  dependencyStatus?: DependencyStatus | null;
}): ExportValidationFailure {
  return {
    trackId: input.clip?.trackId ?? input.trackId ?? null,
    clipId: input.clip?.id ?? null,
    mediaType: input.clip?.mediaType ?? input.mediaType ?? 'video',
    sourceKind: input.clip?.sourceKind ?? input.sourceKind ?? 'production_video',
    sourceId: input.clip?.sourceId ?? input.sourceId ?? null,
    path: input.clip?.relativePath ?? input.path ?? null,
    reason: input.reason,
    message: input.message,
    dependencyStatus: input.dependencyStatus ?? null,
  };
}

function validateClipDependencies(clip: ExportTimelineClip): ExportValidationFailure[] {
  const failures: ExportValidationFailure[] = [];
  const trackStatus = normalizeDependencyStatus(clip.trackDependencyStatus);
  const trackReason = dependencyFailureReason(trackStatus);
  if (trackReason) {
    failures.push(failure({
      clip,
      reason: trackReason,
      message: dependencyFailureMessage(trackStatus, clip.trackDependencyReason),
      dependencyStatus: trackStatus,
    }));
  }

  const videoStatus = normalizeDependencyStatus(clip.videoDependencyStatus);
  const videoReason = dependencyFailureReason(videoStatus);
  if (videoReason) {
    failures.push(failure({
      clip,
      reason: videoReason,
      message: dependencyFailureMessage(videoStatus, clip.videoDependencyReason),
      dependencyStatus: videoStatus,
    }));
  }

  return failures;
}

function resolveClipFile(clip: ExportTimelineClip): ResolvedClip {
  if (!clip.relativePath?.trim()) {
    return { clip, absolutePath: null };
  }

  try {
    return {
      clip,
      absolutePath: resolveMediaPath('project', clip.relativePath),
    };
  } catch {
    return { clip, absolutePath: null };
  }
}

function validateResolvedClip(resolved: ResolvedClip): ExportValidationFailure | null {
  const { clip, absolutePath } = resolved;
  if (!clip.relativePath?.trim()) {
    return failure({ clip, reason: 'emptyPath', message: '素材路径为空' });
  }
  if (!absolutePath) {
    return failure({ clip, reason: 'fileMissing', message: '素材路径无法解析' });
  }

  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile()) {
      return failure({ clip, reason: 'notFile', message: '素材路径不是文件' });
    }
  } catch {
    return failure({ clip, reason: 'fileMissing', message: '素材文件不存在' });
  }

  try {
    accessSync(absolutePath, constants.R_OK);
  } catch {
    return failure({ clip, reason: 'permissionDenied', message: '素材文件不可读取' });
  }

  const mime = getMediaMimeInfo(absolutePath);
  if (!mime || mime.kind !== clip.mediaType) {
    return failure({ clip, reason: 'unsupportedType', message: '素材格式不支持' });
  }

  return null;
}

function validateTimeline(timeline: ExportTimeline): { failures: ExportValidationFailure[]; resolvedClips: ResolvedClip[] } {
  assertTimelineHasContent(timeline);
  const resolvedClips = timeline.clips.map(resolveClipFile);
  const mediaFailures = resolvedClips.map(validateResolvedClip).filter((item): item is ExportValidationFailure => Boolean(item));
  const dependencyFailures = timeline.clips.flatMap(validateClipDependencies);
  const storyboardFailures = validateStoryboardDependencies(timeline);
  const failures = [...dependencyFailures, ...storyboardFailures, ...mediaFailures];
  return { failures, resolvedClips };
}

function readStoryboards(projectId: number, scriptId: number, storyboardIds: number[]): StoryboardRow[] {
  const placeholders = storyboardIds.map(() => '?').join(', ');
  return getDatabase()
    .prepare<Array<number>, StoryboardRow>(
      `
      SELECT id, project_id, script_id, sort_index, prompt, video_desc, duration, relative_path, dependency_status, dependency_reason
      FROM production_storyboards
      WHERE project_id = ? AND script_id = ? AND id IN (${placeholders})
      `,
    )
    .all(projectId, scriptId, ...storyboardIds);
}

function validateStoryboardDependencies(timeline: ExportTimeline): ExportValidationFailure[] {
  const storyboardIds = Array.from(new Set(timeline.clips.flatMap((clip) => clip.storyboardIds)));
  if (storyboardIds.length === 0) {
    return [];
  }

  const rows = readStoryboards(timeline.projectId, timeline.contentId, storyboardIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const trackIdByStoryboardId = new Map<number, number>();
  for (const clip of timeline.clips) {
    clip.storyboardIds.forEach((storyboardId) => trackIdByStoryboardId.set(storyboardId, clip.trackId));
  }

  const failures: ExportValidationFailure[] = [];
  for (const storyboardId of storyboardIds) {
    const row = rowById.get(storyboardId);
    if (!row) {
      failures.push(failure({
        trackId: trackIdByStoryboardId.get(storyboardId) ?? null,
        mediaType: 'image',
        sourceKind: 'storyboard',
        sourceId: storyboardId,
        path: null,
        reason: 'dependencyMissing',
        message: '分镜不存在，不能导出',
        dependencyStatus: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
      }));
      continue;
    }

    const status = normalizeDependencyStatus(row.dependency_status);
    const reason = dependencyFailureReason(status);
    if (reason) {
      failures.push(failure({
        trackId: trackIdByStoryboardId.get(row.id) ?? null,
        mediaType: 'image',
        sourceKind: 'storyboard',
        sourceId: row.id,
        path: row.relative_path,
        reason,
        message: dependencyFailureMessage(status, row.dependency_reason),
        dependencyStatus: status,
      }));
    }
  }

  return failures;
}

function extensionForPath(filePath: string, fallback: string): string {
  const ext = extname(filePath).replace(/^\./, '').toLowerCase();
  return ext || fallback;
}

function writeJsonFile(targetPath: string, value: unknown): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function writeExportJson(relativePath: string, value: unknown): string {
  const root = getRuntimeDirectories().exports;
  const targetPath = safeJoin(root, relativePath);
  writeJsonFile(targetPath, value);
  return targetPath;
}

function writeExportBuffer(relativePath: string, value: Buffer): string {
  const root = getRuntimeDirectories().exports;
  const targetPath = safeJoin(root, relativePath);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, value);
  return targetPath;
}

function ensureExportDirectory(relativePath: string): string {
  const targetPath = safeJoin(getRuntimeDirectories().exports, relativePath);
  mkdirSync(targetPath, { recursive: true });
  return targetPath;
}

function assertPathInsideExports(targetPath: string): string {
  return assertInsideRoot(resolve(targetPath), getRuntimeDirectories().exports);
}

interface JianyingCanvasConfig {
  width: number;
  height: number;
  ratio: string;
}

interface JianyingClipBundle {
  clip: ExportTimelineClip;
  sourcePath: string;
  materialId: string;
  speedId: string;
  canvasId: string;
  soundChannelMappingId: string;
  vocalSeparationId: string;
  startUs: number;
  durationUs: number;
}

function createJianyingId(): string {
  return randomUUID().toUpperCase();
}

function msToUs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '剪映草稿时间无效');
  }
  return Math.round(value * 1000);
}

function nowUs(): number {
  return Date.now() * 1000;
}

function normalizeJianyingPath(value: string): string {
  return toPosixPath(resolve(value));
}

function resolveJianyingCanvasConfig(ratio: string): JianyingCanvasConfig {
  if (ratio === PROJECT_VIDEO_RATIOS.LANDSCAPE) {
    return { width: 1920, height: 1080, ratio: PROJECT_VIDEO_RATIOS.LANDSCAPE };
  }
  if (ratio === PROJECT_VIDEO_RATIOS.PORTRAIT) {
    return { width: 1080, height: 1920, ratio: PROJECT_VIDEO_RATIOS.PORTRAIT };
  }
  throw createError(VT_STATUS.INVALID_PARAMS, `项目视频比例 ${ratio || '空'} 不能导出剪映草稿`);
}

function createJianyingPlatform(): Record<string, unknown> {
  return {
    app_id: 3704,
    app_source: 'lv',
    app_version: '5.5.0',
    device_id: '',
    hard_disk_id: '',
    mac_address: '',
    os: 'windows',
    os_version: '',
  };
}

function createEmptyJianyingMaterials(): Record<string, unknown> {
  return {
    ai_translates: [] as unknown[],
    audio_balances: [] as unknown[],
    audio_effects: [] as unknown[],
    audio_fades: [] as unknown[],
    audio_track_indexes: [] as unknown[],
    audios: [] as unknown[],
    beats: [] as unknown[],
    canvases: [] as Record<string, unknown>[],
    chromas: [] as unknown[],
    color_curves: [] as unknown[],
    digital_humans: [] as unknown[],
    drafts: [] as unknown[],
    effects: [] as unknown[],
    flowers: [] as unknown[],
    green_screens: [] as unknown[],
    handwrites: [] as unknown[],
    hsl: [] as unknown[],
    images: [] as unknown[],
    log_color_wheels: [] as unknown[],
    loudnesses: [] as unknown[],
    manual_deformations: [] as unknown[],
    masks: [] as unknown[],
    material_animations: [] as unknown[],
    material_colors: [] as unknown[],
    placeholders: [] as unknown[],
    plugin_effects: [] as unknown[],
    primary_color_wheels: [] as unknown[],
    realtime_denoises: [] as unknown[],
    shapes: [] as unknown[],
    smart_crops: [] as unknown[],
    smart_relights: [] as unknown[],
    sound_channel_mappings: [] as Record<string, unknown>[],
    speeds: [] as Record<string, unknown>[],
    stickers: [] as unknown[],
    tail_leaders: [] as unknown[],
    text_templates: [] as unknown[],
    texts: [] as unknown[],
    time_marks: [] as unknown[],
    transitions: [] as unknown[],
    video_effects: [] as unknown[],
    video_trackings: [] as unknown[],
    videos: [] as Record<string, unknown>[],
    vocal_beautifys: [] as unknown[],
    vocal_separations: [] as Record<string, unknown>[],
  };
}

function resolveClipDraftSourcePath(input: {
  clip: ExportTimelineClip;
  absolutePath: string | null;
  assetPaths: Map<string, string>;
  draftPath: string;
}): string {
  const copiedPath = input.assetPaths.get(input.clip.id);
  if (copiedPath) {
    return normalizeJianyingPath(join(input.draftPath, copiedPath));
  }
  if (input.absolutePath) {
    return normalizeJianyingPath(input.absolutePath);
  }
  throw createError(VT_STATUS.EXPORT_MATERIAL_MISSING, `视频片段 ${input.clip.trackSortIndex + 1} 素材路径为空`);
}

function buildJianyingClipBundles(input: {
  timeline: ExportTimeline;
  resolvedClips: ResolvedClip[];
  assetPaths: Map<string, string>;
  draftPath: string;
}): JianyingClipBundle[] {
  const absolutePathByClipId = new Map(input.resolvedClips.map((item) => [item.clip.id, item.absolutePath]));
  return input.timeline.clips.map((clip) => ({
    clip,
    sourcePath: resolveClipDraftSourcePath({
      clip,
      absolutePath: absolutePathByClipId.get(clip.id) ?? null,
      assetPaths: input.assetPaths,
      draftPath: input.draftPath,
    }),
    materialId: createJianyingId(),
    speedId: createJianyingId(),
    canvasId: createJianyingId(),
    soundChannelMappingId: createJianyingId(),
    vocalSeparationId: createJianyingId(),
    startUs: msToUs(clip.startMs),
    durationUs: msToUs(clip.durationMs),
  }));
}

function buildJianyingVideoMaterial(bundle: JianyingClipBundle, canvas: JianyingCanvasConfig): Record<string, unknown> {
  return {
    aigc_type: 'none',
    audio_fade: null,
    cartoon_path: '',
    category_id: '',
    category_name: 'local',
    check_flag: 63487,
    crop: {
      lower_left_x: 0.0,
      lower_left_y: 1.0,
      lower_right_x: 1.0,
      lower_right_y: 1.0,
      upper_left_x: 0.0,
      upper_left_y: 0.0,
      upper_right_x: 1.0,
      upper_right_y: 0.0,
    },
    crop_ratio: 'free',
    crop_scale: 1.0,
    duration: bundle.durationUs,
    extra_type_option: 0,
    formula_id: '',
    freeze: null,
    gameplay: null,
    has_audio: false,
    height: canvas.height,
    id: bundle.materialId,
    intensifies_audio_path: '',
    intensifies_path: '',
    is_ai_generate_content: false,
    is_copyright: false,
    is_unified_beauty_mode: false,
    local_id: '',
    local_material_id: '',
    material_id: '',
    material_name: basename(bundle.sourcePath),
    material_url: '',
    matting: {
      flag: 0,
      has_use_quick_brush: false,
      has_use_quick_eraser: false,
      interactiveTime: [],
      path: '',
      strokes: [],
    },
    media_path: '',
    object_locked: null,
    origin_material_id: '',
    path: bundle.sourcePath,
    picture_from: 'none',
    picture_set_category_id: '',
    picture_set_category_name: '',
    request_id: '',
    reverse_intensifies_path: '',
    reverse_path: '',
    smart_motion: null,
    source: 0,
    source_platform: 0,
    stable: {
      matrix_path: '',
      stable_level: 0,
      time_range: {
        duration: 0,
        start: 0,
      },
    },
    team_id: '',
    type: 'video',
    video_algorithm: {
      algorithms: [],
      deflicker: null,
      motion_blur_config: null,
      noise_reduction: null,
      path: '',
      quality_enhance: null,
      time_range: null,
    },
    width: canvas.width,
  };
}

function buildJianyingVideoSegment(bundle: JianyingClipBundle, index: number): Record<string, unknown> {
  return {
    cartoon: false,
    clip: {
      alpha: 1.0,
      flip: {
        horizontal: false,
        vertical: false,
      },
      rotation: 0.0,
      scale: {
        x: 1.0,
        y: 1.0,
      },
      transform: {
        x: 0.0,
        y: 0.0,
      },
    },
    common_keyframes: [],
    enable_adjust: true,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    extra_material_refs: [
      bundle.speedId,
      bundle.canvasId,
      bundle.soundChannelMappingId,
      bundle.vocalSeparationId,
    ],
    group_id: '',
    hdr_settings: {
      intensity: 1.0,
      mode: 1,
      nits: 1000,
    },
    id: createJianyingId(),
    intensifies_audio: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    material_id: bundle.materialId,
    render_index: index,
    responsive_layout: {
      enable: false,
      horizontal_pos_layout: 0,
      size_layout: 0,
      target_follow: '',
      vertical_pos_layout: 0,
    },
    reverse: false,
    source_timerange: {
      duration: bundle.durationUs,
      start: 0,
    },
    speed: 1.0,
    target_timerange: {
      duration: bundle.durationUs,
      start: bundle.startUs,
    },
    template_id: '',
    template_scene: 'default',
    track_attribute: 0,
    track_render_index: 0,
    uniform_scale: {
      on: true,
      value: 1.0,
    },
    visible: true,
    volume: 1.0,
  };
}

function addJianyingMaterialRefs(materials: Record<string, unknown>, bundles: JianyingClipBundle[]): void {
  const speeds = materials.speeds as Record<string, unknown>[];
  const canvases = materials.canvases as Record<string, unknown>[];
  const soundChannelMappings = materials.sound_channel_mappings as Record<string, unknown>[];
  const vocalSeparations = materials.vocal_separations as Record<string, unknown>[];

  for (const bundle of bundles) {
    speeds.push({
      curve_speed: null,
      id: bundle.speedId,
      mode: 0,
      speed: 1.0,
      type: 'speed',
    });
    canvases.push({
      album_image: '',
      blur: 0.0,
      color: '',
      id: bundle.canvasId,
      image: '',
      image_id: '',
      image_name: '',
      source_platform: 0,
      team_id: '',
      type: 'canvas_color',
    });
    soundChannelMappings.push({
      audio_channel_mapping: 0,
      id: bundle.soundChannelMappingId,
      is_config_open: false,
      type: 'none',
    });
    vocalSeparations.push({
      choice: 0,
      id: bundle.vocalSeparationId,
      production_path: '',
      time_range: null,
      type: 'vocal_separation',
    });
  }
}

function buildDraftContent(input: {
  timeline: ExportTimeline;
  assetPaths: Map<string, string>;
  draftName: string;
  project: ProjectRow;
  draftPath: string;
  resolvedClips: ResolvedClip[];
}): Record<string, unknown> {
  const canvas = resolveJianyingCanvasConfig(input.project.video_ratio);
  const bundles = buildJianyingClipBundles({
    timeline: input.timeline,
    resolvedClips: input.resolvedClips,
    assetPaths: input.assetPaths,
    draftPath: input.draftPath,
  });
  const materials = createEmptyJianyingMaterials();
  const videos = materials.videos as Record<string, unknown>[];
  const segments = bundles.map(buildJianyingVideoSegment);
  for (const bundle of bundles) {
    videos.push(buildJianyingVideoMaterial(bundle, canvas));
  }
  addJianyingMaterialRefs(materials, bundles);

  const platform = createJianyingPlatform();
  return {
    canvas_config: canvas,
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    duration: msToUs(input.timeline.durationMs),
    extra_info: null,
    fps: 30.0,
    free_render_index_mode_on: false,
    group_container: null,
    id: createJianyingId(),
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [],
      audios: [],
      effects: [],
      filters: [],
      handwrites: [],
      stickers: [],
      texts: [],
      videos: [],
    },
    last_modified_platform: platform,
    materials,
    mutable_config: null,
    name: input.draftName,
    new_version: '103.0.0',
    platform,
    relationships: [],
    render_index_track_mode_on: true,
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    time_marks: null,
    tracks: [
      {
        attribute: 0,
        flag: 0,
        id: createJianyingId(),
        is_default_name: true,
        name: '',
        segments,
        type: 'video',
      },
    ],
    update_time: 0,
    version: 360000,
  };
}

function listDraftMaterialPaths(input: {
  timeline: ExportTimeline;
  resolvedClips: ResolvedClip[];
  assetPaths: Map<string, string>;
  draftPath: string;
}): string[] {
  const absolutePathByClipId = new Map(input.resolvedClips.map((item) => [item.clip.id, item.absolutePath]));
  return input.timeline.clips.map((clip) => resolveClipDraftSourcePath({
    clip,
    absolutePath: absolutePathByClipId.get(clip.id) ?? null,
    assetPaths: input.assetPaths,
    draftPath: input.draftPath,
  }));
}

function sumFileSizes(filePaths: string[]): number {
  let total = 0;
  for (const filePath of filePaths) {
    try {
      total += statSync(filePath).size;
    } catch {
      // validation already checked the files; size is only draft metadata.
    }
  }
  return total;
}

function buildJianyingDraftMetaInfo(input: {
  draftName: string;
  draftPath: string;
  timeline: ExportTimeline;
  assetPaths: Map<string, string>;
  resolvedClips: ResolvedClip[];
}): Record<string, unknown> {
  const timestamp = nowUs();
  const materialPaths = listDraftMaterialPaths({
    timeline: input.timeline,
    resolvedClips: input.resolvedClips,
    assetPaths: input.assetPaths,
    draftPath: input.draftPath,
  });

  return {
    cloud_package_completed_time: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: '',
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: [],
    },
    draft_fold_path: normalizeJianyingPath(input.draftPath),
    draft_id: createJianyingId(),
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_from_deeplink: 'false',
    draft_is_invisible: false,
    draft_materials: [
      { type: 0, value: [] },
      { type: 1, value: [] },
      { type: 2, value: [] },
      { type: 3, value: [] },
      { type: 6, value: [] },
      { type: 7, value: [] },
      { type: 8, value: [] },
    ],
    draft_materials_copied_info: [],
    draft_name: input.draftName,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: normalizeJianyingPath(dirname(input.draftPath)),
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: sumFileSizes(materialPaths),
    draft_type: '',
    tm_draft_cloud_completed: '',
    tm_draft_cloud_modified: 0,
    tm_draft_create: timestamp,
    tm_draft_modified: timestamp,
    tm_draft_removed: 0,
    tm_duration: msToUs(input.timeline.durationMs),
  };
}

function copyDraftAssets(draftRelativePath: string, resolvedClips: ResolvedClip[]): Map<string, string> {
  const assetPaths = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const { clip, absolutePath } of resolvedClips) {
    if (!absolutePath) {
      continue;
    }
    const ext = extname(absolutePath) || '.mp4';
    const baseName = safeFileStem(basename(absolutePath, ext), `clip-${clip.trackSortIndex + 1}`);
    let fileName = `${clip.id}-${baseName}${ext}`;
    let count = 1;
    while (usedNames.has(fileName)) {
      count += 1;
      fileName = `${clip.id}-${baseName}-${count}${ext}`;
    }
    usedNames.add(fileName);
    const assetRelativePath = toPosixPath(join(draftRelativePath, 'assets', fileName));
    const targetPath = safeJoin(getRuntimeDirectories().exports, assetRelativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(absolutePath, targetPath);
    assetPaths.set(clip.id, toPosixPath(join('assets', fileName)));
  }

  return assetPaths;
}

function buildSummary(input: { status: ExportDraftStatus; timeline: ExportTimeline | null; failures: ExportValidationFailure[]; copiedAssetCount: number; draftName: string; taskId: number }): Record<string, unknown> {
  return {
    status: input.status,
    draftName: input.draftName,
    taskId: input.taskId,
    exportedAt: Date.now(),
    summary: {
      clipCount: input.timeline?.clips.length ?? 0,
      copiedAssetCount: input.copiedAssetCount,
      durationMs: input.timeline?.durationMs ?? 0,
    },
    failures: input.failures,
  };
}

function createValidationSnapshot(input: { valid: boolean; stage: ExportValidationSnapshot['stage']; failureCount: number }): ExportValidationSnapshot {
  return {
    valid: input.valid,
    stage: input.stage,
    failureCount: input.failureCount,
    checkedAt: Date.now(),
  };
}

function selectedVideoIdsFromTimeline(timeline: ExportTimeline | null): number[] {
  if (!timeline) {
    return [];
  }
  return Array.from(new Set(timeline.clips.map((clip) => clip.selectedVideoId)));
}

function hashFileMd5(filePath: string): string | null {
  const hash = createHash('md5');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let descriptor: number | null = null;

  try {
    descriptor = openSync(filePath, 'r');
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);

    return hash.digest('hex');
  } catch {
    return null;
  } finally {
    if (descriptor != null) {
      closeSync(descriptor);
    }
  }
}

function createMediaSnapshotItem(input: { clip: ExportTimelineClip; absolutePath: string | null; copiedPath: string | null }): ExportMediaSnapshotItem {
  const mime = input.absolutePath ? getMediaMimeInfo(input.absolutePath) : null;

  try {
    if (!input.absolutePath) {
      throw new Error('missing path');
    }
    const stat = statSync(input.absolutePath);
    if (!stat.isFile()) {
      throw new Error('not file');
    }

    return {
      clipId: input.clip.id,
      trackId: input.clip.trackId,
      selectedVideoId: input.clip.selectedVideoId,
      sourceKind: input.clip.sourceKind,
      sourceId: input.clip.sourceId,
      relativePath: input.clip.relativePath,
      copiedPath: input.copiedPath,
      mediaType: input.clip.mediaType,
      mime: mime?.contentType ?? null,
      sizeBytes: stat.size,
      md5: hashFileMd5(input.absolutePath),
      exists: true,
    };
  } catch {
    return {
      clipId: input.clip.id,
      trackId: input.clip.trackId,
      selectedVideoId: input.clip.selectedVideoId,
      sourceKind: input.clip.sourceKind,
      sourceId: input.clip.sourceId,
      relativePath: input.clip.relativePath,
      copiedPath: input.copiedPath,
      mediaType: input.clip.mediaType,
      mime: mime?.contentType ?? null,
      sizeBytes: null,
      md5: null,
      exists: false,
    };
  }
}

function buildMediaSnapshot(input: { timeline: ExportTimeline | null; resolvedClips: ResolvedClip[]; assetPaths?: Map<string, string>; copyAssets: boolean }): ExportMediaSnapshot {
  const resolvedPathByClipId = new Map(input.resolvedClips.map((item) => [item.clip.id, item.absolutePath]));
  const files = (input.timeline?.clips ?? []).map((clip) => createMediaSnapshotItem({
    clip,
    absolutePath: resolvedPathByClipId.get(clip.id) ?? null,
    copiedPath: input.assetPaths?.get(clip.id) ?? null,
  }));

  return {
    copyAssets: input.copyAssets,
    files,
  };
}

function createExportHistory(input: CreateExportHistoryInput): number {
  const now = Date.now();
  const mediaSnapshot: ExportMediaSnapshot = {
    copyAssets: input.copyAssets,
    files: [],
  };
  const validation = createValidationSnapshot({ valid: false, stage: 'started', failureCount: 0 });
  const result = getDatabase()
    .prepare<
      [number, number, number | null, ExportHistoryType, string, ExportDraftStatus, string, string, string, string, string, string, number, number],
      { id: number }
    >(
      `
      INSERT INTO export_history (
        project_id, script_id, task_id, export_type, draft_name, status,
        app_version, schema_version,
        selected_video_ids_json, media_snapshot_json, failures_json, validation_json, stale_confirmations_json,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
      `,
    )
    .get(
      input.projectId,
      input.scriptId,
      input.taskId,
      input.exportType,
      input.draftName,
      input.status,
      APP_VERSION,
      serializeJson([]),
      serializeJson(mediaSnapshot),
      serializeJson([]),
      serializeJson(validation),
      serializeJson([]),
      now,
      now,
    );

  if (!result) {
    throw createError(VT_STATUS.DATABASE_ERROR, '导出历史创建失败');
  }

  return result.id;
}

function updateExportHistory(historyId: number | null, input: UpdateExportHistoryInput): void {
  if (!historyId) {
    return;
  }

  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  const setValue = (column: string, value: string | number | null): void => {
    assignments.push(`${column} = ?`);
    values.push(value);
  };

  if (input.status !== undefined) {
    setValue('status', input.status);
  }
  if (input.outputPath !== undefined) {
    setValue('output_path', input.outputPath);
  }
  if (input.relativePath !== undefined) {
    setValue('relative_path', input.relativePath);
  }
  if (input.clipCount !== undefined) {
    setValue('clip_count', input.clipCount);
  }
  if (input.copiedAssetCount !== undefined) {
    setValue('copied_asset_count', input.copiedAssetCount);
  }
  if (input.durationMs !== undefined) {
    setValue('duration_ms', input.durationMs);
  }
  if (input.timeline !== undefined) {
    setValue('timeline_json', input.timeline ? serializeJson(input.timeline) : null);
  }
  if (input.selectedVideoIds !== undefined) {
    setValue('selected_video_ids_json', serializeJson(input.selectedVideoIds));
  }
  if (input.mediaSnapshot !== undefined) {
    setValue('media_snapshot_json', serializeJson(input.mediaSnapshot));
  }
  if (input.failures !== undefined) {
    setValue('failures_json', serializeJson(input.failures));
  }
  if (input.validation !== undefined) {
    setValue('validation_json', input.validation ? serializeJson(input.validation) : null);
  }
  if (input.staleConfirmations !== undefined) {
    setValue('stale_confirmations_json', serializeJson(input.staleConfirmations));
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push('updated_at = ?');
  values.push(Date.now(), historyId);
  getDatabase().prepare(`UPDATE export_history SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
}

function mapHistoryRow(row: ExportHistoryRow): ExportHistoryItem {
  const mediaSnapshot = parseJson<ExportMediaSnapshot>(row.media_snapshot_json, { copyAssets: true, files: [] });

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name ?? String(row.project_id),
    contentId: row.script_id,
    contentName: row.script_name ?? String(row.script_id),
    taskId: row.task_id,
    exportType: row.export_type === 'jianyingDraft' ? 'jianyingDraft' : 'jianyingDraft',
    draftName: row.draft_name,
    status: normalizeStoredExportStatus(row.status),
    outputPath: row.output_path,
    relativePath: row.relative_path,
    clipCount: row.clip_count,
    copiedAssetCount: row.copied_asset_count,
    durationMs: row.duration_ms,
    appVersion: row.app_version,
    schemaVersion: row.schema_version,
    copyAssets: mediaSnapshot.copyAssets,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHistoryDetail(row: ExportHistoryRow): ExportHistoryDetail {
  return {
    ...mapHistoryRow(row),
    timeline: parseJson<ExportTimeline | null>(row.timeline_json, null),
    selectedVideoIds: parseJson<number[]>(row.selected_video_ids_json, []),
    mediaSnapshot: parseJson<ExportMediaSnapshot>(row.media_snapshot_json, { copyAssets: true, files: [] }),
    failures: parseJson<ExportValidationFailure[]>(row.failures_json, []),
    validation: parseJson<ExportValidationSnapshot | null>(row.validation_json, null),
    staleConfirmations: parseJson<ExportStaleConfirmationSnapshot[]>(row.stale_confirmations_json, []),
  };
}

function exportHistorySelectSql(): string {
  return `
    SELECT h.*,
           p.name AS project_name,
           s.name AS script_name
    FROM export_history h
    LEFT JOIN projects p ON p.id = h.project_id
    LEFT JOIN scripts s ON s.id = h.script_id
  `;
}

export function buildExportTimeline(payload: ExportBuildTimelinePayload): ExportBuildTimelineResult {
  return {
    timeline: buildTimelineFromDatabase(payload),
  };
}

export function validateExportAssets(payload: ExportValidateAssetsPayload): ExportValidateAssetsResult {
  const timeline = buildTimelineFromDatabase(payload);
  const { failures } = validateTimeline(timeline);
  return {
    valid: failures.length === 0,
    timeline,
    failures,
  };
}

export function exportStoryboardImages(payload: ExportStoryboardImagesPayload): ExportStoryboardImagesResult {
  const { project, script } = assertExportContext(payload);
  const storyboardIds = normalizeIds(payload.storyboardIds, '分镜 ID');
  const rows = readStoryboards(project.id, script.id, storyboardIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const order = (payload.order?.length ? payload.order : storyboardIds).filter((id) => storyboardIds.includes(id));
  const orderedIds = [...order, ...storyboardIds.filter((id) => !order.includes(id))];
  const failures: ExportValidationFailure[] = [];
  const entries: Array<{ name: string; content: Buffer }> = [];

  for (const storyboardId of orderedIds) {
    const row = rowById.get(storyboardId);
    if (!row) {
      failures.push(failure({ mediaType: 'image', sourceKind: 'storyboard', sourceId: storyboardId, path: null, reason: 'fileMissing', message: '分镜不存在' }));
      continue;
    }
    const dependencyStatus = normalizeDependencyStatus(row.dependency_status);
    const dependencyReason = dependencyFailureReason(dependencyStatus);
    if (dependencyReason) {
      failures.push(failure({
        mediaType: 'image',
        sourceKind: 'storyboard',
        sourceId: row.id,
        path: row.relative_path,
        reason: dependencyReason,
        message: dependencyFailureMessage(dependencyStatus, row.dependency_reason),
        dependencyStatus,
      }));
      continue;
    }
    if (!row.relative_path) {
      failures.push(failure({ mediaType: 'image', sourceKind: 'storyboard', sourceId: row.id, path: null, reason: 'emptyPath', message: '分镜图片路径为空' }));
      continue;
    }
    let absolutePath = '';
    try {
      absolutePath = resolveMediaPath('project', row.relative_path);
      const stat = statSync(absolutePath);
      if (!stat.isFile()) {
        failures.push(failure({ mediaType: 'image', sourceKind: 'storyboard', sourceId: row.id, path: row.relative_path, reason: 'notFile', message: '分镜图片不是文件' }));
        continue;
      }
      accessSync(absolutePath, constants.R_OK);
      const mime = getMediaMimeInfo(absolutePath);
      if (!mime || mime.kind !== 'image') {
        failures.push(failure({ mediaType: 'image', sourceKind: 'storyboard', sourceId: row.id, path: row.relative_path, reason: 'unsupportedType', message: '分镜图片格式不支持' }));
        continue;
      }
      const ext = extensionForPath(absolutePath, 'jpg');
      entries.push({
        name: `storyboard-${String(row.sort_index + 1).padStart(2, '0')}-${row.id}.${ext}`,
        content: readFileSync(absolutePath),
      });
    } catch {
      failures.push(failure({ mediaType: 'image', sourceKind: 'storyboard', sourceId: row.id, path: row.relative_path, reason: 'unreadable', message: '分镜图片读取失败' }));
    }
  }

  if (entries.length === 0) {
    return {
      filePath: null,
      relativePath: null,
      exportedCount: 0,
      failedCount: failures.length,
      failures,
    };
  }

  const relativePath = toPosixPath(join(STORYBOARD_ZIP_ROOT, `project-${project.id}`, `script-${script.id}`, `storyboards-${timestampSlug()}.zip`));
  const filePath = writeExportBuffer(relativePath, createStoredZip(entries));
  return {
    filePath,
    relativePath,
    exportedCount: entries.length,
    failedCount: failures.length,
    failures,
  };
}

export function createJianyingDraft(payload: ExportCreateJianyingDraftPayload): ExportCreateJianyingDraftResult {
  const { project, script } = assertExportContext(payload);
  const draftName = safeFileStem(payload.draftName?.trim() || `${project.name}-${script.name}`, 'jianying-draft');
  const copyAssets = payload.copyAssets !== false;
  const task = createProductionTask({
    projectId: project.id,
    category: JIANYING_DRAFT_CATEGORY,
    relatedObjects: { projectId: project.id, contentId: script.id, draftName, copyAssets },
    modelName: null,
    description: `导出剪映草稿：${draftName}`,
  });
  const historyId = createExportHistory({
    projectId: project.id,
    scriptId: script.id,
    taskId: task.taskId,
    exportType: 'jianyingDraft',
    draftName,
    status: EXPORT_DRAFT_STATUS.RUNNING,
    copyAssets,
  });

  let draftRelativePath: string | null = null;
  let draftPath: string | null = null;
  let timeline: ExportTimeline | null = null;
  let resolvedClips: ResolvedClip[] = [];
  let copiedAssetCount = 0;

  try {
    timeline = buildTimelineFromDatabase({ projectId: project.id, contentId: script.id });
    const validation = validateTimeline(timeline);
    resolvedClips = validation.resolvedClips;
    if (validation.failures.length > 0) {
      failTask(task.taskId, new Error(`导出素材校验失败：${validation.failures.length} 项`));
      updateExportHistory(historyId, {
        status: EXPORT_DRAFT_STATUS.FAILED,
        clipCount: timeline.clips.length,
        copiedAssetCount: 0,
        durationMs: timeline.durationMs,
        timeline,
        selectedVideoIds: selectedVideoIdsFromTimeline(timeline),
        mediaSnapshot: buildMediaSnapshot({ timeline, resolvedClips, copyAssets }),
        failures: validation.failures,
        validation: createValidationSnapshot({ valid: false, stage: 'validation', failureCount: validation.failures.length }),
        staleConfirmations: [],
      });
      return {
        taskId: task.taskId,
        status: EXPORT_DRAFT_STATUS.FAILED,
        succeeded: false,
        draftName,
        draftPath: null,
        relativePath: null,
        timeline,
        failures: validation.failures,
        summary: {
          clipCount: timeline.clips.length,
          copiedAssetCount: 0,
          durationMs: timeline.durationMs,
        },
      };
    }

    draftRelativePath = toPosixPath(join(JIANYING_ROOT, `project-${project.id}`, `script-${script.id}`, `${draftName}-${timestampSlug()}`));
    draftPath = ensureExportDirectory(draftRelativePath);
    const assetPaths = copyAssets ? copyDraftAssets(draftRelativePath, validation.resolvedClips) : new Map<string, string>();
    copiedAssetCount = assetPaths.size;
    writeExportJson(toPosixPath(join(draftRelativePath, 'vt_timeline.json')), timeline);
    writeExportJson(toPosixPath(join(draftRelativePath, 'draft_meta_info.json')), buildJianyingDraftMetaInfo({
      draftName,
      draftPath,
      timeline,
      assetPaths,
      resolvedClips: validation.resolvedClips,
    }));
    writeExportJson(toPosixPath(join(draftRelativePath, 'draft_content.json')), buildDraftContent({
      timeline,
      assetPaths,
      draftName,
      project,
      draftPath,
      resolvedClips: validation.resolvedClips,
    }));
    writeExportJson(toPosixPath(join(draftRelativePath, 'export_summary.json')), buildSummary({ status: EXPORT_DRAFT_STATUS.SUCCEEDED, timeline, failures: [], copiedAssetCount: assetPaths.size, draftName, taskId: task.taskId }));
    updateExportHistory(historyId, {
      status: EXPORT_DRAFT_STATUS.SUCCEEDED,
      outputPath: draftPath,
      relativePath: draftRelativePath,
      clipCount: timeline.clips.length,
      copiedAssetCount,
      durationMs: timeline.durationMs,
      timeline,
      selectedVideoIds: selectedVideoIdsFromTimeline(timeline),
      mediaSnapshot: buildMediaSnapshot({ timeline, resolvedClips, assetPaths, copyAssets }),
      failures: [],
      validation: createValidationSnapshot({ valid: true, stage: 'writeDraft', failureCount: 0 }),
      staleConfirmations: [],
    });
    succeedTask(task.taskId);

    return {
      taskId: task.taskId,
      status: EXPORT_DRAFT_STATUS.SUCCEEDED,
      succeeded: true,
      draftName,
      draftPath,
      relativePath: draftRelativePath,
      timeline,
      failures: [],
      summary: {
        clipCount: timeline.clips.length,
        copiedAssetCount: assetPaths.size,
        durationMs: timeline.durationMs,
      },
    };
  } catch (error) {
    try {
      failTask(task.taskId, error);
    } catch {
      // ignore task state race; original error should be returned
    }
    const failures = [failure({ reason: 'unreadable', message: error instanceof Error ? error.message : '导出失败' })];
    if (draftRelativePath) {
      writeExportJson(toPosixPath(join(draftRelativePath, 'export_summary.json')), buildSummary({ status: EXPORT_DRAFT_STATUS.FAILED, timeline, failures, copiedAssetCount: 0, draftName, taskId: task.taskId }));
    }
    updateExportHistory(historyId, {
      status: EXPORT_DRAFT_STATUS.FAILED,
      outputPath: draftPath,
      relativePath: draftRelativePath,
      clipCount: timeline?.clips.length ?? 0,
      copiedAssetCount,
      durationMs: timeline?.durationMs ?? 0,
      timeline,
      selectedVideoIds: selectedVideoIdsFromTimeline(timeline),
      mediaSnapshot: buildMediaSnapshot({ timeline, resolvedClips, copyAssets }),
      failures,
      validation: createValidationSnapshot({ valid: false, stage: 'exception', failureCount: failures.length }),
      staleConfirmations: [],
    });
    return {
      taskId: task.taskId,
      status: EXPORT_DRAFT_STATUS.FAILED,
      succeeded: false,
      draftName,
      draftPath,
      relativePath: draftRelativePath,
      timeline,
      failures,
      summary: {
        clipCount: timeline?.clips.length ?? 0,
        copiedAssetCount: 0,
        durationMs: timeline?.durationMs ?? 0,
      },
    };
  }
}

export function listExportHistory(payload: ExportHistoryListPayload): ExportHistoryListResult {
  const project = assertProject(payload.projectId);
  const scriptId = payload.contentId == null ? null : normalizeScriptId(Number(payload.contentId));
  const status = normalizeHistoryStatus(payload.status);
  const limit = normalizeHistoryLimit(payload.limit);
  const where: string[] = ['h.project_id = ?'];
  const params: Array<number | string> = [project.id];

  if (scriptId) {
    where.push('h.script_id = ?');
    params.push(scriptId);
  }
  if (status) {
    where.push('h.status = ?');
    params.push(status);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const totalRow = getDatabase()
    .prepare<Array<number | string>, { total: number }>(`SELECT COUNT(1) AS total FROM export_history h ${whereSql}`)
    .get(...params);
  const rows = getDatabase()
    .prepare<Array<number | string>, ExportHistoryRow>(
      `
      ${exportHistorySelectSql()}
      ${whereSql}
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT ?
      `,
    )
    .all(...params, limit);

  return {
    histories: rows.map(mapHistoryRow),
    total: totalRow?.total ?? 0,
  };
}

export function getExportHistoryDetail(payload: ExportHistoryDetailPayload): ExportHistoryDetailResult {
  const project = assertProject(payload.projectId);
  const historyId = normalizeHistoryId(payload.id);
  const row = getDatabase()
    .prepare<[number, number], ExportHistoryRow>(
      `
      ${exportHistorySelectSql()}
      WHERE h.project_id = ? AND h.id = ?
      LIMIT 1
      `,
    )
    .get(project.id, historyId);

  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '导出历史不存在');
  }

  return {
    history: mapHistoryDetail(row),
  };
}

export async function openExportDirectory(payload: ExportOpenDirectoryPayload): Promise<ExportOpenDirectoryResult> {
  const normalized = payload.path?.trim();
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, '导出目录不能为空');
  }
  const directoryPath = assertPathInsideExports(normalized);
  const stat = statSync(directoryPath);
  const targetDirectory = stat.isDirectory() ? directoryPath : dirname(directoryPath);
  assertInsideRoot(targetDirectory, getRuntimeDirectories().exports);
  const result = await shell.openPath(targetDirectory);
  if (result) {
    throw createError(VT_STATUS.FILE_ERROR, `打开目录失败：${result}`);
  }
  return {
    opened: true,
    path: targetDirectory,
  };
}

export function isPathInsideExportsForTest(targetPath: string): boolean {
  const root = resolve(getRuntimeDirectories().exports);
  const target = resolve(targetPath);
  const relativePath = relative(root, target);
  return relativePath === '' || (!relativePath.startsWith('..') && !resolve(relativePath).startsWith('..'));
}
