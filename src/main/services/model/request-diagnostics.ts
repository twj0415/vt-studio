import { AsyncLocalStorage } from 'node:async_hooks';
import { VT_STATUS } from '@shared/constants/status';
import { isVtError, normalizeUnknownError } from '@shared/errors';
import { isSensitiveKey, sanitizeSensitiveText, SECRET_REPLACEMENT } from '@shared/security/secrets';
import type {
  ModelRequestDiagnosticError,
  ModelRequestDiagnosticItem,
  ModelRequestDiagnosticStatus,
  ModelRequestDiagnosticTrace,
  ModelRequestHttpTrace,
  ModelRequestTraceData,
} from '@shared/types/request-settings';
import type { ModelCallContext, ModelCallRunOptions } from './gateway';

const MAX_MODEL_REQUESTS = 80;
const MAX_MESSAGE_LENGTH = 260;
const MAX_TRACE_STRING_LENGTH = 4000;
const MAX_TRACE_ARRAY_ITEMS = 30;
const MAX_TRACE_OBJECT_KEYS = 80;
const MAX_TRACE_DEPTH = 6;
const MAX_HTTP_TRACES_PER_REQUEST = 30;
const MAX_HTTP_BODY_BYTES = 64 * 1024;
const WINDOWS_PATH_RE = /\b[a-zA-Z]:\\(?:Users\\[^\\\s]+\\)?[^\s'"<>]+/g;
const HOME_PATH_RE = /\/Users\/[^/\s]+\/[^\s'"<>]+/g;
const TRACE_SENSITIVE_KEY_RE = /(authorization|cookie|set-cookie|password|passwd|token|secret|credential|private[_-]?key|api[_-]?key|access[_-]?key|signature|sign)/i;
const BASE64_KEY_RE = /(base64|imagebase64|audiobase64|videobase64|payload|binary|bytes)/i;
const DATA_URL_RE = /^data:([^;,]+);base64,([\s\S]+)$/i;
const BASE64_RE = /^[a-z0-9+/]+={0,2}$/i;
const BASE64_URL_SAFE_RE = /^[a-z0-9+/_-]+={0,2}$/i;
const TRACE_CONTEXT = new AsyncLocalStorage<{ requestId: string }>();

const requests: ModelRequestDiagnosticItem[] = [];
let fetchTraceInstalled = false;
let httpTraceSeq = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptyTrace(): ModelRequestDiagnosticTrace {
  return {
    input: null,
    normalizedInput: null,
    output: null,
    http: [],
  };
}

function ensureTrace(item: ModelRequestDiagnosticItem): ModelRequestDiagnosticTrace {
  if (!item.trace) {
    item.trace = createEmptyTrace();
  }

  return item.trace;
}

function maskTraceText(value: string): string {
  return sanitizeSensitiveText(value)
    .replace(WINDOWS_PATH_RE, '[本机路径]')
    .replace(HOME_PATH_RE, '[本机路径]');
}

function clampMessage(value: string): string {
  const normalized = maskTraceText(value)
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

function isTraceSensitiveKey(key: string): boolean {
  return isSensitiveKey(key) || TRACE_SENSITIVE_KEY_RE.test(key);
}

function estimateBase64Bytes(value: string): number {
  const compact = value.replace(/\s/g, '');
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function summarizeEncodedString(value: string, key = ''): ModelRequestTraceData | null {
  const trimmed = value.trim();
  const dataUrlMatch = DATA_URL_RE.exec(trimmed);
  if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
    return {
      kind: 'data-url',
      mediaType: dataUrlMatch[1],
      chars: trimmed.length,
      bytesApprox: estimateBase64Bytes(dataUrlMatch[2]),
    };
  }

  const compact = trimmed.replace(/\s/g, '');
  if (BASE64_KEY_RE.test(key) && compact.length >= 128) {
    return {
      kind: BASE64_URL_SAFE_RE.test(compact) ? 'base64' : 'encoded-string',
      chars: compact.length,
      bytesApprox: BASE64_URL_SAFE_RE.test(compact) ? estimateBase64Bytes(compact.replace(/-/g, '+').replace(/_/g, '/')) : null,
    };
  }

  if (
    compact.length >= 512 &&
    compact.length % 4 !== 1 &&
    BASE64_RE.test(compact) &&
    (BASE64_KEY_RE.test(key) || compact.length >= 2048)
  ) {
    return {
      kind: 'base64',
      chars: compact.length,
      bytesApprox: estimateBase64Bytes(compact),
    };
  }

  return null;
}

function clampTraceString(value: string): string {
  const sanitized = maskTraceText(value);
  if (sanitized.length <= MAX_TRACE_STRING_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, MAX_TRACE_STRING_LENGTH)}... [truncated ${sanitized.length - MAX_TRACE_STRING_LENGTH} chars]`;
}

function summarizeBinary(kind: string, bytes: number, extra: Record<string, ModelRequestTraceData> = {}): ModelRequestTraceData {
  return {
    kind,
    bytes,
    ...extra,
  };
}

function isBlobValue(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isFormDataValue(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function isUrlSearchParamsValue(value: unknown): value is URLSearchParams {
  return typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams;
}

function sanitizeTraceData(value: unknown, key = '', depth = 0, seen: WeakSet<object> = new WeakSet()): ModelRequestTraceData {
  if (key && isTraceSensitiveKey(key)) {
    return SECRET_REPLACEMENT;
  }

  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return '[undefined]';
  }

  if (typeof value === 'string') {
    return summarizeEncodedString(value, key) ?? clampTraceString(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'symbol') {
    return value.description ? `[Symbol ${value.description}]` : '[Symbol]';
  }

  if (typeof value === 'function') {
    return value.name ? `[Function ${value.name}]` : '[Function]';
  }

  if (depth >= MAX_TRACE_DEPTH) {
    return '[Max depth reached]';
  }

  if (value instanceof Error) {
    return sanitizeTraceData(sanitizeError(value), key, depth + 1, seen);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return summarizeBinary('array-buffer', value.byteLength);
  }

  if (ArrayBuffer.isView(value)) {
    return summarizeBinary('typed-array', value.byteLength, {
      type: value.constructor.name,
    });
  }

  if (isBlobValue(value)) {
    return summarizeBinary('blob', value.size, {
      type: value.type || 'application/octet-stream',
    });
  }

  if (isUrlSearchParamsValue(value)) {
    const result: Record<string, ModelRequestTraceData> = {};
    for (const [itemKey, itemValue] of value.entries()) {
      result[itemKey] = sanitizeTraceData(itemValue, itemKey, depth + 1, seen);
    }
    return result;
  }

  if (isFormDataValue(value)) {
    const result: Record<string, ModelRequestTraceData> = {};
    for (const [itemKey, itemValue] of value.entries()) {
      result[itemKey] = sanitizeTraceData(itemValue, itemKey, depth + 1, seen);
    }
    return result;
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_TRACE_ARRAY_ITEMS).map((item) => sanitizeTraceData(item, key, depth + 1, seen));
    if (value.length > MAX_TRACE_ARRAY_ITEMS) {
      items.push(`[truncated ${value.length - MAX_TRACE_ARRAY_ITEMS} items]`);
    }
    return items;
  }

  const result: Record<string, ModelRequestTraceData> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [itemKey, itemValue] of entries.slice(0, MAX_TRACE_OBJECT_KEYS)) {
    result[itemKey] = sanitizeTraceData(itemValue, itemKey, depth + 1, seen);
  }

  if (entries.length > MAX_TRACE_OBJECT_KEYS) {
    result.__truncatedKeys = entries.length - MAX_TRACE_OBJECT_KEYS;
  }

  return result;
}

function sanitizeHeaderRecord(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = isTraceSensitiveKey(key) ? SECRET_REPLACEMENT : clampMessage(String(value));
  }

  return result;
}

function headersToRecord(headers: HeadersInit | Headers | null | undefined): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const result: Record<string, string> = {};

  try {
    const normalized = typeof Headers !== 'undefined' && headers instanceof Headers ? headers : new Headers(headers as HeadersInit);
    normalized.forEach((value, key) => {
      result[key] = isTraceSensitiveKey(key) ? SECRET_REPLACEMENT : clampMessage(value);
    });
  } catch {
    if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        result[key] = isTraceSensitiveKey(key) ? SECRET_REPLACEMENT : clampMessage(String(value));
      }
    } else if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers as Record<string, string>)) {
        result[key] = isTraceSensitiveKey(key) ? SECRET_REPLACEMENT : clampMessage(String(value));
      }
    }
  }

  return Object.keys(result).length ? result : undefined;
}

function isRequestValue(value: RequestInfo | URL): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request;
}

function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return clampTraceString(input);
  }

  if (input instanceof URL) {
    return clampTraceString(input.toString());
  }

  if (isRequestValue(input)) {
    return clampTraceString(input.url);
  }

  return '[unknown-url]';
}

function getFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (isRequestValue(input) ? input.method : 'GET') ?? 'GET').toUpperCase();
}

function getFetchHeaders(input: RequestInfo | URL, init?: RequestInit): Record<string, string> | undefined {
  const headers = new Headers(isRequestValue(input) ? input.headers : undefined);
  if (init?.headers) {
    const initHeaders = new Headers(init.headers);
    initHeaders.forEach((value, key) => headers.set(key, value));
  }

  return headersToRecord(headers);
}

function summarizeHttpBody(value: unknown): ModelRequestTraceData {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return sanitizeTraceData(JSON.parse(trimmed));
      } catch {
        return sanitizeTraceData(value, 'body');
      }
    }

    return sanitizeTraceData(value, 'body');
  }

  if (isBlobValue(value)) {
    return summarizeBinary('blob', value.size, {
      type: value.type || 'application/octet-stream',
    });
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return summarizeBinary('array-buffer', value.byteLength);
  }

  if (ArrayBuffer.isView(value)) {
    return summarizeBinary('typed-array', value.byteLength, {
      type: value.constructor.name,
    });
  }

  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) {
    return {
      kind: 'stream',
      readable: true,
    };
  }

  return sanitizeTraceData(value, 'body');
}

function getFetchBody(input: RequestInfo | URL, init?: RequestInit): ModelRequestTraceData | undefined {
  if (init && 'body' in init) {
    return summarizeHttpBody(init.body);
  }

  if (isRequestValue(input) && input.body) {
    return {
      kind: 'request-body',
      source: 'Request',
      bodyUsed: input.bodyUsed,
    };
  }

  return undefined;
}

function buildFetchTraceBase(input: RequestInfo | URL, init?: RequestInit): Pick<ModelRequestHttpTrace, 'id' | 'url' | 'method' | 'status' | 'ok' | 'durationMs' | 'recordedAt'> & {
  requestHeaders?: Record<string, string>;
  requestBody?: ModelRequestTraceData;
} {
  httpTraceSeq = (httpTraceSeq + 1) % Number.MAX_SAFE_INTEGER;
  return {
    id: `http_${Date.now().toString(36)}_${httpTraceSeq}`,
    url: getFetchUrl(input),
    method: getFetchMethod(input, init),
    status: null,
    ok: null,
    durationMs: null,
    requestHeaders: getFetchHeaders(input, init),
    requestBody: getFetchBody(input, init),
    recordedAt: nowIso(),
  };
}

function shouldReadResponseBody(response: Response): { read: boolean; reason?: string; contentType: string; contentLength: number | null } {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const rawLength = response.headers.get('content-length');
  const contentLength = rawLength ? Number.parseInt(rawLength, 10) : null;

  if (/text\/event-stream|image\/|video\/|audio\/|application\/octet-stream/.test(contentType)) {
    return { read: false, reason: 'stream-or-binary', contentType, contentLength };
  }

  if (!/json|text|xml|javascript|x-www-form-urlencoded/.test(contentType)) {
    return { read: false, reason: 'unsupported-content-type', contentType, contentLength };
  }

  if (!Number.isFinite(contentLength)) {
    return { read: false, reason: 'unknown-content-length', contentType, contentLength: null };
  }

  if ((contentLength ?? 0) > MAX_HTTP_BODY_BYTES) {
    return { read: false, reason: 'too-large', contentType, contentLength };
  }

  return { read: true, contentType, contentLength };
}

async function summarizeResponseBody(response: Response): Promise<ModelRequestTraceData> {
  const readState = shouldReadResponseBody(response);
  if (!readState.read) {
    return {
      kind: 'response-body-skipped',
      reason: readState.reason ?? 'skipped',
      contentType: readState.contentType || '[unknown]',
      contentLength: readState.contentLength,
    };
  }

  const text = await response.clone().text();
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return sanitizeTraceData(JSON.parse(trimmed));
    } catch {
      return sanitizeTraceData(text, 'responseBody');
    }
  }

  return sanitizeTraceData(text, 'responseBody');
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

function recordTraceSection(requestId: string, key: 'input' | 'normalizedInput' | 'output', title: string, data: unknown): void {
  const item = findRequest(requestId);
  if (!item) {
    return;
  }

  ensureTrace(item)[key] = {
    title: clampMessage(title),
    data: sanitizeTraceData(data),
    recordedAt: nowIso(),
  };
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
    existing.trace = createEmptyTrace();
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
    trace: createEmptyTrace(),
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

export function recordModelRequestTraceInput(requestId: string, title: string, data: unknown): void {
  recordTraceSection(requestId, 'input', title, data);
}

export function recordModelRequestTraceNormalizedInput(requestId: string, title: string, data: unknown): void {
  recordTraceSection(requestId, 'normalizedInput', title, data);
}

export function recordModelRequestTraceOutput(requestId: string, title: string, data: unknown): void {
  recordTraceSection(requestId, 'output', title, data);
}

export function recordModelRequestHttpTrace(
  requestId: string,
  trace: Omit<ModelRequestHttpTrace, 'requestBody' | 'responseBody' | 'error'> & {
    requestBody?: unknown;
    responseBody?: unknown;
    error?: unknown;
  },
): void {
  const item = findRequest(requestId);
  if (!item) {
    return;
  }

  const itemTrace = ensureTrace(item);
  const existingIndex = itemTrace.http.findIndex((httpTrace) => httpTrace.id === trace.id);
  const existing = existingIndex >= 0 ? itemTrace.http[existingIndex] : null;
  const next: ModelRequestHttpTrace = {
    ...(existing ?? {}),
    id: trace.id,
    url: clampTraceString(trace.url),
    method: clampMessage(trace.method),
    status: trace.status,
    ok: trace.ok,
    durationMs: trace.durationMs,
    recordedAt: trace.recordedAt,
    error: trace.error === undefined ? existing?.error ?? null : trace.error === null ? null : sanitizeError(trace.error),
  };

  const requestHeaders = sanitizeHeaderRecord(trace.requestHeaders);
  if (requestHeaders) {
    next.requestHeaders = requestHeaders;
  }
  if (trace.requestBody !== undefined) {
    next.requestBody = sanitizeTraceData(trace.requestBody, 'requestBody');
  }

  const responseHeaders = sanitizeHeaderRecord(trace.responseHeaders);
  if (responseHeaders) {
    next.responseHeaders = responseHeaders;
  }
  if (trace.responseBody !== undefined) {
    next.responseBody = sanitizeTraceData(trace.responseBody, 'responseBody');
  }

  if (existingIndex >= 0) {
    itemTrace.http.splice(existingIndex, 1, next);
  } else {
    itemTrace.http.push(next);
    if (itemTrace.http.length > MAX_HTTP_TRACES_PER_REQUEST) {
      itemTrace.http.splice(0, itemTrace.http.length - MAX_HTTP_TRACES_PER_REQUEST);
    }
  }
}

export function runWithModelRequestTrace<TResult>(requestId: string, runner: () => Promise<TResult>): Promise<TResult> {
  installModelRequestFetchTrace();
  return TRACE_CONTEXT.run({ requestId }, runner);
}

function installModelRequestFetchTrace(): void {
  if (fetchTraceInstalled || typeof globalThis.fetch !== 'function') {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis) as typeof fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const context = TRACE_CONTEXT.getStore();
    if (!context) {
      return originalFetch(input, init);
    }

    const startedAt = Date.now();
    const baseTrace = buildFetchTraceBase(input, init);

    try {
      const response = await originalFetch(input, init);
      const firstTrace: ModelRequestHttpTrace = {
        ...baseTrace,
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - startedAt,
        responseHeaders: headersToRecord(response.headers),
        recordedAt: nowIso(),
      };
      recordModelRequestHttpTrace(context.requestId, firstTrace);

      void summarizeResponseBody(response)
        .then((responseBody) => {
          recordModelRequestHttpTrace(context.requestId, {
            ...firstTrace,
            durationMs: Date.now() - startedAt,
            responseBody,
            recordedAt: nowIso(),
          });
        })
        .catch(() => undefined);

      return response;
    } catch (error) {
      recordModelRequestHttpTrace(context.requestId, {
        ...baseTrace,
        durationMs: Date.now() - startedAt,
        error,
        recordedAt: nowIso(),
      });
      throw error;
    }
  }) as typeof fetch;
  fetchTraceInstalled = true;
}

export function listModelRequestDiagnostics(): ModelRequestDiagnosticItem[] {
  return requests.map((item) => ({
    ...item,
    error: item.error ? { ...item.error } : null,
    trace: item.trace ? JSON.parse(JSON.stringify(item.trace)) as ModelRequestDiagnosticTrace : null,
  }));
}

export function clearModelRequestDiagnostics(): void {
  requests.splice(0, requests.length);
}
