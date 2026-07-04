import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P4-任务中心批.md', '不新增 pending 状态'],
  ['src/shared/types/task.ts', 'TaskListItem'],
  ['src/shared/types/task.ts', 'TaskProjectOptionsResult'],
  ['src/main/services/task/service.ts', 'getTaskProjectOptions'],
  ['src/main/services/task/service.ts', 'LEFT JOIN projects p ON p.id = t.project_id'],
  ['src/main/services/task/service.ts', 'p.name AS project_name'],
  ['src/main/services/task/service.ts', 'sanitizeSensitiveText'],
  ['src/main/ipc/task.ts', 'task:list'],
  ['src/main/ipc/index.ts', 'registerTaskIpc'],
  ['src/shared/contracts/preload.ts', 'task: {'],
  ['src/preload/index.ts', 'task:project-options'],
  ['src/renderer/src/features/task-center/TaskCenter.vue', 'window.vtStudio.task.list'],
  ['src/renderer/src/features/task-center/TaskCenter.vue', 'handleProjectChange'],
  ['src/renderer/src/features/task-center/TaskCenter.vue', 'getFailReason'],
  ['src/renderer/src/i18n/messages.ts', 'taskCenter'],
  ['src/renderer/src/styles/index.scss', '.task-table-wrap'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P4 task center verification passed');
