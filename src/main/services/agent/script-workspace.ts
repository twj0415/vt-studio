import { randomUUID } from 'node:crypto';
import { DEPENDENCY_STATUSES } from '@shared/constants/dictionaries';
import { VT_STATUS } from '@shared/constants/status';
import {
  SCRIPT_AGENT_WORKSPACE_FIELDS,
  SCRIPT_EXTRACT_STATUS,
  SCRIPT_EXTRACT_STATUS_VALUES,
  type ScriptAgentDeleteScriptPayload,
  type ScriptAgentDeleteScriptResult,
  type ScriptAgentGetWorkspaceResult,
  type ScriptAgentProjectPayload,
  type ScriptAgentScriptItem,
  type ScriptAgentScriptUpsertPayload,
  type ScriptAgentScriptUpsertResult,
  type ScriptAgentUpdateWorkspaceFieldPayload,
  type ScriptAgentWorkspace,
  type ScriptAgentWorkspaceData,
  type ScriptAgentWorkspaceField,
  type ScriptExtractStatus,
} from '@shared/types/script-agent';
import { getDatabase, withTransaction } from '../database';
import { createError } from '../result';
import {
  DEPENDENCY_REASON,
  assertDependencyStatus,
  markProductionForScriptsChanged,
  markScriptsDependencyStatus,
} from '../dependency-state';
import { assertScriptAgentNovelProject, normalizeScriptAgentProjectId } from './script-common';

const WORKSPACE_KEY = 'scriptAgent';

interface AgentWorkDataRow {
  id: number;
  project_id: number;
  key: string;
  data: string;
  created_at: number;
  updated_at: number;
}

interface ScriptRow {
  id: number;
  project_id: number;
  episode_key: string;
  name: string;
  content: string;
  extract_status: string;
  error_reason: string | null;
  dependency_status: string;
  dependency_reason: string | null;
  created_at: number;
  updated_at: number;
}

function normalizeWorkspaceField(value: string): ScriptAgentWorkspaceField {
  if (SCRIPT_AGENT_WORKSPACE_FIELDS.includes(value as ScriptAgentWorkspaceField)) {
    return value as ScriptAgentWorkspaceField;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '工作区字段无效');
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\r\n/g, '\n').trim();
}

function normalizeRequiredText(value: string | null | undefined, label: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}不能为空`);
  }

  return normalized;
}

function normalizeEpisodeKey(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(normalized)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '剧本 episodeKey 只能包含字母、数字、下划线和中划线');
  }

  return normalized;
}

function normalizeScriptId(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '剧本 ID 无效');
  }

  return value;
}

function normalizeExtractStatus(value: string | undefined): ScriptExtractStatus {
  if (!value) {
    return SCRIPT_EXTRACT_STATUS.IDLE;
  }
  if (SCRIPT_EXTRACT_STATUS_VALUES.includes(value as ScriptExtractStatus)) {
    return value as ScriptExtractStatus;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '资产提取状态无效');
}

function createEmptyWorkspaceData(): ScriptAgentWorkspaceData {
  return {
    storySkeleton: '',
    adaptationStrategy: '',
  };
}

function parseWorkspaceData(value: string): ScriptAgentWorkspaceData {
  try {
    const parsed = JSON.parse(value) as Partial<ScriptAgentWorkspaceData>;
    return {
      storySkeleton: typeof parsed.storySkeleton === 'string' ? parsed.storySkeleton : '',
      adaptationStrategy: typeof parsed.adaptationStrategy === 'string' ? parsed.adaptationStrategy : '',
    };
  } catch {
    return createEmptyWorkspaceData();
  }
}

function stringifyWorkspaceData(data: ScriptAgentWorkspaceData): string {
  return JSON.stringify({
    storySkeleton: data.storySkeleton,
    adaptationStrategy: data.adaptationStrategy,
  });
}

function generateEpisodeKey(): string {
  return `episode_${randomUUID().replace(/-/g, '')}`;
}

function mapScriptRow(row: ScriptRow): ScriptAgentScriptItem {
  return {
    id: row.id,
    projectId: row.project_id,
    episodeKey: row.episode_key,
    name: row.name,
    content: row.content,
    extractStatus: normalizeExtractStatus(row.extract_status),
    errorReason: row.error_reason,
    dependencyStatus: assertDependencyStatus(row.dependency_status),
    dependencyReason: row.dependency_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getWorkspaceRow(projectId: number): AgentWorkDataRow {
  const row = getDatabase()
    .prepare<[number, string], AgentWorkDataRow>('SELECT * FROM agent_work_data WHERE project_id = ? AND key = ? LIMIT 1')
    .get(projectId, WORKSPACE_KEY);

  if (row) {
    return row;
  }

  const now = Date.now();
  const insert = getDatabase()
    .prepare<[number, string, string, number, number]>(
      `
      INSERT INTO agent_work_data (project_id, key, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(projectId, WORKSPACE_KEY, stringifyWorkspaceData(createEmptyWorkspaceData()), now, now);

  return {
    id: Number(insert.lastInsertRowid),
    project_id: projectId,
    key: WORKSPACE_KEY,
    data: stringifyWorkspaceData(createEmptyWorkspaceData()),
    created_at: now,
    updated_at: now,
  };
}

function getScriptRowById(projectId: number, scriptId: number): ScriptRow {
  const row = getDatabase()
    .prepare<[number, number], ScriptRow>('SELECT * FROM scripts WHERE project_id = ? AND id = ? LIMIT 1')
    .get(projectId, scriptId);

  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '剧本不存在');
  }

  return row;
}

function getScriptRowByEpisodeKey(projectId: number, episodeKey: string): ScriptRow | null {
  return (
    getDatabase()
      .prepare<[number, string], ScriptRow>('SELECT * FROM scripts WHERE project_id = ? AND episode_key = ? LIMIT 1')
      .get(projectId, episodeKey) ?? null
  );
}

function getScripts(projectId: number): ScriptAgentScriptItem[] {
  return getDatabase()
    .prepare<[number], ScriptRow>(
      `
      SELECT *
      FROM scripts
      WHERE project_id = ?
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(projectId)
    .map(mapScriptRow);
}

function buildWorkspace(projectId: number): ScriptAgentWorkspace {
  const row = getWorkspaceRow(projectId);
  const data = parseWorkspaceData(row.data);

  return {
    storySkeleton: data.storySkeleton,
    adaptationStrategy: data.adaptationStrategy,
    scripts: getScripts(projectId),
  };
}

export function getScriptAgentWorkspace(payload: ScriptAgentProjectPayload): ScriptAgentGetWorkspaceResult {
  const project = assertScriptAgentNovelProject(payload.projectId);

  return {
    workspace: buildWorkspace(project.id),
  };
}

export function updateScriptAgentWorkspaceField(payload: ScriptAgentUpdateWorkspaceFieldPayload): ScriptAgentGetWorkspaceResult {
  const project = assertScriptAgentNovelProject(payload.projectId);
  const field = normalizeWorkspaceField(payload.field);
  const content = normalizeText(payload.content);
  const now = Date.now();

  withTransaction((database) => {
    const row = getWorkspaceRow(project.id);
    const data = parseWorkspaceData(row.data);
    data[field] = content;
    database
      .prepare<[string, number, number]>(
        `
        UPDATE agent_work_data
        SET data = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(stringifyWorkspaceData(data), now, row.id);
  });

  return {
    workspace: buildWorkspace(project.id),
  };
}

export function upsertScriptAgentScript(payload: ScriptAgentScriptUpsertPayload): ScriptAgentScriptUpsertResult {
  const project = assertScriptAgentNovelProject(payload.projectId);
  const id = normalizeScriptId(payload.script.id);
  const episodeKeyFromPayload = normalizeEpisodeKey(payload.script.episodeKey);
  const name = normalizeRequiredText(payload.script.name, '剧本名称');
  const content = normalizeRequiredText(payload.script.content, '剧本内容');
  const extractStatus = normalizeExtractStatus(payload.script.extractStatus);
  const errorReason = normalizeText(payload.script.errorReason);
  const now = Date.now();

  const scriptId = withTransaction((database) => {
    if (id) {
      const existing = getScriptRowById(project.id, id);
      const nextEpisodeKey = episodeKeyFromPayload ?? existing.episode_key;
      const duplicated = getScriptRowByEpisodeKey(project.id, nextEpisodeKey);
      if (duplicated && duplicated.id !== existing.id) {
        throw createError(VT_STATUS.CONFLICT, '剧本 episodeKey 已存在');
      }
      const contentChanged = existing.content !== content;

      database
        .prepare<[string, string, string, ScriptExtractStatus, string | null, number, number]>(
          `
          UPDATE scripts
          SET episode_key = ?, name = ?, content = ?, extract_status = ?, error_reason = ?, updated_at = ?
          WHERE id = ?
          `,
        )
        .run(nextEpisodeKey, name, content, extractStatus, errorReason || null, now, existing.id);
      markScriptsDependencyStatus({
        projectId: project.id,
        scriptIds: [existing.id],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      if (contentChanged) {
        markProductionForScriptsChanged({
          projectId: project.id,
          scriptIds: [existing.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.SCRIPT_CHANGED,
          database,
        });
      }
      return existing.id;
    }

    const episodeKey = episodeKeyFromPayload ?? generateEpisodeKey();
    const existingByEpisodeKey = getScriptRowByEpisodeKey(project.id, episodeKey);
    if (existingByEpisodeKey) {
      const contentChanged = existingByEpisodeKey.content !== content;
      database
        .prepare<[string, string, ScriptExtractStatus, string | null, number, number]>(
          `
          UPDATE scripts
          SET name = ?, content = ?, extract_status = ?, error_reason = ?, updated_at = ?
          WHERE id = ?
          `,
        )
        .run(name, content, extractStatus, errorReason || null, now, existingByEpisodeKey.id);
      markScriptsDependencyStatus({
        projectId: project.id,
        scriptIds: [existingByEpisodeKey.id],
        status: DEPENDENCY_STATUSES.VALID,
        reason: null,
        database,
      });
      if (contentChanged) {
        markProductionForScriptsChanged({
          projectId: project.id,
          scriptIds: [existingByEpisodeKey.id],
          status: DEPENDENCY_STATUSES.NEEDS_REVIEW,
          reason: DEPENDENCY_REASON.SCRIPT_CHANGED,
          database,
        });
      }
      return existingByEpisodeKey.id;
    }

    const insert = database
      .prepare<[number, string, string, string, ScriptExtractStatus, string | null, number, number]>(
        `
        INSERT INTO scripts (
          project_id, episode_key, name, content, extract_status, error_reason, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(project.id, episodeKey, name, content, extractStatus, errorReason || null, now, now);
    return Number(insert.lastInsertRowid);
  });

  return {
    script: mapScriptRow(getScriptRowById(project.id, scriptId)),
  };
}

export function deleteScriptAgentScript(payload: ScriptAgentDeleteScriptPayload): ScriptAgentDeleteScriptResult {
  const projectId = normalizeScriptAgentProjectId(payload.projectId);
  assertScriptAgentNovelProject(projectId);
  const scriptId = normalizeScriptId(payload.scriptId);
  if (!scriptId) {
    throw createError(VT_STATUS.INVALID_PARAMS, '剧本 ID 无效');
  }

  getScriptRowById(projectId, scriptId);
  const deletedCount = withTransaction((database) => {
    markProductionForScriptsChanged({
      projectId,
      scriptIds: [scriptId],
      status: DEPENDENCY_STATUSES.MISSING_DEPENDENCY,
      reason: DEPENDENCY_REASON.SCRIPT_DELETED,
      database,
    });
    return database.prepare<[number, number]>('DELETE FROM scripts WHERE project_id = ? AND id = ?').run(projectId, scriptId).changes;
  });

  return {
    deletedCount,
  };
}
