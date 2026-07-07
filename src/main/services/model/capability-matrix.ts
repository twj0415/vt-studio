import {
  COMMON_VIDEO_DURATIONS,
  COMMON_VIDEO_RESOLUTIONS,
  DEFAULT_IMAGE_FLOW_RATIOS,
  MODEL_CAPABILITIES,
  PROJECT_VIDEO_RATIO_VALUES,
  VIDEO_SIMPLE_MODES,
  type ImageGenerationMode,
  type ModelCapability,
  type VideoGenerationMode,
} from '@shared/constants/dictionaries';
import {
  getEmptyReferenceLimits,
  getImageModeReferenceLimits,
  getVideoModeInputTypes,
  getVideoModeReferenceLimits,
  isKnownImageMode,
  isKnownVideoMode,
  MODEL_AUDIO_SUPPORTS,
  MODEL_OUTPUT_TYPES,
  MODEL_PROMPT_TEMPLATE_TYPES,
  MODEL_REFERENCE_FILE_TYPES,
  getTextReasoningCapability,
  parseVideoModeKey,
  serializeImageMode,
  serializeVideoMode,
  type ModelAudioSupport,
} from '@shared/constants/model-capabilities';
import { VT_STATUS } from '@shared/constants/status';
import type { ModelCapabilityMatrixItem } from '@shared/types/model-capability';
import type { ApiConnection, RegisteredModel } from '@shared/types/model-config';
import { createError } from '../result';
import type { ImageModelConfig, TtsModelConfig, VendorModelConfig, VideoModelConfig } from './types';

const DEFAULT_IMAGE_MODES: ImageGenerationMode[] = ['text'];
const DEFAULT_VIDEO_MODES: VideoGenerationMode[] = [VIDEO_SIMPLE_MODES.TEXT];
const DEFAULT_IMAGE_ASPECT_RATIOS = [...DEFAULT_IMAGE_FLOW_RATIOS];
const DEFAULT_VIDEO_ASPECT_RATIOS = [...PROJECT_VIDEO_RATIO_VALUES];

function uniqueStrings(values: Array<string | null | undefined>, fallback: readonly string[]): string[] {
  const normalized = values.map((value) => value?.trim() ?? '').filter(Boolean);
  const unique = [...new Set(normalized)];
  return unique.length > 0 ? unique : [...fallback];
}

function uniqueNumbers(values: Array<number | null | undefined>, fallback: readonly number[]): number[] {
  const normalized = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const unique = [...new Set(normalized)];
  return unique.length > 0 ? unique : [...fallback];
}

function assertModelBase(model: RegisteredModel): { id: string; displayName: string; modelName: string; type: ModelCapability } {
  const id = model.id?.trim() || model.modelName?.trim();
  const modelName = model.modelName?.trim();
  const displayName = model.displayName?.trim() || modelName;

  if (!id || !modelName || !displayName) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模型 ID、名称和显示名称不能为空');
  }

  if (!Object.values(MODEL_CAPABILITIES).includes(model.type)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `不支持的模型能力：${model.type}`);
  }

  return { id, displayName, modelName, type: model.type };
}

function normalizeImageModes(modes: unknown): ImageGenerationMode[] {
  const source = Array.isArray(modes) ? modes : DEFAULT_IMAGE_MODES;
  const normalized = source.map((mode) => serializeImageMode(String(mode))).filter(Boolean);

  if (!normalized.every(isKnownImageMode)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '图片模型 mode 只能使用 text、singleImage、multiReference');
  }

  return [...new Set(normalized as ImageGenerationMode[])];
}

function normalizeVideoModes(modes: unknown): VideoGenerationMode[] {
  const source = Array.isArray(modes) ? modes : DEFAULT_VIDEO_MODES;
  const normalized = source
    .map((mode) => {
      if (Array.isArray(mode)) {
        return mode.map(String).map((item) => item.trim()).filter(Boolean);
      }

      return parseVideoModeKey(serializeVideoMode(String(mode)));
    })
    .filter((mode) => (Array.isArray(mode) ? mode.length > 0 : Boolean(mode))) as VideoGenerationMode[];

  if (!normalized.every((mode) => isKnownVideoMode(mode))) {
    throw createError(VT_STATUS.INVALID_PARAMS, '视频模型 mode 格式无效');
  }

  const seen = new Set<string>();
  return normalized.filter((mode) => {
    const key = serializeVideoMode(mode);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeAudioSupport(value: unknown): ModelAudioSupport {
  if (value === MODEL_AUDIO_SUPPORTS.REQUIRED || value === true) {
    return MODEL_AUDIO_SUPPORTS.REQUIRED;
  }

  if (value === MODEL_AUDIO_SUPPORTS.NONE || value === false) {
    return MODEL_AUDIO_SUPPORTS.NONE;
  }

  return MODEL_AUDIO_SUPPORTS.OPTIONAL;
}

function audioSupportToVendorAudio(value: ModelAudioSupport): VideoModelConfig['audio'] {
  if (value === MODEL_AUDIO_SUPPORTS.REQUIRED) {
    return true;
  }

  if (value === MODEL_AUDIO_SUPPORTS.NONE) {
    return false;
  }

  return 'optional';
}

export function normalizeRegisteredModel(model: RegisteredModel): RegisteredModel {
  const base = assertModelBase(model);

  if (base.type === MODEL_CAPABILITIES.TEXT) {
    const think = Boolean(model.think);
    return {
      ...base,
      type: MODEL_CAPABILITIES.TEXT,
      think,
      reasoning: getTextReasoningCapability({
        modelName: base.modelName,
        think,
        reasoning: model.reasoning,
      }),
    };
  }

  if (base.type === MODEL_CAPABILITIES.IMAGE) {
    return {
      ...base,
      type: MODEL_CAPABILITIES.IMAGE,
      imageModes: normalizeImageModes(model.imageModes),
      aspectRatioOptions: uniqueStrings(model.aspectRatioOptions ?? [], DEFAULT_IMAGE_ASPECT_RATIOS),
    };
  }

  if (base.type === MODEL_CAPABILITIES.VIDEO) {
    return {
      ...base,
      type: MODEL_CAPABILITIES.VIDEO,
      videoModes: normalizeVideoModes(model.videoModes),
      durationOptions: uniqueNumbers(model.durationOptions ?? [], COMMON_VIDEO_DURATIONS),
      resolutionOptions: uniqueStrings(model.resolutionOptions ?? [], COMMON_VIDEO_RESOLUTIONS),
      aspectRatioOptions: uniqueStrings(model.aspectRatioOptions ?? [], DEFAULT_VIDEO_ASPECT_RATIOS),
      audioSupport: normalizeAudioSupport(model.audioSupport),
    };
  }

  return {
    ...base,
    type: MODEL_CAPABILITIES.TTS,
    voices: model.voices?.length ? model.voices : [{ title: 'Default', voice: 'default' }],
  };
}

export function vendorModelToRegisteredModel(model: VendorModelConfig): RegisteredModel {
  if (model.type === MODEL_CAPABILITIES.TEXT) {
    return {
      id: model.modelName,
      displayName: model.name,
      modelName: model.modelName,
      type: MODEL_CAPABILITIES.TEXT,
      think: model.think,
      reasoning: model.reasoning,
    };
  }

  if (model.type === MODEL_CAPABILITIES.IMAGE) {
    return normalizeRegisteredModel({
      id: model.modelName,
      displayName: model.name,
      modelName: model.modelName,
      type: MODEL_CAPABILITIES.IMAGE,
      imageModes: model.mode,
    });
  }

  if (model.type === MODEL_CAPABILITIES.VIDEO) {
    return normalizeRegisteredModel({
      id: model.modelName,
      displayName: model.name,
      modelName: model.modelName,
      type: MODEL_CAPABILITIES.VIDEO,
      videoModes: model.mode,
      audioSupport: normalizeAudioSupport(model.audio),
      durationOptions: model.durationResolutionMap.flatMap((item) => item.duration),
      resolutionOptions: model.durationResolutionMap.flatMap((item) => item.resolution),
    });
  }

  return normalizeRegisteredModel({
    id: model.modelName,
    displayName: model.name,
    modelName: model.modelName,
    type: MODEL_CAPABILITIES.TTS,
    voices: model.voices,
  });
}

export function registeredModelToVendorModel(model: RegisteredModel): VendorModelConfig {
  const normalized = normalizeRegisteredModel(model);
  const base = {
    name: normalized.displayName,
    modelName: normalized.modelName,
  };

  if (normalized.type === MODEL_CAPABILITIES.TEXT) {
    return { ...base, type: 'text', think: Boolean(normalized.think), reasoning: normalized.reasoning };
  }

  if (normalized.type === MODEL_CAPABILITIES.IMAGE) {
    return {
      ...base,
      type: 'image',
      mode: normalized.imageModes ?? DEFAULT_IMAGE_MODES,
    } satisfies ImageModelConfig;
  }

  if (normalized.type === MODEL_CAPABILITIES.VIDEO) {
    return {
      ...base,
      type: 'video',
      mode: normalized.videoModes ?? DEFAULT_VIDEO_MODES,
      audio: audioSupportToVendorAudio(normalized.audioSupport ?? MODEL_AUDIO_SUPPORTS.OPTIONAL),
      durationResolutionMap: [
        {
          duration: normalized.durationOptions ?? [...COMMON_VIDEO_DURATIONS],
          resolution: normalized.resolutionOptions ?? [...COMMON_VIDEO_RESOLUTIONS],
        },
      ],
    } satisfies VideoModelConfig;
  }

  return {
    ...base,
    type: 'tts',
    voices: normalized.voices ?? [{ title: 'Default', voice: 'default' }],
  } satisfies TtsModelConfig;
}

export function getRegisteredModelModeKeys(model: RegisteredModel): string[] {
  const normalized = normalizeRegisteredModel(model);

  if (normalized.type === MODEL_CAPABILITIES.IMAGE) {
    return (normalized.imageModes ?? DEFAULT_IMAGE_MODES).map(serializeImageMode);
  }

  if (normalized.type === MODEL_CAPABILITIES.VIDEO) {
    return (normalized.videoModes ?? DEFAULT_VIDEO_MODES).map(serializeVideoMode);
  }

  return [''];
}

export function getDefaultRegisteredModelModeKey(model: RegisteredModel): string {
  return getRegisteredModelModeKeys(model)[0] ?? '';
}

export function assertVendorVideoModeSupported(model: VideoModelConfig, mode: string | readonly string[]): string {
  const modeKey = serializeVideoMode(mode);
  const supported = new Set(model.mode.map(serializeVideoMode));

  if (!supported.has(modeKey)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `视频模型 ${model.modelName} 不支持模式：${modeKey || 'default'}`);
  }

  return modeKey;
}

function matrixBase(connection: ApiConnection, model: RegisteredModel): Omit<ModelCapabilityMatrixItem, 'modeKey' | 'mode' | 'inputTypes' | 'outputType' | 'durationOptions' | 'resolutionOptions' | 'aspectRatioOptions' | 'audioSupport' | 'referenceLimits' | 'promptTemplateType'> {
  return {
    connectionId: connection.id,
    connectionName: connection.name,
    modelId: `${connection.id}:${model.modelName}`,
    modelName: model.modelName,
    modelDisplayName: model.displayName,
    modelType: model.type,
    status: connection.status,
    statusText: connection.statusText,
  };
}

export function buildCapabilityMatrixForConnections(connections: ApiConnection[]): ModelCapabilityMatrixItem[] {
  const matrix: ModelCapabilityMatrixItem[] = [];

  for (const connection of connections) {
    for (const rawModel of connection.models) {
      const model = normalizeRegisteredModel(rawModel);
      const base = matrixBase(connection, model);

      if (model.type === MODEL_CAPABILITIES.TEXT) {
        matrix.push({
          ...base,
          modeKey: '',
          mode: '',
          inputTypes: [MODEL_REFERENCE_FILE_TYPES.TEXT],
          outputType: MODEL_OUTPUT_TYPES.TEXT,
          durationOptions: [],
          resolutionOptions: [],
          aspectRatioOptions: [],
          audioSupport: MODEL_AUDIO_SUPPORTS.NONE,
          referenceLimits: getEmptyReferenceLimits(),
          promptTemplateType: MODEL_PROMPT_TEMPLATE_TYPES.NONE,
        });
      }

      if (model.type === MODEL_CAPABILITIES.IMAGE) {
        for (const mode of model.imageModes ?? DEFAULT_IMAGE_MODES) {
          const limits = getImageModeReferenceLimits(mode);
          matrix.push({
            ...base,
            modeKey: serializeImageMode(mode),
            mode,
            inputTypes: limits.image > 0 ? [MODEL_REFERENCE_FILE_TYPES.TEXT, MODEL_REFERENCE_FILE_TYPES.IMAGE] : [MODEL_REFERENCE_FILE_TYPES.TEXT],
            outputType: MODEL_OUTPUT_TYPES.IMAGE,
            durationOptions: [],
            resolutionOptions: [],
            aspectRatioOptions: model.aspectRatioOptions ?? DEFAULT_IMAGE_ASPECT_RATIOS,
            audioSupport: MODEL_AUDIO_SUPPORTS.NONE,
            referenceLimits: limits,
            promptTemplateType: MODEL_PROMPT_TEMPLATE_TYPES.IMAGE,
          });
        }
      }

      if (model.type === MODEL_CAPABILITIES.VIDEO) {
        for (const mode of model.videoModes ?? DEFAULT_VIDEO_MODES) {
          matrix.push({
            ...base,
            modeKey: serializeVideoMode(mode),
            mode,
            inputTypes: getVideoModeInputTypes(mode),
            outputType: MODEL_OUTPUT_TYPES.VIDEO,
            durationOptions: model.durationOptions ?? [...COMMON_VIDEO_DURATIONS],
            resolutionOptions: model.resolutionOptions ?? [...COMMON_VIDEO_RESOLUTIONS],
            aspectRatioOptions: model.aspectRatioOptions ?? DEFAULT_VIDEO_ASPECT_RATIOS,
            audioSupport: model.audioSupport ?? MODEL_AUDIO_SUPPORTS.OPTIONAL,
            referenceLimits: getVideoModeReferenceLimits(mode),
            promptTemplateType: MODEL_PROMPT_TEMPLATE_TYPES.VIDEO,
          });
        }
      }

      if (model.type === MODEL_CAPABILITIES.TTS) {
        matrix.push({
          ...base,
          modeKey: '',
          mode: '',
          inputTypes: [MODEL_REFERENCE_FILE_TYPES.TEXT],
          outputType: MODEL_OUTPUT_TYPES.AUDIO,
          durationOptions: [],
          resolutionOptions: [],
          aspectRatioOptions: [],
          audioSupport: MODEL_AUDIO_SUPPORTS.NONE,
          referenceLimits: getEmptyReferenceLimits(),
          promptTemplateType: MODEL_PROMPT_TEMPLATE_TYPES.NONE,
        });
      }
    }
  }

  return matrix;
}
