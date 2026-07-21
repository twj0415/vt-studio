import type { ImageGenerationMode, ModelCapability, VideoGenerationMode } from '../constants/dictionaries';
import type {
  ModelAudioSupport,
  ModelOutputType,
  ModelPromptTemplateKind,
  ModelReferenceFileType,
  ModelReferenceLimits,
} from '../constants/model-capabilities';

export type ModelCapabilityVerificationStatus = 'verified' | 'provider-reported' | 'unverified';
export type ModelAdapterSupportStatus = 'supported' | 'partial' | 'unsupported';

export interface ModelCapabilitySource {
  status: ModelCapabilityVerificationStatus;
  provider: string;
  documentUrl?: string;
  verifiedAt?: string;
  adapterStatus: ModelAdapterSupportStatus;
  note?: string;
}

export interface ModelReferenceConstraint {
  type: ModelReferenceFileType;
  min: number;
  max: number;
  roles?: string[];
}

export interface ModelParameterCombination {
  durationOptions?: number[];
  resolutionOptions?: string[];
  aspectRatioOptions?: string[];
  sizeOptions?: string[];
  qualityOptions?: string[];
}

export type ModelParameterValue = string | number | boolean;
export type ModelParameterControl = 'select' | 'boolean' | 'number' | 'text';

export interface ModelParameterOption {
  label: string;
  value: ModelParameterValue;
}

export interface ModelParameterDefinition {
  key: string;
  label: string;
  control: ModelParameterControl;
  required: boolean;
  options?: ModelParameterOption[];
  minimum?: number;
  maximum?: number;
  step?: number;
  defaultValue?: ModelParameterValue;
  description?: string;
}

export interface ModelOperationCapability {
  operationId: string;
  modeKey: string;
  inputTypes: ModelReferenceFileType[];
  outputType: ModelOutputType;
  referenceConstraints: ModelReferenceConstraint[];
  minimumTotalReferences?: number;
  maximumTotalReferences?: number;
  parameterCombinations: ModelParameterCombination[];
  parameters?: ModelParameterDefinition[];
  audioSupport: ModelAudioSupport;
  features?: string[];
  source: ModelCapabilitySource;
  enabled?: boolean;
}

export interface ModelCapabilityMatrixItem {
  connectionId: string;
  connectionName: string;
  modelId: string;
  modelName: string;
  modelDisplayName: string;
  modelType: ModelCapability;
  modeKey: string;
  mode: ImageGenerationMode | VideoGenerationMode | '';
  operationId: string;
  inputTypes: ModelReferenceFileType[];
  outputType: ModelOutputType;
  durationOptions: number[];
  resolutionOptions: string[];
  aspectRatioOptions: string[];
  parameterCombinations: ModelParameterCombination[];
  parameters: ModelParameterDefinition[];
  audioSupport: ModelAudioSupport;
  referenceLimits: ModelReferenceLimits;
  referenceConstraints: ModelReferenceConstraint[];
  minimumTotalReferences: number;
  maximumTotalReferences: number | null;
  features: string[];
  source: ModelCapabilitySource;
  promptTemplateType: ModelPromptTemplateKind;
  status: 'ready' | 'incomplete' | 'error';
  statusText: string;
}
