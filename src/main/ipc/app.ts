import { APP_NAME, APP_VERSION } from '@shared/constants/app';
import type { AppInfo, RendererErrorLogPayload, RendererErrorLogResult } from '@shared/types/app';
import type { ExternalLinkOpenPayload } from '@shared/types/shell';
import { closeWindow, getWindowState, listExternalLinks, minimizeWindow, openExternalByKey, toggleMaximizeWindow } from '../services/app-shell';
import { getUserDataPath } from '../app/runtime';
import { logger } from '../services/logger';
import { handleIpc } from './handle';

function normalizeRendererErrorPayload(value: unknown): RendererErrorLogPayload {
  const record = value && typeof value === 'object' ? (value as Partial<RendererErrorLogPayload>) : {};

  return {
    source: record.source ?? 'window',
    message: typeof record.message === 'string' && record.message.trim() ? record.message : 'Unknown renderer error',
    info: typeof record.info === 'string' ? record.info : undefined,
    stack: typeof record.stack === 'string' ? record.stack : undefined,
    route: typeof record.route === 'string' ? record.route : '',
    timestamp: typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString(),
  };
}

export function registerAppIpc(): void {
  handleIpc<AppInfo>('app:get-info', () => {
    return {
      name: APP_NAME,
      version: APP_VERSION,
      platform: process.platform,
      isDev: process.env.NODE_ENV !== 'production',
      userDataPath: getUserDataPath(),
    };
  });
  handleIpc<RendererErrorLogResult>('app:renderer-error', (_event, payload) => {
    const report = normalizeRendererErrorPayload(payload);
    logger.error('RendererError', `${report.source}: ${report.message}`, report);

    return { recorded: true };
  });
  handleIpc('shell:list-external-links', () => listExternalLinks());
  handleIpc('shell:open-external-by-key', (_event, payload) => openExternalByKey(payload as ExternalLinkOpenPayload));
  handleIpc('window:get-state', () => getWindowState());
  handleIpc('window:minimize', () => minimizeWindow());
  handleIpc('window:toggle-maximize', () => toggleMaximizeWindow());
  handleIpc('window:close', () => closeWindow());
}
