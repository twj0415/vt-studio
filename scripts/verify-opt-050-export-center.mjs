import { readdirSync, readFileSync } from 'node:fs';
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

function listFiles(relativeDirectory, extensions = ['.vue', '.ts']) {
  const directory = join(root, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;

    if (entry.isDirectory()) {
      return listFiles(relativePath, extensions);
    }

    if (!entry.isFile()) {
      return [];
    }

    return extensions.some((extension) => entry.name.endsWith(extension)) ? [relativePath] : [];
  });
}

function assertNoDevCodesInRenderer(paths) {
  const pattern = /\b(?:M|OPT)-\d{3}\b/;
  for (const relativePath of paths) {
    const content = read(relativePath);
    const match = content.match(pattern);
    if (match) {
      throw new Error(`${relativePath} should not expose developer task code in user-facing renderer UI: ${match[0]}`);
    }
  }
}

function assertTextOrder(relativePath, expectedOrder) {
  const content = read(relativePath);
  let previousIndex = -1;

  for (const expected of expectedOrder) {
    const currentIndex = content.indexOf(expected);
    if (currentIndex === -1) {
      throw new Error(`${relativePath} should include ordered text: ${expected}`);
    }
    if (currentIndex <= previousIndex) {
      throw new Error(`${relativePath} should keep user-flow menu order: ${expectedOrder.join(' -> ')}`);
    }
    previousIndex = currentIndex;
  }
}

const exportHomePath = 'src/renderer/src/features/export/ExportHome.vue';
const exportHome = read(exportHomePath);
const productionWorkbenchPath = 'src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue';
const productionWorkbench = read(productionWorkbenchPath);
const moduleScaffoldPath = 'src/renderer/src/features/shared/ModuleScaffold.vue';
const workbenchLayoutPath = 'src/renderer/src/layouts/WorkbenchLayout.vue';
const routerMenuPath = 'src/renderer/src/router/menu.ts';

assertNotIncludes(exportHomePath, 'ModuleScaffold');
assertNotIncludes(moduleScaffoldPath, 'moduleId');
assertNotIncludes(workbenchLayoutPath, 'activeMenu?.id');
assertTextOrder(routerMenuPath, [
  "routeName: 'project-overview'",
  "routeName: 'novel'",
  "routeName: 'script-agent'",
  "routeName: 'script'",
  "routeName: 'assets'",
  "routeName: 'corner-scape'",
  "routeName: 'production'",
  "routeName: 'export'",
]);

for (const expected of [
  'useVtRequest',
  'window.vtStudio.script.list',
  'window.vtStudio.export.buildTimeline',
  'window.vtStudio.export.validateAssets',
  'window.vtStudio.export.createJianyingDraft',
  'window.vtStudio.export.openDirectory',
  "router.push({ name: 'production' })",
  "router.push({ name: 'tasks' })",
  'function copyTaskId',
  'resultTaskId',
]) {
  assertIncludes(exportHomePath, expected);
}

if (/[\p{Script=Han}]/u.test(exportHome)) {
  throw new Error(`${exportHomePath} should not contain hard-coded Chinese text`);
}

for (const expected of [
  'interface WorkbenchExportBlocker',
  'const exportBlockers = computed<WorkbenchExportBlocker[]>',
  'const exportReady = computed',
  'const exportCheckVisible = ref(false)',
  'function handleExportAction',
  'function focusExportBlocker',
  'function copyExportPath',
  'function copyExportTaskId',
  'function goTaskCenter',
  'selectedVideoRatio',
  'exportBlockerReason',
]) {
  assertIncludes(productionWorkbenchPath, expected);
}

if (!productionWorkbench.includes(':disabled="tracks.length === 0" @click="handleExportAction"')) {
  throw new Error(`${productionWorkbenchPath} should let the export button open export check instead of disabling on partial selection`);
}

for (const expected of [
  'exportCenter: {',
  "title: '剪映草稿导出'",
  "title: 'Jianying Draft Export'",
  "failureReason: {",
  "copyAssetsHint: '建议保持开启，避免草稿目录缺少视频素材。'",
  "copyAssetsHint: 'Keep this enabled so the draft directory includes required video assets.'",
  "selectedVideoRatio: '已选择 {selected}/{total} 条轨道'",
  "selectedVideoRatio: '{selected}/{total} tracks selected'",
  "moduleEyebrow: '功能入口'",
  "moduleEyebrow: 'Feature Entry'",
  "eyebrow: '视频工作台'",
  "eyebrow: 'Video Workbench'",
  "moduleTag: '生产节点'",
  "moduleTag: 'Production Node'",
  "copyTaskId: '复制任务 ID'",
  "copyTaskId: 'Copy Task ID'",
  "taskIdCopied: '任务 ID 已复制'",
  "taskIdCopied: 'Task ID copied'",
  'exportBlockerReason',
  "copyAssetsOffWarning: '关闭后草稿会依赖原素材路径，移动或删除素材可能导致草稿失效。'",
]) {
  assertIncludes('src/renderer/src/i18n/messages.ts', expected);
}

assertNoDevCodesInRenderer([
  ...listFiles('src/renderer/src/features'),
  ...listFiles('src/renderer/src/layouts'),
]);

assertIncludes('docs/tasks/OPT-050-工作台导航和导出体验治理.md', '独立导出页');
assertIncludes('docs/tasks/OPT-050-工作台导航和导出体验治理.md', 'window.vtStudio.export.createJianyingDraft');
assertIncludes('docs/TODO-优化与缺口.md', 'OPT-050 工作台导航和导出体验治理');
assertIncludes('scripts/verify.mjs', "'verify-opt-050-export-center.mjs'");

console.log('[verify-opt-050-export-center] passed');
