export type AboutUpdateSourceKey = 'github' | 'gitee' | 'custom';
export type AboutLinkKey = 'github' | 'gitee' | 'license';

export interface AboutExternalLinkItem {
  key: AboutLinkKey;
  label: string;
  url: string | null;
  configured: boolean;
}

export interface AboutUpdateSourceItem {
  key: AboutUpdateSourceKey;
  label: string;
  defaultUrl: string | null;
  configured: boolean;
  requiresCustomUrl: boolean;
}

export interface AboutInfo {
  appName: string;
  version: string;
  platform: NodeJS.Platform;
  isDev: boolean;
  userDataPath: string;
  downloadDirectory: string;
  externalLinks: AboutExternalLinkItem[];
  updateSources: AboutUpdateSourceItem[];
}

export interface AboutSettingsResult {
  info: AboutInfo;
}

export interface AboutCheckUpdatePayload {
  source: AboutUpdateSourceKey;
  url?: string;
}

export interface AboutCheckUpdateResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
  resolvedSource: AboutUpdateSourceKey;
  resolvedUrl: string;
  checkedAt: number;
}

export interface AboutDownloadPayload {
  url: string;
  version: string;
  reinstall?: boolean;
}

export interface AboutDownloadResult {
  version: string;
  filePath: string;
  fileName: string;
  sizeBytes: number;
  reinstall: boolean;
}

export interface AboutOpenLinkPayload {
  key: AboutLinkKey;
}

export interface AboutOpenLinkResult {
  key: AboutLinkKey;
  url: string;
}
