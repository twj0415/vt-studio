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

const noHanFiles = [
  'src/renderer/src/features/shared/ModuleScaffold.vue',
  'src/renderer/src/features/settings/SettingsHome.vue',
  'src/renderer/src/features/export/ExportHome.vue',
  'src/renderer/src/features/shell/WelcomeGuide.vue',
  'src/renderer/src/features/settings/appearance/theme.ts',
];

for (const file of noHanFiles) {
  assert(!/[\p{Script=Han}]/u.test(read(file)), `${file} should not include Chinese hard-coded text`);
}

const scaffoldFile = 'src/renderer/src/features/shared/ModuleScaffold.vue';
const scaffold = read(scaffoldFile);
includes(scaffold, `state: 'pending' | 'confirm' | 'ready';`, scaffoldFile);
includes(scaffold, `t(\`scaffold.state.\${action.state}\`)`, scaffoldFile);
notIncludes(scaffold, `待建任务`, scaffoldFile);

const settingsFile = 'src/renderer/src/features/settings/SettingsHome.vue';
const settings = read(settingsFile);
includes(settings, `settingsQuickGroups`, settingsFile);
includes(settings, `settings-anchor-section`, settingsFile);
includes(settings, `t('settings.guide.title')`, settingsFile);
notIncludes(settings, `基础入口`, settingsFile);

const exportFile = 'src/renderer/src/features/export/ExportHome.vue';
const exportHome = read(exportFile);
includes(exportHome, `t('exportCenter.title')`, exportFile);
includes(exportHome, `t('exportCenter.resultTitle')`, exportFile);
includes(exportHome, `t('exportCenter.copyTaskId')`, exportFile);
notIncludes(exportHome, `待确认`, exportFile);

const welcomeFile = 'src/renderer/src/features/shell/WelcomeGuide.vue';
const welcome = read(welcomeFile);
includes(welcome, `language.options.zh-CN.label`, welcomeFile);
includes(welcome, `language.options.en.label`, welcomeFile);
notIncludes(welcome, `简体中文`, welcomeFile);

const themeFile = 'src/renderer/src/features/settings/appearance/theme.ts';
const theme = read(themeFile);
notIncludes(theme, `当前产品默认风格`, themeFile);
notIncludes(theme, `暖色`, themeFile);
notIncludes(theme, `工作风`, themeFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第十二批-共享脚手架和设置残留.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第十二批：共享脚手架和设置残留', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-shared-foundation-i18n.mjs'`, verifyFile);

console.log('[verify-opt-047-shared-foundation-i18n] passed');
