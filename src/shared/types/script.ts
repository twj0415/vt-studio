import type { ScriptExtractStatus } from './script-agent';
import type { DependencyStatus } from '../constants/dictionaries';

export const SCRIPT_ASSET_TYPES = {
  ROLE: 'role',
  SCENE: 'scene',
  TOOL: 'tool',
} as const;

export const SCRIPT_ASSET_TYPE_VALUES = Object.values(SCRIPT_ASSET_TYPES);
export type ScriptAssetType = (typeof SCRIPT_ASSET_TYPE_VALUES)[number];

export interface ScriptProjectPayload {
  projectId: number;
}

export interface ScriptAssetItem {
  id: number;
  projectId: number;
  type: ScriptAssetType;
  name: string;
  description: string;
  prompt: string;
  source: 'manual' | 'extract';
  createdAt: number;
  updatedAt: number;
}

export interface ScriptItem {
  id: number;
  projectId: number;
  episodeKey: string;
  name: string;
  content: string;
  extractStatus: ScriptExtractStatus;
  errorReason: string | null;
  dependencyStatus: DependencyStatus;
  dependencyReason: string | null;
  relatedAssets: ScriptAssetItem[];
  createdAt: number;
  updatedAt: number;
}

export interface ScriptListPayload extends ScriptProjectPayload {
  keyword?: string | null;
}

export interface ScriptListResult {
  scripts: ScriptItem[];
  assets: ScriptAssetItem[];
  scriptEpisodeLength: number;
}

export interface ScriptSaveDraft {
  id?: number | null;
  name: string;
  content: string;
  assetIds?: number[];
}

export interface ScriptSavePayload extends ScriptProjectPayload {
  script: ScriptSaveDraft;
}

export interface ScriptSaveResult {
  script: ScriptItem;
}

export interface ScriptBatchCreateDraft {
  name: string;
  content: string;
}

export interface ScriptBatchCreatePayload extends ScriptProjectPayload {
  scripts: ScriptBatchCreateDraft[];
}

export interface ScriptBatchCreateResult {
  scripts: ScriptItem[];
}

export interface ScriptDeletePayload extends ScriptProjectPayload {
  scriptId: number;
}

export interface ScriptBatchDeletePayload extends ScriptProjectPayload {
  scriptIds: number[];
}

export interface ScriptDeleteResult {
  deletedCount: number;
}

export interface ScriptExportZipPayload extends ScriptProjectPayload {
  scriptIds: number[];
}

export interface ScriptExportZipResult {
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
}

export interface ScriptGenerateParseRegexPayload extends ScriptProjectPayload {
  content: string;
}

export interface ScriptGenerateParseRegexResult {
  regex: string;
}

export interface ScriptExtractAssetsPayload extends ScriptProjectPayload {
  scriptIds: number[];
}

export interface ScriptExtractAssetsResult {
  accepted: boolean;
  taskId: number;
  scriptIds: number[];
}

export interface ScriptPollExtractStatusPayload extends ScriptProjectPayload {
  scriptIds: number[];
}

export interface ScriptPollExtractStatusResult {
  scripts: ScriptItem[];
}

export interface ScriptRecoverExtractStatusResult {
  recovered: number;
}
