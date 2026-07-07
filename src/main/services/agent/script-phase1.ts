import { VT_STATUS } from '@shared/constants/status';
import { normalizeUnknownError } from '@shared/errors';
import type { MemoryClearType } from '@shared/types/memory';
import type {
  ScriptAgentClearMemoryPayload,
  ScriptAgentClearMemoryResult,
  ScriptAgentMemoryHistoryResult,
  ScriptAgentModelCapabilityResult,
  ScriptAgentProjectPayload,
  ScriptAgentSourceEventCheckResult,
} from '@shared/types/script-agent';
import { SOURCE_EVENT_STATUS, type SourceEventStatus } from '@shared/types/source';
import { getDatabase } from '../database';
import { clearMemory, getMemoryHistory } from '../memory';
import { getAgentModelDetail } from '../model/resolver';
import { createError } from '../result';
import { assertScriptAgentNovelProject } from './script-common';

interface SourceStatusCountRow {
  event_status: SourceEventStatus;
  count: number;
}

interface SourceIssueRow {
  id: number;
  chapter_index: number;
  chapter_title: string;
  event_status: SourceEventStatus;
  event_error: string | null;
}

function assertClearType(value: MemoryClearType): MemoryClearType {
  if (value === 'message' || value === 'summary' || value === 'all') {
    return value;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '记忆清理类型无效');
}

export function getScriptAgentMemoryHistory(payload: ScriptAgentProjectPayload): ScriptAgentMemoryHistoryResult {
  const projectId = assertScriptAgentNovelProject(payload.projectId).id;

  return {
    messages: getMemoryHistory({
      projectId,
      agentType: 'scriptAgent',
    }),
  };
}

export function clearScriptAgentMemory(payload: ScriptAgentClearMemoryPayload): ScriptAgentClearMemoryResult {
  const projectId = assertScriptAgentNovelProject(payload.projectId).id;
  const result = clearMemory({
    projectId,
    agentType: 'scriptAgent',
    type: assertClearType(payload.type),
  });

  return {
    deleted: result.deleted,
    updated: result.updated,
  };
}

export function checkScriptAgentSourceEvents(payload: ScriptAgentProjectPayload): ScriptAgentSourceEventCheckResult {
  const projectId = assertScriptAgentNovelProject(payload.projectId).id;
  const rows = getDatabase()
    .prepare<[number], SourceStatusCountRow>(
      `
      SELECT event_status, COUNT(*) AS count
      FROM source_chapters
      WHERE project_id = ?
      GROUP BY event_status
      `,
    )
    .all(projectId);

  const countByStatus = new Map(rows.map((row) => [row.event_status, row.count]));
  const staleCount = countByStatus.get(SOURCE_EVENT_STATUS.STALE) ?? 0;
  const runningCount = countByStatus.get(SOURCE_EVENT_STATUS.RUNNING) ?? 0;
  const succeededCount = countByStatus.get(SOURCE_EVENT_STATUS.SUCCEEDED) ?? 0;
  const failedCount = countByStatus.get(SOURCE_EVENT_STATUS.FAILED) ?? 0;
  const total = staleCount + runningCount + succeededCount + failedCount;
  const issueRows = getDatabase()
    .prepare<[number, SourceEventStatus, SourceEventStatus, SourceEventStatus, number], SourceIssueRow>(
      `
      SELECT id, chapter_index, chapter_title, event_status, event_error
      FROM source_chapters
      WHERE project_id = ?
        AND event_status IN (?, ?, ?)
      ORDER BY chapter_index ASC, id ASC
      LIMIT ?
      `,
    )
    .all(projectId, SOURCE_EVENT_STATUS.STALE, SOURCE_EVENT_STATUS.RUNNING, SOURCE_EVENT_STATUS.FAILED, 6);

  return {
    ready: total > 0 && staleCount === 0 && runningCount === 0 && failedCount === 0,
    total,
    staleCount,
    runningCount,
    succeededCount,
    failedCount,
    issues: issueRows.map((row) => ({
      id: row.id,
      chapterIndex: row.chapter_index,
      chapterTitle: row.chapter_title,
      eventStatus: row.event_status,
      eventError: row.event_error,
    })),
  };
}

export function getScriptAgentModelCapability(): ScriptAgentModelCapabilityResult {
  try {
    const model = getAgentModelDetail('scriptAgent');
    if (model.type !== 'text') {
      return {
        configured: false,
        supportsThink: false,
        modelName: model.name,
        error: '改编助手当前模型不是文本模型',
      };
    }

    return {
      configured: true,
      supportsThink: model.think,
      modelName: model.name,
      error: null,
    };
  } catch (error) {
    return {
      configured: false,
      supportsThink: false,
      modelName: null,
      error: normalizeUnknownError(error).message,
    };
  }
}
