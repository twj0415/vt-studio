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

function assertBlockNotIncludes(relativePath, startMarker, endMarker, unexpected) {
  const content = read(relativePath);
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker, startIndex);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`${relativePath} should include block markers: ${startMarker} / ${endMarker}`);
  }

  const block = content.slice(startIndex, endIndex);
  if (block.includes(unexpected)) {
    throw new Error(`${relativePath} block ${startMarker} should not include: ${unexpected}`);
  }
}

const stylesPath = 'src/renderer/src/styles/index.scss';

for (const expected of [
  'height: 100dvh;',
  'grid-template-columns: 72px minmax(0, 1fr);',
  'scrollbar-gutter: stable;',
  '.project-nav {',
  'overflow-y: auto;',
  '.content-frame {',
  'overflow-x: hidden;',
  '.t-dialog__ctx .t-dialog {',
  'max-height: calc(100dvh - 48px);',
  '.t-dialog__ctx .t-dialog__body {',
  'overscroll-behavior: contain;',
  '.production-workbench-shell {',
  'height: min(78vh, calc(100dvh - 150px));',
  '.production-image-flow-shell {',
  'height: min(74vh, calc(100dvh - 160px));',
]) {
  assertIncludes(stylesPath, expected);
}

assertBlockNotIncludes(stylesPath, '.app-shell {', '.app-shell.has-titlebar', 'min-width: 1180px;');

assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', 'class="content-frame"');
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', 'scrollIntoView({ behavior: \'smooth\', block: \'start\' })');
assertIncludes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'width="96vw"');
assertIncludes('src/renderer/src/features/production/components/ProductionImageFlowDialog.vue', 'width="96vw"');

console.log('[verify-opt-024-scroll-stability] passed');
