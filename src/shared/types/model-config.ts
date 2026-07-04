import type { ImageGenerationMode, VideoGenerationMode } from '../constants/dictionaries';
import type { ModelAudioSupport } from '../constants/model-capabilities';
import type { ModelCapabilityMatrixItem } from './model-capability';
import type { VendorModelType } from './vendor';

export type ModelCapability = VendorModelType;

export type ApiServiceType =
  | 'openai-official'
  | 'openai-gateway'
  | 'claude'
  | 'deepseek'
  | 'gemini'
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
  workflowManifest?: string;
  apiKeyConfigured?: boolean;
  apiKeyMasked?: string;
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
}

export interface ApiConnectionTestResult {
  content: string;
  thinking?: string;
  filePath?: string;
  durationMs: number;
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
}

export type ResourceTestResult = ApiConnectionTestResult;
