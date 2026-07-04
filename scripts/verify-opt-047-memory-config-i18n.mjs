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

const componentFile = 'src/renderer/src/features/settings/components/MemoryConfig.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'MemoryConfig.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t } = useI18n();`, componentFile);
includes(component, `settings.memoryConfig.title`, componentFile);
includes(component, `settings.memoryConfig.modelStatus.available`, componentFile);
includes(component, `settings.memoryConfig.clear.confirmPhrase`, componentFile);
includes(component, `CLEAR_ALL_CONFIRM_TEXT`, componentFile);
includes(component, `CLEAR_TYPE_OPTIONS`, componentFile);
includes(component, `AGENT_TYPE_OPTIONS`, componentFile);
includes(component, `settings.memoryConfig.validation.numberRequired`, componentFile);
includes(component, `settings.memoryConfig.message.confirmPhraseRequired`, componentFile);
notIncludes(component, `记忆配置`, componentFile);
notIncludes(component, `清空全部记忆`, componentFile);
notIncludes(component, `模型文件可用`, componentFile);
notIncludes(component, `剧本 Agent`, componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `memoryConfig: {`, messagesFile);
includes(messages, `title: '记忆配置'`, messagesFile);
includes(messages, `title: 'Memory Settings'`, messagesFile);
includes(messages, `confirmPhrase: '清空全部记忆'`, messagesFile);
includes(messages, `confirmPhrase: 'CLEAR ALL MEMORY'`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第六批-设置记忆配置.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第六批：设置记忆配置', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-memory-config-i18n.mjs'`, verifyFile);

const legacyVerifyFile = 'scripts/verify-f-002-008.mjs';
const legacyVerify = read(legacyVerifyFile);
includes(legacyVerify, `settings.memoryConfig.clear.allTitle`, legacyVerifyFile);
notIncludes(legacyVerify, `MemoryConfig.vue', '清空全部记忆'`, legacyVerifyFile);

console.log('[verify-opt-047-memory-config-i18n] passed');
