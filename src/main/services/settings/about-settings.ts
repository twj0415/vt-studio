import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { shell } from 'electron';
import { is } from '@electron-toolkit/utils';
import { APP_EXTERNAL_LINKS, APP_NAME, APP_UPDATE_SOURCE_URLS, APP_VERSION } from '@shared/constants/app';
import { VT_STATUS } from '@shared/constants/status';
import type {
  AboutCheckUpdatePayload,
  AboutCheckUpdateResult,
  AboutDownloadPayload,
  AboutDownloadResult,
  AboutExternalLinkItem,
  AboutInfo,
  AboutOpenLinkPayload,
  AboutOpenLinkResult,
  AboutSettingsResult,
  AboutUpdateSourceItem,
  AboutUpdateSourceKey,
} from '@shared/types/about-settings';
import { getUserDataPath } from '../../app/runtime';
import { createError } from '../result';

interface UpdateFeed {
  version: string;
  downloadUrl: string | null;
  releaseNotes: string | null;
}

interface GithubAsset {
  browser_download_url?: string;
  name?: string;
}

interface GithubReleasePayload {
  tag_name?: string;
  body?: string;
  assets?: GithubAsset[];
}

function getDownloadDirectory(): string {
  return join(getUserDataPath(), 'downloads');
}

function buildExternalLinks(): AboutExternalLinkItem[] {
  return [
    { key: 'github', label: 'GitHub', url: APP_EXTERNAL_LINKS.github, configured: Boolean(APP_EXTERNAL_LINKS.github) },
    { key: 'gitee', label: 'Gitee', url: APP_EXTERNAL_LINKS.gitee, configured: Boolean(APP_EXTERNAL_LINKS.gitee) },
    { key: 'license', label: 'License', url: APP_EXTERNAL_LINKS.license, configured: Boolean(APP_EXTERNAL_LINKS.license) },
  ];
}

function buildUpdateSources(): AboutUpdateSourceItem[] {
  return [
    { key: 'github', label: 'GitHub', defaultUrl: APP_UPDATE_SOURCE_URLS.github, configured: Boolean(APP_UPDATE_SOURCE_URLS.github), requiresCustomUrl: false },
    { key: 'gitee', label: 'Gitee', defaultUrl: APP_UPDATE_SOURCE_URLS.gitee, configured: Boolean(APP_UPDATE_SOURCE_URLS.gitee), requiresCustomUrl: false },
    { key: 'custom', label: '自定义 URL', defaultUrl: null, configured: true, requiresCustomUrl: true },
  ];
}

function buildInfo(): AboutInfo {
  return {
    appName: APP_NAME,
    version: APP_VERSION,
    platform: process.platform,
    isDev: is.dev,
    userDataPath: getUserDataPath(),
    downloadDirectory: getDownloadDirectory(),
    externalLinks: buildExternalLinks(),
    updateSources: buildUpdateSources(),
  };
}

function ensureHttpUrl(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}不能为空`);
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}无效`, error);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}必须是 http 或 https`);
  }

  return parsed.toString();
}

function resolveUpdateUrl(source: AboutUpdateSourceKey, customUrl?: string): string {
  if (source === 'custom') {
    return ensureHttpUrl(customUrl ?? '', '自定义更新地址');
  }

  const defaultUrl = APP_UPDATE_SOURCE_URLS[source];
  if (!defaultUrl) {
    throw createError(VT_STATUS.NOT_FOUND, `${source === 'github' ? 'GitHub' : 'Gitee'} 更新源未配置`);
  }

  return ensureHttpUrl(defaultUrl, '更新地址');
}

function normalizeVersion(value: string): string {
  const normalized = value.trim().replace(/^v/i, '');
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, '版本号不能为空');
  }

  return normalized;
}

function parseVersionParts(version: string): number[] {
  const core = normalizeVersion(version).split('-')[0] ?? '';
  const parts = core.split('.').map((part) => Number(part));
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `版本号格式无效：${version}`);
  }

  return parts;
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function parseGithubRelease(payload: GithubReleasePayload): UpdateFeed {
  const version = normalizeVersion(payload.tag_name ?? '');
  const asset = payload.assets?.find((item) => typeof item.browser_download_url === 'string' && item.browser_download_url.trim().length > 0);

  return {
    version,
    downloadUrl: asset?.browser_download_url ?? null,
    releaseNotes: typeof payload.body === 'string' && payload.body.trim() ? payload.body.trim() : null,
  };
}

function parseGenericRelease(payload: unknown): UpdateFeed {
  if (!payload || typeof payload !== 'object') {
    throw createError(VT_STATUS.FAIL, '更新响应结构无效');
  }

  const record = payload as Record<string, unknown>;
  const nested = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record;
  const versionValue = nested.version ?? nested.latestVersion ?? nested.tagName ?? nested.tag_name;
  const downloadValue = nested.downloadUrl ?? nested.download_url ?? nested.url ?? nested.browser_download_url;
  const notesValue = nested.releaseNotes ?? nested.release_notes ?? nested.notes ?? nested.body ?? null;

  if (typeof versionValue !== 'string' || !versionValue.trim()) {
    throw createError(VT_STATUS.FAIL, '更新响应缺少版本号');
  }

  return {
    version: normalizeVersion(versionValue),
    downloadUrl: typeof downloadValue === 'string' && downloadValue.trim() ? ensureHttpUrl(downloadValue, '下载地址') : null,
    releaseNotes: typeof notesValue === 'string' && notesValue.trim() ? notesValue.trim() : null,
  };
}

async function fetchUpdateFeed(url: string, source: AboutUpdateSourceKey): Promise<UpdateFeed> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `${APP_NAME}/${APP_VERSION}`,
    },
  });

  if (!response.ok) {
    throw createError(VT_STATUS.FAIL, `检查更新失败：${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (source === 'github') {
    return parseGithubRelease(payload as GithubReleasePayload);
  }

  return parseGenericRelease(payload);
}

function parseContentDispositionFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const normalMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return normalMatch?.[1] ?? null;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
}

function resolveDownloadFileName(url: string, version: string, contentDisposition: string | null): string {
  const fromDisposition = parseContentDispositionFileName(contentDisposition);
  if (fromDisposition) {
    return sanitizeFileName(fromDisposition);
  }

  const parsed = new URL(url);
  const rawName = basename(parsed.pathname);
  const extension = extname(rawName) || '.bin';
  return sanitizeFileName(`vt-studio-${normalizeVersion(version)}${extension}`);
}

export function getAboutInfo(): AboutSettingsResult {
  return {
    info: buildInfo(),
  };
}

export async function checkAboutUpdate(payload: AboutCheckUpdatePayload): Promise<AboutCheckUpdateResult> {
  const source = payload.source;
  if (source !== 'github' && source !== 'gitee' && source !== 'custom') {
    throw createError(VT_STATUS.INVALID_PARAMS, '更新源无效');
  }

  const resolvedUrl = resolveUpdateUrl(source, payload.url);
  const feed = await fetchUpdateFeed(resolvedUrl, source);
  const currentVersion = normalizeVersion(APP_VERSION);
  const latestVersion = normalizeVersion(feed.version);

  return {
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    downloadUrl: feed.downloadUrl,
    releaseNotes: feed.releaseNotes,
    resolvedSource: source,
    resolvedUrl,
    checkedAt: Date.now(),
  };
}

export async function downloadAboutUpdate(payload: AboutDownloadPayload): Promise<AboutDownloadResult> {
  const url = ensureHttpUrl(payload.url, '下载地址');
  const version = normalizeVersion(payload.version);
  const response = await fetch(url, {
    headers: {
      'User-Agent': `${APP_NAME}/${APP_VERSION}`,
    },
  });

  if (!response.ok) {
    throw createError(VT_STATUS.FAIL, `下载安装包失败：${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const directory = getDownloadDirectory();
  await mkdir(directory, { recursive: true });

  const fileName = resolveDownloadFileName(url, version, response.headers.get('content-disposition'));
  const filePath = join(directory, fileName);
  await writeFile(filePath, buffer);

  return {
    version,
    filePath,
    fileName,
    sizeBytes: buffer.byteLength,
    reinstall: Boolean(payload.reinstall),
  };
}

export async function openAboutLink(payload: AboutOpenLinkPayload): Promise<AboutOpenLinkResult> {
  const link = buildExternalLinks().find((item) => item.key === payload.key);
  if (!link) {
    throw createError(VT_STATUS.INVALID_PARAMS, '外链类型无效');
  }
  if (!link.url) {
    throw createError(VT_STATUS.NOT_FOUND, `${link.label} 链接未配置`);
  }

  await shell.openExternal(link.url);

  return {
    key: link.key,
    url: link.url,
  };
}
