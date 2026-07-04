import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P2-应用壳批.md', '设置入口是否必须回退成 dialog 形态'],
  ['src/main/app/window.ts', 'frame: false'],
  ['src/main/ipc/app.ts', 'window:toggle-maximize'],
  ['src/main/services/app-shell.ts', 'openExternalByKey'],
  ['src/shared/contracts/preload.ts', 'shell: {'],
  ['src/shared/contracts/preload.ts', 'window: {'],
  ['src/preload/index.ts', 'shell:list-external-links'],
  ['src/preload/index.ts', 'window:toggle-maximize'],
  ['src/renderer/src/App.vue', 'app-bootstrap-screen'],
  ['src/renderer/src/layouts/WorkbenchLayout.vue', 'DesktopTitleBar'],
  ['src/renderer/src/layouts/WorkbenchLayout.vue', 'vt-main-content'],
  ['src/renderer/src/layouts/WorkbenchLayout.vue', 'layout.skipToContent'],
  ['src/renderer/src/router/index.ts', 'requiresProject: true'],
  ['src/renderer/src/router/menu.ts', 'novelOnly: true'],
  ['src/renderer/src/features/shell/WelcomeGuide.vue', 'vtStudio.welcomeGuideDone'],
  ['src/renderer/src/features/shell/WelcomeGuide.vue', "query: { section"],
  ['src/renderer/src/features/settings/SettingsHome.vue', 'settings-agent-config'],
  ['src/renderer/src/styles/index.scss', '.desktop-titlebar'],
  ['src/renderer/src/styles/index.scss', '.content-frame'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P2 shell verification passed');
