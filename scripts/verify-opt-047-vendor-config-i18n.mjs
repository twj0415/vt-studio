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

const componentFile = 'src/renderer/src/features/settings/components/VendorConfig.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'VendorConfig.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t } = useI18n();`, componentFile);
includes(component, `labelKey: 'settings.vendorConfig.modelType.text'`, componentFile);
includes(component, `settings.vendorConfig.videoMode.imageReference3`, componentFile);
includes(component, `settings.vendorConfig.secretSavedHint`, componentFile);
includes(component, `settings.vendorConfig.deleteModelDialog.title`, componentFile);
includes(component, `settings.vendorConfig.deleteVendorDialog.title`, componentFile);
includes(component, `settings.vendorConfig.testResult.imageSuccess`, componentFile);
includes(component, `settings.vendorConfig.codeDialog.warning`, componentFile);
includes(component, `getVendorStatusText(selectedVendor)`, componentFile);
notIncludes(component, 'MODEL_TYPE_LABELS', componentFile);
notIncludes(component, 'VIDEO_MODE_OPTIONS', componentFile);
notIncludes(component, 'selectedVendor.statusText', componentFile);
notIncludes(component, '最后错误', componentFile);
notIncludes(component, '留空表示不修改', componentFile);
notIncludes(component, '模型服务生成', componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `vendorConfig: {`, messagesFile);
includes(messages, `title: '底层供应商配置'`, messagesFile);
includes(messages, `title: 'Vendor Configuration'`, messagesFile);
includes(messages, `secretSavedHint`, messagesFile);
includes(messages, `readonlyProjection`, messagesFile);
includes(messages, `modelDialog`, messagesFile);
includes(messages, `codeDialog`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第三批-设置供应商.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第三批：设置供应商', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-vendor-config-i18n.mjs'`, verifyFile);

console.log('[verify-opt-047-vendor-config-i18n] passed');
