import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

const checks = [
  ['src/shared/types/project.ts', 'export interface ProjectExportPackagePayload'],
  ['src/shared/types/project.ts', 'export interface ProjectImportPackagePayload'],
  ['src/shared/types/project.ts', 'export interface ProjectPackageSummary'],
  ['src/main/services/project.ts', 'const PROJECT_PACKAGE_VERSION = 1'],
  ['src/main/services/project.ts', 'readPackageProjectRows'],
  ['src/main/services/project.ts', 'validateProjectPackageFiles'],
  ['src/main/services/project.ts', 'export function exportProjectPackage'],
  ['src/main/services/project.ts', 'export function importProjectPackage'],
  ['src/main/services/project.ts', 'export async function openProjectPackageDirectory'],
  ['src/main/services/project.ts', 'assertNoBusinessLocks({ projectId, action: \'导出项目包\' })'],
  ['src/main/services/project.ts', 'assertNoBusinessLocks({ action: \'导入项目包\' })'],
  ['src/main/services/project.ts', 'PROJECT_PACKAGE_EXCLUDED'],
  ['src/main/services/project.ts', 'remapProjectRelativePath'],
  ['src/main/ipc/project.ts', "handleIpc('project:package:export'"],
  ['src/main/ipc/project.ts', "handleIpc('project:package:import'"],
  ['src/main/ipc/project.ts', "handleIpc('project:package:open-directory'"],
  ['src/shared/contracts/preload.ts', 'exportPackage: (payload: ProjectExportPackagePayload)'],
  ['src/shared/contracts/preload.ts', 'importPackage: (payload: ProjectImportPackagePayload)'],
  ['src/shared/contracts/preload.ts', 'openPackageDirectory: (payload: ProjectOpenPackagePayload)'],
  ['src/preload/index.ts', "ipcRenderer.invoke('project:package:export'"],
  ['src/preload/index.ts', "ipcRenderer.invoke('project:package:import'"],
  ['src/preload/index.ts', "ipcRenderer.invoke('project:package:open-directory'"],
  ['src/renderer/src/features/project/ProjectHome.vue', 'window.vtStudio.project.exportPackage'],
  ['src/renderer/src/features/project/ProjectHome.vue', 'window.vtStudio.project.importPackage'],
  ['src/renderer/src/features/project/ProjectHome.vue', 'project.package.exportAction'],
  ['src/renderer/src/i18n/messages.ts', 'exportAction'],
  ['src/renderer/src/i18n/messages.ts', 'Import Package'],
  ['docs/tasks/OPT-037-项目整体导入导出包规范.md', '## 通俗总结'],
  ['docs/TODO-优化与缺口.md', '### 【√】OPT-037 项目整体导入导出包规范'],
  ['docs/03-执行进度.md', 'OPT-037 项目整体导入导出包规范已完成'],
];

for (const [relativePath, needle] of checks) {
  assertIncludes(relativePath, needle);
}

const service = read('src/main/services/project.ts');
for (const forbidden of ['apiKey', 'authorization', 'accessToken']) {
  if (service.includes(forbidden)) {
    throw new Error(`项目包服务不能导出敏感字段：${forbidden}`);
  }
}

console.log('OPT-037 project package verification passed');
