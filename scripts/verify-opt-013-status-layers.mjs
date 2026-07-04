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

function assertNotMatches(relativePath, pattern, message) {
  const content = read(relativePath);
  if (pattern.test(content)) {
    throw new Error(message);
  }
}

assertIncludes('src/shared/constants/status-layers.ts', 'STATUS_LAYER_IDS');
assertIncludes('src/shared/constants/status-layers.ts', 'TASK_RECORD');
assertIncludes('src/shared/constants/status-layers.ts', 'GENERATION_OBJECT');
assertIncludes('src/shared/constants/status-layers.ts', 'SOURCE_EVENT');
assertIncludes('src/shared/constants/status-layers.ts', 'SCRIPT_EXTRACT');
assertIncludes('src/shared/constants/status-layers.ts', 'EXPORT_DRAFT');
assertIncludes('src/shared/constants/status-layers.ts', "'tasks.status'");
assertIncludes('src/shared/constants/status-layers.ts', "'source_chapters.event_status'");
assertIncludes('src/shared/constants/status-layers.ts', "'scripts.extract_status'");
assertIncludes('src/shared/constants/status-layers.ts', "'assets.image_status'");
assertIncludes('src/shared/constants/status-layers.ts', "'production_storyboards.image_status'");
assertIncludes('src/shared/constants/status-layers.ts', "'production_video_tracks.status'");
assertIncludes('src/shared/constants/status-layers.ts', "'production_videos.status'");
assertIncludes('src/shared/constants/status-layers.ts', "'export_summary.status'");

assertIncludes('src/shared/constants/dictionaries.ts', 'EXPORT_DRAFT_STATUSES');
assertIncludes('src/shared/types/export.ts', 'EXPORT_DRAFT_STATUS = SHARED_EXPORT_DRAFT_STATUSES');
assertIncludes('src/main/services/export/index.ts', 'EXPORT_DRAFT_STATUS.SUCCEEDED');
assertIncludes('src/main/services/export/index.ts', 'EXPORT_DRAFT_STATUS.FAILED');

const nonTaskServices = [
  'src/main/services/source/service.ts',
  'src/main/services/script/service.ts',
  'src/main/services/assets/service.ts',
  'src/main/services/production/service.ts',
  'src/main/services/export/index.ts',
];

for (const relativePath of nonTaskServices) {
  assertNotMatches(
    relativePath,
    /\b(?:INSERT\s+INTO|UPDATE)\s+tasks\b[\s\S]{0,160}\bstatus\b/i,
    `${relativePath} should write task status through task service, not direct SQL`,
  );
}

assertIncludes('src/main/services/task/service.ts', 'TASK_STATUS.RUNNING');
assertIncludes('src/main/services/task/service.ts', 'TASK_STATUS.SUCCEEDED');
assertIncludes('src/main/services/task/service.ts', 'TASK_STATUS.FAILED');
assertIncludes('src/main/services/task/service.ts', 'TASK_STATUS.CANCELLED');
assertIncludes('src/main/services/source/service.ts', 'SOURCE_EVENT_STATUS.RUNNING');
assertIncludes('src/main/services/script/service.ts', 'SCRIPT_EXTRACT_STATUS.WAITING');
assertIncludes('src/main/services/assets/service.ts', 'ASSET_TASK_STATUS.RUNNING');
assertIncludes('src/main/services/production/service.ts', 'PRODUCTION_TASK_STATUS.RUNNING');

console.log('[verify-opt-013] status layers are separated');
