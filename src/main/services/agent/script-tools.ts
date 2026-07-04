import { jsonSchema, tool, type Tool } from 'ai';
import { VT_STATUS } from '@shared/constants/status';
import { normalizeUnknownError } from '@shared/errors';
import type {
  ScriptAgentToolChapterEventItem,
  ScriptAgentToolChapterEventsPayload,
  ScriptAgentToolChapterEventsResult,
  ScriptAgentToolNovelTextPayload,
  ScriptAgentToolNovelTextResult,
  ScriptAgentToolPlanDataKey,
  ScriptAgentToolPlanDataPayload,
  ScriptAgentToolPlanDataResult,
  ScriptAgentToolScriptContentItem,
  ScriptAgentToolScriptContentPayload,
  ScriptAgentToolScriptContentResult,
} from '@shared/types/script-agent';
import type { SourceEventStatus } from '@shared/types/source';
import { getDatabase } from '../database';
import { createError } from '../result';
import { assertScriptAgentNovelProject } from './script-common';
import { getScriptAgentWorkspace } from './script-workspace';

const DEFAULT_TEXT_LIMIT = 8000;
const MAX_TEXT_LIMIT = 16000;

type ScriptAgentToolSet = Record<string, Tool>;

interface NovelEventsToolInput {
  chapterIndexes?: number[];
  chapterIndexs?: number[];
}

interface NovelTextToolInput {
  chapterIndex: number | string;
  offset?: number;
  limit?: number;
}

interface PlanDataToolInput {
  key?: ScriptAgentToolPlanDataKey | 'script';
}

interface ScriptContentToolInput {
  scriptIds?: Array<number | string>;
  ids?: Array<number | string>;
  limit?: number;
}

interface SourceToolRow {
  chapter_index: number;
  chapter_title: string;
  content: string;
  event_status: SourceEventStatus;
  event_summary: string | null;
  event_error: string | null;
}

interface ScriptToolRow {
  id: number;
  episode_key: string;
  name: string;
  content: string;
}

function normalizePositiveInteger(value: number | undefined, label: string, fallback?: number): number {
  const normalized = value ?? fallback;
  if (typeof normalized !== 'number' || !Number.isInteger(normalized) || normalized <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}无效`);
  }

  return normalized;
}

function normalizeOffset(value: number | undefined): number {
  const normalized = value ?? 0;
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '正文读取 offset 无效');
  }

  return normalized;
}

function normalizeLimit(value: number | undefined): number {
  const normalized = normalizePositiveInteger(value, '正文读取 limit', DEFAULT_TEXT_LIMIT);
  if (normalized > MAX_TEXT_LIMIT) {
    throw createError(VT_STATUS.INVALID_PARAMS, `正文读取 limit 不能超过 ${MAX_TEXT_LIMIT}`);
  }

  return normalized;
}

function normalizeIds(values: number[] | undefined, label: string): number[] {
  if (!Array.isArray(values)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}无效`);
  }

  const normalized = Array.from(new Set(values.map((value) => Number(value))));
  if (normalized.length === 0 || normalized.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}无效`);
  }

  return normalized;
}

function normalizeToolIds(values: Array<number | string> | undefined, label: string): number[] {
  return normalizeIds(values?.map((value) => Number(value)), label);
}

function normalizeToolPlanDataKey(value: PlanDataToolInput['key']): ScriptAgentToolPlanDataKey | undefined {
  if (!value) {
    return undefined;
  }
  if (value === 'script') {
    return 'scripts';
  }

  return value;
}

function runScriptAgentTool(handler: () => unknown): unknown {
  try {
    return handler();
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    return {
      error: true,
      message: normalized.message,
      statusCode: normalized.statusCode ?? VT_STATUS.AGENT_ERROR,
    };
  }
}

function sliceContent(content: string, offset: number, limit: number): Pick<ScriptAgentToolNovelTextResult, 'content' | 'truncated' | 'nextOffset'> {
  const sliced = content.slice(offset, offset + limit);
  const nextOffset = offset + sliced.length;
  const truncated = nextOffset < content.length;

  return {
    content: sliced,
    truncated,
    nextOffset: truncated ? nextOffset : null,
  };
}

function getSourceRowByChapterIndex(projectId: number, chapterIndex: number): SourceToolRow {
  const row = getDatabase()
    .prepare<[number, number], SourceToolRow>(
      `
      SELECT chapter_index, chapter_title, content, event_status, event_summary, event_error
      FROM source_chapters
      WHERE project_id = ? AND chapter_index = ?
      LIMIT 1
      `,
    )
    .get(projectId, chapterIndex);

  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '原文章节不存在');
  }

  return row;
}

export function getScriptAgentNovelEvents(payload: ScriptAgentToolChapterEventsPayload): ScriptAgentToolChapterEventsResult {
  const project = assertScriptAgentNovelProject(payload.projectId);
  const chapterIndexes = normalizeIds(payload.chapterIndexes, '章节序号');
  const placeholders = chapterIndexes.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, SourceToolRow>(
      `
      SELECT chapter_index, chapter_title, content, event_status, event_summary, event_error
      FROM source_chapters
      WHERE project_id = ?
        AND chapter_index IN (${placeholders})
      ORDER BY chapter_index ASC
      `,
    )
    .all(project.id, ...chapterIndexes);
  const found = new Set(rows.map((row) => row.chapter_index));
  const chapters: ScriptAgentToolChapterEventItem[] = rows.map((row) => ({
    chapterIndex: row.chapter_index,
    chapterTitle: row.chapter_title,
    eventStatus: row.event_status,
    eventSummary: row.event_summary,
    eventError: row.event_error,
  }));

  return {
    chapters,
    missingChapterIndexes: chapterIndexes.filter((chapterIndex) => !found.has(chapterIndex)),
  };
}

export function getScriptAgentNovelText(payload: ScriptAgentToolNovelTextPayload): ScriptAgentToolNovelTextResult {
  const project = assertScriptAgentNovelProject(payload.projectId);
  const chapterIndex = normalizePositiveInteger(payload.chapterIndex, '章节序号');
  const offset = normalizeOffset(payload.offset);
  const limit = normalizeLimit(payload.limit);
  const row = getSourceRowByChapterIndex(project.id, chapterIndex);
  const sliced = sliceContent(row.content, offset, limit);

  return {
    chapterIndex: row.chapter_index,
    chapterTitle: row.chapter_title,
    ...sliced,
    offset,
    limit,
    totalLength: row.content.length,
  };
}

export function getScriptAgentPlanData(payload: ScriptAgentToolPlanDataPayload): ScriptAgentToolPlanDataResult {
  const workspace = getScriptAgentWorkspace({ projectId: payload.projectId }).workspace;
  const key = payload.key ?? 'all';

  if (key === 'all') {
    return { key, data: workspace };
  }
  if (key === 'storySkeleton') {
    return { key, data: workspace.storySkeleton };
  }
  if (key === 'adaptationStrategy') {
    return { key, data: workspace.adaptationStrategy };
  }
  if (key === 'scripts') {
    return { key, data: workspace.scripts };
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '计划数据 key 无效');
}

export function getScriptAgentScriptContent(payload: ScriptAgentToolScriptContentPayload): ScriptAgentToolScriptContentResult {
  const project = assertScriptAgentNovelProject(payload.projectId);
  const scriptIds = normalizeIds(payload.scriptIds, '剧本 ID');
  const limit = normalizeLimit(payload.limit);
  const placeholders = scriptIds.map(() => '?').join(', ');
  const rows = getDatabase()
    .prepare<Array<number>, ScriptToolRow>(
      `
      SELECT id, episode_key, name, content
      FROM scripts
      WHERE project_id = ?
        AND id IN (${placeholders})
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all(project.id, ...scriptIds);
  const found = new Set(rows.map((row) => row.id));
  const scripts: ScriptAgentToolScriptContentItem[] = rows.map((row) => {
    const sliced = sliceContent(row.content, 0, limit);
    return {
      id: row.id,
      episodeKey: row.episode_key,
      name: row.name,
      content: sliced.content,
      totalLength: row.content.length,
      truncated: sliced.truncated,
    };
  });

  return {
    scripts,
    missingScriptIds: scriptIds.filter((scriptId) => !found.has(scriptId)),
  };
}

export function createScriptAgentTools(projectId: number): ScriptAgentToolSet {
  return {
    get_novel_events: tool<NovelEventsToolInput, unknown>({
      description: '读取当前项目指定章节的事件摘要、事件状态和失败原因。输入 chapterIndexes，也兼容旧拼写 chapterIndexs。',
      inputSchema: jsonSchema<NovelEventsToolInput>({
        type: 'object',
        properties: {
          chapterIndexes: {
            type: 'array',
            items: { type: 'number' },
            description: '要读取的章节序号数组。',
          },
          chapterIndexs: {
            type: 'array',
            items: { type: 'number' },
            description: '兼容参考项目旧拼写，优先使用 chapterIndexes。',
          },
        },
        anyOf: [{ required: ['chapterIndexes'] }, { required: ['chapterIndexs'] }],
        additionalProperties: false,
      }),
      execute: (input) =>
        runScriptAgentTool(() =>
          getScriptAgentNovelEvents({
            projectId,
            chapterIndexes: normalizeToolIds(input.chapterIndexes ?? input.chapterIndexs, '章节序号'),
          }),
        ),
    }),
    get_novel_text: tool<NovelTextToolInput, unknown>({
      description: `读取当前项目单个章节正文。长正文默认返回 ${DEFAULT_TEXT_LIMIT} 字符，limit 最大 ${MAX_TEXT_LIMIT}，可用 offset 分块继续读取。`,
      inputSchema: jsonSchema<NovelTextToolInput>({
        type: 'object',
        properties: {
          chapterIndex: {
            oneOf: [{ type: 'number' }, { type: 'string' }],
            description: '要读取的章节序号。',
          },
          offset: {
            type: 'number',
            description: '正文起始偏移量，默认 0。',
          },
          limit: {
            type: 'number',
            description: `单次读取字符数，默认 ${DEFAULT_TEXT_LIMIT}，最大 ${MAX_TEXT_LIMIT}。`,
          },
        },
        required: ['chapterIndex'],
        additionalProperties: false,
      }),
      execute: (input) =>
        runScriptAgentTool(() =>
          getScriptAgentNovelText({
            projectId,
            chapterIndex: Number(input.chapterIndex),
            offset: input.offset,
            limit: input.limit,
          }),
        ),
    }),
    get_planData: tool<PlanDataToolInput, unknown>({
      description: '读取当前项目剧本 Agent 工作区数据。key 可为 all、storySkeleton、adaptationStrategy、scripts；兼容旧 key script。',
      inputSchema: jsonSchema<PlanDataToolInput>({
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: ['all', 'storySkeleton', 'adaptationStrategy', 'scripts', 'script'],
            description: '要读取的数据范围，不传时读取全部工作区。',
          },
        },
        additionalProperties: false,
      }),
      execute: (input) =>
        runScriptAgentTool(() =>
          getScriptAgentPlanData({
            projectId,
            key: normalizeToolPlanDataKey(input.key),
          }),
        ),
    }),
    get_script_content: tool<ScriptContentToolInput, unknown>({
      description: '按剧本 ID 读取当前项目已有剧本内容。输入 scriptIds，也兼容参考项目 ids。',
      inputSchema: jsonSchema<ScriptContentToolInput>({
        type: 'object',
        properties: {
          scriptIds: {
            type: 'array',
            items: {
              oneOf: [{ type: 'number' }, { type: 'string' }],
            },
            description: '要读取的剧本 ID 数组。',
          },
          ids: {
            type: 'array',
            items: {
              oneOf: [{ type: 'number' }, { type: 'string' }],
            },
            description: '兼容参考项目旧字段，优先使用 scriptIds。',
          },
          limit: {
            type: 'number',
            description: `每个剧本最多返回字符数，默认 ${DEFAULT_TEXT_LIMIT}，最大 ${MAX_TEXT_LIMIT}。`,
          },
        },
        anyOf: [{ required: ['scriptIds'] }, { required: ['ids'] }],
        additionalProperties: false,
      }),
      execute: (input) =>
        runScriptAgentTool(() =>
          getScriptAgentScriptContent({
            projectId,
            scriptIds: normalizeToolIds(input.scriptIds ?? input.ids, '剧本 ID'),
            limit: input.limit,
          }),
        ),
    }),
  };
}
