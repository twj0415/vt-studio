import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P8-资产和角景音频批.md', '状态：已完成'],
  ['docs/tasks/P8-资产和角景音频批.md', 'P8 资产和角景音频批已完成'],
  ['docs/tasks/P8-资产和角景音频批.md', 'F-006-001 到 F-006-010，F-007-001 到 F-007-005'],
  ['docs/tasks/F-006-001-角色管理.md', '状态：已完成（由 P8 资产和角景音频批覆盖）'],
  ['docs/tasks/F-006-010-取消生成.md', '状态：已完成（由 P8 资产和角景音频批覆盖）'],
  ['docs/tasks/F-007-001-角色场景音频资产列表.md', '状态：已完成（由 P8 资产和角景音频批覆盖）'],
  ['docs/tasks/F-007-005-角景页复用资产提示词和图片生成.md', '状态：已完成（由 P8 资产和角景音频批覆盖）'],
  ['docs/03-执行进度.md', 'P8 | F-006-001 到 F-006-010，F-007-001 到 F-007-005 | 已完成'],
  ['docs/03-执行进度.md', 'P9 生产工作台批已完成'],
  ['docs/04-对齐验收与偏差记录.md', 'P8 资产和角景音频批'],
  ['docs/04-对齐验收与偏差记录.md', 'P8 资产和角景音频批七条偏差记录'],
  ['src/shared/types/assets.ts', 'export const ASSET_TYPES'],
  ['src/shared/types/assets.ts', 'export interface CornerAssetListResult'],
  ['src/main/services/database/migrations.ts', 'assetMigrations'],
  ['src/main/services/assets/migrations.ts', 'CREATE TABLE IF NOT EXISTS asset_media'],
  ['src/main/services/assets/migrations.ts', 'CREATE TABLE IF NOT EXISTS asset_audio_links'],
  ['src/main/services/assets/service.ts', 'export function listAssets'],
  ['src/main/services/assets/service.ts', 'export function batchGenerateAssetPrompts'],
  ['src/main/services/assets/service.ts', 'export function batchGenerateAssetImages'],
  ['src/main/services/assets/service.ts', 'export function listCornerAssets'],
  ['src/main/services/assets/service.ts', 'export function batchBindAssetAudio'],
  ['src/main/services/assets/service.ts', 'recoverAssetTaskStatus'],
  ['src/main/services/script/service.ts', "AND type IN ('role', 'scene', 'tool')"],
  ['src/main/ipc/index.ts', 'registerAssetsIpc()'],
  ['src/main/ipc/assets.ts', "handleIpc('assets:list'"],
  ['src/main/ipc/assets.ts', "handleIpc('corner-scape:list'"],
  ['src/shared/contracts/preload.ts', 'assets: {'],
  ['src/shared/contracts/preload.ts', 'cornerScape: {'],
  ['src/preload/index.ts', "ipcRenderer.invoke('assets:list'"],
  ['src/preload/index.ts', "ipcRenderer.invoke('corner-scape:list'"],
  ['src/main/index.ts', 'recoverAssetTaskStatus()'],
  ['src/main/services/project.ts', 'asset_audio_links'],
  ['src/main/services/project.ts', 'asset_media'],
  ['src/renderer/src/features/assets/AssetsHome.vue', 'window.vtStudio.assets.list'],
  ['src/renderer/src/features/assets/AssetsHome.vue', 'window.vtStudio.assets.batchGenerateImages'],
  ['src/renderer/src/features/corner-scape/CornerScapeHome.vue', 'window.vtStudio.cornerScape.list'],
  ['src/renderer/src/features/corner-scape/CornerScapeHome.vue', 'window.vtStudio.cornerScape.batchBindAudio'],
  ['src/renderer/src/i18n/messages.ts', "assets: {"],
  ['src/renderer/src/i18n/messages.ts', "cornerScape: {"],
  ['src/renderer/src/styles/index.scss', '.assets-page'],
  ['src/renderer/src/styles/index.scss', '.corner-page'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P8 assets and corner verification passed');
