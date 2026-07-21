import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf-8');

function includes(path, value) {
  if (!read(path).includes(value)) throw new Error(`${path} 缺少：${value}`);
}

function excludes(path, value) {
  if (read(path).includes(value)) throw new Error(`${path} 不应包含：${value}`);
}

includes('AGENTS.md', '模型能力硬规则');
includes('docs/通用视频生产流程设计.md', '内容 -> 资源 -> 分镜 -> 分镜画面 -> 视频 -> 导出');
includes('docs/模型能力审计与设计.md', '禁止兼容旧能力格式');

includes('src/main/services/model/capability-catalog.ts', 'MiniMax-Hailuo-2.3-Fast');
includes('src/main/services/model/capability-catalog.ts', 'fast ? [VIDEO_SIMPLE_MODES.SINGLE_IMAGE]');
includes('src/main/services/model/capability-matrix.ts', 'parameterCombinations');
excludes('src/main/services/model/capability-matrix.ts', 'COMMON_VIDEO_DURATIONS');
excludes('src/main/services/model/capability-matrix.ts', 'COMMON_VIDEO_RESOLUTIONS');

includes('src/main/services/project.ts', 'getCapabilityBindings');
includes('src/main/services/project.ts', "videoMode: ''");
excludes('src/main/services/project.ts', 'imageQualityOptions: [...IMAGE_QUALITY_OPTIONS]');
includes('src/renderer/src/features/project/components/ProjectFormDialog.vue', 'availableImageQualityOptions');
includes('src/renderer/src/features/project/components/ProjectFormDialog.vue', 'resolveDefaultModelId(props.imageModels, props.project.imageModelId)');
includes('src/renderer/src/features/project/components/ProjectFormDialog.vue', '<VtStatusTip');
excludes('src/renderer/src/features/project/components/ProjectFormDialog.vue', '<p v-if="imageModelNeedsReselection"');
excludes('src/renderer/src/features/project/components/ProjectFormDialog.vue', "t('project.form.videoMode')");
includes('src/renderer/src/components/VtStatusTip.vue', "tone?: 'muted' | 'danger'");
includes('src/renderer/src/components/VtStatusTip.vue', '<t-tooltip');

const projectService = read('src/main/services/project.ts');
const restorableStart = projectService.indexOf('function assertProjectRestorable');
const restorableEnd = projectService.indexOf('function toCurrentProjectContext', restorableStart);
const restorableBody = projectService.slice(restorableStart, restorableEnd);
if (restorableBody.includes('resolveProjectModelOption') || restorableBody.includes('normalizeStoredVideoMode')) {
  throw new Error('打开已有项目时不应因失效模型或旧视频模式阻断');
}

includes('src/renderer/src/features/production/video-model-capabilities.ts', 'isReadyModelOperation(item)');
includes('src/renderer/src/features/production/ProductionStepFlowHome.vue', 'activeTrackHasStoryboardImage');
includes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'generationCapabilityReady');
excludes('src/renderer/src/features/production/ProductionStepFlowHome.vue', 'const projectVideoMode =');
excludes('src/renderer/src/features/production/ProductionStepFlowHome.vue', 'projectVideoMode.value');
excludes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'const projectVideoMode =');
excludes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'projectVideoMode.value');

includes('src/main/services/production/service.ts', '请选择视频生成模式');
includes('src/main/services/production/service.ts', '请选择视频时长');
excludes('src/main/services/production/service.ts', 'normalizeMode(project.video_mode)');
includes('src/main/services/production/service.ts', 'PRODUCTION_TASK_STATUS.SUCCEEDED');

console.log('Current production verification passed');
