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

assertIncludes('src/renderer/src/features/project/ProjectHome.vue', 'deleteImpactRows');
assertIncludes('src/renderer/src/features/project/ProjectHome.vue', "t('project.delete.summary'");
assertIncludes('src/renderer/src/features/project/ProjectHome.vue', "t('project.delete.dangerHint')");
assertNotIncludes('src/renderer/src/features/project/ProjectHome.vue', '<pre>{{ buildImpactText(deleteProjectImpact) }}</pre>');

assertIncludes('src/renderer/src/features/task-center/TaskCenter.vue', 'taskStatusSummary');
assertIncludes('src/renderer/src/features/task-center/TaskCenter.vue', 'failDetailTask');
assertIncludes('src/renderer/src/features/task-center/TaskCenter.vue', "t('taskCenter.statusSummary.label')");
assertIncludes('src/renderer/src/features/task-center/TaskCenter.vue', "t('taskCenter.failDetail.open')");
assertIncludes('src/renderer/src/features/task-center/TaskCenter.vue', 'navigator.clipboard.writeText');

assertIncludes('src/renderer/src/components/VtTable.vue', 'slot name="toolbar"');
assertIncludes('src/renderer/src/components/VtTable.vue', ':total-content="false"');
assertIncludes('src/renderer/src/components/VtTable.vue', ':height="height"');
assertIncludes('src/renderer/src/components/VtTable.vue', '.t-table--full-height');
assertIncludes('src/renderer/src/components/VtDialog.vue', 'max-height: calc(100dvh - 48px)');
assertIncludes('src/renderer/src/components/VtDialog.vue', 'max-height: calc(100dvh - 160px)');
assertIncludes('src/renderer/src/components/VtButton.vue', '<t-button');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', "import VtButton from '@renderer/components/VtButton.vue'");
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', '<VtButton');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', '<VtTable');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', '<VtDialog');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'sourceTableColumns');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'source-table-toolbar');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', '<template #toolbar>');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', ':disabled="selectedChapterIds.length === 0"');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'size="small"');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'handleChapterSelectChange');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', '<input type="checkbox" :checked="isCurrentPageAllSelected"');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', '<table class="source-table"');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', 'bordered');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', '<t-button');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', '<t-dialog');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', 'source-table-section');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', 'source-table-wrap');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', 'source-table-actions');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', 'isCurrentPageAllSelected');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', 'toggleCurrentPageSelection');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', 'clearChapterSelection');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', '#{{ chapter.chapterIndex }}');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'getChapterDisplayTitle');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'getChapterDisplayMeta');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'source.table.chapterTitleFormat');
assertIncludes('src/renderer/src/i18n/messages.ts', "chapterTitleFormat: '（#{index}）{title}'");
assertIncludes('src/renderer/src/i18n/messages.ts', "action: '提取事件'");
assertIncludes('src/renderer/src/i18n/messages.ts', "action: 'Extract Events'");
assertIncludes('src/renderer/src/styles/index.scss', '.source-table-toolbar');
assertNotIncludes('src/renderer/src/styles/index.scss', '.source-table-section');
assertNotIncludes('src/renderer/src/styles/index.scss', '.source-table-wrap');
assertNotIncludes('src/renderer/src/styles/index.scss', '.source-pagination');

assertIncludes('src/renderer/src/i18n/messages.ts', "summary: '将删除项目「{name}」'");
assertIncludes('src/renderer/src/i18n/messages.ts', "open: '查看原因'");
assertIncludes('src/renderer/src/i18n/messages.ts', 'Current page task status summary');
assertIncludes('src/renderer/src/i18n/messages.ts', 'Failure reason copied');

const verifyFile = read('scripts/verify.mjs');
if (!verifyFile.includes("'verify-opt-049-first-batch-ui.mjs'")) {
  throw new Error('scripts/verify.mjs should include verify-opt-049-first-batch-ui.mjs');
}

console.log('[verify-opt-049-first-batch-ui] passed');
