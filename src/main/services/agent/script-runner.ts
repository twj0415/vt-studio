import { jsonSchema, tool, type Tool } from 'ai';
import type { AgentThinkConfigPayload } from '@shared/types/socket';
import type { ScriptAgentXmlApplyResult } from '@shared/types/script-agent';
import { readSkillFile, resolveSkillsForAgent, type ResolvedSkill } from '../skill-retrieval';
import { streamModelText } from '../model';
import { createScriptAgentTools } from './script-tools';
import { applyScriptAgentXmlOutput } from './script-xml';

const SCRIPT_AGENT_DECISION_SKILL = 'script_agent_decision.md';
const SCRIPT_AGENT_EXECUTION_SKILL = 'script_agent_execution.md';
const SCRIPT_AGENT_SUPERVISION_SKILL = 'script_agent_supervision.md';

type ScriptAgentModelKey =
  | 'scriptAgent:decisionAgent'
  | 'scriptAgent:storySkeletonAgent'
  | 'scriptAgent:adaptationStrategyAgent'
  | 'scriptAgent:scriptAgent'
  | 'scriptAgent:supervisionAgent';

type ScriptAgentToolSet = Record<string, Tool>;
type ScriptSubAgentKind = 'storySkeleton' | 'adaptationStrategy' | 'script' | 'supervision';

export interface ScriptAgentSubAgentUpdate {
  toolCallId: string;
  toolName: string;
  title: string;
  content: string;
  status: 'streaming' | 'complete' | 'error';
}

export interface ScriptAgentRunContextInput {
  projectId: number;
  userContent: string;
  thinkConfig: Required<AgentThinkConfigPayload>;
  abortSignal?: AbortSignal;
  onSubAgentUpdate?: (update: ScriptAgentSubAgentUpdate) => void;
  onWorkspaceApplied?: (result: ScriptAgentXmlApplyResult) => void;
}

export interface ScriptAgentRunContext {
  modelKey: ScriptAgentModelKey;
  system: string;
  tools: ScriptAgentToolSet;
}

interface SubAgentToolInput {
  task: string;
  chapterIndexes?: number[];
  scriptIds?: Array<number | string>;
  episodeKey?: string | null;
  scriptName?: string | null;
  requirements?: string | null;
}

interface SubAgentToolResult {
  ok: boolean;
  agent: ScriptSubAgentKind;
  output: string;
  xmlApplied?: ScriptAgentXmlApplyResult;
}

interface SubAgentConfig {
  kind: ScriptSubAgentKind;
  toolName: string;
  title: string;
  modelKey: ScriptAgentModelKey;
  requiredXmlTag?: 'storySkeleton' | 'adaptationStrategy' | 'scriptItem';
}

const SUB_AGENT_CONFIGS: SubAgentConfig[] = [
  {
    kind: 'storySkeleton',
    toolName: 'run_sub_agent_storySkeleton',
    title: '故事骨架子 Agent',
    modelKey: 'scriptAgent:storySkeletonAgent',
    requiredXmlTag: 'storySkeleton',
  },
  {
    kind: 'adaptationStrategy',
    toolName: 'run_sub_agent_adaptationStrategy',
    title: '改编策略子 Agent',
    modelKey: 'scriptAgent:adaptationStrategyAgent',
    requiredXmlTag: 'adaptationStrategy',
  },
  {
    kind: 'script',
    toolName: 'run_sub_agent_script',
    title: '剧本生成子 Agent',
    modelKey: 'scriptAgent:scriptAgent',
    requiredXmlTag: 'scriptItem',
  },
  {
    kind: 'supervision',
    toolName: 'run_supervision_agent',
    title: '监督层子 Agent',
    modelKey: 'scriptAgent:supervisionAgent',
  },
];

function normalizeTask(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('子 Agent 任务不能为空');
  }

  return normalized;
}

function uniqueSkills(skills: ResolvedSkill[]): ResolvedSkill[] {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    if (seen.has(skill.path)) {
      return false;
    }
    seen.add(skill.path);
    return true;
  });
}

async function readSkillBundle(attribution: string, query: string): Promise<string> {
  const resolved = await resolveSkillsForAgent({ attribution, query, limit: 4 });
  const skills = uniqueSkills([...resolved.mainSkills, ...resolved.referenceSkills]);
  const targetSkills = skills.length > 0 ? skills : [{ id: attribution, path: attribution, name: attribution, description: '', type: 'main' as const }];
  const parts: string[] = [];

  for (const skill of targetSkills) {
    const file = await readSkillFile(skill.path);
    parts.push([`# Skill: ${skill.name}`, `Path: ${file.path}`, file.content].join('\n'));
  }

  if (resolved.warning) {
    parts.push(`Skill 检索降级说明：${resolved.warning}`);
  }

  return parts.join('\n\n---\n\n');
}

function buildDecisionInstructions(): string {
  return [
    '你是剧本 Agent 的决策层。',
    '你必须先判断用户目标，再按需调用上下文工具或子 Agent 工具。',
    '可用子 Agent：run_sub_agent_storySkeleton、run_sub_agent_adaptationStrategy、run_sub_agent_script、run_supervision_agent。',
    '故事骨架、改编策略、剧本正文的结构化产物必须由对应子 Agent 输出 XML；不要在普通说明里手写伪 XML。',
    '如果任务只需要问答或分析，可以先调用只读上下文工具后直接回复。',
    '所有项目事实必须来自工具或用户输入，不要编造章节、事件或已有剧本。',
  ].join('\n');
}

function buildSubAgentInstructions(config: SubAgentConfig): string {
  if (config.kind === 'storySkeleton') {
    return '你的输出必须包含且只通过 <storySkeleton>...</storySkeleton> 承载最终故事骨架。';
  }
  if (config.kind === 'adaptationStrategy') {
    return '你的输出必须包含且只通过 <adaptationStrategy>...</adaptationStrategy> 承载最终改编策略。';
  }
  if (config.kind === 'script') {
    return '你的输出必须包含一个或多个 <scriptItem name="...">...</scriptItem>；如有稳定 episodeKey 可写入 episodeKey 属性。';
  }

  return '你是监督层，只输出审核意见、问题和修正建议；不要直接输出可写入工作区的 XML。';
}

function buildSubAgentUserMessage(input: SubAgentToolInput): string {
  return [
    `任务：${normalizeTask(input.task)}`,
    input.requirements ? `补充要求：${input.requirements}` : '',
    input.chapterIndexes?.length ? `重点章节序号：${input.chapterIndexes.join(', ')}` : '',
    input.scriptIds?.length ? `相关剧本 ID：${input.scriptIds.join(', ')}` : '',
    input.episodeKey ? `目标 episodeKey：${input.episodeKey}` : '',
    input.scriptName ? `目标剧本名称：${input.scriptName}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function buildSubAgentSystem(config: SubAgentConfig, task: string): Promise<string> {
  const skillBundle = await readSkillBundle(config.kind === 'supervision' ? SCRIPT_AGENT_SUPERVISION_SKILL : SCRIPT_AGENT_EXECUTION_SKILL, `${config.title}\n${task}`);
  return [skillBundle, buildSubAgentInstructions(config)].join('\n\n');
}

async function runSubAgent(projectId: number, config: SubAgentConfig, input: SubAgentToolInput, options: ScriptAgentRunContextInput, toolCallId: string): Promise<SubAgentToolResult> {
  const task = normalizeTask(input.task);
  const system = await buildSubAgentSystem(config, task);
  const abortSignal = options.abortSignal;
  let output = '';

  try {
    options.onSubAgentUpdate?.({
      toolCallId,
      toolName: config.toolName,
      title: config.title,
      content: '',
      status: 'streaming',
    });

    const result = await streamModelText({
      modelKey: config.modelKey,
      system,
      messages: [{ role: 'user', content: buildSubAgentUserMessage(input) }],
      tools: createScriptAgentTools(projectId),
      think: options.thinkConfig.think,
      thinkLevel: options.thinkConfig.thinkLevel,
      abortSignal,
    });

    for await (const delta of result.textStream) {
      if (abortSignal?.aborted) {
        break;
      }
      output += delta;
      options.onSubAgentUpdate?.({
        toolCallId,
        toolName: config.toolName,
        title: config.title,
        content: output,
        status: 'streaming',
      });
    }

    if (abortSignal?.aborted) {
      throw new Error(`${config.title} 已停止`);
    }

    let xmlApplied: ScriptAgentXmlApplyResult | undefined;
    if (config.requiredXmlTag) {
      xmlApplied = applyScriptAgentXmlOutput(projectId, output);
      if (xmlApplied.errors.length > 0) {
        throw new Error(`${config.title} XML 输出格式错误：${xmlApplied.errors.join('；')}`);
      }
      if (xmlApplied.appliedCount <= 0 || !xmlApplied.workspace) {
        throw new Error(`${config.title} 未输出可写入的 ${config.requiredXmlTag} XML`);
      }
      options.onWorkspaceApplied?.(xmlApplied);
    }

    options.onSubAgentUpdate?.({
      toolCallId,
      toolName: config.toolName,
      title: config.title,
      content: output,
      status: 'complete',
    });

    return {
      ok: true,
      agent: config.kind,
      output,
      ...(xmlApplied ? { xmlApplied } : {}),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    options.onSubAgentUpdate?.({
      toolCallId,
      toolName: config.toolName,
      title: config.title,
      content: errorMessage,
      status: 'error',
    });
    if (config.kind === 'supervision' && !abortSignal?.aborted) {
      return {
        ok: false,
        agent: config.kind,
        output: errorMessage,
      };
    }
    throw error;
  }
}

function createSubAgentTool(projectId: number, config: SubAgentConfig, options: ScriptAgentRunContextInput): Tool<SubAgentToolInput, SubAgentToolResult> {
  return tool<SubAgentToolInput, SubAgentToolResult>({
    description: `${config.title}。${buildSubAgentInstructions(config)}`,
    inputSchema: jsonSchema<SubAgentToolInput>({
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: '交给子 Agent 的明确任务。',
        },
        chapterIndexes: {
          type: 'array',
          items: { type: 'number' },
          description: '需要重点参考的章节序号。',
        },
        scriptIds: {
          type: 'array',
          items: {
            oneOf: [{ type: 'number' }, { type: 'string' }],
          },
          description: '需要重点参考的已有剧本 ID。',
        },
        episodeKey: {
          type: 'string',
          description: '目标剧本 episodeKey，可选。',
        },
        scriptName: {
          type: 'string',
          description: '目标剧本名称，可选。',
        },
        requirements: {
          type: 'string',
          description: '额外格式、风格、时长或质量要求。',
        },
      },
      required: ['task'],
      additionalProperties: false,
    }),
    execute: (input, executionOptions) => runSubAgent(projectId, config, input, options, executionOptions.toolCallId),
  });
}

function createScriptAgentDecisionTools(projectId: number, options: ScriptAgentRunContextInput): ScriptAgentToolSet {
  const tools: ScriptAgentToolSet = {
    ...createScriptAgentTools(projectId),
  };

  for (const config of SUB_AGENT_CONFIGS) {
    tools[config.toolName] = createSubAgentTool(projectId, config, options);
  }

  return tools;
}

export async function createScriptAgentRunContext(input: ScriptAgentRunContextInput): Promise<ScriptAgentRunContext> {
  const system = [await readSkillBundle(SCRIPT_AGENT_DECISION_SKILL, input.userContent), buildDecisionInstructions()].join('\n\n');

  return {
    modelKey: 'scriptAgent:decisionAgent',
    system,
    tools: createScriptAgentDecisionTools(input.projectId, input),
  };
}
