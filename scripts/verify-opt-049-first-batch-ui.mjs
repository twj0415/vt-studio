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

assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'selectedCountText');
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', "t('source.selection.hint')");
assertIncludes('src/renderer/src/features/novel/NovelHome.vue', '<t-checkbox :checked="isCurrentPageAllSelected"');
assertNotIncludes('src/renderer/src/features/novel/NovelHome.vue', '<input type="checkbox" :checked="isCurrentPageAllSelected"');

assertIncludes('src/renderer/src/i18n/messages.ts', "summary: '将删除项目「{name}」'");
assertIncludes('src/renderer/src/i18n/messages.ts', "open: '查看原因'");
assertIncludes('src/renderer/src/i18n/messages.ts', "count: '已选择 {count} 个章节'");
assertIncludes('src/renderer/src/i18n/messages.ts', 'Current page task status summary');
assertIncludes('src/renderer/src/i18n/messages.ts', 'Failure reason copied');
assertIncludes('src/renderer/src/i18n/messages.ts', '{count} chapters selected');

assertIncludes('docs/tasks/OPT-049-全页面交互UI整改清单.md', '第一批只改项目页、任务中心、原文页');

const verifyFile = read('scripts/verify.mjs');
if (!verifyFile.includes("'verify-opt-049-first-batch-ui.mjs'")) {
  throw new Error('scripts/verify.mjs should include verify-opt-049-first-batch-ui.mjs');
}

console.log('[verify-opt-049-first-batch-ui] passed');
