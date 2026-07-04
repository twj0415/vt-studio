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

const componentFile = 'src/renderer/src/features/settings/components/DeveloperConfig.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'DeveloperConfig.vue should not include Chinese hard-coded text');
includes(component, `const { t, locale } = useI18n();`, componentFile);
includes(component, `getClearConfirmPhrase()`, componentFile);
includes(component, `settings.devConfig.storage.clearConfirmPhrase`, componentFile);
includes(component, `settings.devConfig.storage.clearConfirmPlaceholder`, componentFile);
includes(component, `localeCompare(right.key, locale.value)`, componentFile);
notIncludes(component, `CLEAR_CONFIRM_PHRASE`, componentFile);
notIncludes(component, `清空 localStorage`, componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `clearConfirmPhrase: '清空 localStorage'`, messagesFile);
includes(messages, `clearConfirmPhrase: 'CLEAR LOCAL STORAGE'`, messagesFile);
includes(messages, `clearConfirmPlaceholder: '输入：{phrase}'`, messagesFile);
includes(messages, `clearConfirmPlaceholder: 'Type: {phrase}'`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第十一批-设置开发者配置.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第十一批：设置开发者配置', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-developer-config-i18n.mjs'`, verifyFile);

const legacyVerifyFile = 'scripts/verify-f-002-014.mjs';
const legacyVerify = read(legacyVerifyFile);
includes(legacyVerify, `settings.devConfig.storage.clearConfirmPhrase`, legacyVerifyFile);
notIncludes(legacyVerify, `DeveloperConfig.vue', '清空 localStorage'`, legacyVerifyFile);

console.log('[verify-opt-047-developer-config-i18n] passed');
