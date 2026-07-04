import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P6-剧本Agent批.md', '阶段 2：工作区底座和剧本卡片'],
  ['src/main/services/agent/migrations.ts', '0009_create_agent_workspace'],
  ['src/main/services/agent/migrations.ts', 'CREATE TABLE IF NOT EXISTS agent_work_data'],
  ['src/main/services/agent/migrations.ts', 'CREATE TABLE IF NOT EXISTS scripts'],
  ['src/shared/types/script-agent.ts', 'ScriptAgentWorkspace'],
  ['src/shared/types/script-agent.ts', 'ScriptAgentScriptItem'],
  ['src/main/services/agent/script-workspace.ts', 'getScriptAgentWorkspace'],
  ['src/main/services/agent/script-workspace.ts', 'updateScriptAgentWorkspaceField'],
  ['src/main/services/agent/script-workspace.ts', 'upsertScriptAgentScript'],
  ['src/main/services/agent/script-workspace.ts', 'deleteScriptAgentScript'],
  ['src/main/services/agent/script-workspace.ts', 'getScriptRowByEpisodeKey'],
  ['src/main/services/database/migrations.ts', 'agentMigrations'],
  ['src/main/ipc/agent.ts', 'agent:script:get-workspace'],
  ['src/main/ipc/agent.ts', 'agent:script:upsert-script'],
  ['src/shared/contracts/preload.ts', 'getWorkspace'],
  ['src/preload/index.ts', 'agent:script:delete-script'],
  ['src/main/services/project.ts', 'DELETE FROM scripts WHERE project_id = ?'],
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'loadWorkspace'],
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'saveWorkspaceField'],
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'confirmDeleteScript'],
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'script-card'],
  ['src/renderer/src/i18n/messages.ts', 'scriptCreated'],
  ['src/renderer/src/styles/index.scss', '.script-card'],
  ['docs/tasks/F-011-006-获取计划数据.md', 'P6 阶段 2'],
  ['docs/tasks/F-011-011-删除剧本卡片.md', 'P6 阶段 2'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P6 script agent phase 2 verification passed');
