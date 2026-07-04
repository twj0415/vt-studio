import type { AgentSocketInfo } from '@shared/types/socket';
import type {
  ScriptAgentClearMemoryPayload,
  ScriptAgentDeleteScriptPayload,
  ScriptAgentProjectPayload,
  ScriptAgentScriptUpsertPayload,
  ScriptAgentUpdateWorkspaceFieldPayload,
} from '@shared/types/script-agent';
import { getAgentSocketInfo } from '../services/socket';
import {
  checkScriptAgentSourceEvents,
  clearScriptAgentMemory,
  getScriptAgentMemoryHistory,
  getScriptAgentModelCapability,
} from '../services/agent/script-phase1';
import {
  deleteScriptAgentScript,
  getScriptAgentWorkspace,
  updateScriptAgentWorkspaceField,
  upsertScriptAgentScript,
} from '../services/agent/script-workspace';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerAgentIpc(): void {
  handleIpc<AgentSocketInfo>('agent:get-socket-info', () => getAgentSocketInfo());
  handleIpc('agent:script:get-memory-history', (_event, payload) => getScriptAgentMemoryHistory(readObjectArg<ScriptAgentProjectPayload>(payload)));
  handleIpc('agent:script:clear-memory', (_event, payload) => clearScriptAgentMemory(readObjectArg<ScriptAgentClearMemoryPayload>(payload)));
  handleIpc('agent:script:check-source-events', (_event, payload) => checkScriptAgentSourceEvents(readObjectArg<ScriptAgentProjectPayload>(payload)));
  handleIpc('agent:script:get-model-capability', () => getScriptAgentModelCapability());
  handleIpc('agent:script:get-workspace', (_event, payload) => getScriptAgentWorkspace(readObjectArg<ScriptAgentProjectPayload>(payload)));
  handleIpc('agent:script:update-workspace-field', (_event, payload) => updateScriptAgentWorkspaceField(readObjectArg<ScriptAgentUpdateWorkspaceFieldPayload>(payload)));
  handleIpc('agent:script:upsert-script', (_event, payload) => upsertScriptAgentScript(readObjectArg<ScriptAgentScriptUpsertPayload>(payload)));
  handleIpc('agent:script:delete-script', (_event, payload) => deleteScriptAgentScript(readObjectArg<ScriptAgentDeleteScriptPayload>(payload)));
}
