import { randomUUID } from 'node:crypto';
import type { Namespace } from 'socket.io';
import { VT_STATUS } from '@shared/constants/status';
import type {
  AgentContentBlock,
  AgentChatPayload,
  AgentContextPayload,
  AgentMessage,
  AgentMessageStatus,
  AgentNamespace,
  AgentRegeneratePayload,
  AgentSocketErrorPayload,
  AgentThinkConfigPayload,
} from '@shared/types/socket';
import type { ScriptAgentXmlApplyResult } from '@shared/types/script-agent';
import { normalizeUnknownError } from '@shared/errors';
import { addMemory } from '../memory';
import { streamModelText } from '../model';
import { logger } from '../logger';
import { cancelTask, createTask, failTask, succeedTask } from '../task/service';
import { createScriptAgentRunContext, type ScriptAgentSubAgentUpdate } from '../agent/script-runner';
import {
  applyScriptAgentXmlOutput,
  createScriptAgentWorkspaceSocketUpdate,
  stripScriptAgentXmlForDisplay,
} from '../agent/script-xml';
import { ThinkStreamParser } from './stripThink';
import type { AgentSessionState, AgentSocket } from './types';

const DEFAULT_THINK_CONFIG: Required<AgentThinkConfigPayload> = {
  think: false,
  thinkLevel: 0,
};

function emitSocketError(socket: AgentSocket, msg: string, code = String(VT_STATUS.AGENT_ERROR)): void {
  const payload: AgentSocketErrorPayload = { code, msg };
  socket.emit('error', payload);
}

function emitMessage(socket: AgentSocket, message: AgentMessage): void {
  socket.emit('message', message);
}

function emitMessageUpdate(socket: AgentSocket, message: AgentMessage): void {
  socket.emit('message:update', {
    id: message.id,
    type: message.type,
    content: message.content,
    status: message.status,
    role: 'assistant',
  });
}

function readSocketProjectId(socket: AgentSocket): number {
  const projectId = Number(socket.data.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error('项目 ID 无效');
  }

  return projectId;
}

function emitContentBlock(
  socket: AgentSocket,
  content: AgentContentBlock,
  emittedContentIds: Set<string>,
): void {
  if (emittedContentIds.has(content.id)) {
    socket.emit('content:update', {
      messageId: content.messageId,
      contentId: content.id,
      patch: {
        content: content.content,
        status: content.status,
        type: content.type,
        toolcall: content.toolcall,
      },
    });
    return;
  }

  emittedContentIds.add(content.id);
  socket.emit('content:add', {
    messageId: content.messageId,
    content,
  });
}

function stringifyToolPayload(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isScriptAgentSubAgentTool(toolName: string): boolean {
  return toolName === 'run_supervision_agent' || toolName.startsWith('run_sub_agent_');
}

function sanitizeToolDisplayResult(toolName: string, value: unknown): unknown {
  if (!isScriptAgentSubAgentTool(toolName) || !value || typeof value !== 'object') {
    return value;
  }

  const result = value as {
    ok?: unknown;
    agent?: unknown;
    output?: unknown;
    xmlApplied?: Pick<ScriptAgentXmlApplyResult, 'appliedCount' | 'patches' | 'errors'>;
  };
  const visibleOutput =
    typeof result.output === 'string'
      ? stripScriptAgentXmlForDisplay(result.output) || (result.ok === false ? result.output : '结构化输出已由子 Agent 过程块展示')
      : result.output;

  return {
    ok: result.ok,
    agent: result.agent,
    output: visibleOutput,
    ...(result.xmlApplied
      ? {
          xmlApplied: {
            appliedCount: result.xmlApplied.appliedCount,
            patches: result.xmlApplied.patches,
            errors: result.xmlApplied.errors,
          },
        }
      : {}),
  };
}

function emitToolStepContent(
  socket: AgentSocket,
  messageId: string,
  emittedContentIds: Set<string>,
  stepResult: {
    toolCalls?: Array<{ toolCallId: string; toolName: string; input?: unknown }>;
    toolResults?: Array<{ toolCallId: string; toolName: string; output?: unknown; result?: unknown }>;
  },
): void {
  for (const toolCall of stepResult.toolCalls ?? []) {
    const toolResult = (stepResult.toolResults ?? []).find((item) => item.toolCallId === toolCall.toolCallId);
    const output = toolResult?.output ?? toolResult?.result;
    const displayOutput = sanitizeToolDisplayResult(toolCall.toolName, output);
    const content = [`tool: ${toolCall.toolName}`, `args: ${stringifyToolPayload(toolCall.input)}`, `result: ${stringifyToolPayload(displayOutput)}`].join('\n');

    emitContentBlock(
      socket,
      {
        id: `${messageId}:tool:${toolCall.toolCallId}`,
        messageId,
        type: 'toolcall',
        content,
        status: 'complete',
        toolcall: {
          name: toolCall.toolName,
          args: toolCall.input,
          result: displayOutput,
        },
      },
      emittedContentIds,
    );
  }
}

function emitSubAgentContent(
  socket: AgentSocket,
  messageId: string,
  emittedContentIds: Set<string>,
  update: ScriptAgentSubAgentUpdate,
): void {
  const visibleContent = stripScriptAgentXmlForDisplay(update.content, update.status === 'streaming');
  const fallbackContent =
    update.status === 'streaming'
      ? `${update.title} 正在生成结构化输出`
      : update.status === 'complete'
        ? `${update.title} 已完成结构化输出`
        : update.content;

  emitContentBlock(
    socket,
    {
      id: `${messageId}:subagent:${update.toolCallId}`,
      messageId,
      type: 'toolcall',
      content: [`subAgent: ${update.title}`, visibleContent || fallbackContent].join('\n'),
      status: update.status,
      toolcall: {
        name: update.toolName,
        result: update.status,
      },
    },
    emittedContentIds,
  );
}

function updateAgentTask(taskId: number | null, action: 'succeed' | 'fail' | 'cancel', error?: unknown): void {
  if (!taskId) {
    return;
  }

  try {
    if (action === 'succeed') {
      succeedTask(taskId);
      return;
    }
    if (action === 'cancel') {
      cancelTask(taskId, '剧本 Agent 生成已停止');
      return;
    }
    failTask(taskId, error ?? '剧本 Agent 生成失败');
  } catch (taskError) {
    logger.warn('任务中心', '剧本 Agent 任务状态更新失败，已跳过');
    logger.detail('任务中心', '剧本 Agent 任务状态更新失败详情', normalizeUnknownError(taskError));
  }
}

function normalizeChatPayload(payload: unknown): AgentChatPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('chat 参数无效');
  }

  const content = (payload as AgentChatPayload).content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('消息内容不能为空');
  }

  return { content, role: 'user' };
}

function normalizeThinkConfig(payload: unknown): Required<AgentThinkConfigPayload> {
  if (!payload || typeof payload !== 'object') {
    return DEFAULT_THINK_CONFIG;
  }

  const think = Boolean((payload as AgentThinkConfigPayload).think);
  const rawThinkLevel = (payload as AgentThinkConfigPayload).thinkLevel;
  const thinkLevel = rawThinkLevel === 1 || rawThinkLevel === 2 || rawThinkLevel === 3 ? rawThinkLevel : 0;

  return { think, thinkLevel };
}

async function persistSocketMemory(socket: AgentSocket, namespace: AgentNamespace, role: 'user' | 'assistant', content: string, name?: string): Promise<void> {
  const normalized = content.trim();
  if (!normalized) {
    return;
  }

  try {
    await addMemory({
      isolationKey: socket.data.isolationKey,
      agentType: namespace,
      role,
      name,
      content: normalized,
      metadata: { source: 'agent-socket' },
    });
  } catch (error) {
    logger.warn('Agent 记忆', '对话记忆写入失败，已跳过');
    logger.detail('Agent 记忆', '对话记忆写入失败详情', normalizeUnknownError(error));
  }
}

async function consumeModelStream(
  socket: AgentSocket,
  namespace: AgentNamespace,
  content: string,
  state: AgentSessionState,
): Promise<void> {
  const messageId = randomUUID();
  const emittedContentIds = new Set<string>();
  const markdownContentId = `${messageId}:markdown`;
  const thinkingContentId = `${messageId}:thinking`;
  let markdownContent = '';
  let visibleMarkdownContent = '';
  let thinkingContent = '';
  const parser = new ThinkStreamParser();
  let taskId: number | null = null;
  let completionError: Error | null = null;

  state.abortController = new AbortController();

  const pendingMessage: AgentMessage = {
    id: messageId,
    type: 'markdown',
    content: '',
    status: 'pending',
  };
  emitMessage(socket, pendingMessage);
  emitMessageUpdate(socket, pendingMessage);

  function emitMarkdownSnapshot(status: AgentMessageStatus): void {
    const nextVisibleContent = stripScriptAgentXmlForDisplay(markdownContent, status === 'streaming');
    if (nextVisibleContent === visibleMarkdownContent && status === 'streaming') {
      return;
    }

    const visibleDelta = nextVisibleContent.startsWith(visibleMarkdownContent)
      ? nextVisibleContent.slice(visibleMarkdownContent.length)
      : nextVisibleContent;
    visibleMarkdownContent = nextVisibleContent;
    if (visibleDelta) {
      const markdownMessage: AgentMessage = {
        id: messageId,
        type: 'markdown',
        content: visibleDelta,
        status,
      };
      emitMessage(socket, markdownMessage);
    }
    if (nextVisibleContent || emittedContentIds.has(markdownContentId)) {
      emitContentBlock(
        socket,
        {
          id: markdownContentId,
          messageId,
          type: 'markdown',
          content: nextVisibleContent,
          status,
        },
        emittedContentIds,
      );
    }
  }

  try {
    await persistSocketMemory(socket, namespace, 'user', content);
    const projectId = namespace === 'scriptAgent' ? readSocketProjectId(socket) : null;
    if (namespace === 'scriptAgent' && projectId) {
      const task = createTask({
        projectId,
        category: '剧本 Agent',
        relatedObjects: { projectId, messageId, action: 'chat' },
        modelName: 'scriptAgent:decisionAgent',
        description: content.slice(0, 200),
      });
      taskId = task.taskId;
    }

    const scriptAgentRunContext =
      namespace === 'scriptAgent' && projectId
        ? await createScriptAgentRunContext({
            projectId,
            userContent: content,
            thinkConfig: state.thinkConfig,
            abortSignal: state.abortController.signal,
            onSubAgentUpdate: (update) => {
              emitSubAgentContent(socket, messageId, emittedContentIds, update);
            },
            onWorkspaceApplied: (xmlResult) => {
              if (xmlResult.workspace) {
                socket.emit('workspace:update', createScriptAgentWorkspaceSocketUpdate(projectId, xmlResult));
              }
            },
          })
        : null;

    const result = await streamModelText({
      modelKey: scriptAgentRunContext?.modelKey ?? namespace,
      ...(scriptAgentRunContext ? { system: scriptAgentRunContext.system } : {}),
      messages: [{ role: 'user', content }],
      think: state.thinkConfig.think,
      thinkLevel: state.thinkConfig.thinkLevel,
      abortSignal: state.abortController.signal,
      ...(scriptAgentRunContext ? { tools: scriptAgentRunContext.tools } : {}),
      ...(namespace === 'scriptAgent'
        ? {
            onStepFinish: (stepResult) => {
              emitToolStepContent(socket, messageId, emittedContentIds, stepResult);
            },
          }
        : {}),
    });

    for await (const delta of result.textStream) {
      if (state.abortController.signal.aborted) {
        break;
      }

      const parsed = parser.feed(delta);
      if (parsed.thinking) {
        thinkingContent += parsed.thinking;
        const thinkingMessage: AgentMessage = {
          id: messageId,
          type: 'thinking',
          content: parsed.thinking,
          status: 'streaming',
        };
        emitMessage(socket, thinkingMessage);
        emitContentBlock(
          socket,
          {
            id: thinkingContentId,
            messageId,
            type: 'thinking',
            content: thinkingContent,
            status: 'streaming',
          },
          emittedContentIds,
        );
      }
      if (parsed.content) {
        markdownContent += parsed.content;
        emitMarkdownSnapshot('streaming');
      }
    }

    const flushed = parser.flush();
    if (flushed.thinking) {
      thinkingContent += flushed.thinking;
      const thinkingMessage: AgentMessage = {
        id: messageId,
        type: 'thinking',
        content: flushed.thinking,
        status: 'streaming',
      };
      emitMessage(socket, thinkingMessage);
      emitContentBlock(
        socket,
        {
          id: thinkingContentId,
          messageId,
          type: 'thinking',
          content: thinkingContent,
          status: 'streaming',
        },
        emittedContentIds,
      );
    }
    if (flushed.content) {
      markdownContent += flushed.content;
      emitMarkdownSnapshot('streaming');
    }

    const finalStatus: AgentMessageStatus = state.abortController.signal.aborted ? 'stop' : 'complete';
    emitMarkdownSnapshot(finalStatus);
    const finalMessage: AgentMessage = {
      id: messageId,
      type: 'markdown',
      content: '',
      status: finalStatus,
    };
    emitMessage(socket, finalMessage);
    emitMessageUpdate(socket, finalMessage);
    for (const contentId of emittedContentIds) {
      socket.emit('content:update', {
        messageId,
        contentId,
        patch: { status: finalStatus },
      });
    }
    if (finalStatus === 'complete') {
      if (namespace === 'scriptAgent' && projectId) {
        try {
          const xmlResult = applyScriptAgentXmlOutput(projectId, markdownContent);
          if (xmlResult.errors.length > 0) {
            completionError = new Error(`Agent XML 输出格式错误：${xmlResult.errors.join('；')}`);
            emitSocketError(socket, completionError.message, String(VT_STATUS.INVALID_PARAMS));
          } else if (xmlResult.appliedCount > 0 && xmlResult.workspace) {
            socket.emit('workspace:update', createScriptAgentWorkspaceSocketUpdate(projectId, xmlResult));
          }
        } catch (error) {
          const normalized = normalizeUnknownError(error);
          completionError = new Error(`Agent XML 写入失败：${normalized.message}`);
          emitSocketError(socket, completionError.message, String(VT_STATUS.AGENT_ERROR));
        }
      }

      const memoryContent = namespace === 'scriptAgent' ? stripScriptAgentXmlForDisplay(markdownContent) : markdownContent;
      await persistSocketMemory(socket, namespace, 'assistant', memoryContent, namespace === 'scriptAgent' ? '剧本 Agent' : '生产 Agent');
    }
    if (namespace === 'scriptAgent') {
      updateAgentTask(taskId, finalStatus === 'stop' ? 'cancel' : completionError ? 'fail' : 'succeed', completionError ?? undefined);
    }
  } catch (error) {
    if (namespace === 'scriptAgent') {
      updateAgentTask(taskId, state.abortController.signal.aborted ? 'cancel' : 'fail', error);
    }
    const normalized = normalizeUnknownError(error);
    const errorMessage: AgentMessage = {
      id: messageId,
      type: 'markdown',
      content: normalized.message,
      status: 'error',
    };
    emitMessage(socket, errorMessage);
    emitMessageUpdate(socket, errorMessage);
    emitSocketError(socket, normalized.message);
  } finally {
    state.abortController = null;
  }
}

export function registerAgentNamespace(ioNamespace: Namespace, namespace: AgentNamespace): void {
  const sessions = new Map<string, AgentSessionState>();

  ioNamespace.on('connection', (rawSocket) => {
    const socket = rawSocket as AgentSocket;
    const state: AgentSessionState = {
      abortController: null,
      thinkConfig: DEFAULT_THINK_CONFIG,
    };
    sessions.set(socket.id, state);

    socket.on('updateThinkConfig', (payload: unknown) => {
      state.thinkConfig = normalizeThinkConfig(payload);
    });

    socket.on('updateContext', (payload: unknown) => {
      if (namespace !== 'productionAgent') {
        return;
      }
      state.context = (payload as AgentContextPayload | undefined)?.context;
    });

    socket.on('stop', () => {
      state.abortController?.abort();
    });

    socket.on('regenerate', (payload: unknown) => {
      const messageId = (payload as AgentRegeneratePayload | undefined)?.messageId;
      if (typeof messageId !== 'string' || messageId.trim().length === 0) {
        emitSocketError(socket, 'regenerate 参数无效', String(VT_STATUS.INVALID_PARAMS));
        return;
      }

      emitSocketError(socket, '业务重生成待剧本/生产 Agent 接入历史消息后实现', String(VT_STATUS.AGENT_ERROR));
    });

    socket.on('chat', (payload: unknown) => {
      void (async () => {
        if (state.abortController) {
          emitSocketError(socket, '已有 Agent 消息正在生成中，请先停止或等待完成', String(VT_STATUS.CONFLICT));
          return;
        }

        try {
          const chatPayload = normalizeChatPayload(payload);
          await consumeModelStream(socket, namespace, chatPayload.content, state);
        } catch (error) {
          const normalized = normalizeUnknownError(error);
          emitSocketError(socket, normalized.message);
        }
      })();
    });

    socket.on('disconnect', () => {
      state.abortController?.abort();
      sessions.delete(socket.id);
    });
  });
}
