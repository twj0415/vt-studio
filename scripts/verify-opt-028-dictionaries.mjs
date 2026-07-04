import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(content, snippet, message) {
  if (!content.includes(snippet)) {
    throw new Error(message);
  }
}

const dictionaries = read('src/shared/constants/dictionaries.ts');

const requiredDictionarySnippets = [
  'PROJECT_SOURCE_TYPES',
  "NOVEL: 'novel'",
  "SCRIPT: 'script'",
  'ASSET_TYPES',
  "ROLE: 'role'",
  "SCENE: 'scene'",
  "TOOL: 'tool'",
  "CLIP: 'clip'",
  "AUDIO: 'audio'",
  'TASK_STATUSES',
  "WAITING: 'waiting'",
  "RUNNING: 'running'",
  "SUCCEEDED: 'succeeded'",
  "FAILED: 'failed'",
  "CANCELLED: 'cancelled'",
  'GENERATION_TASK_STATUSES',
  'SOURCE_EVENT_STATUSES',
  'SCRIPT_EXTRACT_STATUSES',
  'EXPORT_DRAFT_STATUSES',
  'MODEL_CAPABILITIES',
  'IMAGE_GENERATION_MODES',
  'VIDEO_SIMPLE_MODES',
  "TEXT: 'text'",
  "SINGLE_IMAGE: 'singleImage'",
  "MULTI_REFERENCE: 'multiReference'",
  "START_END_REQUIRED: 'startEndRequired'",
  "END_FRAME_OPTIONAL: 'endFrameOptional'",
  "START_FRAME_OPTIONAL: 'startFrameOptional'",
  'VIDEO_REFERENCE_MODE_PREFIXES',
  "VIDEO: 'videoReference'",
  "IMAGE: 'imageReference'",
  "AUDIO: 'audioReference'",
  "TEXT: 'textReference'",
  'APPEARANCE_PRESETS',
  'LOCALES',
  'COMMON_VIDEO_DURATIONS',
  'COMMON_VIDEO_RESOLUTIONS',
  'DEFAULT_IMAGE_FLOW_RATIOS',
];

for (const snippet of requiredDictionarySnippets) {
  assertIncludes(dictionaries, snippet, `统一字典缺少关键内容：${snippet}`);
}

if (/SUCCESS:\s*['"]success['"]/.test(dictionaries) || /TASK_STATUSES[\s\S]*['"]success['"]/.test(dictionaries)) {
  throw new Error('任务完成态必须使用 succeeded，不能新增 success 作为正式状态 key');
}

const requiredConsumers = [
  ['src/shared/types/assets.ts', '../constants/dictionaries'],
  ['src/shared/types/project.ts', '../constants/dictionaries'],
  ['src/shared/types/task.ts', '../constants/dictionaries'],
  ['src/shared/types/source.ts', '../constants/dictionaries'],
  ['src/shared/types/script-agent.ts', '../constants/dictionaries'],
  ['src/shared/types/production.ts', '../constants/dictionaries'],
  ['src/shared/types/export.ts', '../constants/dictionaries'],
  ['src/shared/types/vendor.ts', '../constants/dictionaries'],
  ['src/main/services/model/constants.ts', '@shared/constants/dictionaries'],
  ['src/main/services/model/types.ts', '@shared/constants/dictionaries'],
  ['src/main/services/model/validation.ts', '@shared/constants/dictionaries'],
  ['src/main/services/project.ts', '@shared/constants/dictionaries'],
  ['src/main/services/assets/service.ts', '@shared/constants/dictionaries'],
  ['src/main/services/production/service.ts', '@shared/constants/dictionaries'],
  ['src/renderer/src/i18n/index.ts', '@shared/constants/dictionaries'],
  ['src/renderer/src/features/settings/appearance/theme.ts', '@shared/constants/dictionaries'],
  ['src/renderer/src/features/project/ProjectHome.vue', '@shared/constants/dictionaries'],
  ['src/renderer/src/features/project/components/ProjectFormDialog.vue', '@shared/constants/dictionaries'],
  ['src/renderer/src/features/settings/components/VendorConfig.vue', '@shared/constants/dictionaries'],
  ['src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', '@shared/constants/dictionaries'],
  ['src/renderer/src/features/production/components/ProductionImageFlowDialog.vue', '@shared/constants/dictionaries'],
];

for (const [relativePath, snippet] of requiredConsumers) {
  assertIncludes(read(relativePath), snippet, `${relativePath} 还没有接入统一字典`);
}

const messages = read('src/renderer/src/i18n/messages.ts');
assertIncludes(messages, "waiting: '等待中'", '任务 waiting 状态缺少中文展示文案');
assertIncludes(messages, "waiting: 'Waiting'", '任务 waiting 状态缺少英文展示文案');

console.log('[verify-opt-028] dictionaries are centralized');
