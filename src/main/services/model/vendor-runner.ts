import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import { VT_STATUS } from '@shared/constants/status';
import axios from 'axios';
import FormData from 'form-data';
import jsonwebtoken from 'jsonwebtoken';
import { createQwen } from 'qwen-ai-provider-v5';
import sharp from 'sharp';
import { transform } from 'sucrase';
import { createMinimax } from 'vercel-minimax-ai-provider';
import { VM } from 'vm2';
import { createZhipu } from 'zhipu-ai-provider';
import { logger as mainLogger } from '../logger';
import { createError } from '../result';
import { normalizeVendorManifest } from './validation';
import type { VendorRuntime } from './types';

export interface VendorRunnerPolicy {
  initTimeoutMs?: number;
  requestTimeoutMs?: number;
  pollTimeoutMs?: number;
  pollMaxAttempts?: number;
  allowedHosts?: string[];
  maxLogLength?: number;
  maxDownloadBytes?: number;
}

interface NormalizedVendorRunnerPolicy {
  initTimeoutMs: number;
  requestTimeoutMs: number;
  pollTimeoutMs: number;
  pollMaxAttempts: number;
  allowedHosts: Set<string>;
  maxLogLength: number;
  maxDownloadBytes: number;
}

const DEFAULT_VENDOR_RUNNER_POLICY: Required<Omit<VendorRunnerPolicy, 'allowedHosts'>> = {
  initTimeoutMs: 5000,
  requestTimeoutMs: 120000,
  pollTimeoutMs: 30 * 60 * 1000,
  pollMaxAttempts: 600,
  maxLogLength: 2000,
  maxDownloadBytes: 512 * 1024 * 1024,
};

function splitDataUrl(base64: string): { mime: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(base64);

  if (!match) {
    return { mime: 'image/png', data: base64 };
  }

  return { mime: match[1], data: match[2] };
}

function toDataUrl(buffer: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function zipImage(base64: string, size: number): Promise<string> {
  const { data } = splitDataUrl(base64);
  const maxBytes = size * 1024;
  let quality = 90;
  let buffer = await sharp(Buffer.from(data, 'base64')).jpeg({ quality }).toBuffer();

  while (buffer.byteLength > maxBytes && quality > 30) {
    quality -= 10;
    buffer = await sharp(Buffer.from(data, 'base64')).jpeg({ quality }).toBuffer();
  }

  return toDataUrl(buffer, 'image/jpeg');
}

async function zipImageResolution(base64: string, width: number, height: number): Promise<string> {
  const { data } = splitDataUrl(base64);
  const buffer = await sharp(Buffer.from(data, 'base64')).resize(width, height, { fit: 'inside' }).png().toBuffer();
  return toDataUrl(buffer, 'image/png');
}

async function mergeImages(base64Arr: string[], maxSize = '1024x1024'): Promise<string> {
  const [widthText, heightText] = maxSize.split('x');
  const width = Number.parseInt(widthText ?? '1024', 10) || 1024;
  const height = Number.parseInt(heightText ?? '1024', 10) || 1024;
  const itemWidth = Math.max(1, Math.floor(width / Math.max(1, base64Arr.length)));
  const composites = await Promise.all(
    base64Arr.map(async (base64, index) => {
      const { data } = splitDataUrl(base64);
      const input = await sharp(Buffer.from(data, 'base64')).resize(itemWidth, height, { fit: 'inside' }).png().toBuffer();
      return { input, left: index * itemWidth, top: 0 };
    }),
  );
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return toDataUrl(buffer, 'image/png');
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value!)));
}

function normalizeRunnerPolicy(policy: VendorRunnerPolicy = {}): NormalizedVendorRunnerPolicy {
  return {
    initTimeoutMs: clampNumber(policy.initTimeoutMs, DEFAULT_VENDOR_RUNNER_POLICY.initTimeoutMs, 100, 30000),
    requestTimeoutMs: clampNumber(policy.requestTimeoutMs, DEFAULT_VENDOR_RUNNER_POLICY.requestTimeoutMs, 1000, 10 * 60 * 1000),
    pollTimeoutMs: clampNumber(policy.pollTimeoutMs, DEFAULT_VENDOR_RUNNER_POLICY.pollTimeoutMs, 1000, DEFAULT_VENDOR_RUNNER_POLICY.pollTimeoutMs),
    pollMaxAttempts: clampNumber(policy.pollMaxAttempts, DEFAULT_VENDOR_RUNNER_POLICY.pollMaxAttempts, 1, DEFAULT_VENDOR_RUNNER_POLICY.pollMaxAttempts),
    allowedHosts: new Set((policy.allowedHosts ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean)),
    maxLogLength: clampNumber(policy.maxLogLength, DEFAULT_VENDOR_RUNNER_POLICY.maxLogLength, 200, 10000),
    maxDownloadBytes: clampNumber(policy.maxDownloadBytes, DEFAULT_VENDOR_RUNNER_POLICY.maxDownloadBytes, 1024, DEFAULT_VENDOR_RUNNER_POLICY.maxDownloadBytes),
  };
}

function normalizeRequestUrl(input: string | URL, baseUrl?: string): URL {
  try {
    return new URL(String(input), baseUrl);
  } catch {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, 'adapter 请求地址无效');
  }
}

function assertVendorUrlAllowed(url: string | URL, policy: NormalizedVendorRunnerPolicy, baseUrl?: string): URL {
  const parsed = normalizeRequestUrl(url, baseUrl);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createError(VT_STATUS.FORBIDDEN, `adapter 不允许访问 ${parsed.protocol} 协议`);
  }

  if (policy.allowedHosts.size > 0 && !policy.allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw createError(VT_STATUS.FORBIDDEN, `adapter 不允许访问未授权域名 ${parsed.hostname}`);
  }

  return parsed;
}

async function fetchWithTimeout(url: string | URL, init: RequestInit | undefined, policy: NormalizedVendorRunnerPolicy): Promise<Response> {
  assertVendorUrlAllowed(url, policy);

  if (init?.signal) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.requestTimeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function createSafeFetch(policy: NormalizedVendorRunnerPolicy): typeof fetch {
  return ((url: RequestInfo | URL, init?: RequestInit) => fetchWithTimeout(url as string | URL, init, policy)) as typeof fetch;
}

function createSafeAxios(policy: NormalizedVendorRunnerPolicy): typeof axios {
  const instance = axios.create({ timeout: policy.requestTimeoutMs });
  instance.interceptors.request.use((config) => {
    if (config.url) {
      assertVendorUrlAllowed(config.url, policy, config.baseURL);
    }
    config.timeout = config.timeout ?? policy.requestTimeoutMs;
    return config;
  });

  return instance as typeof axios;
}

async function urlToBase64(url: string, policy: NormalizedVendorRunnerPolicy): Promise<string> {
  const response = await fetchWithTimeout(url, undefined, policy);

  if (!response.ok) {
    throw createError(VT_STATUS.MODEL_ERROR, `下载模型结果失败：${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > policy.maxDownloadBytes) {
    throw createError(VT_STATUS.MODEL_ERROR, `下载模型结果超过大小限制：${contentLength} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > policy.maxDownloadBytes) {
    throw createError(VT_STATUS.MODEL_ERROR, `下载模型结果超过大小限制：${buffer.byteLength} bytes`);
  }

  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function pollTask(
  fn: () => Promise<{ completed: boolean; data?: string; error?: string }>,
  policy: NormalizedVendorRunnerPolicy,
  interval = 3000,
  timeout = 3000000,
): Promise<{ completed: boolean; data?: string; error?: string }> {
  const start = Date.now();
  const safeInterval = clampNumber(interval, 3000, 250, 60000);
  const safeTimeout = clampNumber(timeout, policy.pollTimeoutMs, 1000, policy.pollTimeoutMs);
  let attempts = 0;

  while (Date.now() - start < safeTimeout && attempts < policy.pollMaxAttempts) {
    attempts += 1;
    const result = await fn();

    if (result.completed || result.error) {
      return result;
    }

    await delay(safeInterval);
  }

  return { completed: false, error: 'timeout' };
}

function maskSensitiveText(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;"']+/gi, '$1[已隐藏]')
    .replace(/((api[-_ ]?key|token|secret|password)\s*[:=]\s*)[^\s,;"']+/gi, '$1[已隐藏]');
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...[已截断 ${value.length - maxLength} 字符]`;
}

function sanitizeAdapterLog(value: unknown, policy: NormalizedVendorRunnerPolicy): unknown {
  if (typeof value === 'string') {
    return truncateText(maskSensitiveText(value), policy.maxLogLength);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateText(maskSensitiveText(value.message), policy.maxLogLength),
    };
  }

  try {
    const text = JSON.stringify(value);
    return JSON.parse(truncateText(maskSensitiveText(text), policy.maxLogLength));
  } catch {
    return value;
  }
}

function logger(value: unknown, policy: NormalizedVendorRunnerPolicy): void {
  mainLogger.detail('供应商脚本', '脚本日志', sanitizeAdapterLog(value, policy));
}

export function runVendorCode(code: string, policy: VendorRunnerPolicy = {}): VendorRuntime {
  const safePolicy = normalizeRunnerPolicy(policy);

  try {
    const jsCode = transform(code.replace(/export\s*\{\s*\};?/g, ''), { transforms: ['typescript'] }).code;
    const exports = {};
    const safeFetch = createSafeFetch(safePolicy);
    const safeAxios = createSafeAxios(safePolicy);
    const sandbox = {
      exports,
      fetch: safeFetch,
      Buffer,
      crypto: { createHash },
      createOpenAI,
      createDeepSeek,
      createZhipu,
      createQwen,
      createAnthropic,
      createOpenAICompatible,
      createXai,
      createMinimax,
      createGoogleGenerativeAI,
      axios: safeAxios,
      FormData,
      jsonwebtoken,
      zipImage,
      zipImageResolution,
      mergeImages,
      urlToBase64: (url: string) => urlToBase64(url, safePolicy),
      pollTask: (
        fn: () => Promise<{ completed: boolean; data?: string; error?: string }>,
        interval?: number,
        timeout?: number,
      ) => pollTask(fn, safePolicy, interval, timeout),
      logger: (value: unknown) => logger(value, safePolicy),
    };
    const vm = new VM({
      timeout: safePolicy.initTimeoutMs,
      sandbox,
      compiler: 'javascript',
      eval: false,
      wasm: false,
    });

    vm.run(jsCode);

    return exports as VendorRuntime;
  } catch (error) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '供应商代码运行失败', error);
  }
}

export function validateVendorRuntime(runtime: VendorRuntime): VendorRuntime {
  if (!runtime.vendor) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '脚本文件必须导出 vendor 对象');
  }

  if (!runtime.textRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '脚本文件必须导出 textRequest');
  }

  if (!runtime.imageRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '脚本文件必须导出 imageRequest');
  }

  if (!runtime.videoRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '脚本文件必须导出 videoRequest');
  }

  if (!runtime.ttsRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '脚本文件必须导出 ttsRequest');
  }

  const normalizedVendor = normalizeVendorManifest(runtime.vendor);
  Object.assign(runtime.vendor, normalizedVendor);

  return runtime;
}
