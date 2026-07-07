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

function assertNotIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (content.includes(expected)) {
    throw new Error(`${relativePath} should not include: ${expected}`);
  }
}

assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'href="#vt-main-content"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'id="vt-main-content"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'tabindex="-1"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', "t('layout.skipToContent')");
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'function openProjects()');
assertNotIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', "t('layout.backToProjects')");
assertNotIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'function openSettings()');
assertNotIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'class="topbar"');
assertNotIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'class="nav-section project-nav"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'class="project-workspace-nav"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'class="project-top-nav"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'project-top-nav-item');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'projectWorkspaceRouteNames');
assertNotIncludes('src/renderer/src/router/menu.ts', "titleKey: 'route.projectOverview'");

assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "import AgentConfig from './components/AgentConfig.vue';");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', 'settingsQuickGroups');
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "import SettingsSectionCard from './components/SettingsSectionCard.vue';");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', ':heading="t(\'appearance.title\')"');
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "t('settings.quickNavLabel')");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', 'id="settings-agent-config"');
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', 'id="settings-developer"');
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', 'id="settings-user"');

assertIncludes('src/renderer/src/i18n/messages.ts', "skipToContent: '跳到主内容'");
assertIncludes('src/renderer/src/i18n/messages.ts', "backToProjects: '项目列表'");
assertIncludes('src/renderer/src/i18n/messages.ts', "quickNavLabel: '设置快速定位'");
assertIncludes('src/renderer/src/i18n/messages.ts', "skipToContent: 'Skip to main content'");
assertIncludes('src/renderer/src/i18n/messages.ts', "backToProjects: 'Projects'");
assertIncludes('src/renderer/src/i18n/messages.ts', "quickNavLabel: 'Settings quick navigation'");
assertIncludes('docs/tasks/OPT-048-全局菜单和页面布局治理.md', '项目内模块菜单移到内容区顶部');
assertIncludes('scripts/verify-p2-shell.mjs', 'vt-main-content');

const verifyFile = read('scripts/verify.mjs');
if (!verifyFile.includes("'verify-opt-048-layout-governance.mjs'")) {
  throw new Error('scripts/verify.mjs should include verify-opt-048-layout-governance.mjs');
}

console.log('[verify-opt-048-layout-governance] passed');
