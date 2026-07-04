import type { HistoryMessage, MemoryClearType } from './memory';
import type { SourceEventStatus } from './source';
import type { DependencyStatus } from '../constants/dictionaries';
import {
  SCRIPT_EXTRACT_STATUSES,
  SCRIPT_EXTRACT_STATUS_VALUES as SHARED_SCRIPT_EXTRACT_STATUS_VALUES,
} from '../constants/dictionaries';

export const SCRIPT_AGENT_WORKSPACE_FIELDS = ['storySkeleton', 'adaptationStrategy'] as const;
export type ScriptAgentWorkspaceField = (typeof SCRIPT_AGENT_WORKSPACE_FIELDS)[number];

export const SCRIPT_EXTRACT_STATUS = SCRIPT_EXTRACT_STATUSES;

export const SCRIPT_EXTRACT_STATUS_VALUES = SHARED_SCRIPT_EXTRACT_STATUS_VALUES;
export type ScriptExtractStatus = (typeof SCRIPT_EXTRACT_STATUS_VALUES)[number];

export interface ScriptAgentProjectPayload {
  projectId: number;
}

export interface ScriptAgentMemoryHistoryResult {
  messages: HistoryMessage[];
}

export interface ScriptAgentClearMemoryPayload extends ScriptAgentProjectPayload {
  type: MemoryClearType;
}

export interface ScriptAgentClearMemoryResult {
  deleted: number;
  updated: number;
}

export interface ScriptAgentSourceEventIssue {
  id: number;
  chapterIndex: number;
  chapterTitle: string;
  eventStatus: SourceEventStatus;
  eventError: string | null;
}

export interface ScriptAgentSourceEventCheckResult {
  ready: boolean;
  total: number;
  staleCount: number;
  runningCount: number;
  succeededCount: number;
  failedCount: number;
  issues: ScriptAgentSourceEventIssue[];
}

export interface ScriptAgentModelCapabilityResult {
  configured: boolean;
  supportsThink: boolean;
  modelName: string | null;
  error: string | null;
}

export interface ScriptAgentWorkspaceData {
  storySkeleton: string;
  adaptationStrategy: string;
}

export interface ScriptAgentScriptItem {
  id: number;
  projectId: number;
  episodeKey: string;
  name: string;
  content: string;
  extractStatus: ScriptExtractStatus;
  errorReason: string | null;
  dependencyStatus: DependencyStatus;
  dependencyReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScriptAgentWorkspace extends ScriptAgentWorkspaceData {
  scripts: ScriptAgentScriptItem[];
}

export interface ScriptAgentGetWorkspaceResult {
  workspace: ScriptAgentWorkspace;
}

export interface ScriptAgentUpdateWorkspaceFieldPayload extends ScriptAgentProjectPayload {
  field: ScriptAgentWorkspaceField;
  content: string;
}

export interface ScriptAgentScriptDraft {
  id?: number | null;
  episodeKey?: string | null;
  name: string;
  content: string;
  extractStatus?: ScriptExtractStatus;
  errorReason?: string | null;
}

export interface ScriptAgentScriptUpsertPayload extends ScriptAgentProjectPayload {
  script: ScriptAgentScriptDraft;
}

export interface ScriptAgentScriptUpsertResult {
  script: ScriptAgentScriptItem;
}

export interface ScriptAgentDeleteScriptPayload extends ScriptAgentProjectPayload {
  scriptId: number;
}

export interface ScriptAgentDeleteScriptResult {
  deletedCount: number;
}

export type ScriptAgentXmlPatchType = 'storySkeleton' | 'adaptationStrategy' | 'scriptItem';

export interface ScriptAgentXmlAppliedPatch {
  type: ScriptAgentXmlPatchType;
  scriptId?: number;
  episodeKey?: string;
  name?: string;
}

export interface ScriptAgentXmlApplyResult {
  appliedCount: number;
  patches: ScriptAgentXmlAppliedPatch[];
  errors: string[];
  workspace: ScriptAgentWorkspace | null;
}

export interface ScriptAgentWorkspaceSocketUpdate {
  projectId: number;
  source: 'xml';
  result: ScriptAgentXmlApplyResult;
}

export interface ScriptAgentToolChapterEventsPayload extends ScriptAgentProjectPayload {
  chapterIndexes: number[];
}

export interface ScriptAgentToolChapterEventItem {
  chapterIndex: number;
  chapterTitle: string;
  eventStatus: SourceEventStatus;
  eventSummary: string | null;
  eventError: string | null;
}

export interface ScriptAgentToolChapterEventsResult {
  chapters: ScriptAgentToolChapterEventItem[];
  missingChapterIndexes: number[];
}

export interface ScriptAgentToolNovelTextPayload extends ScriptAgentProjectPayload {
  chapterIndex: number;
  offset?: number;
  limit?: number;
}

export interface ScriptAgentToolNovelTextResult {
  chapterIndex: number;
  chapterTitle: string;
  content: string;
  offset: number;
  limit: number;
  totalLength: number;
  truncated: boolean;
  nextOffset: number | null;
}

export type ScriptAgentToolPlanDataKey = 'all' | 'storySkeleton' | 'adaptationStrategy' | 'scripts';

export interface ScriptAgentToolPlanDataPayload extends ScriptAgentProjectPayload {
  key?: ScriptAgentToolPlanDataKey;
}

export interface ScriptAgentToolPlanDataResult {
  key: ScriptAgentToolPlanDataKey;
  data: ScriptAgentWorkspace | string | ScriptAgentScriptItem[];
}

export interface ScriptAgentToolScriptContentPayload extends ScriptAgentProjectPayload {
  scriptIds: number[];
  limit?: number;
}

export interface ScriptAgentToolScriptContentItem {
  id: number;
  episodeKey: string;
  name: string;
  content: string;
  totalLength: number;
  truncated: boolean;
}

export interface ScriptAgentToolScriptContentResult {
  scripts: ScriptAgentToolScriptContentItem[];
  missingScriptIds: number[];
}
