import type { ProjectImageQuality } from './project';
import {
  ASSET_IMAGE_USAGES as SHARED_ASSET_IMAGE_USAGES,
  ASSET_IMAGE_USAGE_VALUES as SHARED_ASSET_IMAGE_USAGE_VALUES,
  ASSET_IMAGE_VIEW_MODES as SHARED_ASSET_IMAGE_VIEW_MODES,
  ASSET_IMAGE_VIEW_MODE_VALUES as SHARED_ASSET_IMAGE_VIEW_MODE_VALUES,
  ASSET_MEDIA_KINDS as SHARED_ASSET_MEDIA_KINDS,
  ASSET_MEDIA_KIND_VALUES as SHARED_ASSET_MEDIA_KIND_VALUES,
  ASSET_SOURCES as SHARED_ASSET_SOURCES,
  ASSET_SOURCE_VALUES as SHARED_ASSET_SOURCE_VALUES,
  ASSET_TYPES as SHARED_ASSET_TYPES,
  ASSET_TYPE_VALUES as SHARED_ASSET_TYPE_VALUES,
  DEPENDENCY_STATUSES,
  DEPENDENCY_STATUS_VALUES,
  GENERATABLE_ASSET_TYPE_VALUES,
  GENERATION_TASK_STATUSES,
  GENERATION_TASK_STATUS_VALUES,
} from '../constants/dictionaries';

export const ASSET_TYPES = SHARED_ASSET_TYPES;

export const ASSET_TYPE_VALUES = SHARED_ASSET_TYPE_VALUES;
export type AssetType = (typeof ASSET_TYPE_VALUES)[number];
export type GeneratableAssetType = (typeof GENERATABLE_ASSET_TYPE_VALUES)[number];

export const GENERATABLE_ASSET_TYPES: GeneratableAssetType[] = [...GENERATABLE_ASSET_TYPE_VALUES];

export const ASSET_MEDIA_KINDS = SHARED_ASSET_MEDIA_KINDS;

export const ASSET_MEDIA_KIND_VALUES = SHARED_ASSET_MEDIA_KIND_VALUES;
export type AssetMediaKind = (typeof ASSET_MEDIA_KIND_VALUES)[number];

export const ASSET_IMAGE_USAGES = SHARED_ASSET_IMAGE_USAGES;
export const ASSET_IMAGE_USAGE_VALUES = SHARED_ASSET_IMAGE_USAGE_VALUES;
export type AssetImageUsage = (typeof ASSET_IMAGE_USAGE_VALUES)[number];

export const ASSET_IMAGE_VIEW_MODES = SHARED_ASSET_IMAGE_VIEW_MODES;
export const ASSET_IMAGE_VIEW_MODE_VALUES = SHARED_ASSET_IMAGE_VIEW_MODE_VALUES;
export type AssetImageViewMode = (typeof ASSET_IMAGE_VIEW_MODE_VALUES)[number];

export const ASSET_TASK_STATUS = GENERATION_TASK_STATUSES;

export const ASSET_TASK_STATUS_VALUES = GENERATION_TASK_STATUS_VALUES;
export type AssetTaskStatus = (typeof ASSET_TASK_STATUS_VALUES)[number];

export const ASSET_DEPENDENCY_STATUS = DEPENDENCY_STATUSES;
export const ASSET_DEPENDENCY_STATUS_VALUES = DEPENDENCY_STATUS_VALUES;
export type AssetDependencyStatus = (typeof ASSET_DEPENDENCY_STATUS_VALUES)[number];

export const ASSET_SOURCES = SHARED_ASSET_SOURCES;
export const ASSET_SOURCE_VALUES = SHARED_ASSET_SOURCE_VALUES;
export type AssetSource = (typeof ASSET_SOURCE_VALUES)[number];

export interface AssetMediaItem {
  id: number;
  projectId: number;
  assetId: number;
  kind: AssetMediaKind;
  relativePath: string | null;
  source: AssetSource;
  usage: AssetImageUsage;
  viewMode: AssetImageViewMode;
  status: AssetTaskStatus;
  errorReason: string | null;
  prompt: string | null;
  model: string | null;
  modelMode: string | null;
  resolution: ProjectImageQuality | null;
  taskId: number | null;
  metadata: Record<string, unknown>;
  url: string | null;
  thumbnailUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AssetItem {
  id: number;
  projectId: number;
  parentId: number | null;
  type: AssetType;
  name: string;
  description: string;
  remark: string;
  prompt: string;
  source: AssetSource;
  mediaId: number | null;
  promptStatus: AssetTaskStatus;
  promptErrorReason: string | null;
  imageStatus: AssetTaskStatus;
  imageErrorReason: string | null;
  audioBindStatus: AssetTaskStatus;
  audioBindErrorReason: string | null;
  dependencyStatus: AssetDependencyStatus;
  dependencyReason: string | null;
  voiceGender: string | null;
  metadata: Record<string, unknown>;
  media: AssetMediaItem | null;
  mediaHistory: AssetMediaItem[];
  children: AssetItem[];
  boundAudio: AssetAudioSummary | null;
  createdAt: number;
  updatedAt: number;
}

export interface AssetAudioSummary {
  id: number;
  name: string;
  description: string;
  voiceGender: string | null;
}

export interface AssetProjectPayload {
  projectId: number;
}

export interface AssetListPayload extends AssetProjectPayload {
  type: AssetType;
  keyword?: string | null;
  page?: number;
  limit?: number;
}

export interface AssetListResult {
  data: AssetItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AssetSaveDraft {
  id?: number | null;
  parentId?: number | null;
  type: AssetType;
  name: string;
  description?: string | null;
  remark?: string | null;
  prompt?: string | null;
  voiceGender?: string | null;
}

export interface AssetSavePayload extends AssetProjectPayload {
  asset: AssetSaveDraft;
}

export interface AssetSaveResult {
  asset: AssetItem;
}

export interface AssetDeletePayload extends AssetProjectPayload {
  assetId: number;
}

export interface AssetBatchDeletePayload extends AssetProjectPayload {
  assetIds: number[];
}

export interface AssetDeleteResult {
  deletedCount: number;
}

export interface AssetUploadPayload extends AssetProjectPayload {
  assetId?: number | null;
  type: 'clip' | 'audio';
  parentId?: number | null;
  fileName: string;
  dataUrl: string;
  name?: string | null;
  description?: string | null;
  remark?: string | null;
  prompt?: string | null;
  voiceGender?: string | null;
}

export interface AssetUploadResult {
  asset: AssetItem;
}

export interface AssetPromptPayload extends AssetProjectPayload {
  assetId: number;
  extraInstruction?: string | null;
}

export interface AssetBatchPromptPayload extends AssetProjectPayload {
  assetIds: number[];
  extraInstruction?: string | null;
  concurrentCount?: number | null;
}

export interface AssetGenerateAcceptedResult {
  accepted: boolean;
  taskId: number;
  assetIds: number[];
}

export interface AssetImagePayload extends AssetProjectPayload {
  assetId: number;
  model: string;
  resolution: ProjectImageQuality;
  prompt?: string | null;
  referenceImageDataUrl?: string | null;
}

export interface AssetBatchImagePayload extends AssetProjectPayload {
  assetIds: number[];
  model: string;
  resolution: ProjectImageQuality;
  concurrentCount?: number | null;
}

export interface AssetMediaSelectPayload extends AssetProjectPayload {
  assetId: number;
  mediaId: number;
}

export interface AssetMediaDeletePayload extends AssetProjectPayload {
  mediaId: number;
}

export interface AssetCancelImagePayload extends AssetProjectPayload {
  mediaId: number;
}

export interface AssetPollPayload extends AssetProjectPayload {
  assetIds: number[];
}

export interface AssetPollResult {
  assets: AssetItem[];
}

export interface CornerAssetListPayload extends AssetProjectPayload {
  types?: GeneratableAssetType[];
}

export interface CornerAssetListResult {
  assets: AssetItem[];
  audioAssets: AssetAudioSummary[];
  imageModelId: string | null;
  imageQuality: ProjectImageQuality;
  assetsBatchGenerateSize: number;
}

export interface AssetAudioBindingPayload extends AssetProjectPayload {
  assetId: number;
  audioAssetId?: number | null;
}

export interface AssetAudioBindingResult {
  asset: AssetItem;
}

export interface AssetBatchAudioBindingPayload extends AssetProjectPayload {
  assetIds: number[];
  concurrentCount?: number | null;
}
