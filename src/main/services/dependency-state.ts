import type Database from 'better-sqlite3';
import { DEPENDENCY_STATUSES, DEPENDENCY_STATUS_VALUES, type DependencyStatus } from '@shared/constants/dictionaries';
import { getDatabase } from './database';

export const DEPENDENCY_REASON = {
  SOURCE_CHANGED: '原文已变更，需要复查剧本和下游生成结果',
  SCRIPT_CHANGED: '剧本内容已变更，需要复查资产、分镜和视频结果',
  SCRIPT_DELETED: '剧本已删除，相关生产结果缺少来源',
  ASSET_CHANGED: '资产内容或选中媒体已变更，需要复查引用它的分镜和视频',
  ASSET_DELETED: '引用的资产已删除',
  ASSET_IMAGE_MISSING: '资产当前图片已删除或缺失',
  STORYBOARD_CHANGED: '分镜内容、图片或关联资产已变更，需要复查视频轨道',
  STORYBOARD_DELETED: '引用的分镜已删除',
  TRACK_CHANGED: '视频轨道提示词、时长、模式或关联分镜已变更，需要复查视频候选',
  VIDEO_DELETED: '已选视频候选已删除',
  REGENERATED: '已重新生成，依赖状态恢复有效',
  SELECTED: '已重新选择当前结果，依赖状态恢复有效',
} as const;

export function assertDependencyStatus(value: string | null | undefined): DependencyStatus {
  if (DEPENDENCY_STATUS_VALUES.includes(value as DependencyStatus)) {
    return value as DependencyStatus;
  }

  return DEPENDENCY_STATUSES.VALID;
}

function normalizeIds(ids: number[]): number[] {
  return Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
}

function placeholders(ids: number[]): string {
  return ids.map(() => '?').join(', ');
}

function now(): number {
  return Date.now();
}

function updateRows(
  database: Database.Database,
  tableName: string,
  whereSql: string,
  whereParams: Array<number | string>,
  status: DependencyStatus,
  reason: string | null,
): number {
  const result = database
    .prepare<Array<number | string | null>, { changes: number }>(
      `
      UPDATE ${tableName}
      SET dependency_status = ?, dependency_reason = ?, updated_at = ?
      WHERE ${whereSql}
      `,
    )
    .run(status, reason, now(), ...whereParams);

  return result.changes;
}

export function markScriptsDependencyStatus(input: {
  projectId: number;
  scriptIds?: number[];
  status: DependencyStatus;
  reason: string | null;
  database?: Database.Database;
}): number {
  const database = input.database ?? getDatabase();
  const scriptIds = normalizeIds(input.scriptIds ?? []);
  if (scriptIds.length === 0) {
    return updateRows(database, 'scripts', 'project_id = ?', [input.projectId], input.status, input.reason);
  }

  return updateRows(
    database,
    'scripts',
    `project_id = ? AND id IN (${placeholders(scriptIds)})`,
    [input.projectId, ...scriptIds],
    input.status,
    input.reason,
  );
}

export function markAssetsDependencyStatus(input: {
  projectId: number;
  assetIds: number[];
  status: DependencyStatus;
  reason: string | null;
  database?: Database.Database;
}): number {
  const assetIds = normalizeIds(input.assetIds);
  if (assetIds.length === 0) {
    return 0;
  }

  return updateRows(
    input.database ?? getDatabase(),
    'assets',
    `project_id = ? AND id IN (${placeholders(assetIds)})`,
    [input.projectId, ...assetIds],
    input.status,
    input.reason,
  );
}

export function markStoryboardsDependencyStatus(input: {
  projectId: number;
  scriptId?: number;
  storyboardIds: number[];
  status: DependencyStatus;
  reason: string | null;
  database?: Database.Database;
}): number {
  const storyboardIds = normalizeIds(input.storyboardIds);
  if (storyboardIds.length === 0) {
    return 0;
  }

  const scriptClause = input.scriptId ? ' AND script_id = ?' : '';
  const params = input.scriptId ? [input.projectId, input.scriptId, ...storyboardIds] : [input.projectId, ...storyboardIds];
  return updateRows(
    input.database ?? getDatabase(),
    'production_storyboards',
    `project_id = ?${scriptClause} AND id IN (${placeholders(storyboardIds)})`,
    params,
    input.status,
    input.reason,
  );
}

export function markTracksDependencyStatus(input: {
  projectId: number;
  scriptId?: number;
  trackIds: number[];
  status: DependencyStatus;
  reason: string | null;
  database?: Database.Database;
}): number {
  const trackIds = normalizeIds(input.trackIds);
  if (trackIds.length === 0) {
    return 0;
  }

  const database = input.database ?? getDatabase();
  const scriptClause = input.scriptId ? ' AND script_id = ?' : '';
  const params = input.scriptId ? [input.projectId, input.scriptId, ...trackIds] : [input.projectId, ...trackIds];
  return updateRows(
    database,
    'production_video_tracks',
    `project_id = ?${scriptClause} AND id IN (${placeholders(trackIds)})`,
    params,
    input.status,
    input.reason,
  );
}

export function markVideosDependencyStatus(input: {
  projectId: number;
  scriptId?: number;
  videoIds?: number[];
  trackIds?: number[];
  status: DependencyStatus;
  reason: string | null;
  database?: Database.Database;
}): number {
  const videoIds = normalizeIds(input.videoIds ?? []);
  const trackIds = normalizeIds(input.trackIds ?? []);
  if (videoIds.length === 0 && trackIds.length === 0) {
    return 0;
  }

  const clauses = ['project_id = ?'];
  const params: Array<number | string> = [input.projectId];
  if (input.scriptId) {
    clauses.push('script_id = ?');
    params.push(input.scriptId);
  }
  if (videoIds.length > 0) {
    clauses.push(`id IN (${placeholders(videoIds)})`);
    params.push(...videoIds);
  }
  if (trackIds.length > 0) {
    clauses.push(`track_id IN (${placeholders(trackIds)})`);
    params.push(...trackIds);
  }

  return updateRows(input.database ?? getDatabase(), 'production_videos', clauses.join(' AND '), params, input.status, input.reason);
}

export function markProductionForScriptsChanged(input: {
  projectId: number;
  scriptIds: number[];
  status?: DependencyStatus;
  reason?: string;
  database?: Database.Database;
}): void {
  const scriptIds = normalizeIds(input.scriptIds);
  if (scriptIds.length === 0) {
    return;
  }

  const database = input.database ?? getDatabase();
  const status = input.status ?? DEPENDENCY_STATUSES.NEEDS_REVIEW;
  const reason = input.reason ?? DEPENDENCY_REASON.SCRIPT_CHANGED;
  const inSql = placeholders(scriptIds);

  updateRows(database, 'production_storyboards', `project_id = ? AND script_id IN (${inSql})`, [input.projectId, ...scriptIds], status, reason);
  updateRows(database, 'production_video_tracks', `project_id = ? AND script_id IN (${inSql})`, [input.projectId, ...scriptIds], status, reason);
  updateRows(database, 'production_videos', `project_id = ? AND script_id IN (${inSql})`, [input.projectId, ...scriptIds], status, reason);
}

export function markProductionForContentChanged(input: {
  projectId: number;
  contentIds: number[];
  status?: DependencyStatus;
  reason?: string;
  database?: Database.Database;
}): void {
  markProductionForScriptsChanged({
    projectId: input.projectId,
    scriptIds: input.contentIds,
    status: input.status,
    reason: input.reason,
    database: input.database,
  });
}

export function markProductionForAssetsChanged(input: {
  projectId: number;
  assetIds: number[];
  status?: DependencyStatus;
  reason?: string;
  database?: Database.Database;
}): void {
  const assetIds = normalizeIds(input.assetIds);
  if (assetIds.length === 0) {
    return;
  }

  const database = input.database ?? getDatabase();
  const status = input.status ?? DEPENDENCY_STATUSES.NEEDS_REVIEW;
  const reason = input.reason ?? DEPENDENCY_REASON.ASSET_CHANGED;
  const rows = database
    .prepare<Array<number>, { storyboard_id: number; track_id: number | null }>(
      `
      SELECT DISTINCT s.id AS storyboard_id, s.track_id
      FROM production_storyboard_asset_links l
      JOIN production_storyboards s ON s.id = l.storyboard_id
      WHERE s.project_id = ?
        AND l.asset_id IN (${placeholders(assetIds)})
      `,
    )
    .all(input.projectId, ...assetIds);
  const storyboardIds = rows.map((row) => row.storyboard_id);
  const trackIds = rows.map((row) => row.track_id).filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0);

  markStoryboardsDependencyStatus({ projectId: input.projectId, storyboardIds, status, reason, database });
  markTracksDependencyStatus({ projectId: input.projectId, trackIds, status, reason, database });
  markVideosDependencyStatus({ projectId: input.projectId, trackIds, status, reason, database });
}

export function markVideosForStoryboardsChanged(input: {
  projectId: number;
  scriptId: number;
  storyboardIds: number[];
  status?: DependencyStatus;
  reason?: string;
  database?: Database.Database;
}): void {
  const storyboardIds = normalizeIds(input.storyboardIds);
  if (storyboardIds.length === 0) {
    return;
  }

  const database = input.database ?? getDatabase();
  const rows = database
    .prepare<Array<number>, { track_id: number | null }>(
      `
      SELECT DISTINCT track_id
      FROM production_storyboards
      WHERE project_id = ?
        AND script_id = ?
        AND id IN (${placeholders(storyboardIds)})
        AND track_id IS NOT NULL
      `,
    )
    .all(input.projectId, input.scriptId, ...storyboardIds);
  const trackIds = rows.map((row) => row.track_id).filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0);
  const status = input.status ?? DEPENDENCY_STATUSES.NEEDS_REVIEW;
  const reason = input.reason ?? DEPENDENCY_REASON.STORYBOARD_CHANGED;

  markTracksDependencyStatus({ projectId: input.projectId, scriptId: input.scriptId, trackIds, status, reason, database });
  markVideosDependencyStatus({ projectId: input.projectId, scriptId: input.scriptId, trackIds, status, reason, database });
}
