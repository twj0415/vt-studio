import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(content, needle, file) {
  assert(content.includes(needle), `${file} should include ${needle}`);
}

function assertNoHan(content, file) {
  assert(!/[\p{Script=Han}]/u.test(content), `${file} should not include visible Chinese hard-coded text`);
}

const targetFiles = [
  'src/renderer/src/App.vue',
  'src/renderer/src/router/index.ts',
  'src/renderer/src/router/menu.ts',
  'src/renderer/src/stores/auth.ts',
  'src/renderer/src/stores/app.ts',
  'src/renderer/src/layouts/WorkbenchLayout.vue',
  'src/shared/types/app.ts',
];

for (const file of targetFiles) {
  assertNoHan(read(file), file);
}

const i18nHelperFile = 'src/renderer/src/utils/i18n-text.ts';
const i18nHelper = read(i18nHelperFile);
assertIncludes(i18nHelper, 'export function rt(', i18nHelperFile);
assertIncludes(i18nHelper, 'export function rtFallback(', i18nHelperFile);

const app = read('src/renderer/src/App.vue');
assertIncludes(app, "t('app.bootstrapLoading')", 'src/renderer/src/App.vue');
assertIncludes(app, "t('app.bootstrapFailed')", 'src/renderer/src/App.vue');

const menu = read('src/renderer/src/router/menu.ts');
assertIncludes(menu, "titleKey: 'route.projects'", 'src/renderer/src/router/menu.ts');
assertIncludes(menu, "descriptionKey: 'routeDescription.projects'", 'src/renderer/src/router/menu.ts');

const router = read('src/renderer/src/router/index.ts');
assertIncludes(router, "titleKey: 'route.login'", 'src/renderer/src/router/index.ts');
assert(!router.includes('meta: { title:'), 'src/renderer/src/router/index.ts should use titleKey instead of title');

const authStore = read('src/renderer/src/stores/auth.ts');
assertIncludes(authStore, "rt('auth.serviceUnavailable')", 'src/renderer/src/stores/auth.ts');
assertIncludes(authStore, "rtFallback(error, 'auth.loginFailed')", 'src/renderer/src/stores/auth.ts');

const appStore = read('src/renderer/src/stores/app.ts');
assertIncludes(appStore, "rtFallback(error, 'app.bootstrapError')", 'src/renderer/src/stores/app.ts');

const messages = read('src/renderer/src/i18n/messages.ts');
assertIncludes(messages, 'bootstrapLoading', 'src/renderer/src/i18n/messages.ts');
assertIncludes(messages, 'serviceUnavailable', 'src/renderer/src/i18n/messages.ts');
assertIncludes(messages, 'routeDescription', 'src/renderer/src/i18n/messages.ts');

const task = read('docs/tasks/OPT-047-可见文案i18n治理-第一批.md');
assertIncludes(task, '# OPT-047 可见文案 i18n 治理 - 第一批', 'docs/tasks/OPT-047-可见文案i18n治理-第一批.md');
assertIncludes(task, '最后大白话', 'docs/tasks/OPT-047-可见文案i18n治理-第一批.md');

const verify = read('scripts/verify.mjs');
assertIncludes(verify, "'verify-opt-047-i18n-foundation.mjs'", 'scripts/verify.mjs');

console.log('[verify-opt-047-i18n-foundation] passed');
