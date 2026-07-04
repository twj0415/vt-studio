import { BrowserWindow, shell } from 'electron';
import { APP_EXTERNAL_LINKS } from '@shared/constants/app';
import { VT_STATUS } from '@shared/constants/status';
import type {
  ExternalLinkInfo,
  ExternalLinkKey,
  ExternalLinkListResult,
  ExternalLinkOpenPayload,
  ExternalLinkOpenResult,
  WindowState,
  WindowStateResult,
} from '@shared/types/shell';
import { createError } from './result';

function getActiveWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function buildWindowState(window: BrowserWindow): WindowState {
  return {
    isMaximized: window.isMaximized(),
    isMinimized: window.isMinimized(),
  };
}

function getConfiguredExternalLinks(): ExternalLinkInfo[] {
  return [
    { key: 'feedback', label: '反馈', configured: Boolean(APP_EXTERNAL_LINKS.feedback) },
    { key: 'github', label: 'GitHub', configured: Boolean(APP_EXTERNAL_LINKS.github) },
  ];
}

function resolveExternalLink(key: ExternalLinkKey): string {
  const url = APP_EXTERNAL_LINKS[key];
  if (!url) {
    throw createError(VT_STATUS.NOT_FOUND, `${key === 'feedback' ? '反馈' : 'GitHub'} 链接未配置`);
  }

  return url;
}

export function listExternalLinks(): ExternalLinkListResult {
  return {
    links: getConfiguredExternalLinks(),
  };
}

export async function openExternalByKey(payload: ExternalLinkOpenPayload): Promise<ExternalLinkOpenResult> {
  if (payload.key !== 'feedback' && payload.key !== 'github') {
    throw createError(VT_STATUS.INVALID_PARAMS, '外链 key 无效');
  }

  const url = resolveExternalLink(payload.key);
  await shell.openExternal(url);

  return {
    key: payload.key,
    url,
  };
}

export function getWindowState(): WindowStateResult {
  const window = getActiveWindow();
  if (!window) {
    throw createError(VT_STATUS.NOT_FOUND, '当前没有可用窗口');
  }

  return {
    state: buildWindowState(window),
  };
}

export function minimizeWindow(): WindowStateResult {
  const window = getActiveWindow();
  if (!window) {
    throw createError(VT_STATUS.NOT_FOUND, '当前没有可用窗口');
  }

  window.minimize();
  return {
    state: buildWindowState(window),
  };
}

export function toggleMaximizeWindow(): WindowStateResult {
  const window = getActiveWindow();
  if (!window) {
    throw createError(VT_STATUS.NOT_FOUND, '当前没有可用窗口');
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }

  return {
    state: buildWindowState(window),
  };
}

export function closeWindow(): Record<string, never> {
  const window = getActiveWindow();
  if (!window) {
    throw createError(VT_STATUS.NOT_FOUND, '当前没有可用窗口');
  }

  window.close();
  return {};
}
