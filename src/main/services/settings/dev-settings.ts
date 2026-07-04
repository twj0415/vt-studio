import { BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { VT_STATUS } from '@shared/constants/status';
import type {
  DevSettingsOpenDevToolsResult,
  DevSettingsResult,
  DevSettingsSavePayload,
  DevSettingsSaveResult,
} from '@shared/types/dev-settings';
import { getDatabase, withTransaction } from '../database';
import { createError } from '../result';

const DEV_SETTING_KEY = 'switchAiDevTool';

function readEnabled(): boolean {
  const row = getDatabase().prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(DEV_SETTING_KEY);
  return row?.value === '1';
}

function writeEnabled(enabled: boolean): void {
  const now = Date.now();
  withTransaction(() => {
    getDatabase()
      .prepare<[string, string, number, number, number]>(
        `
        INSERT INTO app_settings (key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ?
        `,
      )
      .run(DEV_SETTING_KEY, enabled ? '1' : '0', now, now, now);
  });
}

function getActiveWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

export function getDevSettings(): DevSettingsResult {
  return {
    enabled: readEnabled(),
    isDev: is.dev,
  };
}

export function saveDevSettings(payload: DevSettingsSavePayload): DevSettingsSaveResult {
  if (typeof payload.enabled !== 'boolean') {
    throw createError(VT_STATUS.INVALID_PARAMS, 'AI DevTools 开关参数无效');
  }

  if (!is.dev && payload.enabled) {
    throw createError(VT_STATUS.FORBIDDEN, '生产环境不允许开启 AI DevTools');
  }

  writeEnabled(payload.enabled);

  return {
    enabled: readEnabled(),
    isDev: is.dev,
  };
}

export function openRendererDevTools(): DevSettingsOpenDevToolsResult {
  if (!is.dev) {
    throw createError(VT_STATUS.FORBIDDEN, '生产环境不允许打开 DevTools');
  }

  const window = getActiveWindow();
  if (!window) {
    throw createError(VT_STATUS.NOT_FOUND, '当前没有可用窗口');
  }

  window.webContents.openDevTools({ mode: 'detach' });

  return { opened: true };
}
