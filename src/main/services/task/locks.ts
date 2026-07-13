import {
  GENERATION_TASK_STATUSES,
  SCRIPT_EXTRACT_STATUSES,
  SOURCE_EVENT_STATUSES,
  TASK_STATUSES,
} from '@shared/constants/dictionaries';
import { VT_STATUS } from '@shared/constants/status';
import type { BusinessLockScope, BusinessLockSource, BusinessLockSummary } from '@shared/types/business-lock';
import { getDatabase } from '../database';
import { createError } from '../result';
import { normalizeProductionTaskCategory } from './production-format';

interface BusinessLockQuery {
  projectId?: number | null;
}

interface BusinessLockAssertInput extends BusinessLockQuery {
  action: string;
}

interface CountRow {
  count: number;
}

interface RunningTaskRow {
  id: number;
  project_id: number | null;
  category: string;
}

function tableExists(tableName: string): boolean {
  const row = getDatabase()
    .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);

  return Boolean(row);
}

function normalizeProjectId(projectId: number | null | undefined): number | null {
  if (projectId === undefined || projectId === null) {
    return null;
  }

  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }

  return projectId;
}

function getScope(projectId: number | null): BusinessLockScope {
  return projectId === null ? 'global' : 'project';
}

function countRows(tableName: string, condition: string, params: Array<number | string>, projectId: number | null): number {
  if (!tableExists(tableName)) {
    return 0;
  }

  const projectSql = projectId === null ? '' : ' AND project_id = ?';
  const row = getDatabase()
    .prepare<Array<number | string>, CountRow>(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${condition}${projectSql}`)
    .get(...params, ...(projectId === null ? [] : [projectId]));

  return row?.count ?? 0;
}

function pushLock(locks: BusinessLockSummary[], input: {
  source: BusinessLockSource;
  label: string;
  count: number;
  projectId: number | null;
  taskIds?: number[];
}): void {
  if (input.count <= 0) {
    return;
  }

  locks.push({
    source: input.source,
    scope: getScope(input.projectId),
    projectId: input.projectId,
    label: input.label,
    count: input.count,
    taskIds: input.taskIds ?? [],
  });
}

function listRunningTaskLocks(projectId: number | null): BusinessLockSummary[] {
  if (!tableExists('tasks')) {
    return [];
  }

  const projectSql = projectId === null ? '' : ' AND project_id = ?';
  const rows = getDatabase()
    .prepare<Array<number | string>, RunningTaskRow>(`SELECT id, project_id, category FROM tasks WHERE status = ?${projectSql} ORDER BY id ASC`)
    .all(TASK_STATUSES.RUNNING, ...(projectId === null ? [] : [projectId]));

  const groups = new Map<string, RunningTaskRow[]>();
  rows.forEach((row) => {
    const key = row.category ? normalizeProductionTaskCategory(row.category) : '未分类任务';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return Array.from(groups.entries()).map(([category, group]) => ({
    source: 'tasks',
    scope: getScope(projectId),
    projectId,
    label: `任务：${category}`,
    count: group.length,
    taskIds: group.map((row) => row.id),
  }));
}

export function countRunningTaskRecords(input: BusinessLockQuery = {}): number {
  const projectId = normalizeProjectId(input.projectId);
  return listRunningTaskLocks(projectId).reduce((total, lock) => total + lock.count, 0);
}

export function listBusinessLocks(input: BusinessLockQuery = {}): BusinessLockSummary[] {
  const projectId = normalizeProjectId(input.projectId);
  const locks = [...listRunningTaskLocks(projectId)];

  pushLock(locks, {
    source: 'source_chapters',
    label: '原文事件分析',
    count: countRows('source_chapters', 'event_status = ?', [SOURCE_EVENT_STATUSES.RUNNING], projectId),
    projectId,
  });
  pushLock(locks, {
    source: 'scripts',
    label: '提取资源',
    count: countRows('scripts', 'extract_status IN (?, ?)', [SCRIPT_EXTRACT_STATUSES.WAITING, SCRIPT_EXTRACT_STATUSES.RUNNING], projectId),
    projectId,
  });
  pushLock(locks, {
    source: 'assets',
    label: '资产提示词生成',
    count: countRows('assets', 'prompt_status = ?', [GENERATION_TASK_STATUSES.RUNNING], projectId),
    projectId,
  });
  pushLock(locks, {
    source: 'assets',
    label: '生成资源图',
    count: countRows('assets', 'image_status = ?', [GENERATION_TASK_STATUSES.RUNNING], projectId),
    projectId,
  });
  pushLock(locks, {
    source: 'assets',
    label: '角景音频绑定',
    count: countRows('assets', 'audio_bind_status = ?', [GENERATION_TASK_STATUSES.RUNNING], projectId),
    projectId,
  });
  pushLock(locks, {
    source: 'asset_media',
    label: '资产媒体生成',
    count: countRows('asset_media', 'status = ?', [GENERATION_TASK_STATUSES.RUNNING], projectId),
    projectId,
  });
  pushLock(locks, {
    source: 'production_storyboards',
    label: '生成分镜图',
    count: countRows('production_storyboards', 'image_status = ?', [GENERATION_TASK_STATUSES.RUNNING], projectId),
    projectId,
  });
  pushLock(locks, {
    source: 'production_video_tracks',
    label: '生成视频提示词',
    count: countRows('production_video_tracks', 'status = ?', [GENERATION_TASK_STATUSES.RUNNING], projectId),
    projectId,
  });
  pushLock(locks, {
    source: 'production_videos',
    label: '生成视频',
    count: countRows('production_videos', 'status = ?', [GENERATION_TASK_STATUSES.RUNNING], projectId),
    projectId,
  });

  return locks;
}

export function countBusinessLocks(input: BusinessLockQuery = {}): number {
  return listBusinessLocks(input).reduce((total, lock) => total + lock.count, 0);
}

export function formatBusinessLockSummary(locks: BusinessLockSummary[]): string {
  if (locks.length === 0) {
    return '无运行中任务';
  }

  const visible = locks.slice(0, 5).map((lock) => `${lock.label} ${lock.count} 个`);
  const suffix = locks.length > visible.length ? `，另有 ${locks.length - visible.length} 类` : '';
  return `${visible.join('，')}${suffix}`;
}

export function assertNoBusinessLocks(input: BusinessLockAssertInput): void {
  const locks = listBusinessLocks(input);
  if (locks.length === 0) {
    return;
  }

  throw createError(
    VT_STATUS.TASK_STATUS_CONFLICT,
    `${input.action}前请先等待或停止运行中的任务：${formatBusinessLockSummary(locks)}`,
  );
}
