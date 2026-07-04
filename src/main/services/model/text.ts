import { extractReasoningMiddleware, generateText, stepCountIs, streamText, wrapLanguageModel } from 'ai';
import { VT_STATUS } from '@shared/constants/status';
import { getDatabase } from '../database';
import { createError } from '../result';
import { MODEL_SETTING_KEYS, MODEL_TYPES } from './constants';
import type { TextInvokeInput, TextModelConfig, TextStreamInput } from './types';
import { resolveModelCallContext, runModelCall, type ModelCallContext } from './gateway';

function resolveTextRequest(modelKey: string, think?: boolean, thinkLevel: 0 | 1 | 2 | 3 = 0, requestId?: string) {
  const context = resolveModelCallContext<TextModelConfig>({
    modelKey,
    expectedType: MODEL_TYPES.TEXT,
    requestId,
  });
  const { runtime, model } = context;

  if (!runtime.textRequest) {
    throw createError(VT_STATUS.MODEL_VENDOR_INVALID, '供应商未导出 textRequest', undefined, { requestId: context.requestId });
  }

  const effectiveThink = think ?? Boolean(model.think);
  const baseModel = runtime.textRequest(model, effectiveThink, thinkLevel);

  return { baseModel, agentConfig: context.agentConfig, context };
}

function withCommonTextSettings<TInput extends TextInvokeInput | TextStreamInput>(input: TInput) {
  const { modelKey, think, thinkLevel, requestId, ...rest } = input;
  const { baseModel, agentConfig, context } = resolveTextRequest(modelKey, think, thinkLevel, requestId);
  const toolCount = rest.tools ? Object.keys(rest.tools).length : 0;

  return {
    settings: {
      ...rest,
      model: baseModel,
      ...(toolCount > 0 ? { stopWhen: stepCountIs(toolCount * 50) } : {}),
      ...(agentConfig?.temperature !== null && agentConfig?.temperature !== undefined ? { temperature: agentConfig.temperature } : {}),
      ...(agentConfig?.maxOutputTokens !== null && agentConfig?.maxOutputTokens !== undefined && agentConfig.maxOutputTokens > 0 ? { maxOutputTokens: agentConfig.maxOutputTokens } : {}),
    },
    baseModel,
    context,
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
  return runModelCall(context as ModelCallContext, async () =>
    generateText({
      ...settings,
      model: await createWrappedTextModel(baseModel),
    } as Parameters<typeof generateText>[0]),
  );
}

export async function streamModelText(input: TextStreamInput) {
  const { settings, baseModel, context } = withCommonTextSettings(input);

  return runModelCall(context as ModelCallContext, async () =>
    streamText({
      ...settings,
      model: await createWrappedTextModel(baseModel),
    } as Parameters<typeof streamText>[0]),
  );
}
