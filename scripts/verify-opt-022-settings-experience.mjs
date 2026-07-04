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
  "key: 'generation'",
  "key: 'workspace'",
  "key: 'account'",
  "key: 'advanced'",
  "t('settings.guide.title')",
  "t('settings.guide.summary')",
  'appInfo.value?.isDev',
  'developerVisible',
]) {
  assertIncludes(settingsHomePath, expected);
}

assertOrder(settingsHomePath, [
  'id="settings-model-service"',
  'id="settings-agent-config"',
  'id="settings-prompt"',
  'id="settings-files"',
  'id="settings-appearance"',
  'id="settings-language"',
  'id="settings-business"',
  'id="settings-about"',
  'id="settings-developer"',
  'id="settings-user"',
]);

for (const expected of [
  'guide: {',
  "title: '先跑通生成，再调整体验'",
  "title: 'Make generation work first, then tune the workspace'",
  "generation: {",
  "workspace: {",
  "account: {",
  "advanced: {",
]) {
  assertIncludes(messagesPath, expected);
}

console.log('[verify-opt-022-settings-experience] passed');
