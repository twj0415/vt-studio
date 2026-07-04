import type { AssetTaskStatus } from './assets';
import {
  DEPENDENCY_STATUSES,
  DEPENDENCY_STATUS_VALUES,
  GENERATION_TASK_STATUSES,
  PRODUCTION_IMAGE_FLOW_OWNER_TYPES as SHARED_PRODUCTION_IMAGE_FLOW_OWNER_TYPES,
  PRODUCTION_NODE_TYPES as SHARED_PRODUCTION_NODE_TYPES,
  PRODUCTION_REFERENCE_FILE_TYPES as SHARED_PRODUCTION_REFERENCE_FILE_TYPES,
  PRODUCTION_REFERENCE_SOURCES as SHARED_PRODUCTION_REFERENCE_SOURCES,
} from '../constants/dictionaries';

export const PRODUCTION_TASK_STATUS = GENERATION_TASK_STATUSES;

export type ProductionTaskStatus = (typeof PRODUCTION_TASK_STATUS)[keyof typeof PRODUCTION_TASK_STATUS];
export const PRODUCTION_DEPENDENCY_STATUS = DEPENDENCY_STATUSES;
export const PRODUCTION_DEPENDENCY_STATUS_VALUES = DEPENDENCY_STATUS_VALUES;
export type ProductionDependencyStatus = (typeof PRODUCTION_DEPENDENCY_STATUS_VALUES)[number];

export const PRODUCTION_NODE_TYPES = SHARED_PRODUCTION_NODE_TYPES;
export type ProductionNodeType = (typeof PRODUCTION_NODE_TYPES)[number];

export const PRODUCTION_IMAGE_FLOW_OWNER_TYPES = SHARED_PRODUCTION_IMAGE_FLOW_OWNER_TYPES;
export type ProductionImageFlowOwnerType = (typeof PRODUCTION_IMAGE_FLOW_OWNER_TYPES)[number];

export const PRODUCTION_REFERENCE_SOURCES = SHARED_PRODUCTION_REFERENCE_SOURCES;
export type ProductionReferenceSource = (typeof PRODUCTION_REFERENCE_SOURCES)[number];

export const PRODUCTION_REFERENCE_FILE_TYPES = SHARED_PRODUCTION_REFERENCE_FILE_TYPES;
export type ProductionReferenceFileType = (typeof PRODUCTION_REFERENCE_FILE_TYPES)[number];

export const PRODUCTION_AGENT_TOOL_NAMES = [
  'get_flowData',
  'add_deriveAsset',
  'del_deriveAsset',
  'generate_deriveAsset',
  'generate_storyboard',
  'add_flowData_storyboard',
  'run_sub_agent_derive_assets',
  'run_sub_agent_generate_assets',
  'run_sub_agent_director_plan',
  'run_sub_agent_storyboard_gen',
  'run_sub_agent_storyboard_panel',
  'run_sub_agent_storyboard_table',
  'run_sub_agent_supervision',
] as const;
export type ProductionAgentToolName = (typeof PRODUCTION_AGENT_TOOL_NAMES)[number];

export const PRODUCTION_AGENT_TOOL_STATUSES = ['ready', 'reserved'] as const;
export type ProductionAgentToolStatus = (typeof PRODUCTION_AGENT_TOOL_STATUSES)[number];

export const PRODUCTION_AGENT_WORKSPACE_PATCH_FIELDS = ['script', 'scriptPlan', 'storyboardTable'] as const;
export type ProductionAgentWorkspacePatchField = (typeof PRODUCTION_AGENT_WORKSPACE_PATCH_FIELDS)[number];

export interface ProductionProjectPayload {
  projectId: number;
}

export interface ProductionScriptPayload extends ProductionProjectPayload {
  scriptId: number;
}

export interface ProductionFlowPosition {
  x: number;
  y: number;
}

export type ProductionFlowPositions = Partial<Record<ProductionNodeType, ProductionFlowPosition>>;

export interface ProductionScriptOption {
  id: number;
  name: string;
  episodeKey: string;
  content: string;
}

export interface ProductionAssetSummary {
  id: number;
  parentId: number | null;
  type: 'role' | 'scene' | 'tool' | 'clip' | 'audio';
  name: string;
  description: string;
  prompt: string;
  imageUrl: string | null;
  imageStatus: AssetTaskStatus;
  imageErrorReason: string | null;
  dependencyStatus: ProductionDependencyStatus;
  dependencyReason: string | null;
  flowId: string | null;
  children: ProductionAssetSummary[];
}

export interface ProductionStoryboardItem {
  id: number;
  scriptId: number;
  projectId: number;
  index: number;
  prompt: string;
  videoDesc: string;
  duration: number;
  trackId: number | null;
  flowId: string | null;
  shouldGenerateImage: boolean;
  imageStatus: ProductionTaskStatus;
  imageErrorReason: string | null;
  dependencyStatus: ProductionDependencyStatus;
  dependencyReason: string | null;
  imageUrl: string | null;
  associatedAssetIds: number[];
  generationMetadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionVideoItem {
  id: number;
  trackId: number;
  projectId: number;
  scriptId: number;
  status: ProductionTaskStatus;
  errorReason: string | null;
  dependencyStatus: ProductionDependencyStatus;
  dependencyReason: string | null;
  videoUrl: string | null;
  relativePath: string | null;
  prompt: string;
  duration: number;
  mode: ProductionVideoModeValue | null;
  resolution: string | null;
  audioEnabled: boolean;
  references: ProductionReferenceInput[];
  taskId: number | null;
  generationMetadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionVideoTrackItem {
  id: number;
  projectId: number;
  scriptId: number;
  sortIndex: number;
  prompt: string;
  duration: number;
  status: ProductionTaskStatus;
  errorReason: string | null;
  dependencyStatus: ProductionDependencyStatus;
  dependencyReason: string | null;
  mode: ProductionVideoModeValue | null;
  selectedVideoId: number | null;
  storyboardIds: number[];
  videos: ProductionVideoItem[];
  taskId: number | null;
  generationMetadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionFlowData {
  script: string;
  scriptPlan: string;
  storyboardTable: string;
  positions: ProductionFlowPositions;
  assets: ProductionAssetSummary[];
  storyboards: ProductionStoryboardItem[];
  videoTracks: ProductionVideoTrackItem[];
}

export interface ProductionWorkspaceResult {
  scripts: ProductionScriptOption[];
  currentScriptId: number | null;
  flowData: ProductionFlowData | null;
}

export interface ProductionSaveWorkspacePayload extends ProductionScriptPayload {
  scriptPlan: string;
  storyboardTable: string;
  positions: ProductionFlowPositions;
}

export interface ProductionSaveWorkspaceResult {
  savedAt: number;
}

export type ProductionVideoModeValue = string | string[];

export interface ProductionReferenceInput {
  id: number | null;
  source: ProductionReferenceSource;
  fileType: ProductionReferenceFileType;
  url?: string | null;
  prompt?: string | null;
  index?: number | null;
}

export interface ProductionImageFlowNode {
  id: string;
  type: string;
  position: ProductionFlowPosition;
  data: Record<string, unknown>;
}

export interface ProductionImageFlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface ProductionImageFlowData {
  nodes: ProductionImageFlowNode[];
  edges: ProductionImageFlowEdge[];
}

export interface ProductionImageFlowItem {
  id: string;
  projectId: number;
  scriptId: number;
  ownerType: ProductionImageFlowOwnerType;
  ownerId: number | null;
  flowData: ProductionImageFlowData;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionImageFlowGetPayload extends ProductionScriptPayload {
  flowId: string;
}

export interface ProductionImageFlowSavePayload extends ProductionScriptPayload {
  flowId?: string | null;
  ownerType?: ProductionImageFlowOwnerType | null;
  ownerId?: number | null;
  flowData: ProductionImageFlowData;
}

export interface ProductionImageFlowSaveResult {
  flow: ProductionImageFlowItem;
}

export interface ProductionImageFlowGetResult {
  flow: ProductionImageFlowItem | null;
}

export interface ProductionImageFlowApplyPayload extends ProductionScriptPayload {
  flowId: string;
  ownerType: Exclude<ProductionImageFlowOwnerType, 'free'>;
  ownerId: number;
  imageUrl: string;
}

export interface ProductionImageFlowApplyResult {
  flowId: string;
  ownerType: Exclude<ProductionImageFlowOwnerType, 'free'>;
  ownerId: number;
}

export interface ProductionStoryboardSavePayload extends ProductionScriptPayload {
  id?: number | null;
  prompt: string;
  videoDesc: string;
  duration: number;
  associatedAssetIds?: number[];
  index?: number | null;
  shouldGenerateImage?: boolean;
}

export interface ProductionStoryboardSaveResult {
  storyboard: ProductionStoryboardItem;
}

export interface ProductionStoryboardDeletePayload extends ProductionScriptPayload {
  storyboardId: number;
}

export interface ProductionBatchDeleteStoryboardsPayload extends ProductionScriptPayload {
  storyboardIds: number[];
}

export interface ProductionDeleteResult {
  deletedCount: number;
}

export interface ProductionGenerateStoryboardsPayload extends ProductionScriptPayload {
  storyboardIds: number[];
  compulsory?: boolean;
}

export interface ProductionGenerateAcceptedResult {
  accepted: boolean;
  taskId: number;
  ids: number[];
}

export interface ProductionPollPayload extends ProductionScriptPayload {
  ids: number[];
}

export interface ProductionStoryboardPollResult {
  storyboards: ProductionStoryboardItem[];
}

export interface ProductionDerivedAssetSavePayload extends ProductionScriptPayload {
  parentAssetId: number;
  id?: number | null;
  name: string;
  description?: string | null;
  prompt?: string | null;
}

export interface ProductionDerivedAssetDeletePayload extends ProductionScriptPayload {
  assetId: number;
}

export interface ProductionGenerateDerivedAssetsPayload extends ProductionScriptPayload {
  assetIds: number[];
}

export interface ProductionDerivedAssetPollResult {
  assets: ProductionAssetSummary[];
}

export interface ProductionVideoTrackSavePayload extends ProductionScriptPayload {
  id?: number | null;
  storyboardIds?: number[];
  duration?: number | null;
  prompt?: string | null;
  mode?: ProductionVideoModeValue | null;
  sortIndex?: number | null;
}

export interface ProductionVideoTrackSaveResult {
  track: ProductionVideoTrackItem;
}

export interface ProductionVideoTrackDeletePayload extends ProductionScriptPayload {
  trackId: number;
}

export interface ProductionGenerateVideoPromptPayload extends ProductionScriptPayload {
  trackIds: number[];
}

export interface ProductionGenerateVideoPayload extends ProductionScriptPayload {
  trackIds: number[];
  model?: string | null;
  mode?: ProductionVideoModeValue | null;
  resolution?: string | null;
  duration?: number | null;
  audioEnabled?: boolean | null;
  referencesByTrackId?: Record<number, ProductionReferenceInput[]>;
}

export interface ProductionVideoPollResult {
  tracks: ProductionVideoTrackItem[];
}

export interface ProductionVideoPromptPollResult {
  tracks: ProductionVideoTrackItem[];
}

export interface ProductionSelectVideoPayload extends ProductionScriptPayload {
  trackId: number;
  videoId: number | null;
}

export interface ProductionSelectVideoResult {
  track: ProductionVideoTrackItem;
}

export interface ProductionVideoDeletePayload extends ProductionScriptPayload {
  videoId: number;
}

export interface ProductionWorkbenchResult {
  tracks: ProductionVideoTrackItem[];
  storyboards: ProductionStoryboardItem[];
  assets: ProductionAssetSummary[];
}

export interface ProductionAgentToolDescriptor {
  name: ProductionAgentToolName;
  status: ProductionAgentToolStatus;
  writes: string[];
  inputKeys: string[];
}

export interface ProductionAgentXmlTagDescriptor {
  tag: 'script' | 'scriptPlan' | 'storyboardTable' | 'storyboardItem';
  writes: ProductionAgentWorkspacePatchField | 'storyboard';
  status: ProductionAgentToolStatus;
}

export interface ProductionAgentToolsResult {
  tools: ProductionAgentToolDescriptor[];
  xmlTags: ProductionAgentXmlTagDescriptor[];
}

export interface ProductionAgentManualContext {
  kind: 'visual' | 'director';
  manualId: number;
  manualName: string;
  manualPath: string;
  keys: string[];
  contentHash: string;
  contentLength: number;
  updatedAt: number;
  content: string;
}

export interface ProductionAgentContextResult extends ProductionAgentToolsResult {
  projectId: number;
  scriptId: number;
  scriptName: string;
  flowData: ProductionFlowData;
  manuals: {
    visual: ProductionAgentManualContext;
    director: ProductionAgentManualContext;
  };
}

export interface ProductionAgentWorkspacePatch {
  field: ProductionAgentWorkspacePatchField;
  content: string;
}

export interface ProductionAgentWorkspacePatchPayload extends ProductionScriptPayload {
  patches: ProductionAgentWorkspacePatch[];
  source?: 'xml' | 'tool' | 'manual';
}

export interface ProductionAgentAppliedPatch {
  field: ProductionAgentWorkspacePatchField;
}

export interface ProductionAgentWorkspacePatchResult {
  appliedCount: number;
  patches: ProductionAgentAppliedPatch[];
  flowData: ProductionFlowData;
}

export interface ProductionAgentStoryboardDraft {
  id?: number | null;
  videoDesc: string;
  prompt?: string | null;
  duration?: number | null;
  associatedAssetIds?: number[];
  index?: number | null;
  shouldGenerateImage?: boolean;
}

export interface ProductionAgentStoryboardPayload extends ProductionScriptPayload {
  storyboard: ProductionAgentStoryboardDraft;
}

export interface ProductionAgentStoryboardResult {
  storyboard: ProductionStoryboardItem;
  flowData: ProductionFlowData;
}

export interface ProductionAgentDerivedAssetDraft {
  id?: number | null;
  parentAssetId: number;
  name: string;
  description?: string | null;
  prompt?: string | null;
}

export interface ProductionAgentDerivedAssetPayload extends ProductionScriptPayload {
  asset: ProductionAgentDerivedAssetDraft;
}

export interface ProductionAgentDerivedAssetResult {
  assets: ProductionAssetSummary[];
  flowData: ProductionFlowData;
}
