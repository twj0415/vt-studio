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

const componentFile = 'src/renderer/src/features/settings/components/BusinessConfig.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'BusinessConfig.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t } = useI18n();`, componentFile);
includes(component, `settings.businessConfig.title`, componentFile);
includes(component, `settings.businessConfig.restoreDialog.title`, componentFile);
includes(component, `settings.businessConfig.validation.numberRequired`, componentFile);
includes(component, `settings.businessConfig.wheelMode.zoom`, componentFile);
includes(component, `settings.businessConfig.field.chapterRegPlaceholder`, componentFile);
notIncludes(component, `其他业务配置`, componentFile);
notIncludes(component, `恢复默认章节正则`, componentFile);
notIncludes(component, `必须是数字`, componentFile);
notIncludes(component, `保存失败`, componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `businessConfig: {`, messagesFile);
includes(messages, `title: '其他业务配置'`, messagesFile);
includes(messages, `title: 'Business Settings'`, messagesFile);
includes(messages, `chapterRegPlaceholder`, messagesFile);
includes(messages, `wheelMode`, messagesFile);
includes(messages, `restoreDialog`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第九批-设置其他业务配置.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第九批：设置其他业务配置', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-business-config-i18n.mjs'`, verifyFile);

const legacyVerifyFile = 'scripts/verify-f-002-012.mjs';
const legacyVerify = read(legacyVerifyFile);
includes(legacyVerify, `settings.businessConfig.restoreDefaultRegex`, legacyVerifyFile);
notIncludes(legacyVerify, `BusinessConfig.vue', '恢复默认章节正则'`, legacyVerifyFile);

console.log('[verify-opt-047-business-config-i18n] passed');
