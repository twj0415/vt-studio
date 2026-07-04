import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P6-剧本Agent批.md', '阶段 3：XML 写入和工具读取上下文'],
  ['src/shared/types/script-agent.ts', 'ScriptAgentXmlApplyResult'],
  ['src/shared/types/script-agent.ts', 'ScriptAgentWorkspaceSocketUpdate'],
  ['src/shared/types/script-agent.ts', 'ScriptAgentToolNovelTextResult'],
  ['src/main/services/agent/script-xml.ts', 'stripScriptAgentXmlForDisplay'],
  ['src/main/services/agent/script-xml.ts', 'applyScriptAgentXmlOutput'],
  ['src/main/services/agent/script-xml.ts', 'withTransaction'],
  ['src/main/services/agent/script-tools.ts', 'createScriptAgentTools'],
  ['src/main/services/agent/script-tools.ts', 'get_novel_events'],
  ['src/main/services/agent/script-tools.ts', 'get_planData'],
  ['src/main/services/agent/script-tools.ts', 'get_script_content'],
  ['src/main/services/socket/types.ts', 'workspace:update'],
  ['src/main/services/agent/script-runner.ts', 'createScriptAgentTools'],
  ['src/main/services/socket/agent-handler.ts', 'applyScriptAgentXmlOutput'],
  ['src/main/services/socket/agent-handler.ts', 'stripScriptAgentXmlForDisplay'],
  ['src/main/services/socket/agent-handler.ts', 'workspace:update'],
  ['src/renderer/src/composables/useAgentSocket.ts', 'lastWorkspaceUpdate'],
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'handleWorkspaceSocketUpdate'],
  ['src/renderer/src/i18n/messages.ts', 'xmlApplied'],
  ['docs/tasks/F-011-012-AgentXML写入工作区.md', 'P6 阶段 3'],
  ['docs/tasks/F-011-013-Agent工具读取上下文.md', 'P6 阶段 3'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P6 script agent phase 3 verification passed');
