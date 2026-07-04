import { VT_STATUS } from '@shared/constants/status';
import { getDatabase } from '../database';
import { createError } from '../result';

export interface ScriptAgentProjectRow {
  id: number;
  source_type: string;
  name: string;
}

export function normalizeScriptAgentProjectId(projectId: number): number {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }

  return projectId;
}

export function assertScriptAgentNovelProject(projectId: number): ScriptAgentProjectRow {
  const normalizedProjectId = normalizeScriptAgentProjectId(projectId);
  const row = getDatabase()
    .prepare<[number], ScriptAgentProjectRow>('SELECT id, source_type, name FROM projects WHERE id = ? LIMIT 1')
    .get(normalizedProjectId);

  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '项目不存在');
  }

  if (row.source_type !== 'novel') {
    throw createError(VT_STATUS.CONFLICT, '当前项目不是原文项目');
  }

  return row;
}
