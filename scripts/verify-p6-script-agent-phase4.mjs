import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P6-剧本Agent批.md', '阶段 4：子 Agent 调度闭环'],
  ['docs/tasks/P6-剧本Agent批.md', 'P6 阶段 4 已完成'],
  ['docs/tasks/F-011-014-子Agent调度.md', '状态：已完成'],
  ['docs/tasks/F-011-014-子Agent调度.md', 'scriptAgent:decisionAgent'],
  ['docs/03-执行进度.md', 'P6-阶段4'],
  ['docs/04-对齐验收与偏差记录.md', 'P6-阶段4'],
  ['src/main/services/agent/script-runner.ts', 'createScriptAgentRunContext'],
  ['src/main/services/agent/script-runner.ts', 'scriptAgent:decisionAgent'],
  ['src/main/services/agent/script-runner.ts', 'scriptAgent:storySkeletonAgent'],
  ['src/main/services/agent/script-runner.ts', 'scriptAgent:adaptationStrategyAgent'],
  ['src/main/services/agent/script-runner.ts', 'scriptAgent:scriptAgent'],
  ['src/main/services/agent/script-runner.ts', 'scriptAgent:supervisionAgent'],
  ['src/main/services/agent/script-runner.ts', 'run_sub_agent_storySkeleton'],
  ['src/main/services/agent/script-runner.ts', 'run_sub_agent_adaptationStrategy'],
  ['src/main/services/agent/script-runner.ts', 'run_sub_agent_script'],
  ['src/main/services/agent/script-runner.ts', 'run_supervision_agent'],
  ['src/main/services/agent/script-runner.ts', 'createScriptAgentTools(projectId)'],
  ['src/main/services/agent/script-runner.ts', 'applyScriptAgentXmlOutput(projectId, output)'],
  ['src/main/services/agent/script-runner.ts', "config.kind === 'supervision'"],
  ['src/main/services/socket/agent-handler.ts', 'createScriptAgentRunContext'],
  ['src/main/services/socket/agent-handler.ts', 'emitSubAgentContent'],
  ['src/main/services/socket/agent-handler.ts', 'sanitizeToolDisplayResult'],
  ['src/main/services/socket/agent-handler.ts', "category: '剧本 Agent'"],
  ['src/main/services/socket/agent-handler.ts', "modelName: 'scriptAgent:decisionAgent'"],
  ['src/main/services/socket/agent-handler.ts', 'createTask'],
  ['src/main/services/socket/agent-handler.ts', 'succeedTask'],
  ['src/main/services/socket/agent-handler.ts', 'failTask'],
  ['src/main/services/socket/agent-handler.ts', 'cancelTask'],
  ['src/main/services/socket/agent-handler.ts', 'completionError'],
  ['src/main/services/socket/agent-handler.ts', 'workspace:update'],
  ['src/main/services/model/constants.ts', "'scriptAgent:scriptAgent'"],
  ['src/main/services/database/seed-agent-configs.ts', "key: 'scriptAgent:scriptAgent'"],
  ['src/main/services/default-assets/registry.ts', 'DEFAULT_MAIN_SKILLS'],
  ['src/main/services/default-assets/registry.ts', "path: 'script_agent_decision.md'"],
  ['src/main/services/default-assets/registry.ts', "path: 'script_agent_execution.md'"],
  ['src/main/services/default-assets/registry.ts', "path: 'script_agent_supervision.md'"],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P6 script agent phase 4 verification passed');
