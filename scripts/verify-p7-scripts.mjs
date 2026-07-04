import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P7-剧本结果批.md', '状态：已完成'],
  ['docs/tasks/P7-剧本结果批.md', 'P7 剧本结果批已完成'],
  ['docs/tasks/P7-剧本结果批.md', 'F-005-001 到 F-005-008'],
  ['docs/tasks/F-005-001-新增剧本.md', '状态：已完成（由 P7 剧本结果批覆盖）'],
  ['docs/tasks/F-005-002-批量新增剧本.md', '状态：已完成（由 P7 剧本结果批覆盖）'],
  ['docs/tasks/F-005-003-编辑剧本.md', '状态：已完成（由 P7 剧本结果批覆盖）'],
  ['docs/tasks/F-005-004-删除批量删除剧本.md', '状态：已完成（由 P7 剧本结果批覆盖）'],
  ['docs/tasks/F-005-005-搜索剧本.md', '状态：已完成（由 P7 剧本结果批覆盖）'],
  ['docs/tasks/F-005-006-导出剧本zip.md', '状态：已完成（由 P7 剧本结果批覆盖）'],
  ['docs/tasks/F-005-007-从剧本提取资产.md', '状态：已完成（由 P7 剧本结果批覆盖）'],
  ['docs/tasks/F-005-008-资产提取状态轮询.md', '状态：已完成（由 P7 剧本结果批覆盖）'],
  ['docs/03-执行进度.md', 'P7 | F-005-001 到 F-005-008 | 已完成'],
  ['docs/03-执行进度.md', 'P8 资产和角景音频批'],
  ['docs/04-对齐验收与偏差记录.md', 'P7 剧本结果批'],
  ['docs/04-对齐验收与偏差记录.md', 'P7 剧本结果批六条偏差记录'],
  ['src/shared/constants/dictionaries.ts', 'SCRIPT_EXTRACT_STATUSES'],
  ['src/shared/constants/dictionaries.ts', "WAITING: 'waiting'"],
  ['src/shared/types/script-agent.ts', 'SCRIPT_EXTRACT_STATUS = SCRIPT_EXTRACT_STATUSES'],
  ['src/shared/types/script.ts', 'export interface ScriptItem'],
  ['src/shared/types/script.ts', 'export interface ScriptAssetItem'],
  ['src/shared/contracts/preload.ts', 'script: {'],
  ['src/shared/contracts/preload.ts', 'pollExtractStatus: (payload: ScriptPollExtractStatusPayload)'],
  ['src/preload/index.ts', "ipcRenderer.invoke('script:extract-assets'"],
  ['src/preload/index.ts', "ipcRenderer.invoke('script:poll-extract-status'"],
  ['src/main/ipc/index.ts', 'registerScriptIpc()'],
  ['src/main/ipc/script.ts', "handleIpc('script:list'"],
  ['src/main/ipc/script.ts', "handleIpc('script:extract-assets'"],
  ['src/main/services/database/migrations.ts', 'scriptMigrations'],
  ['src/main/services/script/migrations.ts', 'CREATE TABLE IF NOT EXISTS assets'],
  ['src/main/services/script/migrations.ts', 'CREATE TABLE IF NOT EXISTS script_asset_links'],
  ['src/main/services/script/zip.ts', 'createStoredZip'],
  ['src/main/services/script/service.ts', 'export function listScripts'],
  ['src/main/services/script/service.ts', 'export function saveScript'],
  ['src/main/services/script/service.ts', 'export function batchCreateScripts'],
  ['src/main/services/script/service.ts', 'export async function exportScriptsZip'],
  ['src/main/services/script/service.ts', 'export function extractScriptAssets'],
  ['src/main/services/script/service.ts', 'export function pollScriptExtractStatus'],
  ['src/main/services/script/service.ts', 'export function recoverScriptExtractStatus'],
  ['src/main/services/script/service.ts', 'SCRIPT_ASSET_EXTRACTION_TASK_CATEGORY'],
  ['src/main/services/script/service.ts', 'existingAssetRefs'],
  ['src/main/services/script/service.ts', 'normalizeAssetScriptIds'],
  ['src/main/index.ts', 'recoverScriptExtractStatus()'],
  ['src/main/services/project.ts', 'script_asset_links'],
  ['src/main/services/project.ts', 'DELETE FROM assets'],
  ['src/renderer/src/features/script/ScriptHome.vue', 'window.vtStudio.script.list'],
  ['src/renderer/src/features/script/ScriptHome.vue', 'window.vtStudio.script.save'],
  ['src/renderer/src/features/script/ScriptHome.vue', 'window.vtStudio.script.batchCreate'],
  ['src/renderer/src/features/script/ScriptHome.vue', 'window.vtStudio.script.exportZip'],
  ['src/renderer/src/features/script/ScriptHome.vue', 'window.vtStudio.script.extractAssets'],
  ['src/renderer/src/features/script/ScriptHome.vue', 'window.vtStudio.script.pollExtractStatus'],
  ['src/renderer/src/features/script/ScriptHome.vue', 'DecompressionStream'],
  ['src/renderer/src/i18n/messages.ts', "script: {"],
  ['src/renderer/src/i18n/messages.ts', '资产提取已开始'],
  ['src/renderer/src/i18n/messages.ts', 'Asset extraction started'],
  ['src/renderer/src/styles/index.scss', '.script-page'],
  ['src/renderer/src/styles/index.scss', '.script-result-card'],
  ['src/renderer/src/styles/index.scss', '.script-detail-content'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P7 scripts verification passed');
