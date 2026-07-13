import { VT_STATUS } from '@shared/constants/status';
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
  runTool(payload: ProductionToolRunPayload): Promise<unknown> | unknown;
}

const WORKFLOW_STEPS: ProductionWorkflowStep[] = [
  'content',
  'resources',
  'directorPlan',
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

function buildStepState(step: ProductionWorkflowStep, flowData: ProductionFlowData): ProductionWorkflowStepState {
  if (step === 'content') {
    return hasContent(flowData)
      ? { step, canRun: true, status: 'done', reason: null }
      : { step, canRun: true, status: 'ready', reason: null };
  }

  if (!hasContent(flowData)) {
    return { step, canRun: false, status: 'blocked', reason: '缺少内容' };
  }

  if (step === 'resources') {
    return flowData.assets.length > 0
      ? { step, canRun: true, status: 'done', reason: null }
      : { step, canRun: true, status: 'ready', reason: null };
  }

  if (step === 'directorPlan') {
    return flowData.directorPlan?.trim()
      ? { step, canRun: true, status: 'done', reason: null }
      : { step, canRun: true, status: 'ready', reason: null };
  }

  if (step === 'storyboardTable') {
    if (!flowData.directorPlan?.trim()) {
      return { step, canRun: false, status: 'blocked', reason: '缺少导演计划' };
    }
    return flowData.storyboardTable.trim()
      ? { step, canRun: true, status: 'done', reason: null }
      : { step, canRun: true, status: 'ready', reason: null };
  }

  if (step === 'storyboardImages') {
    if (!flowData.storyboardTable.trim() && flowData.storyboards.length === 0) {
      return { step, canRun: false, status: 'blocked', reason: '缺少分镜表' };
    }
    const missingImages = flowData.storyboards.some((storyboard) => storyboard.shouldGenerateImage && !storyboard.imageUrl);
    return missingImages || flowData.storyboards.length === 0
      ? { step, canRun: true, status: 'ready', reason: null }
      : { step, canRun: true, status: 'done', reason: null };
  }

  if (step === 'videoWorkbench') {
    if (flowData.storyboards.length === 0) {
      return { step, canRun: false, status: 'blocked', reason: '缺少分镜图' };
    }
    const hasSelectedVideo = flowData.videoTracks.some((track) => track.selectedVideoId);
    return hasSelectedVideo
      ? { step, canRun: true, status: 'done', reason: null }
      : { step, canRun: true, status: 'ready', reason: null };
  }

  const exportReady = flowData.videoTracks.length > 0 && flowData.videoTracks.every((track) => track.selectedVideoId);
  return exportReady
    ? { step, canRun: true, status: 'ready', reason: null }
    : { step, canRun: false, status: 'blocked', reason: '缺少已选择的视频候选' };
}

export class ProductionWorkflowOrchestrator {
  constructor(private readonly services: ProductionWorkflowServices) {}

  getState(input: ProductionWorkflowStateInput): ProductionWorkflowStateResult {
    const flowData = this.services.getFlowData(input).flowData;
    const steps = WORKFLOW_STEPS.map((step) => buildStepState(step, flowData));
    const next = steps.find((step) => step.status === 'ready' && step.canRun) ?? steps[steps.length - 1]!;
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
