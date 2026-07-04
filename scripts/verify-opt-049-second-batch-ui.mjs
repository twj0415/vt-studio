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

assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', ':aria-label="t(\'layout.sidebarLabel\')"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'class="nav-item-label"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'class="topbar-icon-action"');
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', "t('layout.appVersion'");
assertIncludes('src/renderer/src/styles/index.scss', 'grid-template-columns: 72px minmax(0, 1fr)');
assertIncludes('src/renderer/src/styles/index.scss', '.nav-item-label');
assertIncludes('src/renderer/src/styles/index.scss', '.topbar-icon-action');
assertIncludes('src/renderer/src/styles/tokens.scss', '--vt-surface-app: #eef3f1');

assertIncludes('src/renderer/src/features/script/ScriptHome.vue', 'scriptStatusSummary');
assertIncludes('src/renderer/src/features/script/ScriptHome.vue', "t('script.statusSummary.label')");
assertIncludes('src/renderer/src/features/script/ScriptHome.vue', "t('script.selection.count'");
assertIncludes('src/renderer/src/features/script/ScriptHome.vue', "t('script.selection.clear')");
assertIncludes('src/renderer/src/features/script/ScriptHome.vue', '<t-checkbox :checked="isCurrentPageAllSelected"');
assertNotIncludes('src/renderer/src/features/script/ScriptHome.vue', '<input type="checkbox" :checked="isCurrentPageAllSelected"');
assertIncludes('src/renderer/src/features/script/ScriptHome.vue', '<t-checkbox :checked="selectedDraftIds.includes(script.tempId)"');
assertIncludes('src/renderer/src/features/script/ScriptHome.vue', '@keydown.enter.prevent="toggleDraftSelection(script.tempId)"');
assertNotIncludes('src/renderer/src/features/script/ScriptHome.vue', '<input type="checkbox" :checked="selectedDraftIds.includes(script.tempId)"');
assertNotIncludes('src/renderer/src/styles/index.scss', ".script-draft-item input[type='checkbox']");

assertIncludes('src/renderer/src/features/assets/AssetsHome.vue', 'assetStatusSummary');
assertIncludes('src/renderer/src/features/assets/AssetsHome.vue', "t('assets.statusSummary.label')");
assertIncludes('src/renderer/src/features/assets/AssetsHome.vue', "t('assets.selection.count'");
assertIncludes('src/renderer/src/features/assets/AssetsHome.vue', '<t-checkbox :checked="allSelected"');

assertIncludes('src/renderer/src/features/corner-scape/CornerScapeHome.vue', 'cornerStatusSummary');
assertIncludes('src/renderer/src/features/corner-scape/CornerScapeHome.vue', "t('cornerScape.statusSummary.label')");
assertIncludes('src/renderer/src/features/corner-scape/CornerScapeHome.vue', "t('cornerScape.selection.hint'");
assertIncludes('src/renderer/src/features/corner-scape/CornerScapeHome.vue', 'corner-error-link');
assertIncludes('src/renderer/src/features/corner-scape/CornerScapeHome.vue', '<t-checkbox :checked="selectedIds.includes(asset.id)"');
assertIncludes('src/renderer/src/features/corner-scape/CornerScapeHome.vue', '<template #action>');
assertIncludes('src/renderer/src/features/corner-scape/CornerScapeHome.vue', 'resetCornerFilters');
assertIncludes('src/renderer/src/features/corner-scape/CornerScapeHome.vue', "t('cornerScape.emptyActionReset')");

assertIncludes('src/renderer/src/i18n/messages.ts', "sidebarLabel: '工作台主导航'");
assertIncludes('src/renderer/src/i18n/messages.ts', "label: '剧本页资产提取状态摘要'");
assertIncludes('src/renderer/src/i18n/messages.ts', "clear: '清空选择'");
assertIncludes('src/renderer/src/i18n/messages.ts', "label: '资产页生成状态摘要'");
assertIncludes('src/renderer/src/i18n/messages.ts', "label: '角景页绑定状态摘要'");
assertIncludes('src/renderer/src/i18n/messages.ts', "emptyActionReset: '清空筛选'");
assertIncludes('src/renderer/src/i18n/messages.ts', "sidebarLabel: 'Workbench primary navigation'");
assertIncludes('src/renderer/src/i18n/messages.ts', "label: 'Script asset extraction status summary'");
assertIncludes('src/renderer/src/i18n/messages.ts', "clear: 'Clear Selection'");
assertIncludes('src/renderer/src/i18n/messages.ts', "label: 'Asset generation status summary'");
assertIncludes('src/renderer/src/i18n/messages.ts', "label: 'Role and scene binding status summary'");
assertIncludes('src/renderer/src/i18n/messages.ts', "emptyActionReset: 'Clear Filters'");

assertIncludes('docs/tasks/OPT-049-全页面交互UI整改清单.md', '第二批已完成：剧本页、资产页、角景页、全局工作台壳层视觉微调');
assertIncludes('docs/TODO-优化与缺口.md', '第二批页面已完成：剧本页、资产页、角景页、全局工作台壳层视觉微调');
assertIncludes('docs/03-执行进度.md', 'OPT-049 全页面交互 UI 整改清单第二批已完成');

const verifyFile = read('scripts/verify.mjs');
if (!verifyFile.includes("'verify-opt-049-second-batch-ui.mjs'")) {
  throw new Error('scripts/verify.mjs should include verify-opt-049-second-batch-ui.mjs');
}

console.log('[verify-opt-049-second-batch-ui] passed');
