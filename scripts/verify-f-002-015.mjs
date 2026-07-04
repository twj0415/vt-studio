import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/F-002-015-关于与版本信息.md', '检查更新'],
  ['src/shared/types/about-settings.ts', 'AboutCheckUpdateResult'],
  ['src/shared/constants/app.ts', 'APP_UPDATE_SOURCE_URLS'],
  ['src/main/services/settings/about-settings.ts', 'checkAboutUpdate'],
  ['src/main/services/settings/about-settings.ts', 'downloadAboutUpdate'],
  ['src/main/ipc/settings.ts', 'settings:about:check-update'],
  ['src/shared/contracts/preload.ts', 'about: {'],
  ['src/preload/index.ts', 'settings:about:download'],
  ['src/renderer/src/features/settings/components/AboutConfig.vue', 'downloadUpdate'],
  ['src/renderer/src/features/settings/SettingsHome.vue', '<AboutConfig'],
  ['src/renderer/src/styles/index.scss', '.about-config-section'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('F-002-015 about config verification passed');
