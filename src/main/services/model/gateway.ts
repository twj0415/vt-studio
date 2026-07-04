import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { VT_STATUS } from '@shared/constants/status';
import { isVtError, normalizeUnknownError } from '@shared/errors';
import { createError } from '../result';
import { logger } from '../logger';
import { getBusinessSettings } from '../settings/business-settings';
import { isTaskCancelled } from '../task/service';
import { MODEL_TYPES, type AgentModelKey, type ModelType } from './constants';
import { CONNECTION_PROJECTION_ADAPTER_KEY } from './connection-projection';
import { resolveModelKey, splitModelId } from './resolver';
import { isBuiltinVendor } from './builtin-vendors';
import {
  recordModelRequestAttempt,
  recordModelRequestFailure,
  recordModelRequestRetry,
  recordModelRequestStart,
  recordModelRequestSuccess,
} from './request-diagnostics';
import { getVendorRuntime } from './vendor-service';
import type { AgentModelConfig, ModelCallRetryOptions, VendorModelConfig, VendorRuntime } from './types';

export type ModelCallType = Exclude<ModelType, 'all'>;
export type ModelProtocol = 'sdk' | 'openai-compatible' | 'builtin-adapter' | 'custom-adapter' | 'workflow';

export interface ModelCallContext<TModel extends VendorModelConfig = VendorModelConfig> {
  requestId: string;
  inputKey: AgentModelKey | string;
  modelId: string;
  vendorId: string;
  protocolVendorId: string;
  vendorName: string;
  modelName: string;
  modelType: ModelCallType;
  protocol: ModelProtocol;
  runtime: VendorRuntime;
  model: TModel;
  agentConfig: AgentModelConfig | null;
}

interface ResolveModelCallContextInput<TType extends ModelCallType> {
  modelKey: AgentModelKey | string;
  expectedType: TType;
  requestId?: string;
}

export interface ModelCallRunOptions {
  timeoutMs?: number;
  retry?: ModelCallRetryOptions | false;
  taskId?: number;
  isCancelled?: () => boolean;
}

interface NormalizedRetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffFactor: number;
}

const MODEL_TYPE_LABELS: Record<ModelCallType, string> = {
  [MODEL_TYPES.TEXT]: '文本',
  [MODEL_TYPES.IMAGE]: '图片',
  [MODEL_TYPES.VIDEO]: '视频',
  [MODEL_TYPES.TTS]: 'TTS',
};

const OPENAI_COMPATIBLE_VENDOR_IDS = new Set(['atlascloud', 'volcengine', 'minimax']);
const DEFAULT_MODEL_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_MODEL_TIMEOUT_MS = 1000;
const MAX_MODEL_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRY_ATTEMPTS = 3;

export function createModelRequestId(): string {
  return `model_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function isOfficialOpenAiBaseUrl(baseUrl: string | undefined): boolean {
  const value = baseUrl?.trim();
  if (!value) {
    return true;
  }

  try {
    return new URL(value).hostname === 'api.openai.com';
  } catch {
    return false;
  }
}

function detectProtocolByVendor(vendorId: string, inputValues: Record<string, string>, modelType: ModelCallType): ModelProtocol {
  if (vendorId === 'comfyui') {
    return 'workflow';
  }

  if (!isBuiltinVendor(vendorId)) {
    return 'custom-adapter';
  }

  if (modelType !== MODEL_TYPES.TEXT) {
    return 'builtin-adapter';
  }

  if (OPENAI_COMPATIBLE_VENDOR_IDS.has(vendorId)) {
    return 'openai-compatible';
  }

  if (vendorId === 'openai' && !isOfficialOpenAiBaseUrl(inputValues.baseUrl)) {
    return 'openai-compatible';
  }

  return 'sdk';
}

function detectModelProtocol(vendorId: string, runtime: VendorRuntime, modelType: ModelCallType): { protocol: ModelProtocol; protocolVendorId: string } {
  const inputValues = runtime.vendor?.inputValues ?? {};
  const adapterVendorId = inputValues[CONNECTION_PROJECTION_ADAPTER_KEY]?.trim();
  const protocolVendorId = adapterVendorId || vendorId;

  return {
    protocolVendorId,
    protocol: detectProtocolByVendor(protocolVendorId, inputValues, modelType),
  };
}

function getLogMeta(context: Pick<ModelCallContext, 'requestId' | 'vendorId' | 'protocolVendorId' | 'vendorName' | 'modelName' | 'modelType' | 'protocol'>, extra: Record<string, unknown> = {}) {
  return {
    requestId: context.requestId,
    vendorId: context.vendorId,
    protocolVendorId: context.protocolVendorId,
    vendorName: context.vendorName,
    modelName: context.modelName,
    modelType: context.modelType,
    protocol: context.protocol,
    ...extra,
  };
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value!)));
}

function getDefaultTimeoutMs(): number {
  try {
    return getBusinessSettings().config.requestTimeoutMs;
  } catch {
    return DEFAULT_MODEL_TIMEOUT_MS;
  }
}

function normalizeTimeoutMs(timeoutMs: number | undefined): number {
  return clampNumber(timeoutMs, getDefaultTimeoutMs(), MIN_MODEL_TIMEOUT_MS, MAX_MODEL_TIMEOUT_MS);
}

function normalizeRetryOptions(retry: ModelCallRunOptions['retry']): NormalizedRetryOptions {
  if (retry === false) {
    return {
      maxAttempts: 1,
      delayMs: DEFAULT_RETRY_DELAY_MS,
      backoffFactor: 1,
    };
  }

  return {
    maxAttempts: clampNumber(retry?.maxAttempts, 1, 1, MAX_RETRY_ATTEMPTS),
    delayMs: clampNumber(retry?.delayMs, DEFAULT_RETRY_DELAY_MS, 100, 30000),
    backoffFactor: clampNumber(retry?.backoffFactor, 1, 1, 5),
  };
}

function isTaskCancellationError(error: unknown): boolean {
  return isVtError(error) && error.statusCode === VT_STATUS.TASK_CANCELLED;
}

function shouldRetryModelError(error: unknown): boolean {
  if (isVtError(error)) {
    if (
      error.statusCode === VT_STATUS.TASK_CANCELLED ||
      error.statusCode === VT_STATUS.INVALID_PARAMS ||
      error.statusCode === VT_STATUS.UNAUTHORIZED ||
      error.statusCode === VT_STATUS.FORBIDDEN ||
      error.statusCode === VT_STATUS.MODEL_NOT_CONFIGURED ||
      error.statusCode === VT_STATUS.MODEL_API_KEY_MISSING ||
      error.statusCode === VT_STATUS.MODEL_VENDOR_INVALID ||
      error.statusCode === VT_STATUS.MODEL_NOT_FOUND ||
      error.statusCode === VT_STATUS.MODEL_VENDOR_INPUT_MISSING ||
      error.statusCode === VT_STATUS.MODEL_TIMEOUT
    ) {
      return false;
    }
  }

  const normalized = normalizeUnknownError(error);
  const message = `${normalized.name} ${normalized.message}`.toLowerCase();
  return (
    /\b(econnreset|econnrefused|etimedout|eai_again|enotfound|socket hang up|network|fetch failed|temporarily unavailable)\b/.test(message) ||
    /\b(408|409|425|429|500|502|503|504)\b/.test(message)
  );
}

function assertModelCallNotCancelled(options: ModelCallRunOptions, requestId: string): void {
  if (options.taskId && isTaskCancelled(options.taskId)) {
    throw createError(VT_STATUS.TASK_CANCELLED, '模型调用已取消', undefined, { requestId });
  }

  if (options.isCancelled?.()) {
    throw createError(VT_STATUS.TASK_CANCELLED, '模型调用已取消', undefined, { requestId });
  }
}

async function withModelTimeout<TResult>(runner: () => Promise<TResult>, timeoutMs: number, requestId: string): Promise<TResult> {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      runner(),
      new Promise<TResult>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(createError(VT_STATUS.MODEL_TIMEOUT, `模型调用超时：${Math.round(timeoutMs / 1000)} 秒`, undefined, { requestId }));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function toModelCallError(error: unknown, context: { requestId: string; modelType?: ModelCallType; modelName?: string }): Error {
  if (isVtError(error)) {
    return createError(error.statusCode, error.message, { cause: normalizeUnknownError(error) }, { msgKey: error.msgKey, requestId: error.requestId ?? context.requestId });
  }

  const normalized = normalizeUnknownError(error);
  const label = context.modelType ? MODEL_TYPE_LABELS[context.modelType] : '模型';
  const modelName = context.modelName ? ` ${context.modelName}` : '';
  return createError(VT_STATUS.MODEL_ERROR, `${label}${modelName}调用失败：${normalized.message}`, { cause: normalized }, { requestId: context.requestId });
}

export function resolveModelCallContext<TModel extends VendorModelConfig, TType extends ModelCallType = ModelCallType>(
  input: ResolveModelCallContextInput<TType>,
): ModelCallContext<TModel> {
  const requestId = input.requestId ?? createModelRequestId();

  try {
    const resolved = resolveModelKey(input.modelKey);
    const { vendorId, modelName } = splitModelId(resolved.modelId);
    const runtime = getVendorRuntime(vendorId);
    const model = runtime.vendor?.models.find((item) => item.modelName === modelName);

    if (!model || model.type !== input.expectedType) {
      throw createError(VT_STATUS.MODEL_NOT_FOUND, `未找到${MODEL_TYPE_LABELS[input.expectedType]}模型 ${modelName}`, undefined, { requestId });
    }

    const protocol = detectModelProtocol(vendorId, runtime, input.expectedType);

    return {
      requestId,
      inputKey: input.modelKey,
      modelId: resolved.modelId,
      vendorId,
      protocolVendorId: protocol.protocolVendorId,
      vendorName: runtime.vendor?.name ?? vendorId,
      modelName,
      modelType: input.expectedType,
      protocol: protocol.protocol,
      runtime,
      model: model as TModel,
      agentConfig: resolved.agentConfig,
    };
  } catch (error) {
    throw toModelCallError(error, { requestId, modelType: input.expectedType });
  }
}

export async function runModelCall<TResult>(context: ModelCallContext, runner: () => Promise<TResult>, options: ModelCallRunOptions = {}): Promise<TResult> {
  const startedAt = Date.now();
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const retry = normalizeRetryOptions(options.retry);
  let finalAttempt = 0;
  recordModelRequestStart(context, {
    ...options,
    timeoutMs,
    maxAttempts: retry.maxAttempts,
  });
  logger.detail('模型调用', '开始调用', getLogMeta(context, {
    taskId: options.taskId ?? null,
    timeoutMs,
    retryMaxAttempts: retry.maxAttempts,
  }));

  try {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      finalAttempt = attempt;
      recordModelRequestAttempt(context.requestId, attempt);
      try {
        assertModelCallNotCancelled(options, context.requestId);
        const result = await withModelTimeout(runner, timeoutMs, context.requestId);
        assertModelCallNotCancelled(options, context.requestId);
        recordModelRequestSuccess(context.requestId, attempt);
        logger.detail('模型调用', '调用成功', getLogMeta(context, {
          taskId: options.taskId ?? null,
          attempt,
          durationMs: Date.now() - startedAt,
        }));
        return result;
      } catch (error) {
        lastError = error;

        if (isTaskCancellationError(error) || attempt >= retry.maxAttempts || !shouldRetryModelError(error)) {
          throw error;
        }

        const waitMs = retry.delayMs * (retry.backoffFactor ** (attempt - 1));
        recordModelRequestRetry(context.requestId, attempt, waitMs, error);
        logger.warn('模型调用', `临时失败，准备第 ${attempt + 1} 次重试`, getLogMeta(context, {
          taskId: options.taskId ?? null,
          attempt,
          waitMs,
          error: normalizeUnknownError(error),
        }));
        await delay(waitMs);
      }
    }

    throw lastError;
  } catch (error) {
    const wrapped = toModelCallError(error, context);
    recordModelRequestFailure(context.requestId, finalAttempt || 1, wrapped);
    logger.error('模型调用', `调用失败（${context.requestId}）`, getLogMeta(context, {
      taskId: options.taskId ?? null,
      durationMs: Date.now() - startedAt,
      error: normalizeUnknownError(wrapped),
    }));
    throw wrapped;
  }
}
