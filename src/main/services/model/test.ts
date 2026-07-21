import sharp from 'sharp';
import { getVideoModeReferenceLimits } from '@shared/constants/model-capabilities';
import { VT_STATUS } from '@shared/constants/status';
import { isVtError, normalizeUnknownError } from '@shared/errors';
import { writeManagedFile, getRuntimeDirectories } from '../file-system';
import { createError } from '../result';
import { MODEL_TEST_FILE_NAMES } from './constants';
import { getModelDetail } from './resolver';
import type { ImageGenerateInput, ModelTestImageInput, ModelTestTextInput, ModelTestVideoInput, ReferenceItem, VideoGenerateInput, VideoModelConfig } from './types';
import { generateImageByModel, generateVideoByModel } from './media';
import { invokeText } from './text';

function formatTextTestErrorMessage(message: string): string {
  if (/invalid json response/i.test(message)) {
    return '接口返回了非 JSON。中转地址通常应填到 /v1，不要填完整的 /chat/completions 或 /responses；也可能是网关返回了网页错误页';
  }

  return message;
}

function formatImagePermissionErrorMessage(message: string): string {
  if (!/Image generation is not enabled for this group/i.test(message)) {
    return message;
  }

  if (/未开通图片生成权限/.test(message)) {
    return message;
  }

  return `${message}。上游返回 403：当前 API Key/Group 未开通图片生成权限；请在中转服务后台启用图片生成，或换用已开通图片能力的 Key、模型或供应商`;
}

function formatModelTestErrorMessage(message: string): string {
  return formatImagePermissionErrorMessage(formatTextTestErrorMessage(message.replace(/^(文本|图片|视频|TTS)\s+\S+调用失败：/, '')));
}

function throwFormattedModelTestError(error: unknown): never {
  if (isVtError(error)) {
    if (error.statusCode === VT_STATUS.MODEL_ERROR) {
      throw createError(VT_STATUS.MODEL_ERROR, `模型测试失败：${formatModelTestErrorMessage(error.message)}`, error, { requestId: error.requestId, msgKey: error.msgKey });
    }

    throw error;
  }

  const normalized = normalizeUnknownError(error);
  throw createError(VT_STATUS.MODEL_ERROR, `模型测试失败：${formatModelTestErrorMessage(normalized.message)}`, error);
}

function decodeBase64Media(value: string, fallbackMime: string, label: string): { mime: string; buffer: Buffer } {
  const normalized = value.trim();
  const dataUrlMatch = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(normalized);
  const mime = dataUrlMatch?.[1]?.toLowerCase() ?? fallbackMime;
  const payload = (dataUrlMatch?.[2] ?? normalized).replace(/\s/g, '');

  if (!payload || payload.length % 4 === 1 || !/^[a-z0-9+/]+={0,2}$/i.test(payload)) {
    throw createError(VT_STATUS.MODEL_ERROR, `模型返回的${label}不是有效 base64`);
  }

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.byteLength < 32) {
    throw createError(VT_STATUS.MODEL_ERROR, `模型返回的${label}内容为空或过小`);
  }

  return { mime, buffer };
}

function isAspectRatio(value: string | undefined): value is `${number}:${number}` {
  return Boolean(value?.trim() && /^[1-9]\d*:[1-9]\d*$/.test(value.trim()));
}

function resolveImageSize(value: ModelTestImageInput['imageSize']): ImageGenerateInput['size'] {
  if (value === undefined) return undefined;
  if (['1K', '2K', '3K', '4K'].includes(value)) return value as ImageGenerateInput['size'];
  throw createError(VT_STATUS.INVALID_PARAMS, `图片规格无效：${value}`);
}

function resolveImageAspectRatio(value: ModelTestImageInput['aspectRatio']): ImageGenerateInput['aspectRatio'] | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!isAspectRatio(normalized)) throw createError(VT_STATUS.INVALID_PARAMS, `图片比例无效：${normalized}`);
  return normalized;
}

function resolveVideoAspectRatio(value: ModelTestVideoInput['aspectRatio']): VideoGenerateInput['aspectRatio'] | undefined {
  if (value === undefined) return undefined;
  if (value === '16:9' || value === '9:16') return value;
  throw createError(VT_STATUS.INVALID_PARAMS, `视频比例无效：${value}`);
}

function createImageReferences(values: Array<string | undefined>): Extract<ReferenceItem, { type: 'image' }>[] {
  return values
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .map((base64) => ({ type: 'image', sourceType: 'base64', base64 }));
}

function normalizeVideoModeForLimits(mode: ModelTestVideoInput['mode']): string | readonly string[] {
  if (typeof mode === 'string') {
    return mode;
  }

  return mode.flatMap((item) => (Array.isArray(item) ? item : [item])).map(String);
}

function getImageReferenceMinimum(mode: ModelTestImageInput['imageMode']): number {
  if (mode === 'singleImage' || mode === 'multiReference') {
    return 1;
  }

  return 0;
}

function assertReferenceCount(label: string, expected: number, actual: number): void {
  if (expected > 0 && actual < expected) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}至少需要 ${expected} 张参考图`);
  }
}

async function createPngImageTestResult(content: string): Promise<{ filePath: string; content: string }> {
  const decoded = decodeBase64Media(content, 'image/png', '图片');
  const pngBuffer = await sharp(decoded.buffer).png().toBuffer();
  const filePath = writeManagedFile(getRuntimeDirectories().modelTest, MODEL_TEST_FILE_NAMES.image, pngBuffer);

  return {
    filePath,
    content: `data:image/png;base64,${pngBuffer.toString('base64')}`,
  };
}

function createVideoTestResult(content: string): { filePath: string; content: string } {
  const decoded = decodeBase64Media(content, 'video/mp4', '视频');
  const fileName = decoded.mime.includes('webm')
    ? 'test-video.webm'
    : decoded.mime.includes('quicktime')
      ? 'test-video.mov'
      : MODEL_TEST_FILE_NAMES.video;
  const filePath = writeManagedFile(getRuntimeDirectories().modelTest, fileName, decoded.buffer);

  return {
    filePath,
    content: content.startsWith('data:') ? content : `data:${decoded.mime};base64,${decoded.buffer.toString('base64')}`,
  };
}

export async function testTextModel(input: ModelTestTextInput): Promise<{ thinking?: string; content: string }> {
  try {
    const result = await invokeText({
      modelKey: `${input.vendorId}:${input.modelName}`,
      messages: input.messages,
      think: input.think,
      reasoningEffort: input.reasoningEffort,
    });

    return {
      thinking: typeof result.reasoningText === 'string' ? result.reasoningText : undefined,
      content: result.text,
    };
  } catch (error) {
    throwFormattedModelTestError(error);
  }
}

export async function testImageModel(input: ModelTestImageInput): Promise<{ filePath: string; content: string }> {
  try {
    const referenceList = createImageReferences([...(input.referenceImages ?? []), input.imageBase64]);
    assertReferenceCount('图片测试', getImageReferenceMinimum(input.imageMode), referenceList.length);

    const content = await generateImageByModel(`${input.vendorId}:${input.modelName}`, {
      prompt: input.prompt,
      referenceList,
      size: resolveImageSize(input.imageSize),
      aspectRatio: resolveImageAspectRatio(input.aspectRatio),
    });

    return await createPngImageTestResult(content);
  } catch (error) {
    throwFormattedModelTestError(error);
  }
}

export async function testVideoModel(input: ModelTestVideoInput): Promise<{ filePath: string; content: string }> {
  try {
    getModelDetail(`${input.vendorId}:${input.modelName}`) as VideoModelConfig;
    if (!Number.isFinite(input.duration) || Number(input.duration) <= 0) throw createError(VT_STATUS.INVALID_PARAMS, '请选择视频时长');
    const resolution = input.resolution?.trim();
    if (!resolution) throw createError(VT_STATUS.INVALID_PARAMS, '请选择视频分辨率');
    const referenceImages = createImageReferences(input.referenceImages ?? []);
    const referenceList = [...referenceImages, ...input.images, ...input.videos, ...input.audios];
    const limits = getVideoModeReferenceLimits(normalizeVideoModeForLimits(input.mode));
    assertReferenceCount('视频测试', limits.image, referenceImages.length + input.images.length);
    const content = await generateVideoByModel(`${input.vendorId}:${input.modelName}`, {
      duration: Number(input.duration),
      resolution,
      aspectRatio: resolveVideoAspectRatio(input.aspectRatio),
      prompt: input.prompt,
      referenceList,
      audio: input.audio,
      mode: input.mode,
    });

    return createVideoTestResult(content);
  } catch (error) {
    throwFormattedModelTestError(error);
  }
}
