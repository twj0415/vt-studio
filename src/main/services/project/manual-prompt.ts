import { createHash } from 'node:crypto';
import type { ProjectManualKind } from '@shared/constants/dictionaries';
import { VT_STATUS } from '@shared/constants/status';
import { getDatabase } from '../database';
import { createError } from '../result';

interface ManualRow {
  id: number;
  name: string;
  path: string;
  tabs_json: string;
  updated_at: number;
}

interface ManualTab {
  key?: string;
  content?: string;
}

export interface ManualPromptSnapshot {
  kind: ProjectManualKind;
  manualId: number;
  manualName: string;
  manualPath: string;
  keys: string[];
  contentHash: string;
  contentLength: number;
  updatedAt: number;
}

export interface ManualPromptContentSnapshot extends ManualPromptSnapshot {
  content: string;
}

export interface ManualPromptBundle extends ManualPromptSnapshot {
  content: string;
}

function getManualTableName(kind: ProjectManualKind): 'visual_manuals' | 'director_manuals' {
  return kind === 'visual' ? 'visual_manuals' : 'director_manuals';
}

function getManualLabel(kind: ProjectManualKind): string {
  return kind === 'visual' ? '视觉手册' : '导演手册';
}

function parseTabs(row: ManualRow, kind: ProjectManualKind): Map<string, string> {
  try {
    const tabs = JSON.parse(row.tabs_json || '[]') as ManualTab[];
    return new Map(
      tabs
        .filter((tab) => typeof tab.key === 'string')
        .map((tab) => [tab.key!, typeof tab.content === 'string' ? tab.content : '']),
    );
  } catch {
    throw createError(VT_STATUS.INVALID_PARAMS, `${getManualLabel(kind)}内容解析失败`);
  }
}

function createContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function readManualPromptBundle(kind: ProjectManualKind, manualId: number, keys: readonly string[]): ManualPromptBundle {
  const tableName = getManualTableName(kind);
  const row = getDatabase()
    .prepare<[number], ManualRow>(`SELECT id, name, path, tabs_json, updated_at FROM ${tableName} WHERE id = ? LIMIT 1`)
    .get(manualId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, `${getManualLabel(kind)}不存在`);
  }

  const uniqueKeys = Array.from(new Set(keys.map((key) => key.trim()).filter(Boolean)));
  const tabs = parseTabs(row, kind);
  const content = uniqueKeys
    .map((key) => tabs.get(key) ?? '')
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n');

  if (!content) {
    throw createError(VT_STATUS.NOT_FOUND, `${getManualLabel(kind)}缺少生成所需内容：${uniqueKeys.join(', ')}`);
  }

  return {
    kind,
    manualId: row.id,
    manualName: row.name,
    manualPath: row.path,
    keys: uniqueKeys,
    content,
    contentHash: createContentHash(content),
    contentLength: content.length,
    updatedAt: row.updated_at,
  };
}

export function toManualPromptSnapshot(bundle: ManualPromptBundle): ManualPromptSnapshot {
  return {
    kind: bundle.kind,
    manualId: bundle.manualId,
    manualName: bundle.manualName,
    manualPath: bundle.manualPath,
    keys: bundle.keys,
    contentHash: bundle.contentHash,
    contentLength: bundle.contentLength,
    updatedAt: bundle.updatedAt,
  };
}

export function toManualPromptContentSnapshot(bundle: ManualPromptBundle): ManualPromptContentSnapshot {
  return {
    ...toManualPromptSnapshot(bundle),
    content: bundle.content,
  };
}

export function formatManualPromptSection(title: string, bundle: ManualPromptBundle): string {
  return [
    `【${title}】`,
    `手册：${bundle.manualName} (${bundle.manualPath})`,
    `片段：${bundle.keys.join(', ')}`,
    bundle.content,
  ].join('\n');
}
