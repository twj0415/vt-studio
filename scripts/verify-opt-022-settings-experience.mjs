import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function assertIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} should include: ${expected}`);
  }
}

function assertNotIncludes(relativePath, unexpected) {
  const content = read(relativePath);
  if (content.includes(unexpected)) {
    throw new Error(`${relativePath} should not include: ${unexpected}`);
  }
}

function assertOrder(relativePath, expectedOrder) {
  const content = read(relativePath);
  let previousIndex = -1;

  for (const expected of expectedOrder) {
    const currentIndex = content.indexOf(expected);
    if (currentIndex === -1) {
      throw new Error(`${relativePath} should include ordered text: ${expected}`);
    }
    if (currentIndex <= previousIndex) {
      throw new Error(`${relativePath} should keep settings order: ${expectedOrder.join(' -> ')}`);
    }
    previousIndex = currentIndex;
  }
}

const settingsHomePath = 'src/renderer/src/features/settings/SettingsHome.vue';
const messagesPath = 'src/renderer/src/i18n/messages.ts';

for (const expected of [
  'interface SettingsQuickGroup',
  'settingsQuickGroups = computed<SettingsQuickGroup[]>',
  "key: 'basic'",
  "key: 'account'",
  "key: 'generation'",
  "key: 'workspace'",
  "key: 'creation'",
  "key: 'about'",
  "key: 'advanced'",
  'settings-category-section',
  'settings-list-section',
  'SettingsSectionCard',
  ':heading="t(\'appearance.title\')"',
  'settings-row',
  'activeCategoryKey',
  'selectCategory',
  "activeCategory?.key === 'basic'",
  "activeCategory?.key === 'account'",
  "activeCategory?.key === 'generation'",
  "activeCategory?.key === 'workspace'",
  "activeCategory?.key === 'creation'",
  "activeCategory?.key === 'about'",
  "activeCategory?.key === 'advanced'",
  'appInfo.value?.isDev',
]) {
  assertIncludes(settingsHomePath, expected);
}

for (const unexpected of [
  "t('settings.guide.title')",
  "t('settings.guide.summary')",
  'activeSectionId',
  'scrollToSection',
  'scrollIntoView',
  'developerVisible',
  'activeSettingId',
  'settings-single-panel',
  "v-else-if=\"activeSettingId",
  'settings-category-head',
  'expandedPanelKeys',
  'toggleSettingsPanel',
  'settings-panel-toggle',
  'isPanelExpanded',
  'ChevronDownIcon',
  'ChevronUpIcon',
]) {
  assertNotIncludes(settingsHomePath, unexpected);
}

assertOrder(settingsHomePath, [
  'id="settings-appearance"',
  'id="settings-language"',
  'id="settings-user"',
  'id="settings-about"',
  'id="settings-model-service"',
  'id="settings-agent-config"',
  'id="settings-files"',
  'id="settings-business"',
  'id="settings-developer"',
]);

for (const expected of [
  'guide: {',
  "title: '清晰分类，按需配置'",
  "title: 'Clear categories, focused controls'",
  "basic: {",
  "account: {",
  "generation: {",
  "workspace: {",
  "creation: {",
  "about: {",
  "advanced: {",
]) {
  assertIncludes(messagesPath, expected);
}

console.log('[verify-opt-022-settings-experience] passed');
