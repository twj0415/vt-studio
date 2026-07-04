import {
  DEPENDENCY_STATUS_VALUES,
  EXPORT_DRAFT_STATUS_VALUES,
  GENERATION_TASK_STATUS_VALUES,
  SCRIPT_EXTRACT_STATUS_VALUES,
  SOURCE_EVENT_STATUS_VALUES,
  TASK_STATUS_VALUES,
} from './dictionaries';

export const STATUS_LAYER_IDS = {
  TASK_RECORD: 'taskRecord',
  GENERATION_OBJECT: 'generationObject',
  SOURCE_EVENT: 'sourceEvent',
  SCRIPT_EXTRACT: 'scriptExtract',
  EXPORT_DRAFT: 'exportDraft',
  DEPENDENCY_STATE: 'dependencyState',
} as const;

export type StatusLayerId = (typeof STATUS_LAYER_IDS)[keyof typeof STATUS_LAYER_IDS];

export const STATUS_LAYER_LABELS_ZH: Record<StatusLayerId, string> = {
  taskRecord: '任务记录状态',
  generationObject: '生成业务对象状态',
  sourceEvent: '原文事件状态',
  scriptExtract: '剧本资产提取状态',
  exportDraft: '导出草稿状态',
  dependencyState: '业务依赖可信度状态',
};

export const STATUS_LAYERS = {
  TASK_RECORD: {
    id: STATUS_LAYER_IDS.TASK_RECORD,
    owner: 'tasks.status',
    values: TASK_STATUS_VALUES,
    summary: '记录一次异步工作的总体结果，用于任务中心筛选和失败原因定位。',
  },
  GENERATION_OBJECT: {
    id: STATUS_LAYER_IDS.GENERATION_OBJECT,
    owner: 'assets/production business status fields',
    values: GENERATION_TASK_STATUS_VALUES,
    summary: '记录图片、音频、分镜、视频候选等业务对象自己的生成状态。',
  },
  SOURCE_EVENT: {
    id: STATUS_LAYER_IDS.SOURCE_EVENT,
    owner: 'source_chapters.event_status',
    values: SOURCE_EVENT_STATUS_VALUES,
    summary: '记录原文章节事件分析是否需要重跑、是否成功或失败。',
  },
  SCRIPT_EXTRACT: {
    id: STATUS_LAYER_IDS.SCRIPT_EXTRACT,
    owner: 'scripts.extract_status',
    values: SCRIPT_EXTRACT_STATUS_VALUES,
    summary: '记录剧本资产提取的排队、运行和结果。',
  },
  EXPORT_DRAFT: {
    id: STATUS_LAYER_IDS.EXPORT_DRAFT,
    owner: 'export_summary.status',
    values: EXPORT_DRAFT_STATUS_VALUES,
    summary: '记录一次导出产物摘要的状态，不反写业务生成对象。',
  },
  DEPENDENCY_STATE: {
    id: STATUS_LAYER_IDS.DEPENDENCY_STATE,
    owner: 'scripts/assets/production dependency_status fields',
    values: DEPENDENCY_STATUS_VALUES,
    summary: '记录业务对象的上游依赖是否仍然可信，不表示生成任务是否成功。',
  },
} as const;

export const STATUS_FIELD_POLICIES = {
  'tasks.status': STATUS_LAYER_IDS.TASK_RECORD,
  'source_chapters.event_status': STATUS_LAYER_IDS.SOURCE_EVENT,
  'scripts.extract_status': STATUS_LAYER_IDS.SCRIPT_EXTRACT,
  'assets.prompt_status': STATUS_LAYER_IDS.GENERATION_OBJECT,
  'assets.image_status': STATUS_LAYER_IDS.GENERATION_OBJECT,
  'assets.audio_bind_status': STATUS_LAYER_IDS.GENERATION_OBJECT,
  'asset_media.status': STATUS_LAYER_IDS.GENERATION_OBJECT,
  'production_storyboards.image_status': STATUS_LAYER_IDS.GENERATION_OBJECT,
  'production_video_tracks.status': STATUS_LAYER_IDS.GENERATION_OBJECT,
  'production_videos.status': STATUS_LAYER_IDS.GENERATION_OBJECT,
  'export_summary.status': STATUS_LAYER_IDS.EXPORT_DRAFT,
  'scripts.dependency_status': STATUS_LAYER_IDS.DEPENDENCY_STATE,
  'assets.dependency_status': STATUS_LAYER_IDS.DEPENDENCY_STATE,
  'production_storyboards.dependency_status': STATUS_LAYER_IDS.DEPENDENCY_STATE,
  'production_video_tracks.dependency_status': STATUS_LAYER_IDS.DEPENDENCY_STATE,
  'production_videos.dependency_status': STATUS_LAYER_IDS.DEPENDENCY_STATE,
} as const;

export type StatusFieldName = keyof typeof STATUS_FIELD_POLICIES;

export function getStatusFieldLayer(fieldName: StatusFieldName): StatusLayerId {
  return STATUS_FIELD_POLICIES[fieldName];
}

export function isStatusInLayer(layerId: StatusLayerId, status: string): boolean {
  const layer = Object.values(STATUS_LAYERS).find((item) => item.id === layerId);
  return layer ? (layer.values as readonly string[]).includes(status) : false;
}
