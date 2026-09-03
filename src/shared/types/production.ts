import type { AssetTaskStatus } from './assets';
import type { ProjectTemplateType } from '../constants/dictionaries';
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
  'save_content',
  'extract_resources',
  'save_director_plan',
  'save_storyboard_table',
  'add_storyboard',
  'update_storyboard',
  'delete_storyboard',
  'add_deriveAsset',
  'del_deriveAsset',
  'generate_deriveAsset',
  'generate_storyboard',
  'save_video_track',
  'generate_video_prompt',
  'generate_video',
  'select_video',
  'validate_export',
  'create_export',
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

export const PRODUCTION_AGENT_WORKSPACE_PATCH_FIELDS = ['content', 'directorPlan', 'storyboardTable'] as const;
export type ProductionAgentWorkspacePatchField = (typeof PRODUCTION_AGENT_WORKSPACE_PATCH_FIELDS)[number];

export interface ProductionProjectPayload {
  projectId: number;
}

export type ProductionResourceContextKey =
  | 'visualManual'
  | 'directorManual'
  | 'scriptManual'
  | 'promptTemplates'
  | 'modelPrompts'
  | 'skills';

export interface ProductionResourceContextPayload extends ProductionProjectPayload {
  templateType: ProjectTemplateType;
}

export interface ManualContext {
  id: number;
  name: string;
  content: string;
  updatedAt: number;
}

export interface PromptTemplateContext {
  id: number;
  name: string;
  type: string;
  content: string;
}

export interface ModelPromptContext {
  modelId: string;
  purpose: string;
  content: string;
}

export interface SkillContext {
  name: string;
  description: string;
  content: string;
}

export interface ProductionResourceContext {
  visualManual: ManualContext;
  directorManual: ManualContext;
  scriptManual: ManualContext;
  promptTemplates: PromptTemplateContext[];
  modelPrompts: ModelPromptContext[];
  skills: SkillContext[];
}

export interface ProductionSkillBundle {
  skills: SkillContext[];
  mainSkills: SkillContext[];
  referenceSkills: SkillContext[];
}

export interface ProductionContentPayload extends ProductionProjectPayload {
  contentId: number;
}

export interface ProductionContentScopedPayload extends ProductionContentPayload {}

export interface ProductionContentItem {
  id: number;
  projectId: number;
  title: string;
  body: string;
  version: number;
  resourceStatus: ProductionTaskStatus;
  resourceErrorReason: string | null;
  dependencyStatus: ProductionDependencyStatus;
  dependencyReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionContentListResult {
  contents: ProductionContentItem[];
  currentContentId: number | null;
}

export interface ProductionContentResult {
  content: ProductionContentItem;
}

export interface ProductionContentSavePayload extends ProductionProjectPayload {
  contentId?: number | null;
  title: string;
  body: string;
}

export interface ProductionContentSaveResult {
  content: ProductionContentItem;
}

export interface ProductionContentDeletePayload extends ProductionContentPayload {}

export interface ProductionExtractResourcesPayload extends ProductionContentPayload {}

export interface ProductionExtractResourcesResult {
  accepted: boolean;
  taskId: number;
  contentIds: number[];
}

export interface ProductionPollResourceExtractionPayload extends ProductionProjectPayload {
  contentIds: number[];
}

export interface ProductionPollResourceExtractionResult {
  contents: ProductionContentItem[];
}

export type ProductionResourceDraftType = 'role' | 'scene' | 'tool';
export const PRODUCTION_RESOURCE_DRAFT_ACTIONS = ['create', 'merge', 'replace', 'skip'] as const;
export type ProductionResourceDraftAction = (typeof PRODUCTION_RESOURCE_DRAFT_ACTIONS)[number];
export const PRODUCTION_RESOURCE_DRAFT_STATUSES = ['draft', 'saved', 'skipped'] as const;
export type ProductionResourceDraftStatus = (typeof PRODUCTION_RESOURCE_DRAFT_STATUSES)[number];

export interface ProductionResourceExistingAsset {
  id: number;
  type: ProductionResourceDraftType;
  name: string;
  description: string;
  prompt: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

export interface ProductionResourceDraft {
  id: number;
  projectId: number;
  contentId: number;
  taskId: number | null;
  assetId: number | null;
  matchedAssetId: number | null;
  matchedAssetName: string | null;
  matchedAssetType: ProductionResourceDraftType | null;
  type: ProductionResourceDraftType;
  name: string;
  description: string;
  prompt: string;
  action: ProductionResourceDraftAction;
  status: ProductionResourceDraftStatus;
  errorReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionResourceDraftListPayload extends ProductionContentPayload {}

export interface ProductionResourceDraftListResult {
  drafts: ProductionResourceDraft[];
  existingAssets: ProductionResourceExistingAsset[];
}

export interface ProductionResourceDraftSavePayload extends ProductionContentPayload {
  draftId: number;
  type?: ProductionResourceDraftType;
  name?: string;
  description?: string;
  prompt?: string;
  action?: ProductionResourceDraftAction;
  matchedAssetId?: number | null;
}

export interface ProductionResourceDraftSaveResult {
  draft: ProductionResourceDraft;
}

export interface ProductionResourceDraftDeletePayload extends ProductionContentPayload {
  draftId: number;
}

export interface ProductionResourceDraftCommitPayload extends ProductionContentPayload {
  draftIds?: number[];
}

export interface ProductionResourceDraftCommitResult {
  savedCount: number;
  skippedCount: number;
  assets: ProductionAssetSummary[];
  drafts: ProductionResourceDraft[];
  flowData: ProductionFlowData;
}

export interface ProductionFlowPosition {
  x: number;
  y: number;
}

export type ProductionFlowPositions = Partial<Record<ProductionNodeType, ProductionFlowPosition>>;

export interface ProductionContentOption {
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
  thumbnailUrl: string | null;
  imageStatus: AssetTaskStatus;
  imageErrorReason: string | null;
  dependencyStatus: ProductionDependencyStatus;
  dependencyReason: string | null;
  flowId: string | null;
  children: ProductionAssetSummary[];
}

export interface ProductionStoryboardItem {
  id: number;
  contentId: number;
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
  thumbnailUrl: string | null;
  associatedAssetIds: number[];
  generationMetadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionVideoItem {
  id: number;
  trackId: number;
  projectId: number;
  contentId: number;
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
  contentId: number;
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
  content?: ProductionContentItem;
  contentBody: string;
  directorPlan?: string;
  storyboardTable: string;
  positions: ProductionFlowPositions;
  assets: ProductionAssetSummary[];
  storyboards: ProductionStoryboardItem[];
  videoTracks: ProductionVideoTrackItem[];
}

export interface ProductionWorkspaceResult {
  contents: ProductionContentOption[];
  currentContentId: number | null;
  flowData: ProductionFlowData | null;
}

export interface ProductionSaveWorkspacePayload extends ProductionContentScopedPayload {
  directorPlan: string;
  storyboardTable: string;
  positions: ProductionFlowPositions;
}

export interface ProductionSaveWorkspaceResult {
  savedAt: number;
}

export interface ProductionFlowDataResult {
  flowData: ProductionFlowData;
}

export interface ProductionSaveFlowPositionsPayload extends ProductionContentPayload {
  positions: ProductionFlowPositions;
}

export interface ProductionSaveDirectorPlanPayload extends ProductionContentPayload {
  directorPlan: string;
}

export interface ProductionSaveStoryboardTablePayload extends ProductionContentPayload {
  storyboardTable: string;
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
  contentId: number;
  ownerType: ProductionImageFlowOwnerType;
  ownerId: number | null;
  flowData: ProductionImageFlowData;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionImageFlowGetPayload extends ProductionContentScopedPayload {
  flowId: string;
}

export interface ProductionImageFlowSavePayload extends ProductionContentScopedPayload {
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

export interface ProductionImageFlowApplyPayload extends ProductionContentScopedPayload {
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

export interface ProductionStoryboardSavePayload extends ProductionContentScopedPayload {
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

export interface ProductionStoryboardDeletePayload extends ProductionContentScopedPayload {
  storyboardId: number;
}

export interface ProductionBatchDeleteStoryboardsPayload extends ProductionContentScopedPayload {
  storyboardIds: number[];
}

export interface ProductionDeleteResult {
  deletedCount: number;
}

export interface ProductionGenerateStoryboardsPayload extends ProductionContentScopedPayload {
  storyboardIds: number[];
  compulsory?: boolean;
}

export interface ProductionSmartSplitStoryboardsPayload extends ProductionContentScopedPayload {
  replaceExisting?: boolean;
}

export interface ProductionSmartSplitStoryboardsResult {
  generatedCount: number;
  storyboards: ProductionStoryboardItem[];
}

export interface ProductionGenerateAcceptedResult {
  accepted: boolean;
  taskId: number;
  ids: number[];
}

export interface ProductionPollPayload extends ProductionContentScopedPayload {
  ids: number[];
}

export interface ProductionStoryboardPollResult {
  storyboards: ProductionStoryboardItem[];
}

export interface ProductionDerivedAssetSavePayload extends ProductionContentScopedPayload {
  parentAssetId: number;
  id?: number | null;
  name: string;
  description?: string | null;
  prompt?: string | null;
}

export interface ProductionDerivedAssetDeletePayload extends ProductionContentScopedPayload {
  assetId: number;
}

export interface ProductionGenerateDerivedAssetsPayload extends ProductionContentScopedPayload {
  assetIds: number[];
}

export interface ProductionDerivedAssetPollResult {
  assets: ProductionAssetSummary[];
}

export interface ProductionVideoTrackSavePayload extends ProductionContentScopedPayload {
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

export interface ProductionVideoTrackDeletePayload extends ProductionContentScopedPayload {
  trackId: number;
}

export interface ProductionGenerateVideoPromptPayload extends ProductionContentScopedPayload {
  trackIds: number[];
  model?: string | null;
  mode?: ProductionVideoModeValue | null;
}

export interface ProductionGenerateVideoPayload extends ProductionContentScopedPayload {
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

export interface ProductionSelectVideoPayload extends ProductionContentScopedPayload {
  trackId: number;
  videoId: number | null;
}

export interface ProductionSelectVideoResult {
  track: ProductionVideoTrackItem;
}

export interface ProductionVideoDeletePayload extends ProductionContentScopedPayload {
  videoId: number;
}

export interface ProductionWorkbenchResult {
  tracks: ProductionVideoTrackItem[];
  storyboards: ProductionStoryboardItem[];
  assets: ProductionAssetSummary[];
}

export interface ProductionAgentToolDescriptor {
  name: ProductionAgentToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  permissions: string[];
  idempotency: 'none' | 'content' | 'arguments';
  status: ProductionAgentToolStatus;
  writes: string[];
  reads: string[];
}

export interface ProductionToolRunPayload extends ProductionContentScopedPayload {
  toolName: ProductionAgentToolName;
  input?: Record<string, unknown>;
  source?: 'canvas' | 'toolLibrary' | 'agent' | 'system';
  taskId?: number | null;
  idempotencyKey?: string | null;
}

export interface ProductionToolRunResult {
  ok: boolean;
  flowData?: ProductionFlowData;
  summary?: string;
  error?: string;
  result?: unknown;
}

export type ProductionWorkflowStep =
  | 'content'
  | 'resources'
  | 'storyboardTable'
  | 'storyboardImages'
  | 'videoWorkbench'
  | 'export';

export interface ProductionWorkflowStepState {
  step: ProductionWorkflowStep;
  canRun: boolean;
  status: 'ready' | 'blocked' | 'done' | 'needsUpdate';
  reason: string | null;
}

export interface ProductionWorkflowStateInput extends ProductionContentPayload {}

export interface ProductionWorkflowState {
  projectId: number;
  contentId: number;
  steps: ProductionWorkflowStepState[];
  nextStep: ProductionWorkflowStep;
}

export interface ProductionWorkflowStateResult {
  state: ProductionWorkflowState;
}

export interface ProductionRunWorkflowActionPayload extends ProductionContentPayload {
  step: ProductionWorkflowStep;
  mode?: 'normal' | 'force';
  input?: Record<string, unknown>;
}

export interface ProductionStepGuardResult {
  canRun: boolean;
  reason: string | null;
}

export interface ProductionRunWorkflowActionResult extends ProductionStepGuardResult {
  accepted: boolean;
  step: ProductionWorkflowStep;
  result?: unknown;
  flowData?: ProductionFlowData;
}

export interface ProductionAgentXmlTagDescriptor {
  tag: 'content' | 'directorPlan' | 'storyboardTable' | 'storyboardItem';
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

export interface ProductionStepRuleReference {
  key: string;
  source: 'manual' | 'prompt' | 'skill';
  name: string;
  content: string;
  description?: string;
  manualKind?: 'visual' | 'director';
  manualKeys?: string[];
  promptType?: string;
  modelId?: string;
}

export type ProductionStepRuleReferences = Record<ProductionWorkflowStep, ProductionStepRuleReference[]>;

export interface ProductionAgentContextResult extends ProductionAgentToolsResult {
  projectId: number;
  contentId: number;
  contentTitle: string;
  flowData: ProductionFlowData;
  resourceContext: ProductionResourceContext;
  skillBundle: ProductionSkillBundle;
  manuals: {
    visual: ProductionAgentManualContext;
    director: ProductionAgentManualContext;
  };
  stepRules: ProductionStepRuleReferences;
}

export interface ProductionAgentWorkspacePatch {
  field: ProductionAgentWorkspacePatchField;
  content: string;
}

export interface ProductionAgentWorkspacePatchPayload extends ProductionContentScopedPayload {
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

export interface ProductionAgentStoryboardPayload extends ProductionContentScopedPayload {
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

export interface ProductionAgentDerivedAssetPayload extends ProductionContentScopedPayload {
  asset: ProductionAgentDerivedAssetDraft;
}

export interface ProductionAgentDerivedAssetResult {
  assets: ProductionAssetSummary[];
  flowData: ProductionFlowData;
}
