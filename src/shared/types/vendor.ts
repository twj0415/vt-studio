import type {
  ImageGenerationMode,
  ModelCapability,
  ProjectImageQuality,
  ProjectVideoRatio,
  VendorCapability,
  VendorInputType,
  VideoGenerationMode,
} from '../constants/dictionaries';
import type { ReasoningEffort, TextReasoningCapability } from '../constants/model-capabilities';

export type VendorModelType = ModelCapability;
export type { VendorCapability, VendorInputType };

export interface VendorInputDefinition {
  key: string;
  label: string;
  type: VendorInputType;
  required: boolean;
  placeholder?: string;
}

export interface VendorTextModel {
  name: string;
  modelName: string;
  type: 'text';
  think: boolean;
  reasoning?: TextReasoningCapability;
}

export interface VendorImageModel {
  name: string;
  modelName: string;
  type: 'image';
  mode: ImageGenerationMode[];
  associationSkills?: string;
}

export interface VendorVideoModel {
  name: string;
  modelName: string;
  type: 'video';
  mode: VideoGenerationMode[];
  associationSkills?: string;
  audio: 'optional' | boolean;
  durationResolutionMap: Array<{
    duration: number[];
    resolution: string[];
  }>;
}

export interface VendorTtsModel {
  name: string;
  modelName: string;
  type: 'tts';
  voices: Array<{
    title: string;
    voice: string;
  }>;
}

export type VendorModel = VendorTextModel | VendorImageModel | VendorVideoModel | VendorTtsModel;

export interface VendorListItem {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  author: string;
  version?: string;
  enabled: boolean;
  builtin: boolean;
  managedBy: 'model-service' | null;
  readOnly: boolean;
  codeEditable: boolean;
  codeReady: boolean;
  status: 'ready' | 'missing-code' | 'invalid';
  statusText: string;
  adapterMd5: string | null;
  adapterUpdatedAt: number;
  lastError: string | null;
  capabilities: VendorCapability[];
  inputs: VendorInputDefinition[];
  inputValues: Record<string, string>;
  inputConfigured?: Record<string, boolean>;
  inputMasked?: Record<string, string>;
  models: VendorModel[];
}

export interface VendorListResult {
  vendors: VendorListItem[];
}

export interface VendorUpdateInputsPayload {
  vendorId: string;
  inputValues: Record<string, string>;
}

export interface VendorSetEnabledPayload {
  vendorId: string;
  enabled: boolean;
}

export interface VendorModelPayload {
  vendorId: string;
  model: VendorModel;
  originalModelName?: string;
}

export interface VendorDeleteModelPayload {
  vendorId: string;
  modelName: string;
}

export interface VendorDeletePayload {
  vendorId: string;
}

export interface VendorCodePayload {
  vendorId: string;
  code: string;
}

export interface VendorAddCodePayload {
  code: string;
}

export interface VendorCodeResult {
  vendorId: string;
  code: string;
  editable: boolean;
}

export interface VendorAddCodeResult {
  vendorId: string;
}

export interface VendorUpdateCodeResult {
  vendorId: string;
}

export interface VendorDeleteResult {
  vendorId: string;
}

export interface VendorDeleteModelResult {
  vendorId: string;
  modelName: string;
}

export interface VendorModelSaveResult {
  vendorId: string;
  modelName: string;
}

export interface VendorSetEnabledResult {
  vendorId: string;
  enabled: boolean;
}

export interface VendorUpdateInputsResult {
  vendorId: string;
}

export interface VendorTestTextPayload {
  vendorId: string;
  modelName: string;
  prompt: string;
  reasoningEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
}

export interface VendorTestTextResult {
  content: string;
  thinking?: string;
  durationMs: number;
}

export interface VendorTestImagePayload {
  vendorId: string;
  modelName: string;
  prompt: string;
  imageMode?: ImageGenerationMode;
  imageSize?: ProjectImageQuality;
  aspectRatio?: string;
  referenceImages?: string[];
  imageBase64?: string;
}

export interface VendorTestMediaResult {
  content: string;
  filePath: string;
  durationMs: number;
}

export interface VendorTestVideoPayload {
  vendorId: string;
  modelName: string;
  mode: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: ProjectVideoRatio;
  audio?: boolean;
  referenceImages?: string[];
}
