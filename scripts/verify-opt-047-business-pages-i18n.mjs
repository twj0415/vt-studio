import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const files = [
  'src/renderer/src/features/assets/AssetsHome.vue',
  'src/renderer/src/features/corner-scape/CornerScapeHome.vue',
  'src/renderer/src/features/production/ProductionHome.vue',
  'src/renderer/src/features/production/components/ProductionAgentPanel.vue',
  'src/renderer/src/features/production/components/ProductionFlowNode.vue',
  'src/renderer/src/features/production/components/ProductionImageFlowDialog.vue',
  'src/renderer/src/features/production/components/ProductionImageFlowNode.vue',
  'src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue',
  'src/renderer/src/features/export/ExportHome.vue',
];

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(content, needle, file) {
  assert(content.includes(needle), `${file} should include ${needle}`);
}

for (const file of files) {
  assert(!/[\p{Script=Han}]/u.test(read(file)), `${file} should not include Chinese hard-coded text`);
}

const assetHome = read('src/renderer/src/features/assets/AssetsHome.vue');
includes(assetHome, 'useI18n', 'src/renderer/src/features/assets/AssetsHome.vue');
includes(assetHome, `t('assets.title')`, 'src/renderer/src/features/assets/AssetsHome.vue');

const cornerHome = read('src/renderer/src/features/corner-scape/CornerScapeHome.vue');
includes(cornerHome, 'useI18n', 'src/renderer/src/features/corner-scape/CornerScapeHome.vue');
includes(cornerHome, `t('cornerScape.title')`, 'src/renderer/src/features/corner-scape/CornerScapeHome.vue');

const productionHome = read('src/renderer/src/features/production/ProductionHome.vue');
includes(productionHome, 'useI18n', 'src/renderer/src/features/production/ProductionHome.vue');
includes(productionHome, `t('production.title')`, 'src/renderer/src/features/production/ProductionHome.vue');

const exportHome = read('src/renderer/src/features/export/ExportHome.vue');
includes(exportHome, 'useI18n', 'src/renderer/src/features/export/ExportHome.vue');
includes(exportHome, `t('exportCenter.title')`, 'src/renderer/src/features/export/ExportHome.vue');

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第十六批-剩余业务页复扫.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第十六批：剩余业务页复扫', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-business-pages-i18n.mjs'`, verifyFile);

console.log('[verify-opt-047-business-pages-i18n] passed');
