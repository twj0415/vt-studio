import { VT_STATUS } from '@shared/constants/status';
import {
  getVideoModeReferenceLimits,
} from '@shared/constants/model-capabilities';
import { isVtError } from '@shared/errors';
import { normalizeUnknownError } from '@shared/errors';
import { cancelTask, createTask, failTask, isTaskCancelled, succeedTask } from '../task';
import { createError } from '../result';
import { MODEL_TYPES } from './constants';
import { assertVendorVideoModeSupported } from './capability-matrix';
import { resolveModelCallContext, runModelCall, type ModelCallContext, type ModelCallRunOptions } from './gateway';
import {
  recordModelRequestTraceInput,
  recordModelRequestTraceNormalizedInput,
  recordModelRequestTraceOutput,
} from './request-diagnostics';
import type {
  AudioGenerateInput,
  ImageGenerateInput,
  ImageModelConfig,
  ModelTaskOptions,
  ReferenceItem,
  TtsModelConfig,
  VendorModelConfig,
  VideoGenerateInput,
  VideoModelConfig,
} from './types';
import { getVendor } from './vendor-service';

type MediaResultKind = 'image' | 'video' | 'audio';

const MEDIA_KIND_LABELS: Record<MediaResultKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
};

const MEDIA_MIME_PREFIXES: Record<MediaResultKind, string[]> = {
  image: ['image/'],
  video: ['video/'],
  audio: ['audio/'],
};

const MEDIA_MAX_BYTES: Record<MediaResultKind, number> = {
  image: 50 * 1024 * 1024,
  video: 512 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
};

const MEDIA_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function assertHttpMediaUrl(url: string): URL {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw createError(VT_STATUS.FORBIDDEN, `模型结果 URL 不允许使用 ${parsed.protocol} 协议`);
    }

    return parsed;
  } catch (error) {
    if (isVtError(error)) {
      throw error;
    }

    throw createError(VT_STATUS.MODEL_ERROR, '模型结果 URL 无效', error);
  }
}

function assertMediaMime(contentType: string, kind: MediaResultKind): void {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
  if (!MEDIA_MIME_PREFIXES[kind].some((prefix) => mime.startsWith(prefix))) {
    throw createError(VT_STATUS.MODEL_ERROR, `模型返回的媒体类型不是${MEDIA_KIND_LABELS[kind]}`);
  }
}

async function urlToBase64(url: string, kind: MediaResultKind): Promise<string> {
  const parsed = assertHttpMediaUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEDIA_DOWNLOAD_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(parsed, { signal: controller.signal });
  } catch (error) {
    throw createError(VT_STATUS.MODEL_ERROR, '下载模型结果失败', error);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw createError(VT_STATUS.MODEL_ERROR, `下载模型结果失败：${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  assertMediaMime(contentType, kind);
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
  const maxBytes = MEDIA_MAX_BYTES[kind];
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw createError(VT_STATUS.MODEL_ERROR, `模型返回的${MEDIA_KIND_LABELS[kind]}超过大小限制：${contentLength} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw createError(VT_STATUS.MODEL_ERROR, `模型返回的${MEDIA_KIND_LABELS[kind]}超过大小限制：${buffer.byteLength} bytes`);
  }

  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function getBase64Payload(value: string): string {
  const dataUrlMatch = /^data:[^;,]+;base64,([\s\S]+)$/i.exec(value.trim());
  return (dataUrlMatch?.[1] ?? value).replace(/\s/g, '');
}

function assertReferencePayloads(references: ReferenceItem[] | undefined): void {
  for (const reference of references ?? []) {
    const payload = getBase64Payload(reference.base64);
    const label = MEDIA_KIND_LABELS[reference.type];

    if (!payload || payload.length % 4 === 1 || !/^[a-z0-9+/]+={0,2}$/i.test(payload)) {
      throw createError(VT_STATUS.INVALID_PARAMS, `${label}参考素材不是有效 base64`);
    }

    const byteLength = Buffer.from(payload, 'base64').byteLength;
    if (byteLength > MEDIA_MAX_BYTES[reference.type]) {
      throw createError(VT_STATUS.INVALID_PARAMS, `${label}参考素材超过大小限制：${byteLength} bytes`);
    }
  }
}

function assertBase64Payload(payload: string, kind: MediaResultKind): void {
  const compact = payload.replace(/\s/g, '');
  const label = MEDIA_KIND_LABELS[kind];

  if (!compact || compact.length % 4 === 1 || !/^[a-z0-9+/]+={0,2}$/i.test(compact)) {
    throw createError(VT_STATUS.MODEL_ERROR, `模型返回的${label}不是有效 base64`);
  }

  if (Buffer.from(compact, 'base64').byteLength < 32) {
    throw createError(VT_STATUS.MODEL_ERROR, `模型返回的${label}内容为空或过小`);
  }
}

function validateMediaResult(value: string, kind: MediaResultKind): string {
  const normalized = value.trim();
  const label = MEDIA_KIND_LABELS[kind];

  if (!normalized) {
    throw createError(VT_STATUS.MODEL_ERROR, `模型未返回${label}结果`);
  }

  const dataUrlMatch = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(normalized);
  if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
    const mime = dataUrlMatch[1].toLowerCase();
    if (!MEDIA_MIME_PREFIXES[kind].some((prefix) => mime.startsWith(prefix))) {
      throw createError(VT_STATUS.MODEL_ERROR, `模型返回的媒体类型不是${label}`);
    }

    assertBase64Payload(dataUrlMatch[2], kind);
    return normalized;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  assertBase64Payload(normalized, kind);
  return normalized.replace(/\s/g, '');
}

async function normalizeMediaResult(value: string, kind: MediaResultKind): Promise<string> {
  const normalized = validateMediaResult(value, kind);
  if (/^https?:\/\//i.test(normalized)) {
    return validateMediaResult(await urlToBase64(normalized, kind), kind);
  }

  return normalized;
}

function getMediaResultSource(value: string): 'data-url' | 'url' | 'base64' {
  if (/^data:[^;,]+;base64,/i.test(value)) {
    return 'data-url';
  }

  if (/^https?:\/\//i.test(value)) {
    return 'url';
  }

  return 'base64';
}

function summarizeMediaTraceInput<TInput extends ImageGenerateInput | VideoGenerateInput | AudioGenerateInput>(modelKey: string, input: TInput): Record<string, unknown> {
  return {
    modelKey,
    ...input,
    task: input.task
      ? {
        taskId: input.task.taskId,
        projectId: input.task.projectId,
        category: input.task.category,
        description: input.task.description,
        timeoutMs: input.task.timeoutMs,
        retry: input.task.retry,
        relatedObjects: input.task.relatedObjects,
      }
      : null,
  };
}

function summarizeMediaTraceOutput(kind: MediaResultKind, value: string): Record<string, unknown> {
  return {
    kind,
    source: getMediaResultSource(value),
    result: value,
  };
}

function normalizeLegacyReferenceInput(vendorId: string, input: ImageGenerateInput | VideoGenerateInput | AudioGenerateInput): void {
  const vendor = getVendor(vendorId);
  const version = Number.parseFloat(vendor.manifest.version ?? '1.0');

  if (Number.isFinite(version) && version >= 2) {
    return;
  }

  const legacyInput = input as ImageGenerateInput & { imageBase64?: string[] };
  if (legacyInput.referenceList?.length) {
    legacyInput.imageBase64 = legacyInput.referenceList.filter((item) => item.type === 'image').map((item) => item.base64);
  }
}

function ensureBase64SourceType<T extends { referenceList?: ReferenceItem[] }>(input: T): T {
  if (!input.referenceList) {
    return input;
  }

  input.referenceList = input.referenceList.map((item) => ({
    ...item,
    sourceType: 'base64',
  }));

  return input;
}

function cloneRuntimeInput<TInput extends ImageGenerateInput | VideoGenerateInput | AudioGenerateInput>(input: TInput): TInput {
  const { task: _task, requestId: _requestId, ...runtimeInput } = input;
  return runtimeInput as TInput;
}

function enrichRelatedObjects(relatedObjects: unknown, context: ModelCallContext): unknown {
  const modelCall = {
    requestId: context.requestId,
    protocol: context.protocol,
    vendorId: context.vendorId,
    modelName: context.modelName,
    modelType: context.modelType,
  };

  if (relatedObjects && typeof relatedObjects === 'object' && !Array.isArray(relatedObjects)) {
    return {
      ...(relatedObjects as Record<string, unknown>),
      modelCall,
    };
  }

  return {
    value: relatedObjects,
    modelCall,
  };
}

function normalizeTaskFailure(error: unknown, context: ModelCallContext): string {
  const normalized = normalizeUnknownError(error);
  return `${normalized.message || '模型任务失败'}（requestId: ${context.requestId}）`;
}

function isModelTaskCancelled(taskId: number | undefined, task: ModelTaskOptions | undefined): boolean {
  if (task?.isCancelled?.()) {
    return true;
  }

  return Boolean(taskId && isTaskCancelled(taskId));
}

async function runWithTask<T>(task: ModelTaskOptions | undefined, context: ModelCallContext, runner: (options: ModelCallRunOptions) => Promise<T>): Promise<T> {
  if (!task) {
    return runner({ retry: false });
  }

  const createdTask = task.taskId
    ? null
    : createTask({
      projectId: task.projectId,
      category: task.category,
      modelName: context.modelName,
      description: task.description,
      relatedObjects: enrichRelatedObjects(task.relatedObjects, context),
    });
  const taskId = task.taskId ?? createdTask?.taskId;

  try {
    const result = await runner({
      taskId,
      timeoutMs: task.timeoutMs,
      retry: task.retry,
      isCancelled: () => isModelTaskCancelled(taskId, task),
    });
    if (createdTask) {
      succeedTask(createdTask.taskId);
    }
    return result;
  } catch (error) {
    if (createdTask) {
      if (isVtError(error) && error.statusCode === VT_STATUS.TASK_CANCELLED) {
        cancelTask(createdTask.taskId);
      } else {
        failTask(createdTask.taskId, normalizeTaskFailure(error, context));
      }
    }
    throw error;
  }
}

function resolveMediaModel<TModel extends VendorModelConfig>(modelKey: string, expectedType: TModel['type'], requestId?: string): ModelCallContext<TModel> {
  return resolveModelCallContext<TModel>({
    modelKey,
    expectedType,
    requestId,
  });
}

function countReferences(references: ReferenceItem[] | undefined, type: ReferenceItem['type']): number {
  return references?.filter((item) => item.type === type).length ?? 0;
}

function normalizeVideoInputModeForCapability(mode: VideoGenerateInput['mode']): string | readonly string[] {
  if (typeof mode === 'string') {
    return mode;
  }

  return mode.flatMap((item) => (Array.isArray(item) ? item : [item])).map(String);
}

function assertVideoInputSupported(model: VideoModelConfig, input: VideoGenerateInput): void {
  const modeForCapability = normalizeVideoInputModeForCapability(input.mode);
  const modeKey = assertVendorVideoModeSupported(model, modeForCapability);
  const limits = getVideoModeReferenceLimits(modeForCapability);
  const imageCount = countReferences(input.referenceList, 'image');
  const videoCount = countReferences(input.referenceList, 'video');
  const audioCount = countReferences(input.referenceList, 'audio');

  if (limits.image > 0 && imageCount < limits.image && !limits.optionalStart) {
    throw createError(VT_STATUS.INVALID_PARAMS, `视频模式 ${modeKey} 至少需要 ${limits.image} 张图片参考`);
  }

  if (limits.video > 0 && videoCount < limits.video) {
    throw createError(VT_STATUS.INVALID_PARAMS, `视频模式 ${modeKey} 至少需要 ${limits.video} 个视频参考`);
  }

  if (limits.audio > 0 && audioCount < limits.audio) {
    throw createError(VT_STATUS.INVALID_PARAMS, `视频模式 ${modeKey} 至少需要 ${limits.audio} 个音频参考`);
  }

  if (input.audio && model.audio === false) {
    throw createError(VT_STATUS.INVALID_PARAMS, `视频模型 ${model.modelName} 不支持输出音频`);
  }

  if (model.audio === true && input.audio === false) {
    input.audio = true;
  }
}

export async function generateImageByModel(modelKey: string, input: ImageGenerateInput): Promise<string> {
  const context = resolveMediaModel<ImageModelConfig>(modelKey, MODEL_TYPES.IMAGE, input.requestId);
  const { runtime, vendorId, model } = context;

  if (!runtime.imageRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '供应商未导出 imageRequest', undefined, { requestId: context.requestId });
  }

  return runWithTask(input.task, context, async (options) => {
    return runModelCall(context, async () => {
      recordModelRequestTraceInput(context.requestId, 'Image input', summarizeMediaTraceInput(modelKey, input));
      const runtimeInput = cloneRuntimeInput(input);
      ensureBase64SourceType(runtimeInput);
      assertReferencePayloads(runtimeInput.referenceList);
      normalizeLegacyReferenceInput(vendorId, runtimeInput);
      recordModelRequestTraceNormalizedInput(context.requestId, 'Image adapter input', runtimeInput);
      const result = await runtime.imageRequest!(runtimeInput, model);
      const normalizedResult = await normalizeMediaResult(result, 'image');
      recordModelRequestTraceOutput(context.requestId, 'Image output', summarizeMediaTraceOutput('image', normalizedResult));
      return normalizedResult;
    }, {
      ...options,
      retry: options.retry ?? { maxAttempts: 2, delayMs: 1000, backoffFactor: 2 },
    });
  });
}

export async function generateVideoByModel(modelKey: string, input: VideoGenerateInput): Promise<string> {
  const context = resolveMediaModel<VideoModelConfig>(modelKey, MODEL_TYPES.VIDEO, input.requestId);
  const { runtime, vendorId, model } = context;

  if (!runtime.videoRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '供应商未导出 videoRequest', undefined, { requestId: context.requestId });
  }

  return runWithTask(input.task, context, async (options) => {
    return runModelCall(context, async () => {
      recordModelRequestTraceInput(context.requestId, 'Video input', summarizeMediaTraceInput(modelKey, input));
      const runtimeInput = cloneRuntimeInput(input);
      ensureBase64SourceType(runtimeInput);
      assertReferencePayloads(runtimeInput.referenceList);
      normalizeLegacyReferenceInput(vendorId, runtimeInput);
      assertVideoInputSupported(model, runtimeInput);
      recordModelRequestTraceNormalizedInput(context.requestId, 'Video adapter input', runtimeInput);
      const result = await runtime.videoRequest!(runtimeInput, model);
      const normalizedResult = await normalizeMediaResult(result, 'video');
      recordModelRequestTraceOutput(context.requestId, 'Video output', summarizeMediaTraceOutput('video', normalizedResult));
      return normalizedResult;
    }, {
      ...options,
      retry: options.retry ?? false,
    });
  });
}

export async function generateAudioByModel(modelKey: string, input: AudioGenerateInput): Promise<string> {
  const context = resolveMediaModel<TtsModelConfig>(modelKey, MODEL_TYPES.TTS, input.requestId);
  const { runtime, vendorId, model } = context;

  if (!runtime.ttsRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '供应商未导出 ttsRequest', undefined, { requestId: context.requestId });
  }

  return runWithTask(input.task, context, async (options) => {
    return runModelCall(context, async () => {
      recordModelRequestTraceInput(context.requestId, 'Audio input', summarizeMediaTraceInput(modelKey, input));
      const runtimeInput = cloneRuntimeInput(input);
      ensureBase64SourceType(runtimeInput);
      assertReferencePayloads(runtimeInput.referenceList);
      normalizeLegacyReferenceInput(vendorId, runtimeInput);
      recordModelRequestTraceNormalizedInput(context.requestId, 'Audio adapter input', runtimeInput);
      const result = await runtime.ttsRequest!(runtimeInput, model);
      const normalizedResult = await normalizeMediaResult(result, 'audio');
      recordModelRequestTraceOutput(context.requestId, 'Audio output', summarizeMediaTraceOutput('audio', normalizedResult));
      return normalizedResult;
    }, {
      ...options,
      retry: options.retry ?? { maxAttempts: 2, delayMs: 1000, backoffFactor: 2 },
    });
  });
}
