import { IMAGE_GENERATION_MODES, PROJECT_IMAGE_QUALITY_VALUES, type ImageGenerationMode, type ProjectImageQuality } from '@shared/constants/dictionaries';
import { resolveModelOperationOptions, validateModelOperationReferences, validateModelOperationSelection } from '@shared/model-capability-options';
import type { ModelCapabilityMatrixItem } from '@shared/types/model-capability';
import { VT_STATUS } from '@shared/constants/status';
import { createError } from './result';
import { getReadyModelOperationCapability } from './settings/model-config';
import type { ImageGenerateInput } from './model/types';

export interface ImageGenerationRequestOptions {
  model: string;
  referenceImageCount: number;
  size?: ProjectImageQuality | null;
  rejectUnsupportedSize?: boolean;
  aspectRatio?: string | null;
}

export interface ResolvedImageGenerationRequestOptions {
  capability: ModelCapabilityMatrixItem;
  modeKey: ImageGenerationMode;
  size?: NonNullable<ImageGenerateInput['size']>;
  aspectRatio?: ImageGenerateInput['aspectRatio'];
}

function getImageModeByReferenceCount(referenceImageCount: number): ImageGenerationMode {
  const count = Math.max(0, Math.floor(referenceImageCount));
  if (count > 1) return IMAGE_GENERATION_MODES.MULTI_REFERENCE;
  if (count === 1) return IMAGE_GENERATION_MODES.SINGLE_IMAGE;
  return IMAGE_GENERATION_MODES.TEXT;
}

function assertImageSize(value: ProjectImageQuality): NonNullable<ImageGenerateInput['size']> {
  if (PROJECT_IMAGE_QUALITY_VALUES.includes(value) && ['1K', '2K', '3K', '4K'].includes(value)) {
    return value as NonNullable<ImageGenerateInput['size']>;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, `图片规格无效：${value}`);
}

export function resolveImageGenerationRequestOptions(input: ImageGenerationRequestOptions): ResolvedImageGenerationRequestOptions {
  const modeKey = getImageModeByReferenceCount(input.referenceImageCount);
  let capability: ModelCapabilityMatrixItem;
  try {
    capability = getReadyModelOperationCapability(input.model, modeKey, 'image');
  } catch (error) {
    throw createError(VT_STATUS.MODEL_NOT_FOUND, error instanceof Error ? error.message : '图片模型操作不可用');
  }

  const options = resolveModelOperationOptions(capability);
  let size: NonNullable<ImageGenerateInput['size']> | undefined;
  if (options.sizes.length > 0) {
    if (!input.size) throw createError(VT_STATUS.INVALID_PARAMS, '请选择图片规格');
    size = assertImageSize(input.size);
  } else if (input.rejectUnsupportedSize && input.size) {
    throw createError(VT_STATUS.INVALID_PARAMS, '当前图片模型不支持图片规格参数');
  }

  let aspectRatio: ImageGenerateInput['aspectRatio'] | undefined;
  if (options.aspectRatios.length > 0) {
    const normalized = input.aspectRatio?.trim();
    if (!normalized) throw createError(VT_STATUS.INVALID_PARAMS, '请选择图片比例');
    aspectRatio = normalized as ImageGenerateInput['aspectRatio'];
  }

  try {
    validateModelOperationSelection(capability, { size, aspectRatio });
    validateModelOperationReferences(capability, { image: input.referenceImageCount });
  } catch (error) {
    throw createError(VT_STATUS.INVALID_PARAMS, error instanceof Error ? error.message : '图片模型参数无效');
  }

  return { capability, modeKey, size, aspectRatio };
}
