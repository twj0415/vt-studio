import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/F-002-013-请求地址配置.md', '本地服务地址诊断'],
  ['src/main/app/server.ts', 'getLocalServerInfo'],
  ['src/main/services/settings/request-diagnostics.ts', 'electron-local'],
  ['src/main/ipc/settings.ts', 'settings:request:get'],
  ['src/main/ipc/settings.ts', 'settings:request:refresh-local-url'],
  ['src/shared/contracts/preload.ts', 'request: {'],
  ['src/preload/index.ts', 'settings:request:refresh-local-url'],
  ['src/renderer/src/features/settings/components/RequestDiagnostics.vue', 'settings.requestDiagnostics.currentUrl'],
  ['src/renderer/src/i18n/messages.ts', 'requestDiagnostics'],
  ['src/renderer/src/features/settings/SettingsHome.vue', '<RequestDiagnostics'],
  ['src/renderer/src/styles/index.scss', '.request-diagnostics-section'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('F-002-013 request diagnostics verification passed');
