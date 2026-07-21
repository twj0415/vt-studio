import type { generateText, streamText } from 'ai';
import type { AgentModelKey, ModelType } from './constants';
import type {
  ImageGenerationMode,
  ProjectImageQuality,
  ProjectVideoRatio,
  VendorInputType,
  VideoGenerationMode,
  VideoReferenceMode,
  VideoSimpleMode,
} from '@shared/constants/dictionaries';
import type { ReasoningEffort, TextReasoningCapability } from '@shared/constants/model-capabilities';
import type { ModelOperationCapability } from '@shared/types/model-capability';

export type ImageMode = ImageGenerationMode;
export type VideoMode = VideoGenerationMode;
export type { VendorInputType, VideoReferenceMode, VideoSimpleMode };

export interface VendorInput {
  key: string;
  label: string;
  type: VendorInputType;
  required: boolean;
  placeholder?: string;
}

export interface TextModelConfig {
  name: string;
  modelName: string;
  type: 'text';
  think: boolean;
  reasoning?: TextReasoningCapability;
  operations?: ModelOperationCapability[];
}

export interface ImageModelConfig {
  name: string;
  modelName: string;
  type: 'image';
  mode: ImageMode[];
  associationSkills?: string;
  operations?: ModelOperationCapability[];
}

export interface VideoModelConfig {
  name: string;
  modelName: string;
  type: 'video';
  mode: VideoMode[];
  associationSkills?: string;
  audio: 'optional' | boolean;
  durationResolutionMap: Array<{
    duration: number[];
    resolution: string[];
  }>;
  operations?: ModelOperationCapability[];
}

export interface TtsModelConfig {
  name: string;
  modelName: string;
  type: 'tts';
  voices: Array<{
    title: string;
    voice: string;
  }>;
  operations?: ModelOperationCapability[];
}

export type VendorModelConfig = TextModelConfig | ImageModelConfig | VideoModelConfig | TtsModelConfig;

export interface VendorManifest {
  id: string;
  author: string;
  description?: string;
  name: string;
  icon?: string;
  inputs: VendorInput[];
  inputValues: Record<string, string>;
  models: VendorModelConfig[];
  version?: string;
}

export interface VendorRecord {
  id: string;
  inputValues: Record<string, string>;
  models: VendorModelConfig[];
  enabled: boolean;
  code: string;
  codeReady: boolean;
  builtin: boolean;
  manifest: VendorManifest;
}

export interface VendorRuntime {
  vendor?: VendorManifest;
  textRequest?: (model: TextModelConfig, think: boolean, thinkLevel: 0 | 1 | 2 | 3, reasoningEffort?: ReasoningEffort) => unknown;
  imageRequest?: (config: ImageGenerateInput, model: ImageModelConfig) => Promise<string>;
  videoRequest?: (config: VideoGenerateInput, model: VideoModelConfig) => Promise<string>;
  ttsRequest?: (config: TtsGenerateInput, model: TtsModelConfig) => Promise<string>;
}

export interface EnabledModelItem {
  vendorId: string;
  vendorName: string;
  label: string;
  value: string;
  modelId: string;
  type: Exclude<ModelType, 'all'>;
}

export interface AgentModelConfig {
  id: number;
  key: string;
  name: string | null;
  description: string | null;
  modelLabel: string | null;
  modelId: string | null;
  vendorId: string | null;
  temperature: number | null;
  maxOutputTokens: number | null;
  disabled: boolean;
}

export interface ResolvedModelKey {
  inputKey: string;
  modelId: string;
  agentConfig: AgentModelConfig | null;
}

export type ReferenceItem =
  | { type: 'image'; sourceType: 'base64'; base64: string }
  | { type: 'audio'; sourceType: 'base64'; base64: string }
  | { type: 'video'; sourceType: 'base64'; base64: string };

export interface ImageGenerateInput {
  requestId?: string;
  prompt: string;
  referenceList?: Extract<ReferenceItem, { type: 'image' }>[];
  size?: '1K' | '2K' | '3K' | '4K';
  aspectRatio?: `${number}:${number}`;
  task?: ModelTaskOptions;
}

export interface VideoGenerateInput {
  requestId?: string;
  duration: number;
  resolution: string;
  aspectRatio?: '16:9' | '9:16';
  prompt: string;
  referenceList?: ReferenceItem[];
  audio?: boolean;
  mode: VideoMode[] | VideoMode | string;
  task?: ModelTaskOptions;
}

export interface TtsGenerateInput {
  requestId?: string;
  text?: string;
  voice?: string;
  speechRate?: number;
  pitchRate?: number;
  volume?: number;
  referenceList?: ReferenceItem[];
  task?: ModelTaskOptions;
  [key: string]: unknown;
}

export type AudioGenerateInput = TtsGenerateInput;

export interface ModelTaskOptions {
  taskId?: number;
  projectId: number;
  category: string;
  description: string;
  relatedObjects: unknown;
  timeoutMs?: number;
  retry?: ModelCallRetryOptions | false;
  isCancelled?: () => boolean;
}

export type TextInvokeInput = Omit<Parameters<typeof generateText>[0], 'model'> & {
  requestId?: string;
  modelKey: AgentModelKey | string;
  think?: boolean;
  thinkLevel?: 0 | 1 | 2 | 3;
  reasoningEffort?: ReasoningEffort;
};

export type TextStreamInput = Omit<Parameters<typeof streamText>[0], 'model'> & {
  requestId?: string;
  modelKey: AgentModelKey | string;
  think?: boolean;
  thinkLevel?: 0 | 1 | 2 | 3;
  reasoningEffort?: ReasoningEffort;
};

export interface ModelTestTextInput {
  vendorId: string;
  modelName: string;
  messages: TextInvokeInput['messages'];
  think?: boolean;
  reasoningEffort?: ReasoningEffort;
}

export interface ModelTestImageInput {
  vendorId: string;
  modelName: string;
  prompt: string;
  imageMode?: ImageGenerationMode;
  imageSize?: ProjectImageQuality;
  aspectRatio?: string;
  referenceImages?: string[];
  imageBase64?: string;
}

export interface ModelTestVideoInput {
  vendorId: string;
  modelName: string;
  mode: string | VideoMode | VideoMode[];
  prompt: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: ProjectVideoRatio;
  audio?: boolean;
  referenceImages?: string[];
  images: ReferenceItem[];
  videos: ReferenceItem[];
  audios: ReferenceItem[];
}

export interface ModelCallRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffFactor?: number;
}
