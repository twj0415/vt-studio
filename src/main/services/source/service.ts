import { VT_STATUS } from '@shared/constants/status';
import { DEPENDENCY_STATUSES } from '@shared/constants/dictionaries';
import { normalizeUnknownError } from '@shared/errors';
import {
  SOURCE_EVENT_STATUS,
  SOURCE_EVENT_STATUS_VALUES,
  type SourceChapter,
  type SourceChapterDraft,
  type SourceDeleteChapterPayload,
  type SourceDeleteChaptersPayload,
  type SourceDeleteResult,
  type SourceEventStatus,
  type SourceGenerateEventsPayload,
  type SourceGenerateEventsResult,
  type SourceImportPayload,
  type SourceImportResult,
  type SourceListPayload,
  type SourceListResult,
  type SourcePollEventStatusPayload,
  type SourcePollEventStatusResult,
  type SourceUpdateChapterPayload,
  type SourceUpdateChapterResult,
} from '@shared/types/source';
import { getDatabase, withTransaction } from '../database';
import { invokeText } from '../model/text';
import { createError } from '../result';
import { getBusinessSettings } from '../settings/business-settings';
import { getEffectivePromptByType } from '../settings/prompt';
import { stripThink } from '../socket/stripThink';
import { createTask, failTask, succeedTask } from '../task';
import { logger } from '../logger';
import { DEPENDENCY_REASON, markScriptsDependencyStatus } from '../dependency-state';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_VOLUME_NAME = '正文卷';
const SOURCE_EVENT_TASK_CATEGORY = '原文事件分析';
const RUNNING_RECOVER_REASON = '软件退出导致事件分析失败';
const SECRET_REPLACEMENT = '[已隐藏]';

interface SourceChapterRow {
  id: number;
  project_id: number;
  chapter_index: number;
  volume_name: string;
  chapter_title: string;
  content: string;
  event_status: SourceEventStatus;
  event_summary: string | null;
  event_error: string | null;
  created_at: number;
  updated_at: number;
}

interface ProjectRow {
  id: number;
  source_type: string;
  name: string;
}

function tableExists(tableName: string): boolean {
  const row = getDatabase()
    .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);

  return Boolean(row);
}

function normalizeProjectId(projectId: number): number {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }

  return projectId;
}

function assertNovelProject(projectId: number): ProjectRow {
  const id = normalizeProjectId(projectId);
  const row = getDatabase().prepare<[number], ProjectRow>('SELECT id, source_type, name FROM projects WHERE id = ? LIMIT 1').get(id);

  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '项目不存在');
  }

  if (row.source_type !== 'novel') {
    throw createError(VT_STATUS.CONFLICT, '当前项目不是原文项目');
  }

  return row;
}

function normalizePage(value: number | undefined): number {
  const page = value ?? DEFAULT_PAGE;
  if (!Number.isInteger(page) || page <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '分页页码无效');
  }

  return page;
}

function normalizeLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
    throw createError(VT_STATUS.INVALID_PARAMS, `分页数量必须在 1-${MAX_LIMIT} 之间`);
  }

  return limit;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}不能为空`);
  }

  return normalized;
}

function normalizeVolumeName(value: string | null | undefined): string {
  return normalizeOptionalText(value) ?? DEFAULT_VOLUME_NAME;
}

function normalizeChapterTitle(value: string | null | undefined, fallback: string): string {
  return normalizeOptionalText(value) ?? fallback;
}

function normalizeChapterIds(chapterIds: number[]): number[] {
  const normalized = Array.from(new Set(chapterIds.map((id) => Number(id))));
  if (normalized.length === 0 || normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '章节 ID 无效');
  }

  return normalized;
}

function assertEventStatus(value: string): SourceEventStatus {
  if (SOURCE_EVENT_STATUS_VALUES.includes(value as SourceEventStatus)) {
    return value as SourceEventStatus;
  }

  return SOURCE_EVENT_STATUS.STALE;
}

function mapChapterRow(row: SourceChapterRow): SourceChapter {
  return {
    id: row.id,
    projectId: row.project_id,
    chapterIndex: row.chapter_index,
    volumeName: row.volume_name,
    chapterTitle: row.chapter_title,
    content: row.content,
    eventStatus: assertEventStatus(row.event_status),
    eventSummary: row.event_summary,
    eventError: row.event_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getChapterRow(projectId: number, chapterId: number): SourceChapterRow {
  const row = getDatabase()
    .prepare<[number, number], SourceChapterRow>('SELECT * FROM source_chapters WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, chapterId);

  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '原文章节不存在');
  }

  return row;
}

function getChapterRows(projectId: number, chapterIds: number[]): SourceChapterRow[] {
  const placeholders = chapterIds.map(() => '?').join(', ');
  return getDatabase()
    .prepare<Array<number>, SourceChapterRow>(`SELECT * FROM source_chapters WHERE project_id = ? AND id IN (${placeholders}) ORDER BY chapter_index ASC, id ASC`)
    .all(projectId, ...chapterIds);
}

function assertAllChaptersExist(projectId: number, chapterIds: number[]): SourceChapterRow[] {
  const rows = getChapterRows(projectId, chapterIds);
  if (rows.length !== chapterIds.length) {
    throw createError(VT_STATUS.NOT_FOUND, '部分原文章节不存在');
  }

  return rows;
}

function assertNoRunningRows(rows: SourceChapterRow[], action: string): void {
  const runningCount = rows.filter((row) => row.event_status === SOURCE_EVENT_STATUS.RUNNING).length;
  if (runningCount > 0) {
    throw createError(VT_STATUS.TASK_STATUS_CONFLICT, `有 ${runningCount} 个章节正在事件分析，不能${action}`);
  }
}

function normalizeDraft(chapter: SourceChapterDraft, index: number): SourceChapterDraft {
  return {
    volumeName: normalizeVolumeName(chapter.volumeName),
    chapterTitle: normalizeChapterTitle(chapter.chapterTitle, `第 ${index + 1} 章`),
    content: normalizeRequiredText(chapter.content, '章节正文'),
  };
}

function maskSensitiveText(value: string): string {
  return value
    .replace(/(api[_-]?key|authorization|password|secret|token)(\s*[:=]\s*)[^\s,;]+/gi, `$1$2${SECRET_REPLACEMENT}`)
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, `Bearer ${SECRET_REPLACEMENT}`)
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, SECRET_REPLACEMENT)
    .replace(/([a-zA-Z]:\\Users\\)[^\\\s]+/g, `$1***`);
}

function normalizeErrorReason(error: unknown): string {
  const normalized = normalizeUnknownError(error);
  return maskSensitiveText(normalized.message || '事件分析失败');
}

function updateChapterFailure(projectId: number, chapterId: number, error: unknown): void {
  const now = Date.now();
  getDatabase()
    .prepare<[SourceEventStatus, null, string, number, number, number]>(
      `
      UPDATE source_chapters
      SET event_status = ?, event_summary = ?, event_error = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
      `,
    )
    .run(SOURCE_EVENT_STATUS.FAILED, null, normalizeErrorReason(error), now, projectId, chapterId);
}

function updateChapterSuccess(projectId: number, chapterId: number, eventSummary: string): void {
  const now = Date.now();
  getDatabase()
    .prepare<[SourceEventStatus, string, null, number, number, number]>(
      `
      UPDATE source_chapters
      SET event_status = ?, event_summary = ?, event_error = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
      `,
    )
    .run(SOURCE_EVENT_STATUS.SUCCEEDED, eventSummary, null, now, projectId, chapterId);
}

function buildEventPrompt(chapter: SourceChapterRow): string {
  return [
    `章节序号：${chapter.chapter_index}`,
    `卷：${chapter.volume_name}`,
    `章节名：${chapter.chapter_title}`,
    '',
    '章节正文：',
    chapter.content,
    '',
    '请基于以上正文提取本章事件摘要。',
  ].join('\n');
}

async function generateChapterEvent(projectId: number, chapterId: number, prompt: string): Promise<boolean> {
  try {
    const chapter = getChapterRow(projectId, chapterId);
    const result = await invokeText({
      modelKey: 'universalAi',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: buildEventPrompt(chapter) },
      ],
    });
    const text = stripThink(result.text ?? '').trim();
    if (!text) {
      throw createError(VT_STATUS.MODEL_ERROR, '模型返回了空事件摘要');
    }

    updateChapterSuccess(projectId, chapterId, text);
    return true;
  } catch (error) {
    updateChapterFailure(projectId, chapterId, error);
    logger.error('原文事件分析', `章节 ${chapterId} 分析失败`, normalizeUnknownError(error));
    return false;
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, handler: (item: T) => Promise<boolean>): Promise<boolean[]> {
  const results: boolean[] = new Array(items.length).fill(false);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await handler(items[currentIndex]!);
      }
    }),
  );

  return results;
}

async function runEventGeneration(projectId: number, chapterIds: number[], taskId: number): Promise<void> {
  try {
    const prompt = getEffectivePromptByType('eventExtraction');
    const limit = getBusinessSettings().config.assetsBatchGenerateSize;
    const results = await runWithConcurrency(chapterIds, limit, (chapterId) => generateChapterEvent(projectId, chapterId, prompt));
    const failedCount = results.filter((result) => !result).length;

    if (failedCount > 0) {
      failTask(taskId, new Error(`${failedCount} 个章节事件分析失败`));
      return;
    }

    succeedTask(taskId);
  } catch (error) {
    for (const chapterId of chapterIds) {
      updateChapterFailure(projectId, chapterId, error);
    }
    try {
      failTask(taskId, error);
    } catch (taskError) {
      logger.error('原文事件分析', '任务状态更新失败', taskError);
    }
    logger.error('原文事件分析', '批量事件分析失败', normalizeUnknownError(error));
  }
}

export function listSourceChapters(payload: SourceListPayload): SourceListResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertNovelProject(projectId);
  const page = normalizePage(payload.page);
  const limit = normalizeLimit(payload.limit);
  const where = ['project_id = ?'];
  const params: Array<string | number> = [projectId];
  const keyword = normalizeOptionalText(payload.chapterKeyword);

  if (keyword) {
    where.push('chapter_title LIKE ?');
    params.push(`%${keyword}%`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const totalRow = getDatabase().prepare<Array<string | number>, { total: number }>(`SELECT COUNT(*) AS total FROM source_chapters ${whereSql}`).get(...params);
  const rows = getDatabase()
    .prepare<Array<string | number>, SourceChapterRow>(
      `
      SELECT *
      FROM source_chapters
      ${whereSql}
      ORDER BY chapter_index ASC, id ASC
      LIMIT ? OFFSET ?
      `,
    )
    .all(...params, limit, (page - 1) * limit);

  return {
    data: rows.map(mapChapterRow),
    total: totalRow?.total ?? 0,
    page,
    limit,
  };
}

export function importSourceChapters(payload: SourceImportPayload): SourceImportResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertNovelProject(projectId);
  if (!Array.isArray(payload.chapters) || payload.chapters.length === 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '请至少选择一个章节');
  }

  const drafts = payload.chapters.map(normalizeDraft);
  const insertedIds = withTransaction((database) => {
    const maxRow = database.prepare<[number], { max_index: number | null }>('SELECT MAX(chapter_index) AS max_index FROM source_chapters WHERE project_id = ?').get(projectId);
    let nextIndex = (maxRow?.max_index ?? 0) + 1;
    const ids: number[] = [];
    const now = Date.now();
    const insert = database.prepare<[number, number, string, string, string, SourceEventStatus, null, null, number, number]>(
      `
      INSERT INTO source_chapters (
        project_id, chapter_index, volume_name, chapter_title, content,
        event_status, event_summary, event_error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const draft of drafts) {
      const result = insert.run(
        projectId,
        nextIndex,
        draft.volumeName,
        draft.chapterTitle,
        draft.content,
        SOURCE_EVENT_STATUS.STALE,
        null,
        null,
        now,
        now,
      );
      ids.push(Number(result.lastInsertRowid));
      nextIndex += 1;
    }

    return ids;
  });

  if (insertedIds.length > 0) {
    markScriptsDependencyStatus({
      projectId,
      status: DEPENDENCY_STATUSES.STALE,
      reason: DEPENDENCY_REASON.SOURCE_CHANGED,
    });
  }

  return {
    chapters: getChapterRows(projectId, insertedIds).map(mapChapterRow),
  };
}

export function updateSourceChapter(payload: SourceUpdateChapterPayload): SourceUpdateChapterResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertNovelProject(projectId);
  const chapterId = normalizeChapterIds([payload.chapterId])[0]!;
  const existing = getChapterRow(projectId, chapterId);
  assertNoRunningRows([existing], '编辑');

  const nextContent = normalizeRequiredText(payload.content, '章节正文');
  const nextEventSummary = normalizeOptionalText(payload.eventSummary);
  const contentChanged = existing.content !== nextContent;
  const nextEventStatus = contentChanged
    ? SOURCE_EVENT_STATUS.STALE
    : nextEventSummary
      ? SOURCE_EVENT_STATUS.SUCCEEDED
      : SOURCE_EVENT_STATUS.STALE;
  const now = Date.now();

  getDatabase()
    .prepare<[string, string, string, SourceEventStatus, string | null, string | null, number, number, number]>(
      `
      UPDATE source_chapters
      SET volume_name = ?, chapter_title = ?, content = ?,
          event_status = ?, event_summary = ?, event_error = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
      `,
    )
    .run(
      normalizeVolumeName(payload.volumeName),
      normalizeChapterTitle(payload.chapterTitle, existing.chapter_title),
      nextContent,
      nextEventStatus,
      contentChanged ? null : nextEventSummary,
      null,
      now,
      projectId,
      chapterId,
    );

  if (contentChanged) {
    markScriptsDependencyStatus({
      projectId,
      status: DEPENDENCY_STATUSES.STALE,
      reason: DEPENDENCY_REASON.SOURCE_CHANGED,
    });
  }

  return {
    chapter: mapChapterRow(getChapterRow(projectId, chapterId)),
  };
}

export function deleteSourceChapters(payload: SourceDeleteChaptersPayload): SourceDeleteResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertNovelProject(projectId);
  const chapterIds = normalizeChapterIds(payload.chapterIds);
  const rows = assertAllChaptersExist(projectId, chapterIds);
  assertNoRunningRows(rows, '删除');

  const deletedCount = withTransaction((database) => {
    const placeholders = chapterIds.map(() => '?').join(', ');
    const result = database
      .prepare<Array<number>, { changes: number }>(`DELETE FROM source_chapters WHERE project_id = ? AND id IN (${placeholders})`)
      .run(projectId, ...chapterIds);
    return result.changes;
  });

  if (deletedCount > 0) {
    markScriptsDependencyStatus({
      projectId,
      status: DEPENDENCY_STATUSES.STALE,
      reason: DEPENDENCY_REASON.SOURCE_CHANGED,
    });
  }

  return { deletedCount };
}

export function deleteSourceChapter(payload: SourceDeleteChapterPayload): SourceDeleteResult {
  return deleteSourceChapters({
    projectId: payload.projectId,
    chapterIds: [payload.chapterId],
  });
}

export function generateSourceEvents(payload: SourceGenerateEventsPayload): SourceGenerateEventsResult {
  const projectId = normalizeProjectId(payload.projectId);
  const project = assertNovelProject(projectId);
  const chapterIds = normalizeChapterIds(payload.chapterIds);
  const rows = assertAllChaptersExist(projectId, chapterIds);
  assertNoRunningRows(rows, '重新分析');

  const task = createTask({
    projectId,
    category: SOURCE_EVENT_TASK_CATEGORY,
    relatedObjects: { chapterIds },
    modelName: 'universalAi',
    description: `分析 ${project.name} 的 ${chapterIds.length} 个原文章节事件`,
  });

  const now = Date.now();
  const placeholders = chapterIds.map(() => '?').join(', ');
  getDatabase()
    .prepare<Array<number | string | null>, { changes: number }>(
      `
      UPDATE source_chapters
      SET event_status = ?, event_summary = ?, event_error = ?, updated_at = ?
      WHERE project_id = ? AND id IN (${placeholders})
      `,
    )
    .run(SOURCE_EVENT_STATUS.RUNNING, null, null, now, projectId, ...chapterIds);

  void runEventGeneration(projectId, chapterIds, task.taskId);

  return {
    accepted: true,
    taskId: task.taskId,
    chapterIds,
  };
}

export function pollSourceEventStatus(payload: SourcePollEventStatusPayload): SourcePollEventStatusResult {
  const projectId = normalizeProjectId(payload.projectId);
  assertNovelProject(projectId);
  const chapterIds = normalizeChapterIds(payload.chapterIds);
  const placeholders = chapterIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number | string>, SourceChapterRow>(
      `
      SELECT *
      FROM source_chapters
      WHERE project_id = ?
        AND id IN (${placeholders})
        AND event_status != ?
      ORDER BY chapter_index ASC, id ASC
      `,
    )
    .all(projectId, ...chapterIds, SOURCE_EVENT_STATUS.RUNNING);

  return {
    chapters: rows.map(mapChapterRow),
  };
}

export function recoverRunningSourceEvents(reason = RUNNING_RECOVER_REASON): number {
  if (!tableExists('source_chapters')) {
    return 0;
  }

  const now = Date.now();
  const result = getDatabase()
    .prepare<[SourceEventStatus, string, number, number, SourceEventStatus]>(
      `
      UPDATE source_chapters
      SET event_status = ?, event_error = ?, updated_at = ?
      WHERE id > ? AND event_status = ?
      `,
    )
    .run(SOURCE_EVENT_STATUS.FAILED, reason, now, 0, SOURCE_EVENT_STATUS.RUNNING);

  return result.changes;
}
