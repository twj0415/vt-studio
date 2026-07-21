import { IMAGE_GENERATION_MODES, VIDEO_SIMPLE_MODES, type ModelCapability } from '@shared/constants/dictionaries';
import {
  MODEL_AUDIO_SUPPORTS,
  MODEL_OUTPUT_TYPES,
  MODEL_REFERENCE_FILE_TYPES,
} from '@shared/constants/model-capabilities';
import type { ModelCapabilitySource, ModelOperationCapability } from '@shared/types/model-capability';
import type { ApiConnection, ApiServiceType, RegisteredModel } from '@shared/types/model-config';

const VERIFIED_AT = '2026-07-15';

export interface ModelCapabilityCatalogEntry {
  catalogId: string;
  provider: string;
  displayName: string;
  modelNames: string[];
  modelType: ModelCapability;
  connectionServiceTypes: ApiServiceType[];
  lifecycle: 'active' | 'planned' | 'deprecated';
  operations: ModelOperationCapability[];
}

function source(input: {
  provider: string;
  adapterStatus: ModelCapabilitySource['adapterStatus'];
  status?: ModelCapabilitySource['status'];
  documentUrl?: string;
  note?: string;
}): ModelCapabilitySource {
  return {
    status: input.status ?? 'provider-reported',
    provider: input.provider,
    documentUrl: input.documentUrl,
    verifiedAt: VERIFIED_AT,
    adapterStatus: input.adapterStatus,
    note: input.note,
  };
}

function textOperation(sourceInfo: ModelCapabilitySource): ModelOperationCapability {
  return {
    operationId: 'text.generate',
    modeKey: '',
    inputTypes: [MODEL_REFERENCE_FILE_TYPES.TEXT],
    outputType: MODEL_OUTPUT_TYPES.TEXT,
    referenceConstraints: [],
    minimumTotalReferences: 0,
    maximumTotalReferences: 0,
    parameterCombinations: [],
    audioSupport: MODEL_AUDIO_SUPPORTS.NONE,
    source: sourceInfo,
    enabled: true,
  };
}

function imageOperation(input: {
  modeKey: string;
  source: ModelCapabilitySource;
  maximumImages?: number;
  sizeOptions?: string[];
  aspectRatioOptions?: string[];
  qualityOptions?: string[];
}): ModelOperationCapability {
  const needsImage = input.modeKey !== IMAGE_GENERATION_MODES.TEXT;
  const maximumImages = needsImage ? input.maximumImages ?? 1 : 0;
  return {
    operationId: `image.${input.modeKey}`,
    modeKey: input.modeKey,
    inputTypes: needsImage
      ? [MODEL_REFERENCE_FILE_TYPES.TEXT, MODEL_REFERENCE_FILE_TYPES.IMAGE]
      : [MODEL_REFERENCE_FILE_TYPES.TEXT],
    outputType: MODEL_OUTPUT_TYPES.IMAGE,
    referenceConstraints: needsImage
      ? [{ type: MODEL_REFERENCE_FILE_TYPES.IMAGE, min: 1, max: maximumImages }]
      : [],
    minimumTotalReferences: needsImage ? 1 : 0,
    maximumTotalReferences: maximumImages,
    parameterCombinations: [{
      ...(input.sizeOptions?.length ? { sizeOptions: input.sizeOptions } : {}),
      ...(input.aspectRatioOptions?.length ? { aspectRatioOptions: input.aspectRatioOptions } : {}),
      ...(input.qualityOptions?.length ? { qualityOptions: input.qualityOptions } : {}),
    }].filter((item) => Object.keys(item).length > 0),
    audioSupport: MODEL_AUDIO_SUPPORTS.NONE,
    source: input.source,
    enabled: true,
  };
}

function videoOperation(input: {
  modeKey: string;
  source: ModelCapabilitySource;
  combinations: ModelOperationCapability['parameterCombinations'];
  imageMinimum?: number;
  imageMaximum?: number;
  videoMaximum?: number;
  audioMaximum?: number;
  audioSupport?: ModelOperationCapability['audioSupport'];
  features?: string[];
}): ModelOperationCapability {
  const referenceConstraints = [
    ...(input.imageMaximum ? [{ type: MODEL_REFERENCE_FILE_TYPES.IMAGE, min: input.imageMinimum ?? 0, max: input.imageMaximum }] : []),
    ...(input.videoMaximum ? [{ type: MODEL_REFERENCE_FILE_TYPES.VIDEO, min: 0, max: input.videoMaximum }] : []),
    ...(input.audioMaximum ? [{ type: MODEL_REFERENCE_FILE_TYPES.AUDIO, min: 0, max: input.audioMaximum }] : []),
  ];
  const maximumTotalReferences = referenceConstraints.reduce((total, item) => total + item.max, 0);
  return {
    operationId: `video.${input.modeKey}`,
    modeKey: input.modeKey,
    inputTypes: [MODEL_REFERENCE_FILE_TYPES.TEXT, ...referenceConstraints.map((item) => item.type)],
    outputType: MODEL_OUTPUT_TYPES.VIDEO,
    referenceConstraints,
    minimumTotalReferences: input.imageMinimum ?? 0,
    maximumTotalReferences,
    parameterCombinations: input.combinations,
    audioSupport: input.audioSupport ?? MODEL_AUDIO_SUPPORTS.NONE,
    features: input.features,
    source: input.source,
    enabled: true,
  };
}

const OPENAI_GATEWAY_SOURCE = source({
  provider: 'OpenAI-compatible gateway',
  adapterStatus: 'supported',
  note: '按当前 OpenAI-compatible adapter 和已配置网关能力登记；不同网关必须分别测试。',
});
const GPT_IMAGE_SOURCE = source({
  provider: 'GPT Image gateway',
  adapterStatus: 'supported',
  note: '当前 adapter 使用 images/generations 与 images/edits；多图数量按接口上限保守登记。',
});
const MINIMAX_VIDEO_SOURCE = source({
  provider: 'MiniMax',
  status: 'verified',
  adapterStatus: 'supported',
  documentUrl: 'https://platform.minimaxi.com/docs/api-reference/video-generation-t2v',
});
const MAINTAINED_ONLY_SOURCE = (provider: string, note: string): ModelCapabilitySource => source({
  provider,
  adapterStatus: 'unsupported',
  note,
});

const GPT_IMAGE_RATIOS = ['1:1', '16:9', '9:16'];
const HAILUO_COMBINATIONS = [
  { durationOptions: [6], resolutionOptions: ['768P', '1080P'] },
  { durationOptions: [10], resolutionOptions: ['768P'] },
];

function gptImageOperations(): ModelOperationCapability[] {
  return [
    imageOperation({ modeKey: IMAGE_GENERATION_MODES.TEXT, source: GPT_IMAGE_SOURCE, aspectRatioOptions: GPT_IMAGE_RATIOS }),
    imageOperation({ modeKey: IMAGE_GENERATION_MODES.SINGLE_IMAGE, source: GPT_IMAGE_SOURCE, maximumImages: 1, aspectRatioOptions: GPT_IMAGE_RATIOS }),
    imageOperation({ modeKey: IMAGE_GENERATION_MODES.MULTI_REFERENCE, source: GPT_IMAGE_SOURCE, maximumImages: 16, aspectRatioOptions: GPT_IMAGE_RATIOS }),
  ];
}

function hailuoOperations(fast: boolean): ModelOperationCapability[] {
  const modes = fast ? [VIDEO_SIMPLE_MODES.SINGLE_IMAGE] : [VIDEO_SIMPLE_MODES.TEXT, VIDEO_SIMPLE_MODES.SINGLE_IMAGE];
  return modes.map((modeKey) => videoOperation({
    modeKey,
    source: {
      ...MINIMAX_VIDEO_SOURCE,
      documentUrl: modeKey === VIDEO_SIMPLE_MODES.SINGLE_IMAGE
        ? 'https://platform.minimaxi.com/docs/api-reference/video-generation-i2v'
        : MINIMAX_VIDEO_SOURCE.documentUrl,
    },
    combinations: HAILUO_COMBINATIONS,
    imageMinimum: modeKey === VIDEO_SIMPLE_MODES.SINGLE_IMAGE ? 1 : 0,
    imageMaximum: modeKey === VIDEO_SIMPLE_MODES.SINGLE_IMAGE ? 1 : 0,
  }));
}

function maintainedImageOperations(input: {
  provider: string;
  modes: string[];
  sizes: string[];
  maximumImages: number;
  note: string;
}): ModelOperationCapability[] {
  const sourceInfo = MAINTAINED_ONLY_SOURCE(input.provider, input.note);
  return input.modes.map((modeKey) => imageOperation({
    modeKey,
    source: sourceInfo,
    maximumImages: input.maximumImages,
    sizeOptions: input.sizes,
  }));
}

function maintainedVideoOperations(input: {
  provider: string;
  modes: string[];
  combinations: ModelOperationCapability['parameterCombinations'];
  imageMaximum?: number;
  videoMaximum?: number;
  audioMaximum?: number;
  audioSupport?: ModelOperationCapability['audioSupport'];
  note: string;
}): ModelOperationCapability[] {
  const sourceInfo = MAINTAINED_ONLY_SOURCE(input.provider, input.note);
  return input.modes.map((modeKey) => videoOperation({
    modeKey,
    source: sourceInfo,
    combinations: input.combinations,
    imageMinimum: modeKey === VIDEO_SIMPLE_MODES.SINGLE_IMAGE ? 1 : 0,
    imageMaximum: input.imageMaximum,
    videoMaximum: input.videoMaximum,
    audioMaximum: input.audioMaximum,
    audioSupport: input.audioSupport,
  }));
}

export const MODEL_CAPABILITY_CATALOG: readonly ModelCapabilityCatalogEntry[] = [
  {
    catalogId: 'openai-gateway:gpt-5.5',
    provider: 'OpenAI gateway',
    displayName: 'GPT-5.5',
    modelNames: ['gpt-5.5'],
    modelType: 'text',
    connectionServiceTypes: ['openai-gateway', 'openai-official'],
    lifecycle: 'active',
    operations: [textOperation(OPENAI_GATEWAY_SOURCE)],
  },
  {
    catalogId: 'openai-gateway:gpt-5.4',
    provider: 'OpenAI gateway',
    displayName: 'GPT-5.4',
    modelNames: ['gpt-5.4'],
    modelType: 'text',
    connectionServiceTypes: ['openai-gateway', 'openai-official'],
    lifecycle: 'active',
    operations: [textOperation(OPENAI_GATEWAY_SOURCE)],
  },
  {
    catalogId: 'gpt-image-2',
    provider: 'OpenAI-compatible gateway',
    displayName: 'GPT Image 2',
    modelNames: ['gpt-image-2', 'openai/gpt-image-2/text-to-image'],
    modelType: 'image',
    connectionServiceTypes: ['openai-gateway'],
    lifecycle: 'active',
    operations: gptImageOperations(),
  },
  {
    catalogId: 'hailuo-2.3',
    provider: 'MiniMax',
    displayName: '海螺 2.3',
    modelNames: ['MiniMax-Hailuo-2.3'],
    modelType: 'video',
    connectionServiceTypes: ['minimax'],
    lifecycle: 'active',
    operations: hailuoOperations(false),
  },
  {
    catalogId: 'hailuo-2.3-fast',
    provider: 'MiniMax',
    displayName: '海螺 2.3 Fast',
    modelNames: ['MiniMax-Hailuo-2.3-Fast'],
    modelType: 'video',
    connectionServiceTypes: ['minimax'],
    lifecycle: 'active',
    operations: hailuoOperations(true),
  },
  {
    catalogId: 'minimax-image-01',
    provider: 'MiniMax',
    displayName: 'MiniMax Image 01',
    modelNames: ['image-01', 'image-01-live'],
    modelType: 'image',
    connectionServiceTypes: [],
    lifecycle: 'planned',
    operations: maintainedImageOperations({ provider: 'MiniMax', modes: ['text', 'singleImage'], sizes: ['1K', '2K'], maximumImages: 1, note: '仅维护能力；本期不接入 MiniMax 图片。' }),
  },
  {
    catalogId: 'seedream-5-pro',
    provider: '火山引擎',
    displayName: 'Seedream 5 Pro',
    modelNames: ['doubao-seedream-5-0-260128'],
    modelType: 'image',
    connectionServiceTypes: [],
    lifecycle: 'planned',
    operations: maintainedImageOperations({ provider: '火山引擎', modes: ['text', 'singleImage', 'multiReference'], sizes: ['1K', '2K'], maximumImages: 14, note: '参考图与输出图合计最多 15；adapter 本期不接入。' }),
  },
  {
    catalogId: 'seedream-5-lite',
    provider: '火山引擎',
    displayName: 'Seedream 5 Lite',
    modelNames: ['doubao-seedream-5-0-lite-260128'],
    modelType: 'image',
    connectionServiceTypes: [],
    lifecycle: 'planned',
    operations: maintainedImageOperations({ provider: '火山引擎', modes: ['text', 'singleImage', 'multiReference'], sizes: ['2K', '3K', '4K'], maximumImages: 14, note: '参考图与输出图合计最多 15；adapter 本期不接入。' }),
  },
  {
    catalogId: 'kling-v3',
    provider: '可灵',
    displayName: 'Kling V3',
    modelNames: ['kling-v3:std', 'kling-v3:pro'],
    modelType: 'video',
    connectionServiceTypes: [],
    lifecycle: 'planned',
    operations: maintainedVideoOperations({ provider: '可灵', modes: ['text', 'singleImage', 'startEndRequired'], combinations: [{ durationOptions: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolutionOptions: ['720P', '1080P', '4K'] }], imageMaximum: 2, audioSupport: MODEL_AUDIO_SUPPORTS.OPTIONAL, note: '仅维护能力，当前 adapter 参数未完整映射。' }),
  },
  {
    catalogId: 'kling-v3-omni',
    provider: '可灵',
    displayName: 'Kling V3 Omni',
    modelNames: ['kling-v3-omni:std', 'kling-v3-omni:pro'],
    modelType: 'video',
    connectionServiceTypes: [],
    lifecycle: 'planned',
    operations: maintainedVideoOperations({ provider: '可灵', modes: ['text', 'singleImage', 'startEndRequired', 'imageReference:3'], combinations: [{ durationOptions: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolutionOptions: ['720P', '1080P', '4K'] }], imageMaximum: 3, videoMaximum: 1, audioMaximum: 1, audioSupport: MODEL_AUDIO_SUPPORTS.OPTIONAL, note: 'Element 最多 3 个；视频和音频参考尚未实现。' }),
  },
  {
    catalogId: 'vidu-q3',
    provider: 'Vidu',
    displayName: 'Vidu Q3 Pro/Turbo',
    modelNames: ['viduq3-pro', 'viduq3-turbo'],
    modelType: 'video',
    connectionServiceTypes: [],
    lifecycle: 'planned',
    operations: maintainedVideoOperations({ provider: 'Vidu', modes: ['text', 'singleImage', 'startEndRequired', 'imageReference:7'], combinations: [{ durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], resolutionOptions: ['540P', '720P', '1080P'] }], imageMaximum: 7, audioSupport: MODEL_AUDIO_SUPPORTS.OPTIONAL, note: '仅维护能力，当前错误接口实现不作为可用 adapter。' }),
  },
  {
    catalogId: 'seedance-2.0',
    provider: '火山引擎',
    displayName: 'Seedance 2.0',
    modelNames: ['doubao-seedance-2-0-260128'],
    modelType: 'video',
    connectionServiceTypes: [],
    lifecycle: 'planned',
    operations: maintainedVideoOperations({ provider: '火山引擎', modes: ['text', 'imageReference:9,videoReference:3,audioReference:3'], combinations: [{ durationOptions: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolutionOptions: ['480P', '720P', '1080P', '4K'] }], imageMaximum: 9, videoMaximum: 3, audioMaximum: 3, audioSupport: MODEL_AUDIO_SUPPORTS.OPTIONAL, note: '仅维护多模态能力；adapter 本期不接入。' }),
  },
  {
    catalogId: 'seedance-2.0-fast',
    provider: '火山引擎',
    displayName: 'Seedance 2.0 Fast',
    modelNames: ['doubao-seedance-2-0-fast-260128'],
    modelType: 'video',
    connectionServiceTypes: [],
    lifecycle: 'planned',
    operations: maintainedVideoOperations({ provider: '火山引擎', modes: ['text', 'imageReference:9'], combinations: [{ durationOptions: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolutionOptions: ['480P', '720P'] }], imageMaximum: 9, audioSupport: MODEL_AUDIO_SUPPORTS.OPTIONAL, note: '仅维护 Fast 能力；adapter 本期不接入。' }),
  },
] as const;

export function getCatalogOperations(connection: ApiConnection, model: RegisteredModel): ModelOperationCapability[] {
  const entry = MODEL_CAPABILITY_CATALOG.find((item) => (
    item.lifecycle !== 'deprecated'
    && item.modelType === model.type
    && item.connectionServiceTypes.includes(connection.serviceType)
    && item.modelNames.includes(model.modelName)
  ));
  return entry?.operations.map((operation) => ({
    ...operation,
    inputTypes: [...operation.inputTypes],
    referenceConstraints: operation.referenceConstraints.map((constraint) => ({ ...constraint, roles: constraint.roles ? [...constraint.roles] : undefined })),
    parameterCombinations: operation.parameterCombinations.map((combination) => ({
      ...combination,
      durationOptions: combination.durationOptions ? [...combination.durationOptions] : undefined,
      resolutionOptions: combination.resolutionOptions ? [...combination.resolutionOptions] : undefined,
      aspectRatioOptions: combination.aspectRatioOptions ? [...combination.aspectRatioOptions] : undefined,
      sizeOptions: combination.sizeOptions ? [...combination.sizeOptions] : undefined,
      qualityOptions: combination.qualityOptions ? [...combination.qualityOptions] : undefined,
    })),
    parameters: operation.parameters?.map((parameter) => ({ ...parameter, options: parameter.options?.map((option) => ({ ...option })) })),
    features: operation.features ? [...operation.features] : undefined,
    source: { ...operation.source },
  })) ?? [];
}
