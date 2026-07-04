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

function assertNotIncludes(relativePath, pattern) {
  const content = read(relativePath);
  if (pattern.test(content)) {
    throw new Error(`${relativePath} should not match ${pattern}`);
  }
}

assertIncludes('src/shared/types/project.ts', 'export interface ProjectFlowFailedTaskSummary');
assertIncludes('src/shared/types/project.ts', 'failedTaskSummaries: ProjectFlowFailedTaskSummary[];');

assertIncludes('src/main/services/project.ts', 'function listProjectFailedTaskSummaries');
assertIncludes('src/main/services/project.ts', 'sanitizeSensitiveText(row.error_reason)');
assertIncludes('src/main/services/project.ts', 'failedTaskSummaries: listProjectFailedTaskSummaries(projectId)');
assertIncludes('src/main/services/project.ts', 'ORDER BY updated_at DESC, id DESC');

const overviewFile = 'src/renderer/src/features/project-overview/ProjectOverviewHome.vue';
assertIncludes(overviewFile, 'const failedTaskSummaries = computed(() => stats.value.failedTaskSummaries);');
assertIncludes(overviewFile, "name: 'tasks'");
assertIncludes(overviewFile, "status: 'failed'");
assertIncludes(overviewFile, "t('projectOverview.failedTasks.openTaskCenter')");
assertIncludes(overviewFile, 'failedTaskSummaries.length > 0');
assertNotIncludes(overviewFile, /[\p{Script=Han}]/u);

const taskCenterFile = 'src/renderer/src/features/task-center/TaskCenter.vue';
assertIncludes(taskCenterFile, "import { useRoute } from 'vue-router';");
assertIncludes(taskCenterFile, 'function applyRouteQueryFilters');
assertIncludes(taskCenterFile, 'route.query.projectId');
assertIncludes(taskCenterFile, 'route.query.status');
assertIncludes(taskCenterFile, 'watch(');

const messagesFile = 'src/renderer/src/i18n/messages.ts';
assertIncludes(messagesFile, "failedTasks: {");
assertIncludes(messagesFile, "openTaskCenter: '查看失败任务'");
assertIncludes(messagesFile, "openTaskCenter: 'View Failed Tasks'");

assertIncludes('docs/tasks/OPT-051-项目流程总览和流程驱动交互.md', '第四批');
assertIncludes('docs/TODO-优化与缺口.md', '第四批记录');
assertIncludes('docs/04-对齐验收与偏差记录.md', 'OPT-051');

console.log('[verify-opt-051-task-failure-link] passed');
