import {
  APPEARANCE_FONT_SIZE_VALUES,
  APPEARANCE_MODE_VALUES,
  APPEARANCE_PRESET_VALUES,
  APPEARANCE_PRESETS as APPEARANCE_PRESET_IDS,
  type AppearanceFontSize,
  type AppearanceMode,
  type AppearancePresetId,
} from '@shared/constants/dictionaries';

export type { AppearanceFontSize, AppearanceMode, AppearancePresetId };
export type ResolvedAppearanceMode = 'light' | 'dark';

export interface AppearanceSettings {
  mode: AppearanceMode;
  themePresetId: AppearancePresetId;
  fontSize: AppearanceFontSize;
}

export interface AppearancePresetMeta {
  id: AppearancePresetId;
  name: string;
  description: string;
  preview: [string, string, string];
}

const APPEARANCE_STORAGE_KEY = 'vtStudio.appearance';
const FONT_SIZES: AppearanceFontSize[] = [...APPEARANCE_FONT_SIZE_VALUES];

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  mode: 'auto',
  themePresetId: 'studio',
  fontSize: 14,
};

export const APPEARANCE_PRESETS: AppearancePresetMeta[] = [
  {
    id: 'studio',
    name: 'Studio',
    description: 'Default studio preset.',
    preview: ['#2f6f63', '#f3efe7', '#9a641f'],
  },
  {
    id: 'warm',
    name: 'Warm',
    description: 'Warm reading preset.',
    preview: ['#b36a3c', '#f6eee4', '#7b8b53'],
  },
  {
    id: 'work',
    name: 'Work',
    description: 'Dense work preset.',
    preview: ['#2563eb', '#eef2f6', '#0f172a'],
  },
];

let currentSettings: AppearanceSettings = { ...DEFAULT_APPEARANCE_SETTINGS };
let mediaQueryList: MediaQueryList | null = null;
let mediaQueryHandlerBound = false;

function isAppearanceMode(value: string): value is AppearanceMode {
  return APPEARANCE_MODE_VALUES.includes(value as AppearanceMode);
}

function isAppearancePresetId(value: string): value is AppearancePresetId {
  return APPEARANCE_PRESET_VALUES.includes(value as AppearancePresetId);
}

function isAppearanceFontSize(value: number): value is AppearanceFontSize {
  return FONT_SIZES.includes(value as AppearanceFontSize);
}

export function normalizeAppearanceSettings(value: Partial<AppearanceSettings> | null | undefined): AppearanceSettings {
  const mode = typeof value?.mode === 'string' && isAppearanceMode(value.mode) ? value.mode : DEFAULT_APPEARANCE_SETTINGS.mode;
  const themePresetId = typeof value?.themePresetId === 'string' && isAppearancePresetId(value.themePresetId) ? value.themePresetId : DEFAULT_APPEARANCE_SETTINGS.themePresetId;
  const fontSizeNumber = Number(value?.fontSize);
  const fontSize = isAppearanceFontSize(fontSizeNumber) ? fontSizeNumber : DEFAULT_APPEARANCE_SETTINGS.fontSize;

  return {
    mode,
    themePresetId,
    fontSize,
  };
}

export function readStoredAppearanceSettings(): AppearanceSettings {
  const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_APPEARANCE_SETTINGS };
  }

  try {
    return normalizeAppearanceSettings(JSON.parse(raw) as Partial<AppearanceSettings>);
  } catch {
    return { ...DEFAULT_APPEARANCE_SETTINGS };
  }
}

export function persistAppearanceSettings(settings: AppearanceSettings): void {
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
}

export function getSystemAppearanceMode(): ResolvedAppearanceMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveAppearanceMode(mode: AppearanceMode): ResolvedAppearanceMode {
  return mode === 'auto' ? getSystemAppearanceMode() : mode;
}

export function applyAppearanceSettings(settings: AppearanceSettings): void {
  currentSettings = normalizeAppearanceSettings(settings);
  const root = document.documentElement;
  const resolvedMode = resolveAppearanceMode(currentSettings.mode);

  root.setAttribute('theme-mode', currentSettings.mode);
  root.setAttribute('data-theme-preset', currentSettings.themePresetId || APPEARANCE_PRESET_IDS.STUDIO);
  root.setAttribute('data-color-mode', resolvedMode);
  root.classList.toggle('dark', resolvedMode === 'dark');
  root.style.fontSize = `${currentSettings.fontSize}px`;
}

function handleSystemAppearanceChange(): void {
  if (currentSettings.mode !== 'auto') {
    return;
  }

  applyAppearanceSettings(currentSettings);
}

export function watchSystemAppearance(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }

  if (!mediaQueryList) {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
  }

  if (mediaQueryHandlerBound) {
    return;
  }

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', handleSystemAppearanceChange);
  } else {
    mediaQueryList.addListener(handleSystemAppearanceChange);
  }
  mediaQueryHandlerBound = true;
}

export function initAppearance(): AppearanceSettings {
  const settings = readStoredAppearanceSettings();
  applyAppearanceSettings(settings);
  watchSystemAppearance();
  return settings;
}
