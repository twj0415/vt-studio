import {
  MODEL_CAPABILITIES,
  type ImageGenerationMode,
  type ModelCapability,
  type VideoGenerationMode,
} from '@shared/constants/dictionaries';
import {
  getEmptyReferenceLimits,
  getImageModeReferenceLimits,
  getVideoModeReferenceLimits,
  isKnownImageMode,
  isKnownVideoMode,
  MODEL_AUDIO_SUPPORTS,
  MODEL_OUTPUT_TYPE_VALUES,
  MODEL_PROMPT_TEMPLATE_TYPES,
  MODEL_REFERENCE_FILE_TYPES,
  getTextReasoningCapability,
  parseVideoModeKey,
  serializeImageMode,
  serializeVideoMode,
  type ModelAudioSupport,
  type ModelReferenceLimits,
} from '@shared/constants/model-capabilities';
import { VT_STATUS } from '@shared/constants/status';
import type {
  ModelCapabilityMatrixItem,
  ModelCapabilitySource,
  ModelOperationCapability,
  ModelParameterCombination,
  ModelParameterDefinition,
  ModelReferenceConstraint,
} from '@shared/types/model-capability';
import type { ApiConnection, RegisteredModel } from '@shared/types/model-config';
import { createError } from '../result';
import { getCatalogOperations } from './capability-catalog';
import type { ImageModelConfig, TtsModelConfig, VendorModelConfig, VideoModelConfig } from './types';

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

function normalizeDurationResolutionMap(
  value: RegisteredModel['durationResolutionMap'],
): NonNullable<RegisteredModel['durationResolutionMap']> {
  const normalized = (value ?? []).map((item) => ({
    duration: uniqueNumbers(item.duration ?? [], []),
    resolution: uniqueStrings(item.resolution ?? [], []),
  })).filter((item) => item.duration.length > 0 && item.resolution.length > 0);
  return normalized;
}

function normalizeReferenceConstraints(value: unknown): ModelReferenceConstraint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ModelReferenceConstraint[] => {
    if (!item || typeof item !== 'object') return [];
    const input = item as Partial<ModelReferenceConstraint>;
    if (!MODEL_REFERENCE_FILE_TYPES || !Object.values(MODEL_REFERENCE_FILE_TYPES).includes(input.type as never)) return [];
    const min = Math.max(0, Math.floor(Number(input.min) || 0));
    const max = Math.max(min, Math.floor(Number(input.max) || 0));
    if (max === 0) return [];
    return [{
      type: input.type!,
      min,
      max,
      ...(Array.isArray(input.roles) ? { roles: uniqueStrings(input.roles.map(String), []) } : {}),
    }];
  });
}

function normalizeParameterCombinations(value: unknown): ModelParameterCombination[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ModelParameterCombination[] => {
    if (!item || typeof item !== 'object') return [];
    const input = item as ModelParameterCombination;
    const combination: ModelParameterCombination = {
      ...(input.durationOptions ? { durationOptions: uniqueNumbers(input.durationOptions, []) } : {}),
      ...(input.resolutionOptions ? { resolutionOptions: uniqueStrings(input.resolutionOptions, []) } : {}),
      ...(input.aspectRatioOptions ? { aspectRatioOptions: uniqueStrings(input.aspectRatioOptions, []) } : {}),
      ...(input.sizeOptions ? { sizeOptions: uniqueStrings(input.sizeOptions, []) } : {}),
      ...(input.qualityOptions ? { qualityOptions: uniqueStrings(input.qualityOptions, []) } : {}),
    };
    return Object.keys(combination).length > 0 ? [combination] : [];
  });
}

function normalizeParameterDefinitions(value: unknown): ModelParameterDefinition[] {
  if (!Array.isArray(value)) return [];
  const controls = new Set<ModelParameterDefinition['control']>(['select', 'boolean', 'number', 'text']);
  return value.flatMap((item): ModelParameterDefinition[] => {
    if (!item || typeof item !== 'object') return [];
    const input = item as Partial<ModelParameterDefinition>;
    const key = input.key?.trim();
    const label = input.label?.trim();
    if (!key || !label || !controls.has(input.control as ModelParameterDefinition['control'])) return [];
    return [{
      key,
      label,
      control: input.control!,
      required: input.required === true,
      ...(Array.isArray(input.options) ? { options: input.options.filter((option) => option && typeof option.label === 'string') } : {}),
      ...(Number.isFinite(input.minimum) ? { minimum: Number(input.minimum) } : {}),
      ...(Number.isFinite(input.maximum) ? { maximum: Number(input.maximum) } : {}),
      ...(Number.isFinite(input.step) ? { step: Number(input.step) } : {}),
      ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    }];
  });
}

function normalizeOperations(value: unknown): ModelOperationCapability[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ModelOperationCapability[] => {
    if (!item || typeof item !== 'object') return [];
    const input = item as Partial<ModelOperationCapability>;
    const operationId = input.operationId?.trim();
    const modeKey = input.modeKey?.trim() ?? '';
    if (!operationId || !MODEL_OUTPUT_TYPE_VALUES.includes(input.outputType as never)) return [];
    const referenceConstraints = normalizeReferenceConstraints(input.referenceConstraints);
    const inputTypes = uniqueStrings((input.inputTypes ?? []).map(String), [MODEL_REFERENCE_FILE_TYPES.TEXT])
      .filter((type): type is ModelReferenceConstraint['type'] => Object.values(MODEL_REFERENCE_FILE_TYPES).includes(type as never));
    if (!input.source?.provider || !input.source.status || !input.source.adapterStatus) return [];
    const source: ModelCapabilitySource = {
      status: input.source.status,
      provider: input.source.provider,
      documentUrl: input.source.documentUrl,
      verifiedAt: input.source.verifiedAt,
      adapterStatus: input.source.adapterStatus,
      note: input.source.note,
    };
    return [{
      operationId,
      modeKey,
      inputTypes,
      outputType: input.outputType!,
      referenceConstraints,
      minimumTotalReferences: Math.max(0, Math.floor(Number(input.minimumTotalReferences) || 0)),
      maximumTotalReferences: input.maximumTotalReferences === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(input.maximumTotalReferences) || 0)),
      parameterCombinations: normalizeParameterCombinations(input.parameterCombinations),
      parameters: normalizeParameterDefinitions(input.parameters),
      audioSupport: normalizeAudioSupport(input.audioSupport),
      features: uniqueStrings((input.features ?? []).map(String), []),
      source,
      enabled: input.enabled !== false,
    }];
  });
}

function referenceLimitsFromConstraints(
  constraints: ModelReferenceConstraint[],
  minimumTotal: number,
  maximumTotal: number | null | undefined,
  fallback: ModelReferenceLimits,
): ModelReferenceLimits {
  if (constraints.length === 0) return fallback;
  const limits = getEmptyReferenceLimits();
  for (const constraint of constraints) {
    limits[constraint.type] = constraint.min;
    limits.maximum[constraint.type] = constraint.max;
  }
  limits.minimumTotal = minimumTotal;
  limits.maximumTotal = maximumTotal === undefined
    ? constraints.reduce((total, item) => total + item.max, 0)
    : maximumTotal;
  limits.allowMore = constraints.some((item) => item.max > item.min);
  return limits;
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
  const source = Array.isArray(modes) ? modes : [];
  const normalized = source.map((mode) => serializeImageMode(String(mode))).filter(Boolean);

  if (!normalized.every(isKnownImageMode)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '图片模型 mode 只能使用 text、singleImage、multiReference');
  }

  return [...new Set(normalized as ImageGenerationMode[])];
}

function normalizeVideoModes(modes: unknown): VideoGenerationMode[] {
  const source = Array.isArray(modes) ? modes : [];
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
      operations: normalizeOperations(model.operations),
    };
  }

  if (base.type === MODEL_CAPABILITIES.IMAGE) {
    return {
      ...base,
      type: MODEL_CAPABILITIES.IMAGE,
      imageModes: normalizeImageModes(model.imageModes),
      aspectRatioOptions: uniqueStrings(model.aspectRatioOptions ?? [], []),
      operations: normalizeOperations(model.operations),
    };
  }

  if (base.type === MODEL_CAPABILITIES.VIDEO) {
    const durationResolutionMap = normalizeDurationResolutionMap(model.durationResolutionMap);
    return {
      ...base,
      type: MODEL_CAPABILITIES.VIDEO,
      videoModes: normalizeVideoModes(model.videoModes),
      durationOptions: uniqueNumbers([
        ...(model.durationOptions ?? []),
        ...durationResolutionMap.flatMap((item) => item.duration),
      ], []),
      resolutionOptions: uniqueStrings([
        ...(model.resolutionOptions ?? []),
        ...durationResolutionMap.flatMap((item) => item.resolution),
      ], []),
      durationResolutionMap,
      aspectRatioOptions: uniqueStrings(model.aspectRatioOptions ?? [], []),
      audioSupport: normalizeAudioSupport(model.audioSupport),
      operations: normalizeOperations(model.operations),
    };
  }

  return {
    ...base,
    type: MODEL_CAPABILITIES.TTS,
    voices: model.voices?.length ? model.voices : [{ title: 'Default', voice: 'default' }],
    operations: normalizeOperations(model.operations),
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
      durationResolutionMap: model.durationResolutionMap,
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
      mode: normalized.imageModes ?? [],
    } satisfies ImageModelConfig;
  }

  if (normalized.type === MODEL_CAPABILITIES.VIDEO) {
    return {
      ...base,
      type: 'video',
      mode: normalized.videoModes ?? [],
      audio: audioSupportToVendorAudio(normalized.audioSupport ?? MODEL_AUDIO_SUPPORTS.OPTIONAL),
      durationResolutionMap: normalized.durationResolutionMap ?? [],
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
    return (normalized.imageModes ?? []).map(serializeImageMode);
  }

  if (normalized.type === MODEL_CAPABILITIES.VIDEO) {
    return (normalized.videoModes ?? []).map(serializeVideoMode);
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

type MatrixBase = Pick<
  ModelCapabilityMatrixItem,
  'connectionId' | 'connectionName' | 'modelId' | 'modelName' | 'modelDisplayName' | 'modelType' | 'status' | 'statusText'
>;

function matrixBase(connection: ApiConnection, model: RegisteredModel): MatrixBase {
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

function createMatrixItem(input: {
  base: MatrixBase;
  modeKey: string;
  mode: ModelCapabilityMatrixItem['mode'];
  operation: ModelOperationCapability;
  referenceLimits: ModelReferenceLimits;
  promptTemplateType: ModelCapabilityMatrixItem['promptTemplateType'];
}): ModelCapabilityMatrixItem {
  const operation = input.operation;
  const referenceConstraints = operation.referenceConstraints;
  const minimumTotalReferences = operation.minimumTotalReferences ?? input.referenceLimits.minimumTotal;
  const maximumTotalReferences = operation.maximumTotalReferences ?? input.referenceLimits.maximumTotal;
  const parameterCombinations = operation.parameterCombinations;
  const referenceLimits = referenceLimitsFromConstraints(
    referenceConstraints,
    minimumTotalReferences,
    maximumTotalReferences,
    input.referenceLimits,
  );

  return {
    ...input.base,
    modeKey: input.modeKey,
    mode: input.mode,
    operationId: operation.operationId,
    inputTypes: operation.inputTypes,
    outputType: operation.outputType,
    durationOptions: uniqueNumbers(parameterCombinations.flatMap((item) => item.durationOptions ?? []), []),
    resolutionOptions: uniqueStrings(parameterCombinations.flatMap((item) => item.resolutionOptions ?? []), []),
    aspectRatioOptions: uniqueStrings(parameterCombinations.flatMap((item) => item.aspectRatioOptions ?? []), []),
    parameterCombinations,
    parameters: operation.parameters ?? [],
    audioSupport: operation.audioSupport,
    referenceLimits,
    referenceConstraints,
    minimumTotalReferences,
    maximumTotalReferences,
    features: operation.features ?? [],
    source: operation.source,
    promptTemplateType: input.promptTemplateType,
  };
}

function operationsForModel(connection: ApiConnection, model: RegisteredModel): ModelOperationCapability[] {
  const catalog = getCatalogOperations(connection, model);
  return catalog.length > 0 ? catalog : model.operations ?? [];
}

export function buildCapabilityMatrixForConnections(connections: ApiConnection[]): ModelCapabilityMatrixItem[] {
  const matrix: ModelCapabilityMatrixItem[] = [];

  for (const connection of connections) {
    for (const rawModel of connection.models) {
      const model = normalizeRegisteredModel(rawModel);
      const base = matrixBase(connection, model);
      const operations = operationsForModel(connection, model).filter((item) => item.enabled !== false);

      if (model.type === MODEL_CAPABILITIES.TEXT) {
        const operation = operations.find((item) => item.modeKey === '');
        if (!operation) continue;
        matrix.push(createMatrixItem({
          base,
          modeKey: '',
          mode: '',
          operation,
          referenceLimits: getEmptyReferenceLimits(),
          promptTemplateType: MODEL_PROMPT_TEMPLATE_TYPES.NONE,
        }));
      }

      if (model.type === MODEL_CAPABILITIES.IMAGE) {
        const modes = operations.map((item) => item.modeKey as ImageGenerationMode);
        for (const mode of modes) {
          const limits = getImageModeReferenceLimits(mode);
          const operation = operations.find((item) => item.modeKey === serializeImageMode(mode));
          if (!operation) continue;
          matrix.push(createMatrixItem({
            base,
            modeKey: serializeImageMode(mode),
            mode,
            operation,
            referenceLimits: limits,
            promptTemplateType: MODEL_PROMPT_TEMPLATE_TYPES.IMAGE,
          }));
        }
      }

      if (model.type === MODEL_CAPABILITIES.VIDEO) {
        const modes = operations.map((item) => parseVideoModeKey(item.modeKey) as VideoGenerationMode);
        for (const mode of modes) {
          const modeKey = serializeVideoMode(mode);
          const operation = operations.find((item) => item.modeKey === modeKey);
          if (!operation) continue;
          matrix.push(createMatrixItem({
            base,
            modeKey,
            mode,
            operation,
            referenceLimits: getVideoModeReferenceLimits(mode),
            promptTemplateType: MODEL_PROMPT_TEMPLATE_TYPES.VIDEO,
          }));
        }
      }

      if (model.type === MODEL_CAPABILITIES.TTS) {
        const operation = operations.find((item) => item.modeKey === '');
        if (!operation) continue;
        matrix.push(createMatrixItem({
          base,
          modeKey: '',
          mode: '',
          operation,
          referenceLimits: getEmptyReferenceLimits(),
          promptTemplateType: MODEL_PROMPT_TEMPLATE_TYPES.NONE,
        }));
      }
    }
  }

  return matrix;
}
