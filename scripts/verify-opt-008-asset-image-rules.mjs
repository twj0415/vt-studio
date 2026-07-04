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
  ['src/shared/constants/dictionaries.ts', 'ASSET_IMAGE_USAGES'],
  ['src/shared/constants/dictionaries.ts', 'ASSET_IMAGE_VIEW_MODES'],
  ['src/shared/types/assets.ts', 'usage: AssetImageUsage'],
  ['src/shared/types/assets.ts', 'viewMode: AssetImageViewMode'],
  ['src/shared/types/assets.ts', 'prompt: string | null'],
  ['src/shared/types/assets.ts', 'modelMode: string | null'],
  ['src/shared/types/assets.ts', 'taskId: number | null'],
  ['src/shared/types/assets.ts', 'metadata: Record<string, unknown>'],
  ['src/main/services/assets/migrations.ts', '0015_add_asset_media_generation_metadata'],
  ['src/main/services/assets/migrations.ts', 'ALTER TABLE asset_media ADD COLUMN usage'],
  ['src/main/services/assets/migrations.ts', 'ALTER TABLE asset_media ADD COLUMN view_mode'],
  ['src/main/services/assets/migrations.ts', 'ALTER TABLE asset_media ADD COLUMN prompt'],
  ['src/main/services/assets/migrations.ts', 'ALTER TABLE asset_media ADD COLUMN model_mode'],
  ['src/main/services/assets/migrations.ts', 'ALTER TABLE asset_media ADD COLUMN metadata'],
  ['src/main/services/assets/service.ts', 'resolveAssetImageRule'],
  ['src/main/services/assets/service.ts', '角色标准四视图'],
  ['src/main/services/assets/service.ts', 'ASSET_IMAGE_VIEW_MODES.FOUR_VIEW'],
  ['src/main/services/assets/service.ts', 'buildAssetImagePrompt'],
  ['src/main/services/assets/service.ts', 'promptSources'],
  ['src/main/services/assets/service.ts', 'referenceImageCount'],
  ['src/main/services/assets/service.ts', 'usage, view_mode, status'],
  ['src/main/services/assets/service.ts', 'error_reason, prompt, model, model_mode, resolution, task_id, metadata'],
  ['src/main/services/production/service.ts', 'ASSET_IMAGE_USAGES.DERIVED'],
  ['src/main/services/production/service.ts', 'ASSET_IMAGE_VIEW_MODES.DERIVED'],
  ['src/main/services/production/service.ts', "promptSources: ['asset.prompt', 'parentAsset.image', 'project.imageQuality', 'visualManual', 'directorManual']"],
  ['docs/tasks/OPT-008-角色图和资产生成规则统一.md', '角色父资产生成“角色标准四视图”'],
  ['docs/TODO-优化与缺口.md', 'OPT-008 角色图和资产生成规则统一'],
];

for (const [relativePath, needle] of checks) {
  assertIncludes(relativePath, needle);
}

console.log('OPT-008 asset image rules verification passed');
