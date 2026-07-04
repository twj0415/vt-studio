import { i18n } from '@renderer/i18n';

type RendererTranslator = {
  t: (key: string, named?: Record<string, unknown>) => string;
  te?: (key: string) => boolean;
};

function getTranslator(): RendererTranslator {
  return i18n.global as unknown as RendererTranslator;
}

export function rt(key: string, named?: Record<string, unknown>): string {
  return getTranslator().t(key, named);
}

export function rtFallback(error: unknown, fallbackKey: string): string {
  return error instanceof Error && error.message ? error.message : rt(fallbackKey);
}
