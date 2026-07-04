import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P6-剧本Agent批.md', '阶段 1：会话、记忆和事件检查'],
  ['src/shared/types/script-agent.ts', 'ScriptAgentMemoryHistoryResult'],
  ['src/shared/types/script-agent.ts', 'ScriptAgentSourceEventCheckResult'],
  ['src/main/services/agent/script-phase1.ts', 'getScriptAgentMemoryHistory'],
  ['src/main/services/agent/script-phase1.ts', 'checkScriptAgentSourceEvents'],
  ['src/main/services/agent/script-phase1.ts', 'getScriptAgentModelCapability'],
  ['src/main/ipc/agent.ts', 'agent:script:get-memory-history'],
  ['src/main/ipc/agent.ts', 'agent:script:check-source-events'],
  ['src/shared/contracts/preload.ts', 'getMemoryHistory'],
  ['src/preload/index.ts', 'agent:script:clear-memory'],
  ['src/main/services/socket/agent-handler.ts', 'persistSocketMemory'],
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'useAgentSocket'],
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'checkSourceEvents'],
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'confirmClearMemory'],
  ['src/renderer/src/i18n/messages.ts', 'scriptAgent'],
  ['src/renderer/src/styles/index.scss', '.script-agent-layout'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P6 script agent phase 1 verification passed');

