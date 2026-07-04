import type { ImageGenerationMode, ModelCapability, VideoGenerationMode } from '../constants/dictionaries';
import type {
  ModelAudioSupport,
  ModelOutputType,
  ModelPromptTemplateKind,
  ModelReferenceFileType,
  ModelReferenceLimits,
} from '../constants/model-capabilities';

export interface ModelCapabilityMatrixItem {
  connectionId: string;
  connectionName: string;
  modelId: string;
  modelName: string;
  modelDisplayName: string;
  modelType: ModelCapability;
  modeKey: string;
  mode: ImageGenerationMode | VideoGenerationMode | '';
  inputTypes: ModelReferenceFileType[];
  outputType: ModelOutputType;
  durationOptions: number[];
  resolutionOptions: string[];
  aspectRatioOptions: string[];
  audioSupport: ModelAudioSupport;
  referenceLimits: ModelReferenceLimits;
  promptTemplateType: ModelPromptTemplateKind;
  status: 'ready' | 'incomplete' | 'error';
  statusText: string;
}
