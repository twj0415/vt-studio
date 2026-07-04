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

const componentFile = 'src/renderer/src/features/settings/components/ModelServiceConfig.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'ModelServiceConfig.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t } = useI18n();`, componentFile);
includes(component, `labelKey: 'settings.modelService.capability.text'`, componentFile);
includes(component, `t('settings.modelService.testPrompt.text')`, componentFile);
includes(component, `t('settings.modelService.validation.nameRequired')`, componentFile);
includes(component, `t('settings.modelService.deleteDialog.title')`, componentFile);
includes(component, `t('settings.modelService.bindingDialog.titleWithCapability'`, componentFile);
assert(!component.includes('item.label'), `${componentFile} should use getCapabilityLabel instead of item.label`);
assert(!component.includes('summary.label'), `${componentFile} should use getCapabilityLabel instead of backend summary.label`);
assert(!component.includes('summary.statusText'), `${componentFile} should not render backend statusText directly`);
assert(!component.includes('connection.statusText'), `${componentFile} should not render backend connection statusText directly`);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `eyebrow: '模型服务'`, messagesFile);
includes(messages, `eyebrow: 'Model Service'`, messagesFile);
includes(messages, 'noTestableModel', messagesFile);
includes(messages, 'bindingDialog', messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第二批-设置模型服务.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第二批：设置模型服务', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-model-service-i18n.mjs'`, verifyFile);

console.log('[verify-opt-047-model-service-i18n] passed');
