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

function assertCount(relativePath, needle, expected) {
  const content = read(relativePath);
  const actual = content.split(needle).length - 1;
  if (actual !== expected) {
    throw new Error(`${relativePath} expected ${expected} occurrence(s) of ${needle}, got ${actual}`);
  }
}

const checks = [
  ['src/main/services/generation/snapshot.ts', 'export function createGenerationSnapshot'],
  ['src/main/services/generation/snapshot.ts', 'export function createPromptTemplateSnapshot'],
  ['src/main/services/generation/snapshot.ts', 'toManualPromptContentSnapshot'],
  ['src/main/services/model/types.ts', 'requestId?: string;'],
  ['src/main/services/model/text.ts', 'requestId, ...rest'],
  ['src/main/services/model/media.ts', 'const { task: _task, requestId: _requestId, ...runtimeInput } = input;'],
  ['src/main/services/model/media.ts', 'input.requestId'],
  ['src/main/services/model/index.ts', 'createModelRequestId'],
  ['src/main/services/assets/service.ts', 'generationSnapshot'],
  ['src/main/services/assets/service.ts', "source: 'asset.image'"],
  ['src/main/services/assets/service.ts', 'finalPrompt'],
  ['src/main/services/production/migrations.ts', '0016_add_production_generation_metadata'],
  ['src/main/services/production/migrations.ts', 'production_storyboards ADD COLUMN generation_metadata'],
  ['src/main/services/production/migrations.ts', 'production_video_tracks ADD COLUMN generation_metadata'],
  ['src/main/services/production/migrations.ts', 'production_videos ADD COLUMN generation_metadata'],
  ['src/main/services/production/service.ts', "source: 'production.storyboardImage'"],
  ['src/main/services/production/service.ts', "source: 'production.derivedAssetImage'"],
  ['src/main/services/production/service.ts', "source: 'production.videoPrompt'"],
  ['src/main/services/production/service.ts', "source: 'production.video'"],
  ['src/main/services/production/service.ts', 'promptTemplate'],
  ['src/main/services/production/service.ts', 'generationMetadata: parseMetadata(row.generation_metadata)'],
  ['src/shared/types/production.ts', 'generationMetadata: Record<string, unknown>;'],
  ['src/renderer/src/features/assets/AssetsHome.vue', 'assets.generationRecord.action'],
  ['src/renderer/src/features/production/components/ProductionFlowNode.vue', 'production.generationRecord.action'],
  ['src/renderer/src/i18n/messages.ts', "generationRecord: {"],
  ['docs/tasks/OPT-034-生成链路记录提示词和手册快照.md', '生成链路记录提示词和手册快照'],
  ['docs/TODO-优化与缺口.md', 'OPT-034 生成链路记录提示词和手册快照'],
];

for (const [relativePath, needle] of checks) {
  assertIncludes(relativePath, needle);
}

assertCount('src/main/services/assets/service.ts', "source: 'asset.image'", 1);

console.log('OPT-034 generation snapshot verification passed');
