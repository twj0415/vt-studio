import { MODEL_AUDIO_SUPPORTS, MODEL_REFERENCE_FILE_TYPES } from './constants/model-capabilities';
import type {
  ModelCapabilityMatrixItem,
  ModelParameterCombination,
  ModelParameterDefinition,
  ModelParameterValue,
} from './types/model-capability';
import type { ModelCapability } from './types/model-config';

export interface ModelOperationSelection {
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  size?: string;
  quality?: string;
  audio?: boolean;
  parameters?: Record<string, ModelParameterValue>;
}

export interface ResolvedModelOperationOptions {
  durations: number[];
  resolutions: string[];
  aspectRatios: string[];
  sizes: string[];
  qualities: string[];
  parameters: ModelParameterDefinition[];
  audioSupport: ModelCapabilityMatrixItem['audioSupport'];
}

export interface AvailableModelSummary {
  modelId: string;
  connectionId: string;
  connectionName: string;
  modelName: string;
  displayName: string;
  modelType: ModelCapability;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))];
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))];
}

export function isReadyModelOperation(item: ModelCapabilityMatrixItem): boolean {
  return item.status === 'ready'
    && Boolean(item.operationId)
    && item.source.status !== 'unverified'
    && item.source.adapterStatus === 'supported';
}

export function listAvailableModels(
  items: ModelCapabilityMatrixItem[],
  modelType?: ModelCapability,
): AvailableModelSummary[] {
  const models = new Map<string, AvailableModelSummary>();
  for (const item of items) {
    if (!isReadyModelOperation(item) || (modelType && item.modelType !== modelType)) continue;
    if (!models.has(item.modelId)) {
      models.set(item.modelId, {
        modelId: item.modelId,
        connectionId: item.connectionId,
        connectionName: item.connectionName,
        modelName: item.modelName,
        displayName: item.modelDisplayName,
        modelType: item.modelType,
      });
    }
  }
  return [...models.values()];
}

export function listModelOperations(
  items: ModelCapabilityMatrixItem[],
  modelId: string,
): ModelCapabilityMatrixItem[] {
  return items.filter((item) => item.modelId === modelId && isReadyModelOperation(item));
}

export function findModelOperation(
  items: ModelCapabilityMatrixItem[],
  modelId: string,
  operationIdOrModeKey: string,
): ModelCapabilityMatrixItem | null {
  return listModelOperations(items, modelId)
    .find((item) => item.operationId === operationIdOrModeKey || item.modeKey === operationIdOrModeKey) ?? null;
}

function matchesSelection(combination: ModelParameterCombination, selection: ModelOperationSelection): boolean {
  if (selection.duration !== undefined && combination.durationOptions?.length && !combination.durationOptions.includes(selection.duration)) return false;
  if (selection.resolution && combination.resolutionOptions?.length && !combination.resolutionOptions.includes(selection.resolution)) return false;
  if (selection.aspectRatio && combination.aspectRatioOptions?.length && !combination.aspectRatioOptions.includes(selection.aspectRatio)) return false;
  if (selection.size && combination.sizeOptions?.length && !combination.sizeOptions.includes(selection.size)) return false;
  if (selection.quality && combination.qualityOptions?.length && !combination.qualityOptions.includes(selection.quality)) return false;
  return true;
}

function combinationsForSelection(
  capability: ModelCapabilityMatrixItem,
  selection: ModelOperationSelection,
  ignoredKey?: keyof ModelOperationSelection,
): ModelParameterCombination[] {
  const scopedSelection = { ...selection };
  if (ignoredKey) delete scopedSelection[ignoredKey];
  return capability.parameterCombinations.filter((combination) => matchesSelection(combination, scopedSelection));
}

export function resolveModelOperationOptions(
  capability: ModelCapabilityMatrixItem,
  selection: ModelOperationSelection = {},
): ResolvedModelOperationOptions {
  return {
    durations: uniqueNumbers(combinationsForSelection(capability, selection, 'duration').flatMap((item) => item.durationOptions ?? [])),
    resolutions: uniqueStrings(combinationsForSelection(capability, selection, 'resolution').flatMap((item) => item.resolutionOptions ?? [])),
    aspectRatios: uniqueStrings(combinationsForSelection(capability, selection, 'aspectRatio').flatMap((item) => item.aspectRatioOptions ?? [])),
    sizes: uniqueStrings(combinationsForSelection(capability, selection, 'size').flatMap((item) => item.sizeOptions ?? [])),
    qualities: uniqueStrings(combinationsForSelection(capability, selection, 'quality').flatMap((item) => item.qualityOptions ?? [])),
    parameters: capability.parameters,
    audioSupport: capability.audioSupport,
  };
}

function assertSelectedOption(label: string, value: string | number | undefined, options: Array<string | number>): void {
  if (options.length === 0) {
    if (value !== undefined && value !== '') throw new Error(`${label}不是当前模型的可配置项`);
    return;
  }
  if (value === undefined || value === '') throw new Error(`请选择${label}`);
  if (!options.includes(value)) throw new Error(`${label}不受当前模型支持：${value}`);
}

function validateCustomParameters(definitions: ModelParameterDefinition[], values: Record<string, ModelParameterValue>): void {
  for (const definition of definitions) {
    const value = values[definition.key];
    if (definition.required && (value === undefined || value === '')) throw new Error(`请配置${definition.label}`);
    if (value === undefined || value === '') continue;
    if (definition.options?.length && !definition.options.some((option) => option.value === value)) {
      throw new Error(`${definition.label}参数无效`);
    }
    if (definition.control === 'number') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new Error(`${definition.label}必须是数字`);
      if (definition.minimum !== undefined && numeric < definition.minimum) throw new Error(`${definition.label}不能小于 ${definition.minimum}`);
      if (definition.maximum !== undefined && numeric > definition.maximum) throw new Error(`${definition.label}不能大于 ${definition.maximum}`);
    }
  }
}

export function validateModelOperationSelection(
  capability: ModelCapabilityMatrixItem,
  selection: ModelOperationSelection,
): void {
  if (!isReadyModelOperation(capability)) throw new Error('当前模型操作不可用');
  const allOptions = resolveModelOperationOptions(capability);
  assertSelectedOption('时长', selection.duration, allOptions.durations);
  const linkedOptions = resolveModelOperationOptions(capability, selection);
  assertSelectedOption('分辨率', selection.resolution, linkedOptions.resolutions);
  assertSelectedOption('比例', selection.aspectRatio, linkedOptions.aspectRatios);
  assertSelectedOption('图片规格', selection.size, linkedOptions.sizes);
  assertSelectedOption('图片质量', selection.quality, linkedOptions.qualities);
  if (capability.audioSupport === MODEL_AUDIO_SUPPORTS.NONE && selection.audio) throw new Error('当前模型不支持音频');
  if (capability.audioSupport === MODEL_AUDIO_SUPPORTS.REQUIRED && selection.audio !== true) throw new Error('当前模型必须生成音频');
  validateCustomParameters(capability.parameters, selection.parameters ?? {});
}

export function validateModelOperationReferences(
  capability: ModelCapabilityMatrixItem,
  counts: Partial<Record<'text' | 'image' | 'video' | 'audio', number>>,
): void {
  let total = 0;
  for (const type of Object.values(MODEL_REFERENCE_FILE_TYPES)) {
    if (type === MODEL_REFERENCE_FILE_TYPES.TEXT) continue;
    const count = Math.max(0, Math.floor(Number(counts[type]) || 0));
    total += count;
    const constraint = capability.referenceConstraints.find((item) => item.type === type);
    if (!constraint && count > 0) throw new Error(`当前操作不支持${type}参考素材`);
    if (constraint && count < constraint.min) throw new Error(`${type}参考素材至少需要 ${constraint.min} 个`);
    if (constraint && count > constraint.max) throw new Error(`${type}参考素材最多支持 ${constraint.max} 个`);
  }
  if (total < capability.minimumTotalReferences) throw new Error(`参考素材至少需要 ${capability.minimumTotalReferences} 个`);
  if (capability.maximumTotalReferences !== null && total > capability.maximumTotalReferences) {
    throw new Error(`参考素材最多支持 ${capability.maximumTotalReferences} 个`);
  }
}
