import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing: ${needle}`);
  }
}

const checks = [
  ['src/shared/types/file-management.ts', "export type FileLifecycleIssueType = 'missingReference' | 'orphanProjectFile' | 'cacheFile' | 'tempFile';"],
  ['src/shared/types/file-management.ts', 'export interface FileLifecycleDiagnoseResult'],
  ['src/shared/types/file-management.ts', 'export interface FileLifecycleCleanupPayload'],
  ['src/main/services/media/lifecycle.ts', 'export function diagnoseFileLifecycle'],
  ['src/main/services/media/lifecycle.ts', 'export function cleanupFileLifecycle'],
  ['src/main/services/media/lifecycle.ts', 'readReferencedMedia'],
  ['src/main/services/media/lifecycle.ts', 'production_storyboards'],
  ['src/main/services/media/lifecycle.ts', 'production_videos'],
  ['src/main/services/settings/file-management.ts', 'diagnoseManagedFiles'],
  ['src/main/services/settings/file-management.ts', 'cleanupManagedFiles'],
  ['src/main/ipc/settings.ts', "settings:files:diagnose-lifecycle"],
  ['src/main/ipc/settings.ts', "settings:files:cleanup-lifecycle"],
  ['src/shared/contracts/preload.ts', 'diagnoseLifecycle: ()'],
  ['src/shared/contracts/preload.ts', 'cleanupLifecycle: (payload: FileLifecycleCleanupPayload)'],
  ['src/preload/index.ts', "settings:files:diagnose-lifecycle"],
  ['src/preload/index.ts', "settings:files:cleanup-lifecycle"],
  ['src/renderer/src/features/settings/components/FileManagement.vue', 'files.lifecycle.title'],
  ['src/renderer/src/features/settings/components/FileManagement.vue', 'cleanupLifecycle'],
  ['src/renderer/src/features/settings/components/FileManagement.vue', 'includeOrphans'],
  ['src/renderer/src/i18n/messages.ts', "title: '素材生命周期'"],
  ['src/renderer/src/i18n/messages.ts', "title: 'Media Lifecycle'"],

  ['src/shared/types/export.ts', 'export interface ExportTimelineClip'],
  ['src/shared/types/export.ts', 'storyboardIds: number[];'],
  ['src/shared/types/export.ts', "export const EXPORT_TIMELINE_SOURCES = ['productionVideoTracks']"],
  ['src/main/services/export/index.ts', 'const JIANYING_ROOT ='],
  ['src/main/services/export/index.ts', 'vt_timeline.json'],
  ['src/main/services/export/index.ts', 'draft_meta_info.json'],
  ['src/main/services/export/index.ts', 'draft_content.json'],
  ['src/main/services/export/index.ts', 'export_summary.json'],
  ['src/main/services/export/index.ts', 'copyDraftAssets'],
  ['src/main/services/export/index.ts', 'validateTimeline'],
  ['src/main/services/export/index.ts', 'buildDraftContent'],
  ['src/main/services/production/service.ts', 'createAutoTrackReferences'],
  ['src/main/services/production/service.ts', 'referenceItemFromRelativePath'],
  ['src/main/services/production/service.ts', 'saveGeneratedProductionMedia'],

  ['docs/tasks/OPT-BATCH-002-素材生命周期和导出结构治理.md', 'OPT-036 / OPT-020 / OPT-021'],
  ['docs/TODO-优化与缺口.md', '### 【√】OPT-036 资产文件生命周期和孤儿文件清理'],
  ['docs/TODO-优化与缺口.md', '### 【√】OPT-020 图片生成到视频生成的素材规范'],
  ['docs/TODO-优化与缺口.md', '### 【√】OPT-021 导出结构提前定死'],
];

for (const [relativePath, needle] of checks) {
  assertIncludes(relativePath, needle);
}

console.log('OPT-036/020/021 media and export foundation verification passed');
