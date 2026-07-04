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

const staticChecks = [
  ['docs/tasks/F-002-011-文件管理.md', '只允许打开白名单 key，不接受任意 path'],
  ['src/main/ipc/settings.ts', 'settings:files:list-openable-dirs'],
  ['src/main/ipc/settings.ts', 'settings:files:open-dir'],
  ['src/main/ipc/settings.ts', 'settings:files:diagnose-lifecycle'],
  ['src/main/ipc/settings.ts', 'settings:files:cleanup-lifecycle'],
  ['src/preload/index.ts', 'settings:files:open-dir'],
  ['src/preload/index.ts', 'settings:files:diagnose-lifecycle'],
  ['src/preload/index.ts', 'settings:files:cleanup-lifecycle'],
  ['src/shared/contracts/preload.ts', 'files: {'],
  ['src/shared/contracts/preload.ts', 'diagnoseLifecycle: ()'],
  ['src/shared/contracts/preload.ts', 'cleanupLifecycle: (payload: FileLifecycleCleanupPayload)'],
  ['src/renderer/src/features/settings/SettingsHome.vue', '<FileManagement'],
  ['src/renderer/src/features/settings/components/FileManagement.vue', "t('files.hint')"],
  ['src/renderer/src/features/settings/components/FileManagement.vue', 'diagnoseLifecycle'],
  ['src/renderer/src/features/settings/components/FileManagement.vue', 'cleanupLifecycle'],
  ['src/main/services/settings/file-management.ts', 'shell.openPath'],
  ['src/main/services/settings/file-management.ts', 'VT_STATUS.INVALID_PARAMS'],
  ['src/main/services/settings/file-management.ts', 'ensureDirectoryReady'],
  ['src/main/services/settings/file-management.ts', 'diagnoseManagedFiles'],
  ['src/main/services/settings/file-management.ts', 'cleanupManagedFiles'],
];

for (const [relativePath, needle] of staticChecks) {
  assertIncludes(relativePath, needle);
}

const service = read('src/main/services/settings/file-management.ts');
const expectedKeys = ['projects', 'exports', 'logs', 'cache', 'temp', 'models', 'modelPrompt', 'skills', 'assets'];

for (const key of expectedKeys) {
  if (!service.includes(`key: '${key}'`)) {
    throw new Error(`文件管理白名单缺少目录 key: ${key}`);
  }
}

for (const forbiddenKey of ['vendors', 'database']) {
  if (service.includes(`key: '${forbiddenKey}'`)) {
    throw new Error(`文件管理不应暴露危险目录 key: ${forbiddenKey}`);
  }
}

if (!service.includes('const normalizedKey = key.trim()')) {
  throw new Error('文件管理必须归一化目录 key');
}

if (!service.includes('throw createError(VT_STATUS.INVALID_PARAMS')) {
  throw new Error('非法目录 key 必须抛 INVALID_PARAMS');
}

if (!service.includes('ensureDirectory(directoryPath)')) {
  throw new Error('缺失目录必须能自动创建');
}

console.log('F-002-011 file management verification passed');
