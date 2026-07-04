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
  ['src/main/services/project/manual-prompt.ts', 'readManualPromptBundle'],
  ['src/main/services/project/manual-prompt.ts', 'contentHash'],
  ['src/main/services/project/manual-prompt.ts', 'formatManualPromptSection'],
  ['src/main/services/project/manual-prompt.ts', '缺少生成所需内容'],
  ['src/main/services/assets/service.ts', 'readAssetVisualManual'],
  ['src/main/services/assets/service.ts', 'buildAssetManualTaskRefs'],
  ['src/main/services/assets/service.ts', '视觉手册规范'],
  ['src/main/services/assets/service.ts', "promptSources: ['asset.prompt', 'asset.imageRule', 'project.imageQuality', 'visualManual']"],
  ['src/main/services/assets/service.ts', 'manuals: {'],
  ['src/main/services/production/service.ts', 'director_manual_id'],
  ['src/main/services/production/service.ts', 'readProductionStoryboardManuals'],
  ['src/main/services/production/service.ts', "readManualPromptBundle('visual', project.visual_manual_id, ['prefix', 'storyboard'])"],
  ['src/main/services/production/service.ts', "readManualPromptBundle('director', project.director_manual_id, ['planning', 'storyboardTable'])"],
  ['src/main/services/production/service.ts', 'readProductionVideoManuals'],
  ['src/main/services/production/service.ts', "readManualPromptBundle('visual', project.visual_manual_id, ['prefix', 'storyboardVideo'])"],
  ['src/main/services/production/service.ts', 'buildStoryboardImagePrompt'],
  ['src/main/services/production/service.ts', '分镜图片生成手册规范'],
  ['src/main/services/production/service.ts', '视频提示词生成手册规范'],
  ['src/main/services/production/service.ts', 'relatedObjects: { ids: idsToGenerate, manuals }'],
  ['src/main/services/production/service.ts', 'relatedObjects: { ids: assetIds, manuals }'],
  ['src/main/services/production/service.ts', 'relatedObjects: { ids: trackIds, manuals }'],
  ['src/shared/types/production.ts', 'ProductionAgentManualContext'],
  ['src/shared/types/production.ts', 'manuals: {'],
  ['docs/tasks/OPT-009-视觉手册和导演手册真正参与生成链路.md', '真正参与生成链路'],
  ['docs/TODO-优化与缺口.md', 'OPT-009 视觉手册和导演手册真正参与生成链路'],
];

for (const [relativePath, needle] of checks) {
  assertIncludes(relativePath, needle);
}

console.log('OPT-009 manual generation chain verification passed');
