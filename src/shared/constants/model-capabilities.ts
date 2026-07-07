import {
  IMAGE_GENERATION_MODES,
  IMAGE_GENERATION_MODE_VALUES,
  VIDEO_REFERENCE_MODE_PREFIX_VALUES,
  VIDEO_SIMPLE_MODES,
  VIDEO_SIMPLE_MODE_VALUES,
  type ImageGenerationMode,
  type VideoReferenceMode,
  type VideoReferenceModePrefix,
  type VideoSimpleMode,
} from './dictionaries';

export const MODEL_OUTPUT_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
} as const;

export const MODEL_OUTPUT_TYPE_VALUES = Object.values(MODEL_OUTPUT_TYPES);
export type ModelOutputType = (typeof MODEL_OUTPUT_TYPE_VALUES)[number];

export const MODEL_AUDIO_SUPPORTS = {
  NONE: 'none',
  OPTIONAL: 'optional',
  REQUIRED: 'required',
} as const;

export const MODEL_AUDIO_SUPPORT_VALUES = Object.values(MODEL_AUDIO_SUPPORTS);
export type ModelAudioSupport = (typeof MODEL_AUDIO_SUPPORT_VALUES)[number];

export const MODEL_PROMPT_TEMPLATE_TYPES = {
  NONE: 'none',
  IMAGE: 'imagePrompt',
  VIDEO: 'videoPrompt',
} as const;

export const MODEL_PROMPT_TEMPLATE_TYPE_VALUES = Object.values(MODEL_PROMPT_TEMPLATE_TYPES);
export type ModelPromptTemplateKind = (typeof MODEL_PROMPT_TEMPLATE_TYPE_VALUES)[number];

export const MODEL_REFERENCE_FILE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
} as const;

export const MODEL_REFERENCE_FILE_TYPE_VALUES = Object.values(MODEL_REFERENCE_FILE_TYPES);
export type ModelReferenceFileType = (typeof MODEL_REFERENCE_FILE_TYPE_VALUES)[number];

export const REASONING_EFFORTS = {
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  XHIGH: 'xhigh',
} as const;

export const REASONING_EFFORT_VALUES = Object.values(REASONING_EFFORTS);
export type ReasoningEffort = (typeof REASONING_EFFORT_VALUES)[number];

export interface TextReasoningCapability {
  supported: boolean;
  defaultEffort: ReasoningEffort;
  efforts: ReasoningEffort[];
}

export interface ModelReferenceLimits {
  text: number;
  image: number;
  video: number;
  audio: number;
  allowMore: boolean;
  startEnd: boolean;
  optionalEnd: boolean;
  optionalStart: boolean;
}

export interface ImageModePreset {
  value: ImageGenerationMode;
  referenceLimits: ModelReferenceLimits;
}

export interface VideoModePreset {
  value: string;
  mode: VideoSimpleMode | readonly VideoReferenceMode[];
  referenceLimits: ModelReferenceLimits;
}

const EMPTY_REFERENCE_LIMITS: ModelReferenceLimits = {
  text: 0,
  image: 0,
  video: 0,
  audio: 0,
  allowMore: false,
  startEnd: false,
  optionalEnd: false,
  optionalStart: false,
};

const NO_REASONING_CAPABILITY: TextReasoningCapability = {
  supported: false,
  defaultEffort: REASONING_EFFORTS.NONE,
  efforts: [REASONING_EFFORTS.NONE],
};

const OPENAI_REASONING_EFFORTS: ReasoningEffort[] = [
  REASONING_EFFORTS.NONE,
  REASONING_EFFORTS.LOW,
  REASONING_EFFORTS.MEDIUM,
  REASONING_EFFORTS.HIGH,
  REASONING_EFFORTS.XHIGH,
];

const STANDARD_REASONING_EFFORTS: ReasoningEffort[] = [
  REASONING_EFFORTS.NONE,
  REASONING_EFFORTS.LOW,
  REASONING_EFFORTS.MEDIUM,
  REASONING_EFFORTS.HIGH,
];

const HIGH_ONLY_REASONING_EFFORTS: ReasoningEffort[] = [
  REASONING_EFFORTS.NONE,
  REASONING_EFFORTS.HIGH,
  REASONING_EFFORTS.XHIGH,
];

export const IMAGE_MODE_PRESETS: readonly ImageModePreset[] = [
  {
    value: IMAGE_GENERATION_MODES.TEXT,
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS },
  },
  {
    value: IMAGE_GENERATION_MODES.SINGLE_IMAGE,
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, image: 1 },
  },
  {
    value: IMAGE_GENERATION_MODES.MULTI_REFERENCE,
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, image: 9, allowMore: true },
  },
] as const;

export const VIDEO_MODE_PRESETS: readonly VideoModePreset[] = [
  {
    value: VIDEO_SIMPLE_MODES.SINGLE_IMAGE,
    mode: VIDEO_SIMPLE_MODES.SINGLE_IMAGE,
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, image: 1 },
  },
  {
    value: VIDEO_SIMPLE_MODES.START_END_REQUIRED,
    mode: VIDEO_SIMPLE_MODES.START_END_REQUIRED,
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, image: 2, startEnd: true },
  },
  {
    value: VIDEO_SIMPLE_MODES.END_FRAME_OPTIONAL,
    mode: VIDEO_SIMPLE_MODES.END_FRAME_OPTIONAL,
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, image: 1, startEnd: true, optionalEnd: true },
  },
  {
    value: VIDEO_SIMPLE_MODES.START_FRAME_OPTIONAL,
    mode: VIDEO_SIMPLE_MODES.START_FRAME_OPTIONAL,
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, image: 1, startEnd: true, optionalStart: true },
  },
  {
    value: VIDEO_SIMPLE_MODES.TEXT,
    mode: VIDEO_SIMPLE_MODES.TEXT,
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS },
  },
  {
    value: 'imageReference:3',
    mode: ['imageReference:3'],
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, image: 3, allowMore: true },
  },
  {
    value: 'videoReference:1,imageReference:2',
    mode: ['videoReference:1', 'imageReference:2'],
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, video: 1, image: 2, allowMore: true },
  },
  {
    value: 'audioReference:1,imageReference:1',
    mode: ['audioReference:1', 'imageReference:1'],
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, audio: 1, image: 1, allowMore: true },
  },
  {
    value: 'textReference:1,imageReference:1',
    mode: ['textReference:1', 'imageReference:1'],
    referenceLimits: { ...EMPTY_REFERENCE_LIMITS, text: 1, image: 1, allowMore: true },
  },
] as const;

export const VIDEO_MODE_PRESET_VALUES = VIDEO_MODE_PRESETS.map((item) => item.value);
export type VideoModePresetValue = (typeof VIDEO_MODE_PRESET_VALUES)[number];

export function getEmptyReferenceLimits(): ModelReferenceLimits {
  return { ...EMPTY_REFERENCE_LIMITS };
}

export function normalizeReasoningEffort(value: unknown, fallback: ReasoningEffort = REASONING_EFFORTS.NONE): ReasoningEffort {
  return REASONING_EFFORT_VALUES.includes(value as ReasoningEffort) ? (value as ReasoningEffort) : fallback;
}

export function reasoningEffortToThinkLevel(effort: ReasoningEffort): 0 | 1 | 2 | 3 {
  if (effort === REASONING_EFFORTS.LOW) {
    return 1;
  }

  if (effort === REASONING_EFFORTS.MEDIUM) {
    return 2;
  }

  if (effort === REASONING_EFFORTS.HIGH || effort === REASONING_EFFORTS.XHIGH) {
    return 3;
  }

  return 0;
}

export function thinkLevelToReasoningEffort(level: 0 | 1 | 2 | 3 | undefined, fallback: ReasoningEffort = REASONING_EFFORTS.LOW): ReasoningEffort {
  if (level === 1) {
    return REASONING_EFFORTS.LOW;
  }

  if (level === 2) {
    return REASONING_EFFORTS.MEDIUM;
  }

  if (level === 3) {
    return REASONING_EFFORTS.HIGH;
  }

  return fallback;
}

function normalizeReasoningEfforts(efforts: unknown, fallback: ReasoningEffort[]): ReasoningEffort[] {
  const values = Array.isArray(efforts) ? efforts.map((item) => normalizeReasoningEffort(item, REASONING_EFFORTS.NONE)) : fallback;
  const unique = [...new Set([REASONING_EFFORTS.NONE, ...values])];
  return unique.length > 1 ? unique : [REASONING_EFFORTS.NONE];
}

function normalizeTextReasoningCapability(input: {
  modelName?: string;
  think?: boolean;
  serviceType?: string;
  protocolType?: string;
  provider?: string;
  reasoning?: Partial<TextReasoningCapability>;
}): TextReasoningCapability {
  if (!input.think) {
    return { ...NO_REASONING_CAPABILITY, efforts: [...NO_REASONING_CAPABILITY.efforts] };
  }

  const modelName = input.modelName?.toLowerCase() ?? '';
  const provider = input.provider?.toLowerCase() ?? '';
  const serviceType = input.serviceType?.toLowerCase() ?? '';
  const protocolType = input.protocolType?.toLowerCase() ?? '';

  let fallbackEfforts = STANDARD_REASONING_EFFORTS;
  if (/^(gpt-5|o[134])/.test(modelName) || provider.includes('openai') || protocolType.includes('openai')) {
    fallbackEfforts = OPENAI_REASONING_EFFORTS;
  } else if (modelName.includes('deepseek') || provider.includes('deepseek') || serviceType.includes('deepseek')) {
    fallbackEfforts = HIGH_ONLY_REASONING_EFFORTS;
  }

  const efforts = normalizeReasoningEfforts(input.reasoning?.efforts, fallbackEfforts);
  const requestedDefault = normalizeReasoningEffort(input.reasoning?.defaultEffort, REASONING_EFFORTS.NONE);
  const defaultEffort = efforts.includes(requestedDefault) ? requestedDefault : REASONING_EFFORTS.NONE;

  return {
    supported: efforts.some((effort) => effort !== REASONING_EFFORTS.NONE),
    defaultEffort,
    efforts,
  };
}

export function getTextReasoningCapability(input: {
  modelName?: string;
  think?: boolean;
  serviceType?: string;
  protocolType?: string;
  provider?: string;
  reasoning?: Partial<TextReasoningCapability>;
}): TextReasoningCapability {
  const capability = normalizeTextReasoningCapability(input);
  return {
    ...capability,
    efforts: [...capability.efforts],
  };
}

export function resolveSupportedReasoningEffort(capability: TextReasoningCapability, effort: ReasoningEffort): ReasoningEffort {
  if (!capability.supported) {
    return REASONING_EFFORTS.NONE;
  }

  if (capability.efforts.includes(effort)) {
    return effort;
  }

  if (capability.defaultEffort !== REASONING_EFFORTS.NONE && capability.efforts.includes(capability.defaultEffort)) {
    return capability.defaultEffort;
  }

  return capability.efforts.find((item) => item !== REASONING_EFFORTS.NONE) ?? REASONING_EFFORTS.NONE;
}

export function serializeImageMode(mode: string | null | undefined): string {
  return (mode ?? '').trim();
}

export function serializeVideoMode(mode: string | readonly string[] | null | undefined): string {
  if (typeof mode === 'string') {
    return mode.trim();
  }

  return mode?.map((item) => item.trim()).filter(Boolean).join(',') ?? '';
}

export function parseVideoModeKey(modeKey: string): VideoSimpleMode | VideoReferenceMode[] | string {
  const normalized = serializeVideoMode(modeKey);
  if (!normalized.includes(',')) {
    return normalized;
  }

  return normalized.split(',').map((item) => item.trim()).filter(Boolean) as VideoReferenceMode[];
}

export function getImageModeReferenceLimits(mode: string | null | undefined): ModelReferenceLimits {
  const key = serializeImageMode(mode);
  return { ...(IMAGE_MODE_PRESETS.find((item) => item.value === key)?.referenceLimits ?? EMPTY_REFERENCE_LIMITS) };
}

function parseReferenceToken(token: string): { type: ModelReferenceFileType; count: number } | null {
  const [rawType, rawCount] = token.split(':');
  const count = Math.max(1, Number(rawCount ?? 1) || 1);
  const prefix = rawType as VideoReferenceModePrefix;

  if (!VIDEO_REFERENCE_MODE_PREFIX_VALUES.includes(prefix)) {
    return null;
  }

  if (prefix === 'imageReference') {
    return { type: MODEL_REFERENCE_FILE_TYPES.IMAGE, count };
  }

  if (prefix === 'videoReference') {
    return { type: MODEL_REFERENCE_FILE_TYPES.VIDEO, count };
  }

  if (prefix === 'audioReference') {
    return { type: MODEL_REFERENCE_FILE_TYPES.AUDIO, count };
  }

  if (prefix === 'textReference') {
    return { type: MODEL_REFERENCE_FILE_TYPES.TEXT, count };
  }

  return null;
}

export function getVideoModeReferenceLimits(mode: string | readonly string[] | null | undefined): ModelReferenceLimits {
  const key = serializeVideoMode(mode);
  const preset = VIDEO_MODE_PRESETS.find((item) => item.value === key);
  if (preset) {
    return { ...preset.referenceLimits };
  }

  const parsed = Array.isArray(mode) ? mode : key ? key.split(',') : [];
  const limits = getEmptyReferenceLimits();
  limits.allowMore = parsed.length > 0;

  for (const token of parsed) {
    const reference = parseReferenceToken(token);
    if (!reference) {
      continue;
    }

    limits[reference.type] += reference.count;
  }

  return limits;
}

export function getVideoModeInputTypes(mode: string | readonly string[] | null | undefined): ModelReferenceFileType[] {
  const limits = getVideoModeReferenceLimits(mode);
  const inputTypes = new Set<ModelReferenceFileType>([MODEL_REFERENCE_FILE_TYPES.TEXT]);

  if (limits.image > 0) inputTypes.add(MODEL_REFERENCE_FILE_TYPES.IMAGE);
  if (limits.video > 0) inputTypes.add(MODEL_REFERENCE_FILE_TYPES.VIDEO);
  if (limits.audio > 0) inputTypes.add(MODEL_REFERENCE_FILE_TYPES.AUDIO);

  return [...inputTypes];
}

export function isKnownImageMode(mode: string): mode is ImageGenerationMode {
  return IMAGE_GENERATION_MODE_VALUES.includes(mode as ImageGenerationMode);
}

export function isKnownVideoMode(mode: string | readonly string[]): boolean {
  if (typeof mode === 'string' && VIDEO_SIMPLE_MODE_VALUES.includes(mode as VideoSimpleMode)) {
    return true;
  }

  if (typeof mode === 'string' && !mode.includes(',')) {
    return Boolean(parseReferenceToken(mode));
  }

  const tokens = typeof mode === 'string' ? mode.split(',').map((item) => item.trim()).filter(Boolean) : mode;
  return tokens.every((token) => Boolean(parseReferenceToken(token)));
}
