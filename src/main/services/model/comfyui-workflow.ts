import { randomUUID } from 'node:crypto';
import { VT_STATUS } from '@shared/constants/status';
import {
  COMFYUI_WORKFLOW_SCHEMA,
  type ComfyUiNodeInputPointer,
  type ComfyUiReferenceImagePointer,
  type ComfyUiWorkflowManifest,
  type ComfyUiWorkflowNode,
  type ComfyUiWorkflowValidationResult,
} from '@shared/types/comfyui-workflow';
import { createError } from '../result';
import type { ImageGenerateInput, ImageModelConfig, ReferenceItem } from './types';

interface ComfyUiImageOutput {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface UploadedReferenceImage {
  index: number;
  name: string;
}

const DEFAULT_COMFYUI_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_COMFYUI_POLL_INTERVAL_MS = 1500;
const MIN_COMFYUI_POLL_INTERVAL_MS = 500;
const MAX_COMFYUI_POLL_INTERVAL_MS = 10000;
const MIN_COMFYUI_TIMEOUT_MS = 5000;
const MAX_COMFYUI_TIMEOUT_MS = 60 * 60 * 1000;
const COMFYUI_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, `${label}不能为空`);
  }

  return value.trim();
}

function normalizeEndpoint(value: string): string {
  const endpoint = assertNonEmptyString(value, 'ComfyUI Endpoint').replace(/\/+$/, '');

  try {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw createError(VT_STATUS.FORBIDDEN, `ComfyUI Endpoint 不允许使用 ${parsed.protocol} 协议`);
    }

    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }

    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, 'ComfyUI Endpoint 无效', error);
  }
}

function normalizePointer(value: unknown, label: string): ComfyUiNodeInputPointer {
  if (!isRecord(value)) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, `${label} 必须是对象`);
  }

  return {
    nodeId: assertNonEmptyString(value.nodeId, `${label}.nodeId`),
    input: assertNonEmptyString(value.input, `${label}.input`),
  };
}

function normalizeReferencePointer(value: unknown, index: number): ComfyUiReferenceImagePointer {
  const pointer = normalizePointer(value, `inputs.referenceImages[${index}]`);
  return {
    ...pointer,
    index: Number.isInteger((value as { index?: unknown }).index) ? Number((value as { index?: unknown }).index) : index,
  };
}

function assertWorkflowNodeExists(workflow: Record<string, ComfyUiWorkflowNode>, pointer: ComfyUiNodeInputPointer, label: string): void {
  const node = workflow[pointer.nodeId];
  if (!isRecord(node)) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, `${label} 指向的节点不存在：${pointer.nodeId}`);
  }

  if (!isRecord(node.inputs)) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, `${label} 指向的节点没有 inputs：${pointer.nodeId}`);
  }
}

function findFirstPromptPointer(workflow: Record<string, ComfyUiWorkflowNode>): ComfyUiNodeInputPointer | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!isRecord(node) || !isRecord(node.inputs)) {
      continue;
    }

    if (typeof node.inputs.text === 'string') {
      return { nodeId, input: 'text' };
    }
  }

  return null;
}

function findOutputNodeIds(workflow: Record<string, ComfyUiWorkflowNode>): string[] {
  const outputNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    const classType = typeof node.class_type === 'string' ? node.class_type.toLowerCase() : '';
    if (classType.includes('saveimage') || classType.includes('previewimage')) {
      outputNodeIds.push(nodeId);
    }
  }

  return outputNodeIds;
}

function normalizeWorkflow(value: unknown): Record<string, ComfyUiWorkflowNode> {
  if (!isRecord(value)) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, 'ComfyUI workflow 必须是对象');
  }

  const workflow: Record<string, ComfyUiWorkflowNode> = {};
  for (const [nodeId, node] of Object.entries(value)) {
    if (!isRecord(node)) {
      throw createError(VT_STATUS.MODEL_VENDOR_INVALID, `ComfyUI workflow 节点无效：${nodeId}`);
    }

    workflow[nodeId] = node as ComfyUiWorkflowNode;
  }

  if (Object.keys(workflow).length === 0) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, 'ComfyUI workflow 不能为空');
  }

  return workflow;
}

function normalizeManifest(value: unknown): ComfyUiWorkflowManifest {
  if (!isRecord(value)) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, 'ComfyUI Workflow Manifest 必须是 JSON 对象');
  }

  if (value.schema !== COMFYUI_WORKFLOW_SCHEMA) {
    const workflow = normalizeWorkflow(value);
    const prompt = findFirstPromptPointer(workflow);
    const outputNodeIds = findOutputNodeIds(workflow);
    if (!prompt || outputNodeIds.length === 0) {
      throw createError(
        VT_STATUS.MODEL_VENDOR_INVALID,
        `原生 ComfyUI workflow 缺少可自动识别的 prompt/output 节点；请使用 ${COMFYUI_WORKFLOW_SCHEMA} manifest 明确节点映射`,
      );
    }

    return {
      schema: COMFYUI_WORKFLOW_SCHEMA,
      workflow,
      inputs: { prompt },
      outputs: { images: outputNodeIds.map((nodeId) => ({ nodeId })) },
    };
  }

  const workflow = normalizeWorkflow(value.workflow);
  const inputs = isRecord(value.inputs) ? value.inputs : {};
  const outputs = isRecord(value.outputs) ? value.outputs : {};
  if (!Array.isArray(outputs.images) || outputs.images.length === 0) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, 'ComfyUI manifest.outputs.images 至少需要一个输出节点');
  }

  const manifest: ComfyUiWorkflowManifest = {
    schema: COMFYUI_WORKFLOW_SCHEMA,
    name: typeof value.name === 'string' ? value.name : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    workflow,
    inputs: {
      prompt: normalizePointer(inputs.prompt, 'inputs.prompt'),
      negativePrompt: inputs.negativePrompt ? normalizePointer(inputs.negativePrompt, 'inputs.negativePrompt') : undefined,
      seed: inputs.seed ? normalizePointer(inputs.seed, 'inputs.seed') : undefined,
      width: inputs.width ? normalizePointer(inputs.width, 'inputs.width') : undefined,
      height: inputs.height ? normalizePointer(inputs.height, 'inputs.height') : undefined,
      batchSize: inputs.batchSize ? normalizePointer(inputs.batchSize, 'inputs.batchSize') : undefined,
      referenceImages: Array.isArray(inputs.referenceImages) ? inputs.referenceImages.map(normalizeReferencePointer) : undefined,
    },
    outputs: {
      images: outputs.images.map((item, index) => {
        if (!isRecord(item)) {
          throw createError(VT_STATUS.MODEL_VENDOR_INVALID, `outputs.images[${index}] 必须是对象`);
        }

        return { nodeId: assertNonEmptyString(item.nodeId, `outputs.images[${index}].nodeId`) };
      }),
    },
    options: isRecord(value.options)
      ? {
          pollIntervalMs: Number(value.options.pollIntervalMs),
          timeoutMs: Number(value.options.timeoutMs),
        }
      : undefined,
  };

  const pointers = [
    ['inputs.prompt', manifest.inputs.prompt],
    ['inputs.negativePrompt', manifest.inputs.negativePrompt],
    ['inputs.seed', manifest.inputs.seed],
    ['inputs.width', manifest.inputs.width],
    ['inputs.height', manifest.inputs.height],
    ['inputs.batchSize', manifest.inputs.batchSize],
    ...(manifest.inputs.referenceImages ?? []).map((pointer, index) => [`inputs.referenceImages[${index}]`, pointer] as const),
  ] as const;

  for (const [label, pointer] of pointers) {
    if (pointer) {
      assertWorkflowNodeExists(workflow, pointer, label);
    }
  }

  for (const output of manifest.outputs.images) {
    if (!workflow[output.nodeId]) {
      throw createError(VT_STATUS.MODEL_VENDOR_INVALID, `outputs.images 指向的节点不存在：${output.nodeId}`);
    }
  }

  return manifest;
}

export function parseComfyUiWorkflowManifest(raw: string): ComfyUiWorkflowManifest {
  const content = assertNonEmptyString(raw, 'ComfyUI Workflow Manifest');

  try {
    return normalizeManifest(JSON.parse(content));
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }

    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, 'ComfyUI Workflow Manifest 不是合法 JSON', error);
  }
}

export function validateComfyUiWorkflowManifest(raw: string): ComfyUiWorkflowValidationResult {
  try {
    const manifest = parseComfyUiWorkflowManifest(raw);
    return {
      ok: true,
      reason: 'Workflow Manifest 有效',
      nodeCount: Object.keys(manifest.workflow).length,
      outputNodeIds: manifest.outputs.images.map((item) => item.nodeId),
      referenceImageCount: manifest.inputs.referenceImages?.length ?? 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow Manifest 无效';
    return {
      ok: false,
      reason: message,
      nodeCount: 0,
      outputNodeIds: [],
      referenceImageCount: 0,
    };
  }
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value!)));
}

function getWorkflowTimeoutMs(manifest: ComfyUiWorkflowManifest): number {
  return clampNumber(manifest.options?.timeoutMs, DEFAULT_COMFYUI_TIMEOUT_MS, MIN_COMFYUI_TIMEOUT_MS, MAX_COMFYUI_TIMEOUT_MS);
}

function getWorkflowPollIntervalMs(manifest: ComfyUiWorkflowManifest): number {
  return clampNumber(manifest.options?.pollIntervalMs, DEFAULT_COMFYUI_POLL_INTERVAL_MS, MIN_COMFYUI_POLL_INTERVAL_MS, MAX_COMFYUI_POLL_INTERVAL_MS);
}

function parseAspectRatio(value: string): { width: number; height: number } {
  const [width, height] = value.split(':').map(Number);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  return { width: 16, height: 9 };
}

function roundToMultipleOfEight(value: number): number {
  return Math.max(64, Math.round(value / 8) * 8);
}

function getComfyUiDimensions(input: ImageGenerateInput): { width: number; height: number } {
  const longEdgeMap = {
    '1K': 1024,
    '2K': 2048,
    '3K': 3072,
    '4K': 4096,
  } satisfies Record<NonNullable<ImageGenerateInput['size']>, number>;
  const longEdge = input.size ? longEdgeMap[input.size] : 1024;
  const ratio = parseAspectRatio(input.aspectRatio ?? '16:9');

  if (ratio.width >= ratio.height) {
    return {
      width: longEdge,
      height: roundToMultipleOfEight(longEdge * (ratio.height / ratio.width)),
    };
  }

  return {
    width: roundToMultipleOfEight(longEdge * (ratio.width / ratio.height)),
    height: longEdge,
  };
}

function setNodeInput(workflow: Record<string, ComfyUiWorkflowNode>, pointer: ComfyUiNodeInputPointer | undefined, value: unknown): void {
  if (!pointer) {
    return;
  }

  const node = workflow[pointer.nodeId];
  if (!node || !isRecord(node.inputs)) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, `ComfyUI 节点映射失效：${pointer.nodeId}.${pointer.input}`);
  }

  node.inputs[pointer.input] = value;
}

function getBase64Payload(value: string): { mime: string; payload: string } {
  const normalized = value.trim();
  const dataUrlMatch = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(normalized);
  return {
    mime: dataUrlMatch?.[1] ?? 'image/png',
    payload: (dataUrlMatch?.[2] ?? normalized).replace(/\s/g, ''),
  };
}

function referenceToBuffer(reference: Extract<ReferenceItem, { type: 'image' }>): { buffer: Buffer; mime: string } {
  const payload = getBase64Payload(reference.base64);
  if (!payload.payload || payload.payload.length % 4 === 1 || !/^[a-z0-9+/]+={0,2}$/i.test(payload.payload)) {
    throw createError(VT_STATUS.INVALID_PARAMS, 'ComfyUI 参考图不是有效 base64');
  }

  const buffer = Buffer.from(payload.payload, 'base64');
  if (buffer.byteLength > COMFYUI_UPLOAD_MAX_BYTES) {
    throw createError(VT_STATUS.INVALID_PARAMS, `ComfyUI 参考图超过大小限制：${buffer.byteLength} bytes`);
  }

  return { buffer, mime: payload.mime };
}

function imageMimeToExtension(mime: string): string {
  if (/jpe?g/i.test(mime)) {
    return 'jpg';
  }

  if (/webp/i.test(mime)) {
    return 'webp';
  }

  return 'png';
}

function buildWorkflowPrompt(
  manifest: ComfyUiWorkflowManifest,
  input: ImageGenerateInput,
  uploadedReferences: UploadedReferenceImage[],
): Record<string, ComfyUiWorkflowNode> {
  const workflow = cloneJson(manifest.workflow);
  const dimensions = getComfyUiDimensions(input);

  setNodeInput(workflow, manifest.inputs.prompt, input.prompt);
  setNodeInput(workflow, manifest.inputs.width, dimensions.width);
  setNodeInput(workflow, manifest.inputs.height, dimensions.height);
  setNodeInput(workflow, manifest.inputs.batchSize, 1);

  if (manifest.inputs.seed) {
    setNodeInput(workflow, manifest.inputs.seed, Math.floor(Math.random() * 2 ** 31));
  }

  for (const referencePointer of manifest.inputs.referenceImages ?? []) {
    const uploaded = uploadedReferences.find((item) => item.index === (referencePointer.index ?? 0));
    if (uploaded) {
      setNodeInput(workflow, referencePointer, uploaded.name);
    }
  }

  return workflow;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    throw createError(VT_STATUS.MODEL_ERROR, 'ComfyUI 请求失败', error);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  if (!response.ok) {
    throw createError(VT_STATUS.MODEL_ERROR, `ComfyUI 请求失败：${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw createError(VT_STATUS.MODEL_ERROR, 'ComfyUI 返回不是合法 JSON', error);
  }
}

async function uploadReferenceImage(endpoint: string, reference: Extract<ReferenceItem, { type: 'image' }>, index: number, timeoutMs: number): Promise<UploadedReferenceImage> {
  const { buffer, mime } = referenceToBuffer(reference);
  const extension = imageMimeToExtension(mime);
  const filename = `vt-studio-${Date.now()}-${index}-${randomUUID().slice(0, 8)}.${extension}`;
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)], { type: mime }), filename);
  form.append('overwrite', 'true');

  const data = await fetchJson(`${endpoint}/upload/image`, { method: 'POST', body: form }, timeoutMs);
  const imageName = isRecord(data) && typeof data.name === 'string' ? data.name : filename;
  return { index, name: imageName };
}

async function uploadReferenceImages(endpoint: string, input: ImageGenerateInput, manifest: ComfyUiWorkflowManifest, timeoutMs: number): Promise<UploadedReferenceImage[]> {
  const imageReferences = input.referenceList?.filter((item): item is Extract<ReferenceItem, { type: 'image' }> => item.type === 'image') ?? [];
  if (imageReferences.length === 0) {
    return [];
  }

  if (!manifest.inputs.referenceImages?.length) {
    throw createError(VT_STATUS.INVALID_PARAMS, '当前 ComfyUI workflow 没有配置参考图节点，不能使用图生图或多参考图');
  }

  const maxReferences = manifest.inputs.referenceImages.length;
  if (imageReferences.length > maxReferences) {
    throw createError(VT_STATUS.INVALID_PARAMS, `当前 ComfyUI workflow 最多支持 ${maxReferences} 张参考图`);
  }

  const uploaded: UploadedReferenceImage[] = [];
  for (let index = 0; index < imageReferences.length; index += 1) {
    uploaded.push(await uploadReferenceImage(endpoint, imageReferences[index], index, timeoutMs));
  }

  return uploaded;
}

function extractPromptId(value: unknown): string {
  if (isRecord(value) && typeof value.prompt_id === 'string' && value.prompt_id.trim()) {
    return value.prompt_id;
  }

  throw createError(VT_STATUS.MODEL_ERROR, 'ComfyUI 未返回 prompt_id');
}

async function queuePrompt(endpoint: string, workflow: Record<string, ComfyUiWorkflowNode>, timeoutMs: number): Promise<string> {
  const data = await fetchJson(
    `${endpoint}/prompt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: `vt-studio-${randomUUID()}`,
        prompt: workflow,
      }),
    },
    timeoutMs,
  );

  return extractPromptId(data);
}

function getHistoryItem(history: unknown, promptId: string): Record<string, unknown> | null {
  if (!isRecord(history)) {
    return null;
  }

  const direct = history[promptId];
  if (isRecord(direct)) {
    return direct;
  }

  return history;
}

function extractOutputImages(historyItem: Record<string, unknown>, manifest: ComfyUiWorkflowManifest): ComfyUiImageOutput[] {
  const outputs = isRecord(historyItem.outputs) ? historyItem.outputs : {};
  const images: ComfyUiImageOutput[] = [];

  for (const output of manifest.outputs.images) {
    const nodeOutput = outputs[output.nodeId];
    if (!isRecord(nodeOutput) || !Array.isArray(nodeOutput.images)) {
      continue;
    }

    for (const image of nodeOutput.images) {
      if (isRecord(image) && typeof image.filename === 'string' && image.filename.trim()) {
        images.push({
          filename: image.filename,
          subfolder: typeof image.subfolder === 'string' ? image.subfolder : '',
          type: typeof image.type === 'string' ? image.type : 'output',
        });
      }
    }
  }

  return images;
}

function extractComfyUiFailure(historyItem: Record<string, unknown>): string | null {
  if (isRecord(historyItem.status)) {
    const status = historyItem.status;
    const statusText = typeof status.status_str === 'string' ? status.status_str.toLowerCase() : '';
    if (statusText.includes('error')) {
      return typeof status.completed === 'boolean' && !status.completed ? 'ComfyUI workflow 执行失败' : `ComfyUI 状态异常：${status.status_str}`;
    }
  }

  if (isRecord(historyItem.error)) {
    return JSON.stringify(historyItem.error).slice(0, 500);
  }

  return null;
}

async function pollPromptHistory(endpoint: string, promptId: string, manifest: ComfyUiWorkflowManifest): Promise<ComfyUiImageOutput> {
  const startedAt = Date.now();
  const timeoutMs = getWorkflowTimeoutMs(manifest);
  const pollIntervalMs = getWorkflowPollIntervalMs(manifest);

  while (Date.now() - startedAt < timeoutMs) {
    const history = await fetchJson(`${endpoint}/history/${encodeURIComponent(promptId)}`, { method: 'GET' }, Math.min(30000, timeoutMs));
    const historyItem = getHistoryItem(history, promptId);
    if (!historyItem) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    const failure = extractComfyUiFailure(historyItem);
    if (failure) {
      throw createError(VT_STATUS.MODEL_ERROR, failure);
    }

    const images = extractOutputImages(historyItem, manifest);
    if (images[0]) {
      return images[0];
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw createError(VT_STATUS.MODEL_TIMEOUT, `ComfyUI workflow 超时：${Math.round(timeoutMs / 1000)} 秒`);
}

async function downloadOutputImage(endpoint: string, output: ComfyUiImageOutput, timeoutMs: number): Promise<string> {
  const params = new URLSearchParams({
    filename: output.filename,
    subfolder: output.subfolder ?? '',
    type: output.type ?? 'output',
  });
  const response = await fetchWithTimeout(`${endpoint}/view?${params.toString()}`, { method: 'GET' }, timeoutMs);
  if (!response.ok) {
    throw createError(VT_STATUS.MODEL_ERROR, `ComfyUI 输出图片读取失败：${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? 'image/png';
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw createError(VT_STATUS.MODEL_ERROR, 'ComfyUI 输出不是图片');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export async function executeComfyUiImageWorkflow(
  config: ImageGenerateInput,
  _model: ImageModelConfig,
  inputValues: Record<string, string>,
): Promise<string> {
  const endpoint = normalizeEndpoint(inputValues.endpoint || inputValues.baseUrl);
  const manifest = parseComfyUiWorkflowManifest(inputValues.workflowManifest || inputValues.workflow);
  const timeoutMs = getWorkflowTimeoutMs(manifest);
  const uploadedReferences = await uploadReferenceImages(endpoint, config, manifest, timeoutMs);
  const workflow = buildWorkflowPrompt(manifest, config, uploadedReferences);
  const promptId = await queuePrompt(endpoint, workflow, timeoutMs);
  const output = await pollPromptHistory(endpoint, promptId, manifest);
  return downloadOutputImage(endpoint, output, timeoutMs);
}
