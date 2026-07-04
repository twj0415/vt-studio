import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing ${needle}`);
  }
}

function assertNotIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (content.includes(needle)) {
    throw new Error(`${relativePath} should not include ${needle}`);
  }
}

const productionService = 'src/main/services/production/service.ts';

assertIncludes('docs/tasks/P12-真实生成执行器批.md', '状态：已完成');
assertIncludes('docs/tasks/P12-真实生成执行器批.md', 'generateImageByModel');
assertIncludes('docs/tasks/P12-真实生成执行器批.md', 'generateVideoByModel');
assertIncludes('docs/tasks/P12-真实生成执行器批.md', '不新增 vt_demo_*');

assertIncludes(productionService, 'async function runProductionStoryboardImageGeneration');
assertIncludes(productionService, 'async function runProductionDerivedAssetImageGeneration');
assertIncludes(productionService, 'async function runProductionVideoGeneration');
assertIncludes(productionService, 'generateImageByModel(model');
assertIncludes(productionService, 'generateVideoByModel(model');
assertIncludes(productionService, 'saveGeneratedProductionMedia');
assertIncludes(productionService, 'INSERT INTO asset_media');
assertIncludes(productionService, 'UPDATE production_videos SET relative_path = ?, status = ?');
assertIncludes(productionService, 'buildModelReferences');
assertIncludes(productionService, 'createAutoTrackReferences');

assertNotIncludes(productionService, 'GENERATION_NOT_CONNECTED_REASON');
assertNotIncludes(productionService, 'createPlaceholderFailureTask');

console.log('P12 real generation verification passed');
