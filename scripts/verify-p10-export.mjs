import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P10-导出批次.md', '剪映导出第一版只读取 P9 视频轨道 selectedVideoId'],
  ['docs/tasks/P10-导出批次.md', '当前没有真实 Jianying Draft Exporter/schema'],
  ['docs/tasks/P10-导出批次.md', 'window.vtStudio.export.createJianyingDraft(payload)'],
  ['docs/tasks/P10-导出批次.md', '校验失败不允许强制导出'],
  ['src/shared/types/export.ts', 'export interface ExportTimelineClip'],
  ['src/shared/types/export.ts', 'selectedVideoId: number;'],
  ['src/shared/types/export.ts', 'export interface ExportValidationFailure'],
  ['src/shared/types/export.ts', 'export interface ExportCreateJianyingDraftResult'],
  ['src/main/services/export/index.ts', 'function buildTimelineFromDatabase'],
  ['src/main/services/export/index.ts', 'selected_video_id'],
  ['src/main/services/export/index.ts', 'readSelectedVideo(project.id, script.id, track.id, track.selected_video_id)'],
  ['src/main/services/export/index.ts', 'validateTimeline(timeline)'],
  ['src/main/services/export/index.ts', 'copyDraftAssets'],
  ['src/main/services/export/index.ts', 'createTask({'],
  ['src/main/services/export/index.ts', 'succeedTask(task.taskId)'],
  ['src/main/services/export/index.ts', 'failTask(task.taskId'],
  ['src/main/services/export/index.ts', 'native_jianying_schema_verified: false'],
  ['src/main/ipc/export.ts', "handleIpc('export:jianying:create-draft'"],
  ['src/main/ipc/index.ts', 'registerExportIpc()'],
  ['src/shared/contracts/preload.ts', 'export: {'],
  ['src/shared/contracts/preload.ts', 'createJianyingDraft: (payload: ExportCreateJianyingDraftPayload)'],
  ['src/preload/index.ts', "ipcRenderer.invoke('export:jianying:create-draft'"],
  ['src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'window.vtStudio.export.storyboardImages'],
  ['src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'window.vtStudio.export.createJianyingDraft'],
  ['src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'exportJianyingDraft'],
  ['src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'production-workbench-export-failures'],
  ['src/renderer/src/i18n/messages.ts', "exportJianyingDraft: '导出剪映草稿'"],
  ['src/renderer/src/i18n/messages.ts', 'exportFailureReason'],
  ['src/renderer/src/styles/index.scss', '.production-workbench-export-failures'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

const exportService = readFileSync(join(workspaceRoot, 'src/main/services/export/index.ts'), 'utf-8');
if (exportService.includes('videos[0]') || exportService.includes('track.videos[0]')) {
  throw new Error('P10 导出不能随机或默认取第一个视频候选');
}

console.log('P10 export verification passed');
