import type { App } from 'vue';
import type { Router } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { i18n } from '@renderer/i18n';

type RendererErrorSource = 'vue' | 'window' | 'promise' | 'router' | 'boundary';

interface ReportRendererErrorOptions {
  source: RendererErrorSource;
  error: unknown;
  info?: string;
  showToast?: boolean;
}

export interface RendererErrorReport {
  source: RendererErrorSource;
  message: string;
  info?: string;
  stack?: string;
  route: string;
  timestamp: string;
}

export const LAST_RENDERER_ERROR_KEY = 'vtStudio.lastRendererError';

const ERROR_TOAST_THROTTLE_MS = 3000;
const recentErrorAt = new Map<string, number>();

function translate(key: string, named?: Record<string, unknown>): string {
  const global = i18n.global as unknown as { t: (key: string, named?: Record<string, unknown>) => string };
  return global.t(key, named);
}

function stringifyUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (typeof error === 'number' || typeof error === 'boolean') {
    return String(error);
  }

  return translate('rendererError.unknown');
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack?.trim()) {
    return error.stack;
  }

  if (typeof error === 'object' && error !== null && 'stack' in error && typeof error.stack === 'string' && error.stack.trim()) {
    return error.stack;
  }

  return undefined;
}

function buildRendererErrorReport(options: ReportRendererErrorOptions, message: string): RendererErrorReport {
  return {
    source: options.source,
    message,
    info: options.info,
    stack: getErrorStack(options.error),
    route: typeof window === 'undefined' ? '' : window.location.href,
    timestamp: new Date().toISOString(),
  };
}

function persistRendererError(report: RendererErrorReport): void {
  try {
    window.localStorage.setItem(LAST_RENDERER_ERROR_KEY, JSON.stringify(report));
    window.dispatchEvent(new CustomEvent('vtstudio:renderer-error', { detail: report }));
    void window.vtStudio?.app.reportRendererError?.(report).catch(() => {
      // Renderer error reporting must never become a second render failure.
    });
  } catch {
    // Error reporting must never become a second render failure.
  }
}

function getErrorKey(source: RendererErrorSource, message: string, info?: string): string {
  return `${source}:${info ?? ''}:${message}`;
}

function shouldShowToast(source: RendererErrorSource, message: string, info?: string): boolean {
  const now = Date.now();
  const key = getErrorKey(source, message, info);
  const lastAt = recentErrorAt.get(key) ?? 0;

  if (now - lastAt < ERROR_TOAST_THROTTLE_MS) {
    return false;
  }

  recentErrorAt.set(key, now);
  return true;
}

export function reportRendererError(options: ReportRendererErrorOptions): RendererErrorReport {
  const message = stringifyUnknownError(options.error);
  const shouldToast = options.showToast ?? true;
  const report = buildRendererErrorReport(options, message);
  persistRendererError(report);

  console.error('[RendererError]', { ...report, error: options.error });

  if (shouldToast && shouldShowToast(options.source, message, options.info)) {
    MessagePlugin.error(translate('rendererError.toast'));
  }

  return report;
}

export function registerRendererErrorBoundary(app: App, router: Router): void {
  app.config.errorHandler = (error, instance, info) => {
    reportRendererError({
      source: 'vue',
      error,
      info: instance ? info : `${info}:no-instance`,
    });
  };

  window.addEventListener('error', (event) => {
    reportRendererError({
      source: 'window',
      error: event.error ?? event.message,
      info: [event.filename, event.lineno, event.colno].filter(Boolean).join(':'),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportRendererError({
      source: 'promise',
      error: event.reason,
      info: 'unhandledrejection',
    });
  });

  router.onError((error, to, from) => {
    reportRendererError({
      source: 'router',
      error,
      info: `${from.fullPath} -> ${to.fullPath}`,
    });
  });
}
