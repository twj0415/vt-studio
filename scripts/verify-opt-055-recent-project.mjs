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

assertIncludes('src/shared/types/project.ts', 'export type ProjectRouteName');
assertIncludes('src/shared/types/project.ts', 'export interface ProjectRestoreRecentResult');
assertIncludes('src/shared/types/project.ts', 'export interface ProjectUpdateRecentRoutePayload');
assertIncludes('src/shared/types/project.ts', 'export interface ProjectClearRecentResult');

assertIncludes('src/main/services/project.ts', "const RECENT_PROJECT_SETTING_KEY = 'recentProject.v1';");
assertIncludes('src/main/services/project.ts', 'function writeRecentProjectContext');
assertIncludes('src/main/services/project.ts', 'export function restoreRecentProject');
assertIncludes('src/main/services/project.ts', 'export function updateRecentProjectRoute');
assertIncludes('src/main/services/project.ts', 'export function clearRecentProject');
assertIncludes('src/main/services/project.ts', 'writeRecentProjectContext(project, targetRoute);');
assertIncludes('src/main/services/project.ts', 'clearRecentProject({ projectId: payload.projectId });');
assertIncludes('src/main/services/project.ts', 'ensureProjectWorkspaceReady(project);');

assertIncludes('src/main/ipc/project.ts', "handleIpc('project:recent:restore'");
assertIncludes('src/main/ipc/project.ts', "handleIpc('project:recent:update-route'");
assertIncludes('src/main/ipc/project.ts', "handleIpc('project:recent:clear'");
assertIncludes('src/shared/contracts/preload.ts', 'restoreRecent: () => Promise<VtResponse<ProjectRestoreRecentResult>>;');
assertIncludes('src/shared/contracts/preload.ts', 'updateRecentRoute: (payload: ProjectUpdateRecentRoutePayload)');
assertIncludes('src/preload/index.ts', "restoreRecent: () => ipcRenderer.invoke('project:recent:restore')");
assertIncludes('src/preload/index.ts', "updateRecentRoute: (payload) => ipcRenderer.invoke('project:recent:update-route', payload)");

assertIncludes('src/renderer/src/router/index.ts', 'let didTryInitialProjectRestore = false;');
assertIncludes('src/renderer/src/router/index.ts', 'window.vtStudio.project.restoreRecent()');
assertIncludes('src/renderer/src/router/index.ts', 'router.afterEach((to) => {');
assertIncludes('src/renderer/src/router/index.ts', 'window.vtStudio.project.updateRecentRoute({ projectId, routeName })');

assertNotIncludes('src/renderer/src/features/project/ProjectHome.vue', 'onMounted(() => {\n  appStore.clearCurrentProject();');
assertIncludes('docs/tasks/OPT-055-最近打开项目和项目上下文恢复.md', '# OPT-055 最近打开项目和项目上下文恢复');

console.log('[verify-opt-055-recent-project] passed');
