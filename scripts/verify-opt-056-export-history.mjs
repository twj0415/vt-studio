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
  ['src/main/services/export/migrations.ts', 'CREATE TABLE IF NOT EXISTS export_history'],
  ['src/main/services/database/migrations.ts', 'exportMigrations'],
  ['src/shared/types/export.ts', 'export interface ExportHistoryItem'],
  ['src/shared/types/export.ts', 'export interface ExportHistoryDetail'],
  ['src/shared/types/export.ts', 'export interface ExportMediaSnapshotItem'],
  ['src/main/services/export/index.ts', 'function createExportHistory'],
  ['src/main/services/export/index.ts', 'function updateExportHistory'],
  ['src/main/services/export/index.ts', 'function buildMediaSnapshot'],
  ['src/main/services/export/index.ts', 'function hashFileMd5'],
  ['src/main/services/export/index.ts', 'export function listExportHistory'],
  ['src/main/services/export/index.ts', 'export function getExportHistoryDetail'],
  ['src/main/services/export/index.ts', 'createExportHistory({'],
  ['src/main/services/export/index.ts', 'status: EXPORT_DRAFT_STATUS.SUCCEEDED'],
  ['src/main/services/export/index.ts', 'status: EXPORT_DRAFT_STATUS.FAILED'],
  ['src/main/ipc/export.ts', "handleIpc('export:history:list'"],
  ['src/main/ipc/export.ts', "handleIpc('export:history:detail'"],
  ['src/shared/contracts/preload.ts', 'listHistory: (payload: ExportHistoryListPayload)'],
  ['src/shared/contracts/preload.ts', 'getHistoryDetail: (payload: ExportHistoryDetailPayload)'],
  ['src/preload/index.ts', "ipcRenderer.invoke('export:history:list'"],
  ['src/preload/index.ts', "ipcRenderer.invoke('export:history:detail'"],
  ['src/renderer/src/features/export/ExportHome.vue', 'window.vtStudio.export.listHistory'],
  ['src/renderer/src/features/export/ExportHome.vue', 'window.vtStudio.export.getHistoryDetail'],
  ['src/renderer/src/features/export/ExportHome.vue', 'historyTitle'],
  ['src/renderer/src/i18n/messages.ts', 'historyTitle'],
  ['src/renderer/src/i18n/messages.ts', 'historyStatus'],
  ['docs/tasks/OPT-056-导出历史和可复现记录.md', '## 通俗总结'],
  ['docs/TODO-优化与缺口.md', '### 【√】OPT-056 导出历史和可复现记录'],
  ['docs/03-执行进度.md', 'OPT-056 导出历史和可复现记录已完成'],
];

for (const [relativePath, needle] of checks) {
  assertIncludes(relativePath, needle);
}

const exportService = read('src/main/services/export/index.ts');
if (exportService.includes('apiKey') || exportService.includes('authorization')) {
  throw new Error('导出历史服务不能写入 API Key 或 authorization 字段');
}

console.log('OPT-056 export history verification passed');
