import { VT_STATUS } from '@shared/constants/status';
import { isVtError, normalizeUnknownError } from '@shared/errors';
import { sanitizeSensitiveText } from '@shared/security/secrets';
import type {
  ModelRequestDiagnosticError,
  ModelRequestDiagnosticItem,
  ModelRequestDiagnosticStatus,
} from '@shared/types/request-settings';
import type { ModelCallContext, ModelCallRunOptions } from './gateway';

const MAX_MODEL_REQUESTS = 80;
const MAX_MESSAGE_LENGTH = 260;
const WINDOWS_PATH_RE = /\b[a-zA-Z]:\\(?:Users\\[^\\\s]+\\)?[^\s'"<>]+/g;
const HOME_PATH_RE = /\/Users\/[^/\s]+\/[^\s'"<>]+/g;

const requests: ModelRequestDiagnosticItem[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function clampMessage(value: string): string {
  const normalized = sanitizeSensitiveText(value)
    .replace(WINDOWS_PATH_RE, '[本机路径]')
    .replace(HOME_PATH_RE, '[本机路径]')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= MAX_MESSAGE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_MESSAGE_LENGTH)}...`;
}

function sanitizeError(error: unknown): ModelRequestDiagnosticError {
  const normalized = normalizeUnknownError(error);
  return {
    name: clampMessage(normalized.name || 'Error'),
    message: clampMessage(normalized.message || '未知错误'),
    statusCode: normalized.statusCode,
    msgKey: normalized.msgKey,
  };
}

function resolveFailureStatus(error: unknown): ModelRequestDiagnosticStatus {
  if (!isVtError(error)) {
    return 'failed';
  }

  if (error.statusCode === VT_STATUS.TASK_CANCELLED) {
    return 'cancelled';
  }

  if (error.statusCode === VT_STATUS.MODEL_TIMEOUT) {
    return 'timeout';
  }

  return 'failed';
}

function findRequest(requestId: string): ModelRequestDiagnosticItem | null {
  return requests.find((item) => item.requestId === requestId) ?? null;
}

function finalizeRequest(item: ModelRequestDiagnosticItem, status: ModelRequestDiagnosticStatus, attempt: number, error?: unknown): void {
  const finishedAt = Date.now();
  item.status = status;
  item.attempt = attempt;
  item.finishedAt = new Date(finishedAt).toISOString();
  item.durationMs = finishedAt - new Date(item.startedAt).getTime();
  item.error = error === undefined ? null : sanitizeError(error);
}

export function recordModelRequestStart(context: ModelCallContext, options: ModelCallRunOptions & { timeoutMs: number; maxAttempts: number }): void {
  const existing = findRequest(context.requestId);
  if (existing) {
    existing.status = 'running';
    existing.taskId = options.taskId ?? null;
    existing.timeoutMs = options.timeoutMs;
    existing.maxAttempts = options.maxAttempts;
    existing.error = null;
    return;
  }

  requests.unshift({
    requestId: context.requestId,
    taskId: options.taskId ?? null,
    vendorId: context.vendorId,
    protocolVendorId: context.protocolVendorId,
    vendorName: context.vendorName,
    modelName: context.modelName,
    modelType: context.modelType,
    protocol: context.protocol,
    status: 'running',
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: null,
    attempt: 0,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
    retryCount: 0,
    lastRetryAt: null,
    lastRetryWaitMs: null,
    error: null,
  });

  if (requests.length > MAX_MODEL_REQUESTS) {
    requests.splice(MAX_MODEL_REQUESTS);
  }
}

export function recordModelRequestAttempt(requestId: string, attempt: number): void {
  const item = findRequest(requestId);
  if (!item) {
    return;
  }

  item.status = 'running';
  item.attempt = attempt;
}

export function recordModelRequestRetry(requestId: string, attempt: number, waitMs: number, error: unknown): void {
  const item = findRequest(requestId);
  if (!item) {
    return;
  }

  item.status = 'retrying';
  item.attempt = attempt;
  item.retryCount += 1;
  item.lastRetryAt = nowIso();
  item.lastRetryWaitMs = waitMs;
  item.error = sanitizeError(error);
}

export function recordModelRequestSuccess(requestId: string, attempt: number): void {
  const item = findRequest(requestId);
  if (!item) {
    return;
  }

  finalizeRequest(item, 'succeeded', attempt);
}

export function recordModelRequestFailure(requestId: string, attempt: number, error: unknown): void {
  const item = findRequest(requestId);
  if (!item) {
    return;
  }

  finalizeRequest(item, resolveFailureStatus(error), attempt, error);
}

export function listModelRequestDiagnostics(): ModelRequestDiagnosticItem[] {
  return requests.map((item) => ({
    ...item,
    error: item.error ? { ...item.error } : null,
  }));
}

export function clearModelRequestDiagnostics(): void {
  requests.splice(0, requests.length);
}
