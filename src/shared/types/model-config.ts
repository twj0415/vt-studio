import type { ImageGenerationMode, ProjectImageQuality, ProjectVideoRatio, VideoGenerationMode } from '../constants/dictionaries';
import type { ModelAudioSupport, ReasoningEffort, TextReasoningCapability } from '../constants/model-capabilities';
import type { ModelCapabilityMatrixItem } from './model-capability';
import type { VendorModelType } from './vendor';

export type ModelCapability = VendorModelType;

export type ApiServiceType =
  | 'openai-official'
  | 'openai-gateway'
  | 'claude'
  | 'deepseek'
  | 'gemini'
  | 'minimax'
  | 'klingai'
  | 'local-workflow'
  | 'advanced';

export type ApiProtocolType =
  | 'openai-official'
  | 'openai-compatible'
  | 'anthropic'
  | 'deepseek'
  | 'gemini'
  | 'workflow'
  | 'custom-adapter';

export type ApiConnectionStatus = 'ready' | 'incomplete' | 'error';

export interface RegisteredModel {
  id: string;
  displayName: string;
  modelName: string;
  type: ModelCapability;
  think?: boolean;
  reasoning?: TextReasoningCapability;
  imageModes?: ImageGenerationMode[];
  videoModes?: VideoGenerationMode[];
  durationOptions?: number[];
  resolutionOptions?: string[];
  aspectRatioOptions?: string[];
  audioSupport?: ModelAudioSupport;
  voices?: Array<{
    title: string;
    voice: string;
  }>;
}

export interface ApiConnection {
  id: string;
  name: string;
  serviceType: ApiServiceType;
  protocolType: ApiProtocolType;
  baseUrl: string;
  apiKey: string;
  secretKey?: string;
  workflowManifest?: string;
  apiKeyConfigured?: boolean;
  apiKeyMasked?: string;
  secretKeyConfigured?: boolean;
  secretKeyMasked?: string;
  capabilities: ModelCapability[];
  models: RegisteredModel[];
  status: ApiConnectionStatus;
  statusText: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApiConnectionDraft {
  id?: string;
  name: string;
  serviceType: ApiServiceType;
  baseUrl: string;
  apiKey: string;
  secretKey?: string;
  workflowManifest?: string;
  capabilities: ModelCapability[];
  models: RegisteredModel[];
}

export interface CapabilityBindingTarget {
  connectionId: string;
  modelName: string;
}

export type CapabilityBindingMap = Partial<Record<ModelCapability, CapabilityBindingTarget>>;

export interface CapabilitySummary {
  capability: ModelCapability;
  label: string;
  binding: CapabilityBindingTarget | null;
  connectionName: string;
  modelDisplayName: string;
  modelName: string;
  status: 'configured' | 'missing' | 'unsupported';
  statusText: string;
}

export interface ApiConnectionListResult {
  connections: ApiConnection[];
}

export interface ApiConnectionSavePayload {
  connection: ApiConnectionDraft;
}

export interface ApiConnectionSaveResult {
  connection: ApiConnection;
}

export interface ApiConnectionDeletePayload {
  connectionId: string;
}

export interface ApiConnectionDeleteResult {
  connectionId: string;
}

export interface ApiConnectionTestPayload {
  connectionId: string;
  modelName: string;
  prompt: string;
  reasoningEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  imageMode?: ImageGenerationMode;
  imageSize?: ProjectImageQuality;
  aspectRatio?: string;
  videoMode?: string;
  duration?: number;
  resolution?: string;
  videoAspectRatio?: ProjectVideoRatio;
  audio?: boolean;
  referenceImages?: string[];
}

export interface ApiConnectionTestResult {
  content: string;
  thinking?: string;
  filePath?: string;
  durationMs: number;
}

export interface ModelTestFilePayload {
  filePath: string;
}

export interface ModelTestOpenFileResult {
  filePath: string;
}

export interface ModelTestSaveFileResult {
  sourcePath: string;
  savedPath: string | null;
}

export interface ResourceConfigResult {
  capabilities: CapabilitySummary[];
  bindings: CapabilityBindingMap;
  connections: ApiConnection[];
  capabilityMatrix: ModelCapabilityMatrixItem[];
}

export interface ResourceBindingSavePayload {
  capability: ModelCapability;
  binding: CapabilityBindingTarget | null;
}

export interface ResourceBindingSaveResult {
  bindings: CapabilityBindingMap;
}

export interface ResourceTestPayload {
  capability: ModelCapability;
  prompt: string;
  reasoningEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  imageMode?: ImageGenerationMode;
  imageSize?: ProjectImageQuality;
  aspectRatio?: string;
  videoMode?: string;
  duration?: number;
  resolution?: string;
  videoAspectRatio?: ProjectVideoRatio;
  audio?: boolean;
  referenceImages?: string[];
}

export type ResourceTestResult = ApiConnectionTestResult;
