import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P3-项目管理批.md', '删除项目时是否默认同步删除本地项目业务文件'],
  ['src/shared/types/project.ts', 'ProjectPageStateResult'],
  ['src/main/services/project/migrations.ts', 'CREATE TABLE IF NOT EXISTS projects'],
  ['src/main/services/project.ts', 'export function createProject'],
  ['src/main/services/project.ts', 'export function openProject'],
  ['src/main/services/project.ts', 'export function saveProjectManual'],
  ['src/main/ipc/project.ts', 'project:get-page-state'],
  ['src/main/ipc/project.ts', 'project:manual:save'],
  ['src/main/ipc/index.ts', 'registerProjectIpc'],
  ['src/shared/contracts/preload.ts', 'project: {'],
  ['src/preload/index.ts', 'project:get-page-state'],
  ['src/renderer/src/features/project/ProjectHome.vue', 'ProjectFormDialog'],
  ['src/renderer/src/features/project/ProjectHome.vue', 'ManualFormDialog'],
  ['src/renderer/src/features/project/components/ProjectFormDialog.vue', "t('project.form.videoMode')"],
  ['src/renderer/src/features/project/components/ManualFormDialog.vue', 'manual-cover-upload'],
  ['src/renderer/src/styles/index.scss', '.project-card-grid'],
  ['src/shared/types/media.ts', "'skills'"],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P3 project verification passed');
