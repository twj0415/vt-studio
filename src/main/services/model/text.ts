import { extractReasoningMiddleware, generateText, stepCountIs, streamText, wrapLanguageModel } from 'ai';
import {
  getTextReasoningCapability,
  normalizeReasoningEffort,
  REASONING_EFFORTS,
  reasoningEffortToThinkLevel,
  resolveSupportedReasoningEffort,
  thinkLevelToReasoningEffort,
  type ReasoningEffort,
} from '@shared/constants/model-capabilities';
import { VT_STATUS } from '@shared/constants/status';
import { getDatabase } from '../database';
import { createError } from '../result';
import { MODEL_SETTING_KEYS, MODEL_TYPES } from './constants';
import type { TextInvokeInput, TextModelConfig, TextStreamInput } from './types';
import { resolveModelCallContext, runModelCall, type ModelCallContext } from './gateway';
import {
  recordModelRequestTraceInput,
  recordModelRequestTraceNormalizedInput,
  recordModelRequestTraceOutput,
} from './request-diagnostics';

type ProviderOptions = Record<string, Record<string, unknown>>;
type UnknownRecord = Record<string, unknown>;

function resolveTextReasoning(context: ModelCallContext<TextModelConfig>, think?: boolean, thinkLevel: 0 | 1 | 2 | 3 = 0, reasoningEffort?: ReasoningEffort) {
  const capability = getTextReasoningCapability({
    provider: context.protocolVendorId,
    modelName: context.model.modelName,
    think: context.model.think,
    reasoning: context.model.reasoning,
  });
  const defaultEnabledEffort = capability.defaultEffort !== REASONING_EFFORTS.NONE ? capability.defaultEffort : capability.efforts.find((effort) => effort !== REASONING_EFFORTS.NONE) ?? REASONING_EFFORTS.LOW;
  const legacyEffort = think ? thinkLevelToReasoningEffort(thinkLevel, defaultEnabledEffort) : REASONING_EFFORTS.NONE;
  const requestedEffort = normalizeReasoningEffort(reasoningEffort, legacyEffort);
  const requestedThink = think ?? requestedEffort !== REASONING_EFFORTS.NONE;
  const effectiveEffort = requestedThink ? resolveSupportedReasoningEffort(capability, requestedEffort) : REASONING_EFFORTS.NONE;
  const effectiveThink = capability.supported && effectiveEffort !== REASONING_EFFORTS.NONE;

  return {
    think: effectiveThink,
    thinkLevel: reasoningEffortToThinkLevel(effectiveEffort),
    reasoningEffort: effectiveEffort,
    capability,
  };
}

function shouldAttachOpenAiReasoningOptions(context: ModelCallContext<TextModelConfig>, reasoningEffort: ReasoningEffort): boolean {
  if (reasoningEffort === REASONING_EFFORTS.NONE && !context.model.reasoning?.supported) {
    return false;
  }

  return context.protocolVendorId === 'openai' || /^(gpt-5|o[134])/.test(context.model.modelName.toLowerCase());
}

function mergeReasoningProviderOptions(
  providerOptions: TextInvokeInput['providerOptions'] | TextStreamInput['providerOptions'] | undefined,
  context: ModelCallContext<TextModelConfig>,
  reasoningEffort: ReasoningEffort,
): TextInvokeInput['providerOptions'] | TextStreamInput['providerOptions'] | undefined {
  if (!shouldAttachOpenAiReasoningOptions(context, reasoningEffort)) {
    return providerOptions;
  }

  const merged: ProviderOptions = { ...((providerOptions as ProviderOptions | undefined) ?? {}) };
  const providerKeys = new Set(['openai']);
  if (context.protocol === 'openai-compatible') {
    providerKeys.add(context.protocolVendorId);
    providerKeys.add('openaiCompatible');
  }

  for (const key of providerKeys) {
    merged[key] = {
      ...(merged[key] ?? {}),
      reasoningEffort,
    };
  }

  return merged as TextInvokeInput['providerOptions'];
}

function resolveTextRequest(modelKey: string, think?: boolean, thinkLevel: 0 | 1 | 2 | 3 = 0, reasoningEffort?: ReasoningEffort, requestId?: string) {
  const context = resolveModelCallContext<TextModelConfig>({
    modelKey,
    expectedType: MODEL_TYPES.TEXT,
    requestId,
  });
  const { runtime, model } = context;

  if (!runtime.textRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '供应商未导出 textRequest', undefined, { requestId: context.requestId });
  }

  const reasoning = resolveTextReasoning(context, think, thinkLevel, reasoningEffort);
  const baseModel = runtime.textRequest(model, reasoning.think, reasoning.thinkLevel, reasoning.reasoningEffort);

  return { baseModel, agentConfig: context.agentConfig, context, reasoning };
}

function withCommonTextSettings<TInput extends TextInvokeInput | TextStreamInput>(input: TInput) {
  const { modelKey, think, thinkLevel, reasoningEffort, requestId, providerOptions, ...rest } = input;
  const { baseModel, agentConfig, context, reasoning } = resolveTextRequest(modelKey, think, thinkLevel, reasoningEffort, requestId);
  const toolCount = rest.tools ? Object.keys(rest.tools).length : 0;

  return {
    settings: {
      ...rest,
      model: baseModel,
      providerOptions: mergeReasoningProviderOptions(providerOptions, context, reasoning.reasoningEffort),
      ...(toolCount > 0 ? { stopWhen: stepCountIs(toolCount * 50) } : {}),
      ...(agentConfig?.temperature !== null && agentConfig?.temperature !== undefined ? { temperature: agentConfig.temperature } : {}),
      ...(agentConfig?.maxOutputTokens !== null && agentConfig?.maxOutputTokens !== undefined && agentConfig.maxOutputTokens > 0 ? { maxOutputTokens: agentConfig.maxOutputTokens } : {}),
    },
    baseModel,
    context,
  };
}

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function getToolNames(tools: unknown): string[] {
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) {
    return [];
  }

  return Object.keys(tools as UnknownRecord);
}

function summarizeTextInput(input: TextInvokeInput | TextStreamInput): UnknownRecord {
  const source = input as UnknownRecord;
  const { modelKey, requestId, think, thinkLevel, reasoningEffort, tools, providerOptions, messages, prompt, system, ...options } = source;

  return {
    modelKey,
    requestId,
    think,
    thinkLevel,
    reasoningEffort,
    system,
    prompt,
    messages,
    toolNames: getToolNames(tools),
    providerOptions,
    options,
  };
}

function summarizeTextSettings(settings: UnknownRecord, context: ModelCallContext<TextModelConfig>): UnknownRecord {
  const { model: _model, tools, providerOptions, messages, prompt, system, stopWhen, ...options } = settings;

  return {
    model: {
      vendorId: context.vendorId,
      protocolVendorId: context.protocolVendorId,
      modelName: context.modelName,
      protocol: context.protocol,
    },
    system,
    prompt,
    messages,
    toolNames: getToolNames(tools),
    providerOptions,
    hasStopWhen: Boolean(stopWhen),
    options,
  };
}

function summarizeToolCalls(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    const record = toRecord(item);
    return {
      toolName: record.toolName,
      toolCallId: record.toolCallId,
      args: record.args,
    };
  });
}

function summarizeTextResponse(value: unknown): unknown {
  const response = toRecord(value);
  if (!Object.keys(response).length) {
    return value;
  }

  return {
    id: response.id,
    modelId: response.modelId,
    timestamp: response.timestamp,
    headers: response.headers,
  };
}

function summarizeTextSteps(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    const step = toRecord(item);
    return {
      finishReason: step.finishReason,
      usage: step.usage,
      text: step.text,
      reasoningText: step.reasoningText,
      toolCalls: summarizeToolCalls(step.toolCalls),
    };
  });
}

function summarizeTextResult(value: unknown): UnknownRecord {
  const result = toRecord(value);
  return {
    kind: 'text',
    text: result.text,
    reasoningText: result.reasoningText,
    finishReason: result.finishReason,
    usage: result.usage,
    warnings: result.warnings,
    toolCalls: summarizeToolCalls(result.toolCalls),
    sources: result.sources,
    response: summarizeTextResponse(result.response),
    steps: summarizeTextSteps(result.steps),
  };
}

function summarizeTextStreamResult(value: unknown): UnknownRecord {
  const result = toRecord(value);
  return {
    kind: 'stream',
    created: true,
    hasTextStream: Boolean(result.textStream),
    hasFullStream: Boolean(result.fullStream),
    hasUsagePromise: Boolean(result.usage),
    hasFinishReasonPromise: Boolean(result.finishReason),
  };
}

function isAiDevToolsEnabled(): boolean {
  const row = getDatabase().prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(MODEL_SETTING_KEYS.switchAiDevTool);
  return row?.value === '1';
}

async function createWrappedTextModel(baseModel: ReturnType<typeof resolveTextRequest>['baseModel']) {
  const middleware: unknown[] = [extractReasoningMiddleware({ tagName: 'reasoning_content', separator: '\n' })];
  if (isAiDevToolsEnabled()) {
    const { devToolsMiddleware } = await import('@ai-sdk/devtools');
    middleware.push(devToolsMiddleware());
  }

  return wrapLanguageModel({
    model: baseModel as Parameters<typeof wrapLanguageModel>[0]['model'],
    middleware: middleware as Parameters<typeof wrapLanguageModel>[0]['middleware'],
  });
}

export async function invokeText(input: TextInvokeInput) {
  const { settings, baseModel, context } = withCommonTextSettings(input);
  return runModelCall(context as ModelCallContext, async () => {
    recordModelRequestTraceInput(context.requestId, 'Text input', summarizeTextInput(input));
    recordModelRequestTraceNormalizedInput(context.requestId, 'AI SDK settings', summarizeTextSettings(settings as UnknownRecord, context));
    const result = await generateText({
      ...settings,
      model: await createWrappedTextModel(baseModel),
    } as Parameters<typeof generateText>[0]);
    recordModelRequestTraceOutput(context.requestId, 'Text output', summarizeTextResult(result));
    return result;
  });
}

export async function streamModelText(input: TextStreamInput) {
  const { settings, baseModel, context } = withCommonTextSettings(input);

  return runModelCall(context as ModelCallContext, async () => {
    recordModelRequestTraceInput(context.requestId, 'Text stream input', summarizeTextInput(input));
    recordModelRequestTraceNormalizedInput(context.requestId, 'AI SDK stream settings', summarizeTextSettings(settings as UnknownRecord, context));
    const result = streamText({
      ...settings,
      model: await createWrappedTextModel(baseModel),
    } as Parameters<typeof streamText>[0]);
    recordModelRequestTraceOutput(context.requestId, 'Text stream output', summarizeTextStreamResult(result));
    return result;
  });
}
