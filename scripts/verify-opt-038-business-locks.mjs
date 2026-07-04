import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing ${needle}`);
  }
}

function assertNotIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (content.includes(needle)) {
    throw new Error(`${relativePath} should not include legacy lock check: ${needle}`);
  }
}

assertIncludes('src/shared/types/business-lock.ts', 'BusinessLockSummary');
assertIncludes('src/shared/types/business-lock.ts', "'source_chapters'");
assertIncludes('src/shared/types/business-lock.ts', "'production_videos'");

assertIncludes('src/main/services/task/locks.ts', 'export function listBusinessLocks');
assertIncludes('src/main/services/task/locks.ts', 'export function assertNoBusinessLocks');
assertIncludes('src/main/services/task/locks.ts', 'TASK_STATUSES.RUNNING');
assertIncludes('src/main/services/task/locks.ts', 'SOURCE_EVENT_STATUSES.RUNNING');
assertIncludes('src/main/services/task/locks.ts', 'SCRIPT_EXTRACT_STATUSES.WAITING');
assertIncludes('src/main/services/task/locks.ts', 'GENERATION_TASK_STATUSES.RUNNING');
assertIncludes('src/main/services/task/index.ts', "from './locks'");

assertIncludes('src/shared/types/project.ts', 'runningLockCount: number;');
assertIncludes('src/shared/types/project.ts', 'runningLocks: BusinessLockSummary[];');
assertIncludes('src/main/services/project.ts', 'listBusinessLocks');
assertIncludes('src/main/services/project.ts', 'countRunningTaskRecords');
assertIncludes('src/main/services/project.ts', "assertNoBusinessLocks({ projectId: payload.projectId, action: '删除项目' })");
assertIncludes('src/renderer/src/features/project/ProjectHome.vue', 'project.delete.lockDetails');
assertIncludes('src/renderer/src/i18n/messages.ts', "lockDetails: '锁定明细'");

assertIncludes('src/shared/types/database-management.ts', 'runningLockCount: number;');
assertIncludes('src/shared/types/database-management.ts', 'runningLocks: BusinessLockSummary[];');
assertIncludes('src/main/services/settings/database-management.ts', 'assertNoBusinessLocks');
assertIncludes('src/main/services/settings/database-management.ts', 'listBusinessLocks');
assertIncludes('src/main/services/settings/database-management.ts', 'countBusinessLocks');
assertIncludes('src/renderer/src/features/settings/components/DatabaseManagement.vue', 'settings.databaseManagement.message.currentLocks');

assertNotIncludes('src/main/services/project.ts', "SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status = 'running'");
assertNotIncludes('src/main/services/settings/database-management.ts', "SELECT COUNT(*) as count FROM tasks WHERE status = 'running'");

console.log('[verify-opt-038] business locks are centralized');
