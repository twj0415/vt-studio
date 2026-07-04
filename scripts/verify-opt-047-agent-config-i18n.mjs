import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(content, needle, file) {
  assert(content.includes(needle), `${file} should include ${needle}`);
}

function notIncludes(content, needle, file) {
  assert(!content.includes(needle), `${file} should not include ${needle}`);
}

const componentFile = 'src/renderer/src/features/settings/components/AgentConfig.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'AgentConfig.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t } = useI18n();`, componentFile);
includes(component, `settings.agentConfig.title`, componentFile);
includes(component, `settings.agentConfig.creativity.stable`, componentFile);
includes(component, `settings.agentConfig.outputLength.auto`, componentFile);
includes(component, `AGENT_NAME_KEYS`, componentFile);
includes(component, `AGENT_STATUS_KEYS`, componentFile);
includes(component, `getAgentName(agent)`, componentFile);
includes(component, `getAgentStatusText(agent.status)`, componentFile);
includes(component, `getDefaultTextStatusText()`, componentFile);
includes(component, `settings.agentConfig.validation.invalidOverrideModel`, componentFile);
notIncludes(component, `agent.statusText`, componentFile);
notIncludes(component, `defaultTextStatusText`, componentFile);
notIncludes(component, `GROUP_LABELS`, componentFile);
notIncludes(component, `{{ item.label }}`, componentFile);
notIncludes(component, `Agent 高级设置`, componentFile);
notIncludes(component, `默认文本模型`, componentFile);
notIncludes(component, `覆盖模型已失效`, componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `agentConfig: {`, messagesFile);
includes(messages, `title: 'Agent 高级设置'`, messagesFile);
includes(messages, `title: 'Agent Advanced Settings'`, messagesFile);
includes(messages, `agentName`, messagesFile);
includes(messages, `defaultStatus`, messagesFile);
includes(messages, `invalidOverrideModel`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第五批-设置Agent配置.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第五批：设置 Agent 配置', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-agent-config-i18n.mjs'`, verifyFile);

const legacyVerifyFile = 'scripts/verify-f-002-005.mjs';
const legacyVerify = read(legacyVerifyFile);
includes(legacyVerify, `settings.agentConfig.title`, legacyVerifyFile);
notIncludes(legacyVerify, `Agent 高级设置`, legacyVerifyFile);

console.log('[verify-opt-047-agent-config-i18n] passed');
