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

assertIncludes('src/shared/types/project.ts', 'export interface ProjectFlowStatsPayload');
assertIncludes('src/shared/types/project.ts', 'export interface ProjectFlowStatsResult');
assertIncludes('src/shared/types/project.ts', 'sourceChapterCount: number;');
assertIncludes('src/shared/types/project.ts', 'selectedVideoTrackCount: number;');
assertIncludes('src/shared/types/project.ts', 'failedTaskCount: number;');

assertIncludes('src/main/services/project.ts', 'export function getProjectFlowStats');
assertIncludes('src/main/services/project.ts', "countRows('source_chapters'");
assertIncludes('src/main/services/project.ts', "countRows('scripts'");
assertIncludes('src/main/services/project.ts', "countRows('assets'");
assertIncludes('src/main/services/project.ts', "countRows('production_storyboards'");
assertIncludes('src/main/services/project.ts', "countRows('production_video_tracks'");
assertIncludes('src/main/services/project.ts', "countRows('production_videos'");
assertIncludes('src/main/services/project.ts', "countRows('tasks'");
assertIncludes('src/main/services/project.ts', 'countAudioLinks(projectId)');

assertIncludes('src/main/ipc/project.ts', "handleIpc('project:get-flow-stats'");
assertIncludes('src/shared/contracts/preload.ts', 'getFlowStats: (payload: ProjectFlowStatsPayload)');
assertIncludes('src/preload/index.ts', "getFlowStats: (payload) => ipcRenderer.invoke('project:get-flow-stats', payload)");

const overviewFile = 'src/renderer/src/features/project-overview/ProjectOverviewHome.vue';
assertIncludes(overviewFile, 'window.vtStudio.project.getFlowStats');
assertIncludes(overviewFile, 'function resolveStepStatus');
assertIncludes(overviewFile, "type FlowStatus = 'done' | 'pending' | 'blocked' | 'skipped' | 'running' | 'failed';");
assertIncludes(overviewFile, "t('projectOverview.refreshStats')");
assertIncludes(overviewFile, 'metricParams(step.key)');
assertNotIncludes(overviewFile, /[\p{Script=Han}]/u);
assertNotIncludes(overviewFile, /getDatabase|better-sqlite3|sqlite/i);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
assertIncludes(messagesFile, "refreshStats: '刷新统计'");
assertIncludes(messagesFile, "refreshStats: 'Refresh Stats'");
assertIncludes(messagesFile, "running: '进行中'");
assertIncludes(messagesFile, "running: 'Running'");
assertIncludes(messagesFile, '章节 {chapters} 个');
assertIncludes(messagesFile, 'Chapters {chapters}');

assertIncludes('docs/tasks/OPT-051-项目流程总览和流程驱动交互.md', '第三批');
assertIncludes('docs/TODO-优化与缺口.md', '`OPT-051` 项目流程总览和流程驱动交互');

console.log('[verify-opt-051-flow-stats] passed');
