export const PROJECT_SOURCE_TYPES = {
  NOVEL: 'novel',
  SCRIPT: 'script',
} as const;

export const PROJECT_SOURCE_TYPE_VALUES = Object.values(PROJECT_SOURCE_TYPES);
export type ProjectSourceType = (typeof PROJECT_SOURCE_TYPE_VALUES)[number];

export const PROJECT_TEMPLATE_TYPES = {
  AI_SHORT_DRAMA: 'aiShortDrama',
} as const;

export const PROJECT_TEMPLATE_TYPE_VALUES = Object.values(PROJECT_TEMPLATE_TYPES);
export type ProjectTemplateType = (typeof PROJECT_TEMPLATE_TYPE_VALUES)[number];

export const PROJECT_IMAGE_QUALITIES = {
  ONE_K: '1K',
  TWO_K: '2K',
  FOUR_K: '4K',
} as const;

export const PROJECT_IMAGE_QUALITY_VALUES = Object.values(PROJECT_IMAGE_QUALITIES);
export type ProjectImageQuality = (typeof PROJECT_IMAGE_QUALITY_VALUES)[number];

export const PROJECT_VIDEO_RATIOS = {
  LANDSCAPE: '16:9',
  PORTRAIT: '9:16',
} as const;

export const PROJECT_VIDEO_RATIO_VALUES = Object.values(PROJECT_VIDEO_RATIOS);
export type ProjectVideoRatio = (typeof PROJECT_VIDEO_RATIO_VALUES)[number];

export const PROJECT_MANUAL_KINDS = {
  VISUAL: 'visual',
  DIRECTOR: 'director',
} as const;

export const PROJECT_MANUAL_KIND_VALUES = Object.values(PROJECT_MANUAL_KINDS);
export type ProjectManualKind = (typeof PROJECT_MANUAL_KIND_VALUES)[number];

export const ASSET_TYPES = {
  ROLE: 'role',
  SCENE: 'scene',
  TOOL: 'tool',
  CLIP: 'clip',
  AUDIO: 'audio',
} as const;

export const ASSET_TYPE_VALUES = Object.values(ASSET_TYPES);
export type AssetType = (typeof ASSET_TYPE_VALUES)[number];

export const GENERATABLE_ASSET_TYPE_VALUES = [
  ASSET_TYPES.ROLE,
  ASSET_TYPES.SCENE,
  ASSET_TYPES.TOOL,
] as const;
export type GeneratableAssetType = (typeof GENERATABLE_ASSET_TYPE_VALUES)[number];

export const ASSET_MEDIA_KINDS = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
} as const;

export const ASSET_MEDIA_KIND_VALUES = Object.values(ASSET_MEDIA_KINDS);
export type AssetMediaKind = (typeof ASSET_MEDIA_KIND_VALUES)[number];

export const ASSET_IMAGE_USAGES = {
  PRIMARY: 'primary',
  DERIVED: 'derived',
  VIEW_SET: 'viewSet',
  REFERENCE: 'reference',
  CUSTOM: 'custom',
} as const;

export const ASSET_IMAGE_USAGE_VALUES = Object.values(ASSET_IMAGE_USAGES);
export type AssetImageUsage = (typeof ASSET_IMAGE_USAGE_VALUES)[number];

export const ASSET_IMAGE_VIEW_MODES = {
  STANDARD: 'standard',
  FOUR_VIEW: 'fourView',
  DERIVED: 'derived',
  CUSTOM: 'custom',
} as const;

export const ASSET_IMAGE_VIEW_MODE_VALUES = Object.values(ASSET_IMAGE_VIEW_MODES);
export type AssetImageViewMode = (typeof ASSET_IMAGE_VIEW_MODE_VALUES)[number];

export const ASSET_SOURCES = {
  MANUAL: 'manual',
  EXTRACT: 'extract',
  UPLOAD: 'upload',
  GENERATED: 'generated',
} as const;

export const ASSET_SOURCE_VALUES = Object.values(ASSET_SOURCES);
export type AssetSource = (typeof ASSET_SOURCE_VALUES)[number];

export const TASK_STATUSES = {
  WAITING: 'waiting',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const TASK_STATUS_VALUES = Object.values(TASK_STATUSES);
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export const GENERATION_TASK_STATUSES = {
  IDLE: 'idle',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const GENERATION_TASK_STATUS_VALUES = Object.values(GENERATION_TASK_STATUSES);
export type GenerationTaskStatus = (typeof GENERATION_TASK_STATUS_VALUES)[number];

export const DEPENDENCY_STATUSES = {
  VALID: 'valid',
  STALE: 'stale',
  NEEDS_REVIEW: 'needs_review',
  MISSING_DEPENDENCY: 'missing_dependency',
  BLOCKED: 'blocked',
} as const;

export const DEPENDENCY_STATUS_VALUES = Object.values(DEPENDENCY_STATUSES);
export type DependencyStatus = (typeof DEPENDENCY_STATUS_VALUES)[number];

export const SOURCE_EVENT_STATUSES = {
  STALE: 'stale',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export const SOURCE_EVENT_STATUS_VALUES = Object.values(SOURCE_EVENT_STATUSES);
export type SourceEventStatus = (typeof SOURCE_EVENT_STATUS_VALUES)[number];

export const SCRIPT_EXTRACT_STATUSES = {
  IDLE: 'idle',
  WAITING: 'waiting',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export const SCRIPT_EXTRACT_STATUS_VALUES = Object.values(SCRIPT_EXTRACT_STATUSES);
export type ScriptExtractStatus = (typeof SCRIPT_EXTRACT_STATUS_VALUES)[number];

export const EXPORT_DRAFT_STATUSES = {
  VALIDATING: 'validating',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export const EXPORT_DRAFT_STATUS_VALUES = Object.values(EXPORT_DRAFT_STATUSES);
export type ExportDraftStatus = (typeof EXPORT_DRAFT_STATUS_VALUES)[number];

export const MODEL_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  TTS: 'tts',
  ALL: 'all',
} as const;

export const MODEL_TYPE_VALUES = Object.values(MODEL_TYPES);
export type ModelType = (typeof MODEL_TYPE_VALUES)[number];

export const MODEL_CAPABILITIES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  TTS: 'tts',
} as const;

export const MODEL_CAPABILITY_VALUES = Object.values(MODEL_CAPABILITIES);
export type ModelCapability = (typeof MODEL_CAPABILITY_VALUES)[number];

export const VENDOR_INPUT_TYPES = {
  TEXT: 'text',
  PASSWORD: 'password',
  URL: 'url',
} as const;

export const VENDOR_INPUT_TYPE_VALUES = Object.values(VENDOR_INPUT_TYPES);
export type VendorInputType = (typeof VENDOR_INPUT_TYPE_VALUES)[number];

export const VENDOR_CAPABILITIES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  TTS: 'tts',
  WORKFLOW: 'workflow',
} as const;

export const VENDOR_CAPABILITY_VALUES = Object.values(VENDOR_CAPABILITIES);
export type VendorCapability = (typeof VENDOR_CAPABILITY_VALUES)[number];

export const IMAGE_GENERATION_MODES = {
  TEXT: 'text',
  SINGLE_IMAGE: 'singleImage',
  MULTI_REFERENCE: 'multiReference',
} as const;

export const IMAGE_GENERATION_MODE_VALUES = Object.values(IMAGE_GENERATION_MODES);
export type ImageGenerationMode = (typeof IMAGE_GENERATION_MODE_VALUES)[number];

export const VIDEO_SIMPLE_MODES = {
  TEXT: 'text',
  SINGLE_IMAGE: 'singleImage',
  START_END_REQUIRED: 'startEndRequired',
  END_FRAME_OPTIONAL: 'endFrameOptional',
  START_FRAME_OPTIONAL: 'startFrameOptional',
} as const;

export const VIDEO_SIMPLE_MODE_VALUES = Object.values(VIDEO_SIMPLE_MODES);
export type VideoSimpleMode = (typeof VIDEO_SIMPLE_MODE_VALUES)[number];

export const VIDEO_REFERENCE_MODE_PREFIXES = {
  VIDEO: 'videoReference',
  IMAGE: 'imageReference',
  AUDIO: 'audioReference',
  TEXT: 'textReference',
} as const;

export const VIDEO_REFERENCE_MODE_PREFIX_VALUES = Object.values(VIDEO_REFERENCE_MODE_PREFIXES);
export type VideoReferenceModePrefix = (typeof VIDEO_REFERENCE_MODE_PREFIX_VALUES)[number];
export type VideoReferenceMode = `${VideoReferenceModePrefix}:${number}`;
export type VideoGenerationMode = VideoSimpleMode | VideoReferenceMode[];

export const VIDEO_GENERATION_MODE_LABELS_ZH: Record<VideoSimpleMode | 'multiReference', string> = {
  text: '纯文本',
  singleImage: '单图',
  multiReference: '多参考图',
  startEndRequired: '首尾帧',
  endFrameOptional: '尾帧可选',
  startFrameOptional: '首帧可选',
};

export const PRODUCTION_NODE_TYPES = [
  'script',
  'scriptPlan',
  'assets',
  'storyboardTable',
  'storyboard',
  'workbench',
  'export',
] as const;
export type ProductionNodeType = (typeof PRODUCTION_NODE_TYPES)[number];

export const PRODUCTION_IMAGE_FLOW_OWNER_TYPES = ['derivedAsset', 'storyboard', 'free'] as const;
export type ProductionImageFlowOwnerType = (typeof PRODUCTION_IMAGE_FLOW_OWNER_TYPES)[number];

export const PRODUCTION_REFERENCE_SOURCES = ['storyboard', 'assets'] as const;
export type ProductionReferenceSource = (typeof PRODUCTION_REFERENCE_SOURCES)[number];

export const PRODUCTION_REFERENCE_FILE_TYPES = ['image', 'video', 'audio', 'text'] as const;
export type ProductionReferenceFileType = (typeof PRODUCTION_REFERENCE_FILE_TYPES)[number];

export const APPEARANCE_MODES = {
  AUTO: 'auto',
  LIGHT: 'light',
  DARK: 'dark',
} as const;

export const APPEARANCE_MODE_VALUES = Object.values(APPEARANCE_MODES);
export type AppearanceMode = (typeof APPEARANCE_MODE_VALUES)[number];

export const APPEARANCE_PRESETS = {
  STUDIO: 'studio',
  WARM: 'warm',
  WORK: 'work',
} as const;

export const APPEARANCE_PRESET_VALUES = Object.values(APPEARANCE_PRESETS);
export type AppearancePresetId = (typeof APPEARANCE_PRESET_VALUES)[number];

export const APPEARANCE_FONT_SIZE_VALUES = [12, 13, 14, 16, 18, 20, 22] as const;
export type AppearanceFontSize = (typeof APPEARANCE_FONT_SIZE_VALUES)[number];

export const LOCALES = {
  ZH_CN: 'zh-CN',
  EN: 'en',
} as const;

export const LOCALE_VALUES = Object.values(LOCALES);
export type AppLocale = (typeof LOCALE_VALUES)[number];

export const DEFAULT_IMAGE_FLOW_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
export type ImageFlowRatio = (typeof DEFAULT_IMAGE_FLOW_RATIOS)[number];

export const COMMON_VIDEO_DURATIONS = [3, 4, 5, 6, 8, 10] as const;
export type CommonVideoDuration = (typeof COMMON_VIDEO_DURATIONS)[number];

export const COMMON_VIDEO_RESOLUTIONS = ['720p', '1080p', '2K', '4K'] as const;
export type CommonVideoResolution = (typeof COMMON_VIDEO_RESOLUTIONS)[number];
