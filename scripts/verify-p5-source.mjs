import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P5-原文输入批.md', '第一版以章节级事件摘要为准'],
  ['docs/tasks/P5-原文输入批.md', '事件分析进入任务中心'],
  ['src/shared/types/source.ts', 'SOURCE_EVENT_STATUS'],
  ['src/shared/types/source.ts', 'SourceGenerateEventsPayload'],
  ['src/main/services/source/migrations.ts', 'CREATE TABLE IF NOT EXISTS source_chapters'],
  ['src/main/services/source/service.ts', 'importSourceChapters'],
  ['src/main/services/source/service.ts', 'generateSourceEvents'],
  ['src/main/services/source/service.ts', 'recoverRunningSourceEvents'],
  ['src/main/services/source/service.ts', 'createTask'],
  ['src/main/services/database/migrations.ts', 'sourceMigrations'],
  ['src/main/index.ts', 'recoverRunningSourceEvents'],
  ['src/main/ipc/source.ts', 'source:generate-events'],
  ['src/main/ipc/index.ts', 'registerSourceIpc'],
  ['src/shared/contracts/preload.ts', 'source: {'],
  ['src/preload/index.ts', 'source:poll-event-status'],
  ['src/renderer/src/features/novel/NovelHome.vue', 'window.vtStudio.source.import'],
  ['src/renderer/src/features/novel/NovelHome.vue', 'pollEventStatus'],
  ['src/renderer/src/features/novel/NovelHome.vue', 'readDocxFile'],
  ['src/renderer/src/i18n/messages.ts', 'source'],
  ['src/renderer/src/styles/index.scss', '.source-table-wrap'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P5 source verification passed');
