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

const componentFile = 'src/renderer/src/features/settings/components/PromptConfig.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'PromptConfig.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t, locale } = useI18n();`, componentFile);
includes(component, `PROMPT_NAME_KEYS`, componentFile);
includes(component, `settings.promptConfig.title`, componentFile);
includes(component, `settings.promptConfig.riskDialog.title`, componentFile);
includes(component, `settings.promptConfig.restoreDialog.title`, componentFile);
includes(component, `getPromptName(prompt)`, componentFile);
includes(component, `getPromptCardStatusText(prompt)`, componentFile);
notIncludes(component, `提示词管理`, componentFile);
notIncludes(component, `恢复默认提示词`, componentFile);
notIncludes(component, `已自定义`, componentFile);
notIncludes(component, `prompt.name`, componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `promptConfig: {`, messagesFile);
includes(messages, `title: '提示词管理'`, messagesFile);
includes(messages, `title: 'Prompt Management'`, messagesFile);
includes(messages, `promptName`, messagesFile);
includes(messages, `riskDialog`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第七批-设置提示词管理.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第七批：设置提示词管理', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-prompt-config-i18n.mjs'`, verifyFile);

const legacyVerifyFile = 'scripts/verify-f-002-006.mjs';
const legacyVerify = read(legacyVerifyFile);
includes(legacyVerify, `settings.promptConfig.restoreDefault`, legacyVerifyFile);
notIncludes(legacyVerify, `PromptConfig.vue', '恢复默认'`, legacyVerifyFile);

console.log('[verify-opt-047-prompt-config-i18n] passed');
