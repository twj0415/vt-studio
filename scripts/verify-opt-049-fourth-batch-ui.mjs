import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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

function listVueFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listVueFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.vue')) {
      files.push(fullPath);
    }
  }
  return files;
}

const workbenchPath = 'src/renderer/src/layouts/WorkbenchLayout.vue';
const settingsPath = 'src/renderer/src/features/settings/SettingsHome.vue';
const modelServicePath = 'src/renderer/src/features/settings/components/ModelServiceConfig.vue';
const agentConfigPath = 'src/renderer/src/features/settings/components/AgentConfig.vue';
const requestDiagnosticsPath = 'src/renderer/src/features/settings/components/RequestDiagnostics.vue';
const stylePath = 'src/renderer/src/styles/index.scss';

for (const expected of ['<t-tooltip :content="t(\'layout.brandHome\')"', '<t-tooltip v-for="menu in localizedGlobalMenus"', 'class="nav-item-label"']) {
  assertIncludes(workbenchPath, expected);
}

for (const unexpected of [':title="t(\'layout.brandHome\')"', ':title="menu.title"', ':title="t(\'common.settings\')"', ':title="t(\'layout.backToProjects\')"', 'class="topbar"', 'topbar-info', 'showSettingsShortcut', 'projectContextTooltip', 'InfoCircleIcon']) {
  assertNotIncludes(workbenchPath, unexpected);
}

for (const expected of ['settings-layout', 'settings-nav-panel', 'settings-content', '<ModelServiceConfig @model-service-updated="handleModelServiceUpdated" />', '<AgentConfig ref="agentConfigRef" />']) {
  assertIncludes(settingsPath, expected);
}

for (const unexpected of ['ModuleScaffold', 'const actions = computed', 'sticky top-0', 'settings.guide.title\') }}</h3>']) {
  assertNotIncludes(settingsPath, unexpected);
}

for (const expected of ['const emit = defineEmits', 'modelServiceUpdated', '<t-tooltip :content="t(\'settings.modelService.tooltip.testConnection\')"']) {
  assertIncludes(modelServicePath, expected);
}

assertNotIncludes(modelServicePath, "import AgentConfig from './AgentConfig.vue'");
assertNotIncludes(modelServicePath, '<AgentConfig ref="agentConfigRef" />');
assertIncludes(agentConfigPath, '<t-button class="agent-advanced-toggle"');
assertIncludes(requestDiagnosticsPath, '<t-tooltip :content="item.path">');

for (const expected of ['.settings-layout', '.settings-nav-panel', '.settings-nav-link.t-button', '.production-track-icon-action']) {
  assertIncludes(stylePath, expected);
}

for (const unexpected of ['.topbar-info', '.topbar-icon-action']) {
  assertNotIncludes(stylePath, unexpected);
}

const vueFiles = listVueFiles(join(root, 'src/renderer/src'));
const allowedTitlePropLines = ['<DesktopTitleBar ', '<t-alert'];
const nativeTitleViolations = [];
const rawControlViolations = [];

for (const file of vueFiles) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const nearbyComponentOpen = lines.slice(Math.max(0, index - 6), index + 1).some((nearbyLine) => allowedTitlePropLines.some((allowed) => nearbyLine.includes(allowed)));
    if (/\s:?title=/.test(line) && !nearbyComponentOpen) {
      nativeTitleViolations.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
    }
    if (/<input\s+[^>]*type=["']checkbox["']|<select[\s>]|<textarea[\s>]/.test(line)) {
      rawControlViolations.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (nativeTitleViolations.length) {
  throw new Error(`Native title tooltip attributes are not allowed:\n${nativeTitleViolations.join('\n')}`);
}

if (rawControlViolations.length) {
  throw new Error(`Use TDesign controls instead of raw checkbox/select/textarea:\n${rawControlViolations.join('\n')}`);
}

console.log('[verify-opt-049-fourth-batch-ui] passed');
