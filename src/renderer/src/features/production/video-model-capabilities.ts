import { isReadyModelOperation, resolveModelOperationOptions } from '@shared/model-capability-options';
import type { ModelCapabilityMatrixItem } from '@shared/types/model-capability';

export type ReadyVideoCapability = ModelCapabilityMatrixItem & {
  modelType: 'video';
  status: 'ready';
};

export function listReadyVideoCapabilities(items: ModelCapabilityMatrixItem[]): ReadyVideoCapability[] {
  return items.filter((item): item is ReadyVideoCapability => (
    item.modelType === 'video'
    && isReadyModelOperation(item)
    && Array.isArray(item.parameterCombinations)
    && item.parameterCombinations.length > 0
  ));
}

export function filterVideoCapabilitiesByModel(
  items: ReadyVideoCapability[],
  modelId: string,
): ReadyVideoCapability[] {
  return modelId ? items.filter((item) => item.modelId === modelId) : items;
}

export function listVideoCapabilityModeKeys(items: ReadyVideoCapability[]): string[] {
  return Array.from(new Set(items.map((item) => item.modeKey).filter(Boolean)));
}

export function findVideoModeCapability(
  items: ReadyVideoCapability[],
  modeKey: string,
): ReadyVideoCapability | null {
  return items.find((item) => item.modeKey === modeKey) ?? null;
}

export function listVideoResolutionOptions(capability: ReadyVideoCapability | null, duration?: number): string[] {
  if (!capability) return [];
  return resolveModelOperationOptions(capability, { duration }).resolutions;
}

export function listVideoDurationOptions(capability: ReadyVideoCapability | null): number[] {
  if (!capability) return [];
  return resolveModelOperationOptions(capability).durations;
}
