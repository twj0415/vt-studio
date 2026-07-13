import {
  EXPORT_DRAFT_STATUSES as SHARED_EXPORT_DRAFT_STATUSES,
  EXPORT_DRAFT_STATUS_VALUES as SHARED_EXPORT_DRAFT_STATUS_VALUES,
} from '../constants/dictionaries';
import type { DependencyStatus } from '../constants/dictionaries';

export const EXPORT_MEDIA_TYPES = ['image', 'video', 'audio', 'text'] as const;
export type ExportMediaType = (typeof EXPORT_MEDIA_TYPES)[number];

export const EXPORT_TIMELINE_SOURCES = ['productionVideoTracks'] as const;
export type ExportTimelineSource = (typeof EXPORT_TIMELINE_SOURCES)[number];

export const EXPORT_VALIDATION_REASONS = [
  'emptyPath',
  'fileMissing',
  'notFile',
  'permissionDenied',
  'unsupportedType',
  'unreadable',
  'dependencyStale',
  'dependencyNeedsReview',
  'dependencyMissing',
  'dependencyBlocked',
] as const;
export type ExportValidationReason = (typeof EXPORT_VALIDATION_REASONS)[number];

export const EXPORT_DRAFT_STATUS = SHARED_EXPORT_DRAFT_STATUSES;
export const EXPORT_DRAFT_STATUSES = SHARED_EXPORT_DRAFT_STATUS_VALUES;
export type ExportDraftStatus = (typeof EXPORT_DRAFT_STATUSES)[number];

export interface ExportContentPayload {
  projectId: number;
  contentId: number;
}

export interface ExportTimelineClip {
  id: string;
  trackId: number;
  trackSortIndex: number;
  selectedVideoId: number;
  storyboardIds: number[];
  mediaType: ExportMediaType;
  sourceKind: 'production_video';
  sourceId: number;
  relativePath: string | null;
  filePath: string | null;
  prompt: string;
  trackDependencyStatus?: DependencyStatus | null;
  trackDependencyReason?: string | null;
  videoDependencyStatus?: DependencyStatus | null;
  videoDependencyReason?: string | null;
  startMs: number;
  durationMs: number;
  endMs: number;
}

export interface ExportTimeline {
  projectId: number;
  projectName: string;
  contentId: number;
  contentName: string;
  source: ExportTimelineSource;
  timebase: 'ms';
  durationMs: number;
  clips: ExportTimelineClip[];
}

export type ExportBuildTimelinePayload = ExportContentPayload;

export interface ExportBuildTimelineResult {
  timeline: ExportTimeline;
}

export type ExportValidateAssetsPayload = ExportContentPayload;

export interface ExportValidationFailure {
  trackId: number | null;
  clipId: string | null;
  mediaType: ExportMediaType;
  sourceKind: ExportTimelineClip['sourceKind'] | 'storyboard';
  sourceId: number | null;
  path: string | null;
  reason: ExportValidationReason;
  message: string;
  dependencyStatus?: DependencyStatus | null;
}

export interface ExportValidateAssetsResult {
  valid: boolean;
  timeline: ExportTimeline;
  failures: ExportValidationFailure[];
}

export interface ExportStoryboardImagesPayload extends ExportContentPayload {
  storyboardIds: number[];
  order?: number[];
}

export interface ExportStoryboardImagesResult {
  filePath: string | null;
  relativePath: string | null;
  exportedCount: number;
  failedCount: number;
  failures: ExportValidationFailure[];
}

export interface ExportCreateJianyingDraftPayload extends ExportContentPayload {
  draftName?: string | null;
  copyAssets?: boolean | null;
}

export interface ExportDraftSummary {
  clipCount: number;
  copiedAssetCount: number;
  durationMs: number;
}

export type ExportHistoryType = 'jianyingDraft';

export interface ExportMediaSnapshotItem {
  clipId: string;
  trackId: number;
  selectedVideoId: number;
  sourceKind: ExportTimelineClip['sourceKind'];
  sourceId: number;
  relativePath: string | null;
  copiedPath: string | null;
  mediaType: ExportMediaType;
  mime: string | null;
  sizeBytes: number | null;
  md5: string | null;
  exists: boolean;
}

export interface ExportMediaSnapshot {
  copyAssets: boolean;
  files: ExportMediaSnapshotItem[];
}

export interface ExportValidationSnapshot {
  valid: boolean;
  stage: 'started' | 'validation' | 'writeDraft' | 'exception';
  failureCount: number;
  checkedAt: number;
}

export interface ExportStaleConfirmationSnapshot {
  targetType: string;
  targetId: number;
  confirmedAt: number;
  reason: string | null;
}

export interface ExportHistoryItem {
  id: number;
  projectId: number;
  projectName: string;
  contentId: number;
  contentName: string;
  taskId: number | null;
  exportType: ExportHistoryType;
  draftName: string;
  status: ExportDraftStatus;
  outputPath: string | null;
  relativePath: string | null;
  clipCount: number;
  copiedAssetCount: number;
  durationMs: number;
  appVersion: string;
  schemaVersion: number;
  copyAssets: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ExportHistoryDetail extends ExportHistoryItem {
  timeline: ExportTimeline | null;
  selectedVideoIds: number[];
  mediaSnapshot: ExportMediaSnapshot;
  failures: ExportValidationFailure[];
  validation: ExportValidationSnapshot | null;
  staleConfirmations: ExportStaleConfirmationSnapshot[];
}

export interface ExportHistoryListPayload {
  projectId: number;
  contentId?: number | null;
  status?: ExportDraftStatus | null;
  limit?: number | null;
}

export interface ExportHistoryListResult {
  histories: ExportHistoryItem[];
  total: number;
}

export interface ExportHistoryDetailPayload {
  projectId: number;
  id: number;
}

export interface ExportHistoryDetailResult {
  history: ExportHistoryDetail;
}

export interface ExportCreateJianyingDraftResult {
  taskId: number;
  status: ExportDraftStatus;
  succeeded: boolean;
  draftName: string;
  draftPath: string | null;
  relativePath: string | null;
  timeline: ExportTimeline | null;
  failures: ExportValidationFailure[];
  summary: ExportDraftSummary;
}

export interface ExportOpenDirectoryPayload {
  path: string;
}

export interface ExportOpenDirectoryResult {
  opened: boolean;
  path: string;
}
