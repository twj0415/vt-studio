import { APP_NAME, APP_VERSION } from '@shared/constants/app';
import type { AppInfo } from '@shared/types/app';
import type { ExternalLinkOpenPayload } from '@shared/types/shell';
import { closeWindow, getWindowState, listExternalLinks, minimizeWindow, openExternalByKey, toggleMaximizeWindow } from '../services/app-shell';
import { getUserDataPath } from '../app/runtime';
import { handleIpc } from './handle';

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
  handleIpc('shell:list-external-links', () => listExternalLinks());
  handleIpc('shell:open-external-by-key', (_event, payload) => openExternalByKey(payload as ExternalLinkOpenPayload));
  handleIpc('window:get-state', () => getWindowState());
  handleIpc('window:minimize', () => minimizeWindow());
  handleIpc('window:toggle-maximize', () => toggleMaximizeWindow());
  handleIpc('window:close', () => closeWindow());
}
