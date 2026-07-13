import type { Tool } from 'ai';
import type { AgentThinkConfigPayload } from '@shared/types/socket';
import type { ProductionAgentContextResult, ProductionAgentToolDescriptor, ProductionFlowData } from '@shared/types/production';
import { getProductionAgentAiTools, getProductionAgentContext } from '../production';
import { streamModelText, type TextStreamInput } from '../model';

type ProductionAgentModelKey = 'productionAgent:decisionAgent';
type ProductionAgentToolSet = Record<string, Tool>;

export interface ProductionAgentRunContextInput {
  projectId: number;
  contentId: number;
  taskId?: number | null;
  userContent: string;
  thinkConfig: Required<AgentThinkConfigPayload>;
  abortSignal?: AbortSignal;
}

export interface ProductionAgentRunContext {
  modelKey: ProductionAgentModelKey;
  system: string;
  tools: ProductionAgentToolSet;
  context: ProductionAgentContextResult;
}

export interface ProductionAgentValidationResult {
  ok: boolean;
  content: string;
  error?: string;
  repaired?: boolean;
}

const MAX_CONTEXT_TEXT = 12000;
const MAX_LIST_ITEMS = 40;
const WRITE_XML_TAG_PATTERN = /<\/?(?:content|directorPlan|storyboardTable|storyboardItem)\b[^>]*>/i;
const LEGACY_FIELD_PATTERN = /\b(?:scriptId|scriptIds|sourceType)\b/;

function clampText(value: string | null | undefined, maxLength = MAX_CONTEXT_TEXT): string {
  const text = (value ?? '').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
}

function stringify(value: unknown, maxLength = MAX_CONTEXT_TEXT): string {
  try {
    return clampText(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return clampText(String(value), maxLength);
  }
}

function summarizeFlowData(flowData: ProductionFlowData): Record<string, unknown> {
  return {
    content: flowData.content
      ? {
          contentId: flowData.content.id,
          title: flowData.content.title,
          version: flowData.content.version,
          resourceStatus: flowData.content.resourceStatus,
          dependencyStatus: flowData.content.dependencyStatus,
        }
      : null,
    contentBody: clampText(flowData.contentBody, 6000),
    directorPlan: clampText(flowData.directorPlan, 4000),
    storyboardTable: clampText(flowData.storyboardTable, 4000),
    assets: flowData.assets.slice(0, MAX_LIST_ITEMS).map((asset) => ({
      id: asset.id,
      parentId: asset.parentId,
      type: asset.type,
      name: asset.name,
      description: clampText(asset.description, 500),
      prompt: clampText(asset.prompt, 500),
      imageStatus: asset.imageStatus,
      dependencyStatus: asset.dependencyStatus,
      children: asset.children.slice(0, 12).map((child) => ({
        id: child.id,
        parentId: child.parentId,
        type: child.type,
        name: child.name,
        description: clampText(child.description, 300),
        imageStatus: child.imageStatus,
      })),
    })),
    storyboards: flowData.storyboards.slice(0, MAX_LIST_ITEMS).map((storyboard) => ({
      id: storyboard.id,
      contentId: storyboard.contentId,
      index: storyboard.index,
      videoDesc: clampText(storyboard.videoDesc, 500),
      prompt: clampText(storyboard.prompt, 500),
      duration: storyboard.duration,
      imageStatus: storyboard.imageStatus,
      associatedAssetIds: storyboard.associatedAssetIds,
    })),
    videoTracks: flowData.videoTracks.slice(0, MAX_LIST_ITEMS).map((track) => ({
      id: track.id,
      contentId: track.contentId,
      sortIndex: track.sortIndex,
      prompt: clampText(track.prompt, 500),
      duration: track.duration,
      status: track.status,
      selectedVideoId: track.selectedVideoId,
      storyboardIds: track.storyboardIds,
      videos: track.videos.map((video) => ({
        id: video.id,
        status: video.status,
        duration: video.duration,
        resolution: video.resolution,
        audioEnabled: video.audioEnabled,
      })),
    })),
  };
}

function summarizeTools(tools: ProductionAgentToolDescriptor[]): Array<Record<string, unknown>> {
  return tools.map((item) => ({
    name: item.name,
    description: item.description,
    status: item.status,
    permissions: item.permissions,
    idempotency: item.idempotency,
    reads: item.reads,
    writes: item.writes,
    inputSchema: item.inputSchema,
  }));
}

export function buildProductionAgentSystemPrompt(context: ProductionAgentContextResult, userContent: string): string {
  return [
    '你是 AI短剧生产线的 Production Agent 决策层。',
    '你只能通过 Production Tools 读取、保存、生成、删除和回写生产数据；普通聊天只负责解释意图、总结结果和询问必要信息。',
    '严禁输出或要求用户粘贴 XML 写入标签；严禁把自由文本当作落库内容。需要保存内容、导演计划、分镜表、分镜、资源、视频或导出时，必须调用对应工具。',
    '正式生产合同只使用 contentId/contentName/contentBody/directorPlan/storyboardTable。不要在回复或工具参数里使用 scriptId、scriptIds、sourceType。',
    '工具返回 ok=false 时，先根据错误调整参数重试一次；仍失败时停止写入并向用户说明失败原因。',
    '不要删除资源库、资源图、衍生资源、Prompt、Skill、手册、模型/API/系统配置，除非用户明确要求且工具允许。',
    '',
    `用户当前请求：${clampText(userContent, 4000)}`,
    `项目 ID：${context.projectId}`,
    `内容 ID：${context.contentId}`,
    `内容名称：${context.contentTitle}`,
    '',
    '【当前 FlowData 摘要】',
    stringify(summarizeFlowData(context.flowData), 24000),
    '',
    '【可用 Production Tools】',
    stringify(summarizeTools(context.tools), 24000),
    '',
    '【视觉手册】',
    clampText(context.manuals.visual.content, 8000),
    '',
    '【导演手册】',
    clampText(context.manuals.director.content, 8000),
    '',
    '【Prompt 模板上下文】',
    stringify(context.resourceContext.promptTemplates, 12000),
    '',
    '【模型 Prompt 上下文】',
    stringify(context.resourceContext.modelPrompts, 12000),
    '',
    '【Skill 上下文】',
    stringify(context.skillBundle.skills.map((skill) => ({ name: skill.name, description: skill.description, content: clampText(skill.content, 5000) })), 20000),
  ].join('\n');
}

export async function createProductionAgentRunContext(input: ProductionAgentRunContextInput): Promise<ProductionAgentRunContext> {
  const context = getProductionAgentContext({ projectId: input.projectId, contentId: input.contentId });
  return {
    modelKey: 'productionAgent:decisionAgent',
    system: buildProductionAgentSystemPrompt(context, input.userContent),
    tools: getProductionAgentAiTools({ projectId: input.projectId, contentId: input.contentId, taskId: input.taskId }),
    context,
  };
}

export async function consumeProductionAgentStream(input: {
  runContext: ProductionAgentRunContext;
  userContent: string;
  thinkConfig: Required<AgentThinkConfigPayload>;
  abortSignal?: AbortSignal;
  onStepFinish?: TextStreamInput['onStepFinish'];
}) {
  return streamModelText({
    modelKey: input.runContext.modelKey,
    system: input.runContext.system,
    messages: [{ role: 'user', content: input.userContent }],
    tools: input.runContext.tools,
    think: input.thinkConfig.think,
    thinkLevel: input.thinkConfig.thinkLevel,
    abortSignal: input.abortSignal,
    onStepFinish: input.onStepFinish,
  });
}

export function validateProductionAgentOutput(content: string): ProductionAgentValidationResult {
  const normalized = content.trim();
  if (WRITE_XML_TAG_PATTERN.test(normalized)) {
    return { ok: false, content: normalized, error: 'Production Agent 回复包含旧 XML 写入标签' };
  }
  if (LEGACY_FIELD_PATTERN.test(normalized)) {
    return { ok: false, content: normalized, error: 'Production Agent 回复包含旧字段名' };
  }
  return { ok: true, content: normalized };
}

export function repairProductionAgentOutput(content: string): ProductionAgentValidationResult {
  const repaired = content
    .replace(/<\/?(?:content|directorPlan|storyboardTable|storyboardItem)\b[^>]*>/gi, '')
    .replace(/\bscriptIds\b/g, 'contentIds')
    .replace(/\bscriptId\b/g, 'contentId')
    .replace(/\bsourceType\b/g, 'contentType')
    .trim();
  const validated = validateProductionAgentOutput(repaired);
  return validated.ok ? { ...validated, repaired: true } : validated;
}
