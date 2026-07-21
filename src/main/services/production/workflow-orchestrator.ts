import { VT_STATUS } from '@shared/constants/status';
import { PRODUCTION_TASK_STATUS } from '@shared/types/production';
import type {
  ProductionFlowData,
  ProductionRunWorkflowActionPayload,
  ProductionRunWorkflowActionResult,
  ProductionStepGuardResult,
  ProductionToolRunPayload,
  ProductionWorkflowStateInput,
  ProductionWorkflowStateResult,
  ProductionWorkflowStep,
  ProductionWorkflowStepState,
} from '@shared/types/production';
import { createError } from '../result';

export interface ProductionWorkflowServices {
  getFlowData(payload: { projectId: number; contentId: number }): { flowData: ProductionFlowData };
  getPendingResourceDraftCount(payload: { projectId: number; contentId: number }): number;
  runTool(payload: ProductionToolRunPayload): Promise<unknown> | unknown;
}

const WORKFLOW_STEPS: ProductionWorkflowStep[] = [
  'content',
  'resources',
  'storyboardTable',
  'storyboardImages',
  'videoWorkbench',
  'export',
];

function normalizeStep(value: ProductionWorkflowStep): ProductionWorkflowStep {
  if (!WORKFLOW_STEPS.includes(value)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '生产步骤无效');
  }
  return value;
}

function hasContent(flowData: ProductionFlowData): boolean {
  return Boolean(flowData.contentBody.trim());
}

function buildWorkflowSteps(flowData: ProductionFlowData, pendingResourceDraftCount: number): ProductionWorkflowStepState[] {
  const contentDone = hasContent(flowData);
  const content: ProductionWorkflowStepState = contentDone
    ? { step: 'content', canRun: true, status: 'done', reason: null }
    : { step: 'content', canRun: true, status: 'ready', reason: null };

  const hasVisualResources = flowData.assets.some((asset) => asset.type === 'role' || asset.type === 'scene' || asset.type === 'tool');
  const extractionFinished = flowData.content?.resourceStatus === PRODUCTION_TASK_STATUS.SUCCEEDED;
  const resources: ProductionWorkflowStepState = !contentDone
    ? { step: 'resources', canRun: false, status: 'blocked', reason: '缺少已保存内容' }
    : pendingResourceDraftCount > 0
      ? { step: 'resources', canRun: true, status: 'needsUpdate', reason: `还有 ${pendingResourceDraftCount} 条资源草稿未确认` }
      : hasVisualResources || extractionFinished
        ? { step: 'resources', canRun: true, status: 'done', reason: null }
        : { step: 'resources', canRun: true, status: 'ready', reason: null };

  const storyboardRowsComplete = flowData.storyboards.length > 0
    && flowData.storyboards.every((storyboard) => Boolean(storyboard.videoDesc.trim()) && storyboard.duration > 0);
  const storyboardTable: ProductionWorkflowStepState = resources.status !== 'done'
    ? { step: 'storyboardTable', canRun: false, status: 'blocked', reason: '资源步骤尚未完成' }
    : flowData.storyboards.length === 0
      ? { step: 'storyboardTable', canRun: true, status: 'ready', reason: '请选择智能拆分、整篇作为一个分镜或手动新增分镜' }
      : storyboardRowsComplete
        ? { step: 'storyboardTable', canRun: true, status: 'done', reason: null }
        : { step: 'storyboardTable', canRun: true, status: 'needsUpdate', reason: '存在不完整的分镜' };

  const requiredStoryboards = flowData.storyboards.filter((storyboard) => storyboard.shouldGenerateImage);
  const failedStoryboardImageCount = requiredStoryboards.filter((storyboard) => storyboard.imageStatus === PRODUCTION_TASK_STATUS.FAILED).length;
  const missingStoryboardImageCount = requiredStoryboards.filter((storyboard) => !storyboard.imageUrl).length;
  const storyboardImages: ProductionWorkflowStepState = storyboardTable.status !== 'done'
    ? { step: 'storyboardImages', canRun: false, status: 'blocked', reason: '分镜步骤尚未完成' }
    : requiredStoryboards.length === 0
      ? { step: 'storyboardImages', canRun: true, status: 'done', reason: null }
    : failedStoryboardImageCount > 0
      ? { step: 'storyboardImages', canRun: true, status: 'needsUpdate', reason: `还有 ${failedStoryboardImageCount} 个分镜画面生成失败` }
      : missingStoryboardImageCount > 0
        ? { step: 'storyboardImages', canRun: true, status: 'ready', reason: `还有 ${missingStoryboardImageCount} 个分镜缺少正式画面` }
        : { step: 'storyboardImages', canRun: true, status: 'done', reason: null };

  const allTracksSelected = flowData.videoTracks.length > 0 && flowData.videoTracks.every((track) => {
    const selected = track.videos.find((video) => video.id === track.selectedVideoId);
    return Boolean(selected?.videoUrl);
  });
  const videoWorkbench: ProductionWorkflowStepState = storyboardImages.status !== 'done'
    ? { step: 'videoWorkbench', canRun: false, status: 'blocked', reason: '分镜画面尚未完成' }
    : allTracksSelected
      ? { step: 'videoWorkbench', canRun: true, status: 'done', reason: null }
      : { step: 'videoWorkbench', canRun: true, status: 'ready', reason: '仍有视频片段未选择正式视频' };

  const exportStep: ProductionWorkflowStepState = videoWorkbench.status !== 'done'
    ? { step: 'export', canRun: false, status: 'blocked', reason: '视频步骤尚未完成' }
    : { step: 'export', canRun: true, status: 'ready', reason: null };

  return [content, resources, storyboardTable, storyboardImages, videoWorkbench, exportStep];
}

export class ProductionWorkflowOrchestrator {
  constructor(private readonly services: ProductionWorkflowServices) {}

  getState(input: ProductionWorkflowStateInput): ProductionWorkflowStateResult {
    const flowData = this.services.getFlowData(input).flowData;
    const pendingResourceDraftCount = this.services.getPendingResourceDraftCount(input);
    const steps = buildWorkflowSteps(flowData, pendingResourceDraftCount);
    const next = steps.find((step) => step.status !== 'done' && step.canRun) ?? steps[steps.length - 1]!;
    return {
      state: {
        projectId: input.projectId,
        contentId: input.contentId,
        steps,
        nextStep: next.step,
      },
    };
  }

  getNextStep(input: ProductionWorkflowStateInput): ProductionWorkflowStep {
    return this.getState(input).state.nextStep;
  }

  canRunStep(input: ProductionRunWorkflowActionPayload): ProductionStepGuardResult {
    const step = normalizeStep(input.step);
    const state = this.getState(input).state.steps.find((item) => item.step === step);
    if (!state) {
      return { canRun: false, reason: '生产步骤不存在' };
    }
    if (input.mode === 'force') {
      return { canRun: true, reason: null };
    }
    return { canRun: state.canRun, reason: state.reason };
  }

  async runStep(input: ProductionRunWorkflowActionPayload): Promise<ProductionRunWorkflowActionResult> {
    const step = normalizeStep(input.step);
    const guard = this.canRunStep(input);
    if (!guard.canRun) {
      return { accepted: false, step, ...guard };
    }

    const toolPayload = this.toToolPayload(input);
    if (!toolPayload) {
      return {
        accepted: true,
        step,
        canRun: true,
        reason: null,
        flowData: this.services.getFlowData(input).flowData,
      };
    }
    const result = await this.services.runTool(toolPayload);
    const flowData = this.services.getFlowData(input).flowData;
    return { accepted: true, step, canRun: true, reason: null, result, flowData };
  }

  private toToolPayload(input: ProductionRunWorkflowActionPayload): ProductionToolRunPayload | null {
    const base = {
      projectId: input.projectId,
      contentId: input.contentId,
      source: 'canvas' as const,
      input: input.input ?? {},
    };
    if (input.step === 'resources') {
      return { ...base, toolName: 'extract_resources' };
    }
    if (input.step === 'storyboardImages') {
      return { ...base, toolName: 'generate_storyboard' };
    }
    if (input.step === 'videoWorkbench') {
      return { ...base, toolName: 'generate_video_prompt' };
    }
    if (input.step === 'export') {
      return { ...base, toolName: 'validate_export' };
    }
    return null;
  }
}
