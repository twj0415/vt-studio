import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
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
  ['src/renderer/src/features/novel/NovelHome.vue', '<VtTable'],
  ['src/renderer/src/features/novel/NovelHome.vue', '<VtDialog'],
  ['src/renderer/src/i18n/messages.ts', 'source'],
  ['src/renderer/src/styles/index.scss', '.source-table-toolbar'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P5 source verification passed');
