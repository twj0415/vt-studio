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

const componentFile = 'src/renderer/src/features/settings/components/ModelPromptConfig.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'ModelPromptConfig.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t } = useI18n();`, componentFile);
includes(component, `settings.modelPromptConfig.title`, componentFile);
includes(component, `settings.modelPromptConfig.templateType.imagePrompt`, componentFile);
includes(component, `getConnectionStatusText(connection)`, componentFile);
includes(component, `getModelStatusText(model)`, componentFile);
includes(component, `getInvalidReasonText(mapping)`, componentFile);
includes(component, `getTemplateOptionLabel(template)`, componentFile);
notIncludes(component, `connectionStatusText`, componentFile);
notIncludes(component, `statusText`, componentFile);
notIncludes(component, `reasonText`, componentFile);
notIncludes(component, `模型专用模板`, componentFile);
notIncludes(component, `模板已保存`, componentFile);
notIncludes(component, `未绑定专用模板`, componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `modelPromptConfig: {`, messagesFile);
includes(messages, `title: '模型专用模板'`, messagesFile);
includes(messages, `title: 'Model-specific Templates'`, messagesFile);
includes(messages, `invalidReason`, messagesFile);
includes(messages, `bindingDialog`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第八批-设置模型专用模板.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第八批：设置模型专用模板', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-model-prompt-config-i18n.mjs'`, verifyFile);

const legacyVerifyFile = 'scripts/verify-f-002-004.mjs';
const legacyVerify = read(legacyVerifyFile);
includes(legacyVerify, `settings.modelPromptConfig.title`, legacyVerifyFile);
notIncludes(legacyVerify, `ModelPromptConfig.vue', '模型专用模板'`, legacyVerifyFile);

console.log('[verify-opt-047-model-prompt-config-i18n] passed');
