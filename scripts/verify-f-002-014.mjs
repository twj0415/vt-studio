import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/F-002-014-开发者配置.md', 'AI DevTools'],
  ['src/shared/types/dev-settings.ts', 'DevSettingsOpenDevToolsResult'],
  ['src/main/services/settings/dev-settings.ts', 'openRendererDevTools'],
  ['src/main/services/model/text.ts', 'devToolsMiddleware'],
  ['src/main/ipc/settings.ts', 'settings:dev:open-devtools'],
  ['src/shared/contracts/preload.ts', 'dev: {'],
  ['src/preload/index.ts', 'settings:dev:open-devtools'],
  ['src/renderer/src/features/settings/components/DeveloperConfig.vue', 'settings.devConfig.storage.clearConfirmPhrase'],
  ['src/renderer/src/features/settings/SettingsHome.vue', '<DeveloperConfig'],
  ['src/renderer/src/styles/index.scss', '.developer-config-section'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('F-002-014 developer config verification passed');
