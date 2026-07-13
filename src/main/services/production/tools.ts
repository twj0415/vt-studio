import { jsonSchema, tool, type Tool } from 'ai';
import { PROJECT_TEMPLATE_TYPES, type ProjectTemplateType } from '@shared/constants/dictionaries';
import { VT_STATUS } from '@shared/constants/status';
import {
  PRODUCTION_AGENT_TOOL_NAMES,
  type ProductionAgentToolDescriptor,
  type ProductionAgentToolName,
  type ProductionFlowData,
  type ProductionResourceContext,
  type ProductionSkillBundle,
  type ProductionToolRunPayload,
  type ProductionToolRunResult,
} from '@shared/types/production';
import type { ExportCreateJianyingDraftPayload } from '@shared/types/export';
import { createError } from '../result';

type JsonSchema = Record<string, unknown>;
type ToolInput = Record<string, unknown>;

export interface ProductionToolContext {
  projectId: number;
  contentId: number;
  templateType: ProjectTemplateType;
  resourceContext: ProductionResourceContext;
  skillBundle: ProductionSkillBundle;
  taskId?: number | null;
  abortSignal?: AbortSignal;
}

export interface ProductionToolExecutorServices {
  getFlowData(payload: { projectId: number; contentId: number }): { flowData: ProductionFlowData };
  saveContent(payload: { projectId: number; contentId?: number | null; title: string; body: string }): unknown;
  extractResources(payload: { projectId: number; contentId: number }): unknown;
  saveDirectorPlan(payload: { projectId: number; contentId: number; directorPlan: string }): unknown;
  saveStoryboardTable(payload: { projectId: number; contentId: number; storyboardTable: string }): unknown;
  saveStoryboard(payload: { projectId: number; contentId: number; id?: number | null; prompt: string; videoDesc: string; duration: number; associatedAssetIds?: number[]; index?: number | null; shouldGenerateImage?: boolean }): unknown;
  deleteStoryboards(payload: { projectId: number; contentId: number; storyboardIds: number[] }): unknown;
  saveDerivedAsset(payload: { projectId: number; contentId: number; parentAssetId: number; id?: number | null; name: string; description?: string | null; prompt?: string | null }): unknown;
  deleteDerivedAsset(payload: { projectId: number; contentId: number; assetId: number }): unknown;
  generateDerivedAssetImages(payload: { projectId: number; contentId: number; assetIds: number[] }): unknown;
  generateStoryboardImages(payload: { projectId: number; contentId: number; storyboardIds: number[]; compulsory?: boolean }): unknown;
  saveVideoTrack(payload: { projectId: number; contentId: number; id?: number | null; storyboardIds?: number[]; prompt?: string | null; duration?: number | null; mode?: string | string[] | null; sortIndex?: number | null }): unknown;
  generateVideoPrompts(payload: { projectId: number; contentId: number; trackIds: number[] }): unknown;
  generateVideos(payload: { projectId: number; contentId: number; trackIds: number[]; model?: string | null; mode?: string | string[] | null; resolution?: string | null; duration?: number | null; audioEnabled?: boolean | null }): unknown;
  selectVideo(payload: { projectId: number; contentId: number; trackId: number; videoId: number | null }): unknown;
  validateExport(payload: { projectId: number; contentId: number }): unknown;
  createExport(payload: ExportCreateJianyingDraftPayload): unknown;
  recordAudit(input: { projectId: number; contentId: number; toolName: string; source?: string | null; taskId?: number | null; input: unknown; result: unknown; error?: string | null }): void;
}

export interface ProductionToolDefinition {
  descriptor: ProductionAgentToolDescriptor;
  execute(input: ToolInput, context: ProductionToolContext): Promise<ProductionToolRunResult> | ProductionToolRunResult;
}

export interface ProductionToolRegistry {
  list(): ProductionAgentToolDescriptor[];
  get(name: ProductionAgentToolName): ProductionToolDefinition;
  run(payload: ProductionToolRunPayload): Promise<ProductionToolRunResult>;
  toAiTools(): Record<string, Tool>;
}

const S = {
  object: (properties: Record<string, unknown> = {}, required: string[] = []): JsonSchema => ({ type: 'object', additionalProperties: false, properties, required }),
  string: { type: 'string' },
  nullableString: { type: ['string', 'null'] },
  number: { type: 'number' },
  nullableNumber: { type: ['number', 'null'] },
  boolean: { type: 'boolean' },
  numberArray: { type: 'array', items: { type: 'number' } },
} satisfies Record<string, unknown>;

function normalizeToolName(value: string): ProductionAgentToolName {
  if (!(PRODUCTION_AGENT_TOOL_NAMES as readonly string[]).includes(value)) {
    throw createError(VT_STATUS.INVALID_PARAMS, 'Production Tool 名称无效');
  }
  return value as ProductionAgentToolName;
}

function normalizeObject(value: unknown): ToolInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError(VT_STATUS.INVALID_PARAMS, 'Production Tool 参数必须是对象');
  }
  return value as ToolInput;
}

function readString(input: ToolInput, key: string, required = true): string {
  const value = input[key];
  if (value === null || value === undefined || value === '') {
    if (!required) {
      return '';
    }
    throw createError(VT_STATUS.INVALID_PARAMS, `${key} 不能为空`);
  }
  if (typeof value !== 'string') {
    throw createError(VT_STATUS.INVALID_PARAMS, `${key} 必须是字符串`);
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${key} 不能为空`);
  }
  return normalized;
}

function readNumber(input: ToolInput, key: string, required = true): number | null {
  const value = input[key];
  if (value === null || value === undefined || value === '') {
    if (!required) {
      return null;
    }
    throw createError(VT_STATUS.INVALID_PARAMS, `${key} 不能为空`);
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${key} 必须是正整数`);
  }
  return normalized;
}

function readNumberArray(input: ToolInput, key: string): number[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${key} 必须是数组`);
  }
  const normalized = Array.from(new Set(value.map((item) => Number(item))));
  if (!normalized.length || normalized.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${key} 必须包含正整数`);
  }
  return normalized;
}

function readOptionalNumberArray(input: ToolInput, key: string): number[] {
  return Array.isArray(input[key]) ? readNumberArray(input, key) : [];
}

function readBoolean(input: ToolInput, key: string, fallback = false): boolean {
  return input[key] === undefined ? fallback : Boolean(input[key]);
}

function descriptor(input: Omit<ProductionAgentToolDescriptor, 'status'> & { status?: ProductionAgentToolDescriptor['status'] }): ProductionAgentToolDescriptor {
  return { status: input.status ?? 'ready', ...input };
}

function ok(result: unknown, flowData?: ProductionFlowData, summary?: string): ProductionToolRunResult {
  return { ok: true, ...(flowData ? { flowData } : {}), ...(summary ? { summary } : {}), result };
}

function withFlowData(services: ProductionToolExecutorServices, context: ProductionToolContext, result: unknown, summary: string): ProductionToolRunResult {
  return ok(result, services.getFlowData({ projectId: context.projectId, contentId: context.contentId }).flowData, summary);
}

function toRecord(value: unknown): ToolInput {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ToolInput) : {};
}

function createDefinitions(services: ProductionToolExecutorServices): ProductionToolDefinition[] {
  const definitions: ProductionToolDefinition[] = [
    {
      descriptor: descriptor({
        name: 'get_flowData',
        description: '读取当前作品生产 FlowData。',
        inputSchema: S.object(),
        permissions: ['read:flowData'],
        idempotency: 'content',
        writes: [],
        reads: ['flowData'],
      }),
      execute: (_input, context) => {
        const flowData = services.getFlowData({ projectId: context.projectId, contentId: context.contentId }).flowData;
        return ok(flowData, flowData, '已读取生产画布');
      },
    },
    {
      descriptor: descriptor({
        name: 'save_content',
        description: '保存当前内容正文。',
        inputSchema: S.object({ title: S.string, body: S.string }, ['body']),
        permissions: ['write:content'],
        idempotency: 'arguments',
        writes: ['production_contents.body'],
        reads: ['production_contents'],
      }),
      execute: (input, context) => withFlowData(services, context, services.saveContent({ projectId: context.projectId, contentId: context.contentId, title: readString(input, 'title', false) || '内容', body: readString(input, 'body') }), '内容已保存'),
    },
    {
      descriptor: descriptor({
        name: 'extract_resources',
        description: '从当前内容提取角色、场景、道具等资源草稿，等待人工审核后入库。',
        inputSchema: S.object(),
        permissions: ['write:resourceDrafts', 'create:task'],
        idempotency: 'content',
        writes: ['production_resource_drafts', 'tasks'],
        reads: ['production_contents', 'manuals', 'prompts', 'skills'],
      }),
      execute: (_input, context) => withFlowData(services, context, services.extractResources({ projectId: context.projectId, contentId: context.contentId }), '资源草稿提取任务已创建'),
    },
    {
      descriptor: descriptor({
        name: 'save_director_plan',
        description: '保存导演计划。',
        inputSchema: S.object({ directorPlan: S.string }, ['directorPlan']),
        permissions: ['write:directorPlan'],
        idempotency: 'arguments',
        writes: ['production_workspaces.script_plan'],
        reads: ['production_workspaces'],
      }),
      execute: (input, context) => withFlowData(services, context, services.saveDirectorPlan({ projectId: context.projectId, contentId: context.contentId, directorPlan: readString(input, 'directorPlan') }), '导演计划已保存'),
    },
    {
      descriptor: descriptor({
        name: 'save_storyboard_table',
        description: '保存分镜表文本。',
        inputSchema: S.object({ storyboardTable: S.string }, ['storyboardTable']),
        permissions: ['write:storyboardTable'],
        idempotency: 'arguments',
        writes: ['production_workspaces.storyboard_table'],
        reads: ['production_workspaces'],
      }),
      execute: (input, context) => withFlowData(services, context, services.saveStoryboardTable({ projectId: context.projectId, contentId: context.contentId, storyboardTable: readString(input, 'storyboardTable') }), '分镜表已保存'),
    },
    {
      descriptor: descriptor({
        name: 'add_storyboard',
        description: '新增分镜。',
        inputSchema: S.object({ prompt: S.string, videoDesc: S.string, duration: S.number, associatedAssetIds: S.numberArray, index: S.nullableNumber, shouldGenerateImage: S.boolean }, ['videoDesc']),
        permissions: ['write:storyboard'],
        idempotency: 'none',
        writes: ['production_storyboards'],
        reads: ['assets'],
      }),
      execute: (input, context) => withFlowData(services, context, services.saveStoryboard({ projectId: context.projectId, contentId: context.contentId, prompt: readString(input, 'prompt', false), videoDesc: readString(input, 'videoDesc'), duration: Number(input.duration ?? 4), associatedAssetIds: readOptionalNumberArray(input, 'associatedAssetIds'), index: readNumber(input, 'index', false), shouldGenerateImage: readBoolean(input, 'shouldGenerateImage', true) }), '分镜已新增'),
    },
    {
      descriptor: descriptor({
        name: 'update_storyboard',
        description: '更新分镜。',
        inputSchema: S.object({ id: S.number, prompt: S.string, videoDesc: S.string, duration: S.number, associatedAssetIds: S.numberArray, index: S.nullableNumber, shouldGenerateImage: S.boolean }, ['id', 'videoDesc']),
        permissions: ['write:storyboard'],
        idempotency: 'arguments',
        writes: ['production_storyboards'],
        reads: ['assets'],
      }),
      execute: (input, context) => withFlowData(services, context, services.saveStoryboard({ projectId: context.projectId, contentId: context.contentId, id: readNumber(input, 'id'), prompt: readString(input, 'prompt', false), videoDesc: readString(input, 'videoDesc'), duration: Number(input.duration ?? 4), associatedAssetIds: readOptionalNumberArray(input, 'associatedAssetIds'), index: readNumber(input, 'index', false), shouldGenerateImage: readBoolean(input, 'shouldGenerateImage', true) }), '分镜已更新'),
    },
    {
      descriptor: descriptor({
        name: 'delete_storyboard',
        description: '删除分镜。',
        inputSchema: S.object({ storyboardIds: S.numberArray }, ['storyboardIds']),
        permissions: ['delete:storyboard'],
        idempotency: 'arguments',
        writes: ['production_storyboards'],
        reads: ['production_storyboards'],
      }),
      execute: (input, context) => withFlowData(services, context, services.deleteStoryboards({ projectId: context.projectId, contentId: context.contentId, storyboardIds: readNumberArray(input, 'storyboardIds') }), '分镜已删除'),
    },
  ];

  definitions.push(
    {
      descriptor: descriptor({
        name: 'add_deriveAsset',
        description: '新增或更新衍生资源。',
        inputSchema: S.object({ parentAssetId: S.number, id: S.nullableNumber, name: S.string, description: S.nullableString, prompt: S.nullableString }, ['parentAssetId', 'name']),
        permissions: ['write:asset'],
        idempotency: 'arguments',
        writes: ['assets', 'production_resource_links'],
        reads: ['assets'],
      }),
      execute: (input, context) => withFlowData(services, context, services.saveDerivedAsset({ projectId: context.projectId, contentId: context.contentId, parentAssetId: readNumber(input, 'parentAssetId')!, id: readNumber(input, 'id', false), name: readString(input, 'name'), description: readString(input, 'description', false), prompt: readString(input, 'prompt', false) }), '衍生资源已保存'),
    },
    {
      descriptor: descriptor({
        name: 'del_deriveAsset',
        description: '删除衍生资源。',
        inputSchema: S.object({ assetId: S.number }, ['assetId']),
        permissions: ['delete:asset'],
        idempotency: 'arguments',
        writes: ['assets', 'production_storyboard_asset_links', 'production_image_flows'],
        reads: ['assets'],
      }),
      execute: (input, context) => withFlowData(services, context, services.deleteDerivedAsset({ projectId: context.projectId, contentId: context.contentId, assetId: readNumber(input, 'assetId')! }), '衍生资源已删除'),
    },
    {
      descriptor: descriptor({
        name: 'generate_deriveAsset',
        description: '生成衍生资源图。',
        inputSchema: S.object({ assetIds: S.numberArray }, ['assetIds']),
        permissions: ['create:task', 'write:assetImage'],
        idempotency: 'arguments',
        writes: ['tasks', 'asset_media'],
        reads: ['assets', 'manuals'],
      }),
      execute: (input, context) => withFlowData(services, context, services.generateDerivedAssetImages({ projectId: context.projectId, contentId: context.contentId, assetIds: readNumberArray(input, 'assetIds') }), '衍生资源图任务已创建'),
    },
    {
      descriptor: descriptor({
        name: 'generate_storyboard',
        description: '生成分镜图。',
        inputSchema: S.object({ storyboardIds: S.numberArray, compulsory: S.boolean }, ['storyboardIds']),
        permissions: ['create:task', 'write:storyboardImage'],
        idempotency: 'arguments',
        writes: ['tasks', 'production_storyboards.relative_path'],
        reads: ['storyboards', 'assets', 'manuals'],
      }),
      execute: (input, context) => withFlowData(services, context, services.generateStoryboardImages({ projectId: context.projectId, contentId: context.contentId, storyboardIds: readNumberArray(input, 'storyboardIds'), compulsory: readBoolean(input, 'compulsory', false) }), '分镜图任务已创建'),
    },
  );

  definitions.push(
    {
      descriptor: descriptor({
        name: 'save_video_track',
        description: '保存视频轨道。',
        inputSchema: S.object({ id: S.nullableNumber, storyboardIds: S.numberArray, prompt: S.nullableString, duration: S.nullableNumber, sortIndex: S.nullableNumber }),
        permissions: ['write:videoTrack'],
        idempotency: 'arguments',
        writes: ['production_video_tracks'],
        reads: ['production_storyboards'],
      }),
      execute: (input, context) => withFlowData(services, context, services.saveVideoTrack({ projectId: context.projectId, contentId: context.contentId, id: readNumber(input, 'id', false), storyboardIds: readOptionalNumberArray(input, 'storyboardIds'), prompt: readString(input, 'prompt', false), duration: input.duration === undefined ? null : Number(input.duration), sortIndex: readNumber(input, 'sortIndex', false) }), '视频轨道已保存'),
    },
    {
      descriptor: descriptor({
        name: 'generate_video_prompt',
        description: '生成视频提示词。',
        inputSchema: S.object({ trackIds: S.numberArray }, ['trackIds']),
        permissions: ['create:task', 'write:videoTrack'],
        idempotency: 'arguments',
        writes: ['tasks', 'production_video_tracks.prompt'],
        reads: ['storyboards', 'assets', 'manuals'],
      }),
      execute: (input, context) => withFlowData(services, context, services.generateVideoPrompts({ projectId: context.projectId, contentId: context.contentId, trackIds: readNumberArray(input, 'trackIds') }), '视频提示词任务已创建'),
    },
    {
      descriptor: descriptor({
        name: 'generate_video',
        description: '生成视频候选。',
        inputSchema: S.object({ trackIds: S.numberArray, model: S.nullableString, resolution: S.nullableString, duration: S.nullableNumber, audioEnabled: S.boolean }, ['trackIds']),
        permissions: ['create:task', 'write:video'],
        idempotency: 'none',
        writes: ['tasks', 'production_videos'],
        reads: ['videoTracks', 'storyboards', 'assets'],
      }),
      execute: (input, context) => withFlowData(services, context, services.generateVideos({ projectId: context.projectId, contentId: context.contentId, trackIds: readNumberArray(input, 'trackIds'), model: readString(input, 'model', false), resolution: readString(input, 'resolution', false), duration: input.duration === undefined ? null : Number(input.duration), audioEnabled: readBoolean(input, 'audioEnabled', false) }), '视频生成任务已创建'),
    },
    {
      descriptor: descriptor({
        name: 'select_video',
        description: '选择正式视频候选。',
        inputSchema: S.object({ trackId: S.number, videoId: S.nullableNumber }, ['trackId']),
        permissions: ['write:videoSelection'],
        idempotency: 'arguments',
        writes: ['production_video_tracks.selected_video_id'],
        reads: ['production_videos'],
      }),
      execute: (input, context) => withFlowData(services, context, services.selectVideo({ projectId: context.projectId, contentId: context.contentId, trackId: readNumber(input, 'trackId')!, videoId: readNumber(input, 'videoId', false) }), '视频候选已选择'),
    },
    {
      descriptor: descriptor({
        name: 'validate_export',
        description: '校验导出素材。',
        inputSchema: S.object(),
        permissions: ['read:export'],
        idempotency: 'content',
        writes: [],
        reads: ['videoTracks', 'videos'],
      }),
      execute: (_input, context) => ok(services.validateExport({ projectId: context.projectId, contentId: context.contentId }), undefined, '导出校验已完成'),
    },
    {
      descriptor: descriptor({
        name: 'create_export',
        description: '创建剪映草稿导出。',
        inputSchema: S.object({ draftName: S.nullableString, copyAssets: S.boolean }),
        permissions: ['create:export', 'create:task'],
        idempotency: 'none',
        writes: ['export_history', 'tasks', 'files'],
        reads: ['videoTracks', 'videos'],
      }),
      execute: (input, context) => ok(services.createExport({ projectId: context.projectId, contentId: context.contentId, draftName: readString(input, 'draftName', false), copyAssets: readBoolean(input, 'copyAssets', true) }), undefined, '导出任务已创建'),
    },
  );

  for (const name of [
    'run_sub_agent_derive_assets',
    'run_sub_agent_generate_assets',
    'run_sub_agent_director_plan',
    'run_sub_agent_storyboard_gen',
    'run_sub_agent_storyboard_panel',
    'run_sub_agent_storyboard_table',
    'run_sub_agent_supervision',
  ] as const) {
    definitions.push({
      descriptor: descriptor({
        name,
        description: '生产子 Agent 占位工具，当前由 Production Agent 调度层接入。',
        inputSchema: S.object({ instruction: S.string }, ['instruction']),
        permissions: ['run:subAgent'],
        idempotency: 'none',
        status: 'reserved',
        writes: [],
        reads: ['flowData', 'resourceContext', 'skillBundle'],
      }),
      execute: () => ({ ok: false, error: '该子 Agent 工具尚未接入执行器' }),
    });
  }

  return definitions;
}

export function createProductionToolRegistry(context: ProductionToolContext, services: ProductionToolExecutorServices): ProductionToolRegistry {
  if (context.templateType !== PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA) {
    throw createError(VT_STATUS.INVALID_PARAMS, '当前仅支持 AI短剧 Production Tools');
  }

  const definitions = createDefinitions(services);
  const definitionsByName = new Map(definitions.map((definition) => [definition.descriptor.name, definition]));

  async function runRegisteredTool(toolNameValue: string, inputValue: unknown, source: ProductionToolRunPayload['source']): Promise<ProductionToolRunResult> {
    const toolName = normalizeToolName(toolNameValue);
    const definition = definitionsByName.get(toolName);
    if (!definition) {
      throw createError(VT_STATUS.INVALID_PARAMS, 'Production Tool 未注册');
    }
    const input = normalizeObject(inputValue ?? {});
    try {
      const result = await definition.execute(input, context);
      services.recordAudit({ projectId: context.projectId, contentId: context.contentId, toolName, source, taskId: context.taskId, input, result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: ProductionToolRunResult = { ok: false, error: message };
      services.recordAudit({ projectId: context.projectId, contentId: context.contentId, toolName, source, taskId: context.taskId, input, result, error: message });
      return result;
    }
  }

  return {
    list: () => definitions.map((definition) => definition.descriptor),
    get: (name) => {
      const definition = definitionsByName.get(normalizeToolName(name));
      if (!definition) {
        throw createError(VT_STATUS.INVALID_PARAMS, 'Production Tool 未注册');
      }
      return definition;
    },
    run: (payload) => runRegisteredTool(payload.toolName, payload.input ?? {}, payload.source),
    toAiTools: () => Object.fromEntries(definitions.map((definition) => [
      definition.descriptor.name,
      tool({
        description: definition.descriptor.description,
        inputSchema: jsonSchema(definition.descriptor.inputSchema),
        execute: (input) => runRegisteredTool(definition.descriptor.name, toRecord(input), 'agent'),
      }),
    ])),
  };
}

const descriptorOnlyServices: ProductionToolExecutorServices = {
  getFlowData: () => {
    throw createError(VT_STATUS.INVALID_PARAMS, 'descriptor only');
  },
  saveContent: () => null,
  extractResources: () => null,
  saveDirectorPlan: () => null,
  saveStoryboardTable: () => null,
  saveStoryboard: () => null,
  deleteStoryboards: () => null,
  saveDerivedAsset: () => null,
  deleteDerivedAsset: () => null,
  generateDerivedAssetImages: () => null,
  generateStoryboardImages: () => null,
  saveVideoTrack: () => null,
  generateVideoPrompts: () => null,
  generateVideos: () => null,
  selectVideo: () => null,
  validateExport: () => null,
  createExport: () => null,
  recordAudit: () => undefined,
};

export function listProductionToolDescriptors(): ProductionAgentToolDescriptor[] {
  return createDefinitions(descriptorOnlyServices).map((definition) => definition.descriptor);
}
