import { jsonSchema, tool } from 'ai';
import { stripThink } from '../socket/stripThink';
import { createModelRequestId } from './gateway';
import { invokeText } from './text';
import type { TextInvokeInput } from './types';

type JsonSchemaDefinition<TOutput extends object> = Parameters<typeof jsonSchema<TOutput>>[0];
type TextResult = Awaited<ReturnType<typeof invokeText>>;
type StructuredSource = 'tool' | 'text' | 'jsonFallback' | 'none';
type StructuredStage = 'initial' | 'jsonFallback';

interface ToolResultRecord {
  toolName?: string;
  output?: unknown;
  result?: unknown;
}

interface StructuredAttemptDiagnostics {
  stage: StructuredStage;
  requestId: string;
  source: StructuredSource;
  hasToolResult: boolean;
  hasText: boolean;
  rawText?: string;
  finishReason?: unknown;
  usage?: unknown;
  warnings?: unknown;
  response?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  steps?: unknown;
}

export interface StructuredResultDiagnostics {
  requestId: string;
  fallbackRequestId?: string;
  modelKey: string;
  status: 'returned' | 'parse_failed';
  source: StructuredSource;
  usedJsonFallback: boolean;
  attempts: StructuredAttemptDiagnostics[];
  parsed?: unknown;
  recordedAt: number;
}

interface StructuredResultOptions<TToolOutput extends object, TOutput> extends Omit<TextInvokeInput, 'tools'> {
  toolName?: string;
  toolDescription: string;
  inputSchema: JsonSchemaDefinition<TToolOutput>;
  jsonFallbackExample: string;
  jsonFallbackInstruction?: string;
  coerce: (value: unknown) => TToolOutput | null;
  normalize?: (value: TToolOutput) => TOutput;
  validate?: (value: TOutput) => void;
  diagnosticSummary?: (value: TOutput | null) => unknown;
}

export interface StructuredResult<TToolOutput extends object, TOutput> {
  output: TOutput | null;
  toolOutput: TToolOutput | null;
  result: TextResult;
  fallbackResult?: TextResult;
  diagnostics: StructuredResultDiagnostics;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function collectJsonCandidates(text: string): string[] {
  const normalized = stripThink(text).trim();
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>();
  for (const match of normalized.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const content = match[1]?.trim();
    if (content) {
      candidates.add(content);
    }
  }
  candidates.add(normalized);

  const objectStart = normalized.indexOf('{');
  const objectEnd = normalized.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.add(normalized.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = normalized.indexOf('[');
  const arrayEnd = normalized.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.add(normalized.slice(arrayStart, arrayEnd + 1));
  }

  return [...candidates];
}

function readToolOutput<TToolOutput extends object>(
  result: { toolResults?: ToolResultRecord[] },
  toolName: string,
  coerce: (value: unknown) => TToolOutput | null,
): TToolOutput | null {
  const toolResult = result.toolResults?.find((item) => item.toolName === toolName);
  return coerce(toolResult?.output ?? toolResult?.result);
}

function parseTextOutput<TToolOutput extends object>(
  text: string,
  coerce: (value: unknown) => TToolOutput | null,
): TToolOutput | null {
  for (const candidate of collectJsonCandidates(text)) {
    const parsed = tryParseJson(candidate);
    const output = coerce(parsed);
    if (output) {
      return output;
    }
  }

  return null;
}

function buildAttemptDiagnostics(
  stage: StructuredStage,
  requestId: string,
  result: TextResult,
  source: StructuredSource,
): StructuredAttemptDiagnostics {
  const record = result as unknown as Record<string, unknown>;
  const rawText = typeof record.text === 'string' ? record.text : '';

  return {
    stage,
    requestId,
    source,
    hasToolResult: Array.isArray(record.toolResults) && record.toolResults.length > 0,
    hasText: rawText.trim().length > 0,
    rawText,
    finishReason: record.finishReason,
    usage: record.usage,
    warnings: record.warnings,
    response: record.response,
    toolCalls: record.toolCalls,
    toolResults: record.toolResults,
    steps: record.steps,
  };
}

function resolveOutput<TToolOutput extends object, TOutput>(
  toolOutput: TToolOutput | null,
  options: Pick<StructuredResultOptions<TToolOutput, TOutput>, 'normalize' | 'validate'>,
): TOutput | null {
  if (!toolOutput) {
    return null;
  }

  const output = options.normalize ? options.normalize(toolOutput) : toolOutput as unknown as TOutput;
  options.validate?.(output);
  return output;
}

function buildJsonFallbackSystem(system: TextInvokeInput['system'], instruction: string, example: string): string {
  return [
    typeof system === 'string' ? system : '',
    instruction,
    example,
  ].filter(Boolean).join('\n\n');
}

export async function invokeStructuredResult<TToolOutput extends object, TOutput = TToolOutput>(
  options: StructuredResultOptions<TToolOutput, TOutput>,
): Promise<StructuredResult<TToolOutput, TOutput>> {
  const {
    toolName = 'resultTool',
    toolDescription,
    inputSchema,
    jsonFallbackExample,
    jsonFallbackInstruction = '当前模型未返回可用工具结果。请只输出纯 JSON，不要解释，不要 Markdown，不要代码块。',
    coerce,
    normalize,
    validate,
    diagnosticSummary,
    ...textInput
  } = options;

  const requestId = textInput.requestId ?? createModelRequestId();
  const resultTool = tool<TToolOutput, TToolOutput>({
    description: toolDescription,
    inputSchema: jsonSchema<TToolOutput>(inputSchema),
    execute: (input) => input,
  } as unknown as Parameters<typeof tool<TToolOutput, TToolOutput>>[0]);
  const result = await invokeText({
    ...textInput,
    requestId,
    tools: {
      [toolName]: resultTool,
    },
  });

  let source: StructuredSource = 'none';
  let toolOutput = readToolOutput(result, toolName, coerce);
  if (toolOutput) {
    source = 'tool';
  } else {
    toolOutput = parseTextOutput(String(result.text ?? ''), coerce);
    if (toolOutput) {
      source = 'text';
    }
  }

  const attempts: StructuredAttemptDiagnostics[] = [
    buildAttemptDiagnostics('initial', requestId, result, source),
  ];
  let fallbackResult: TextResult | undefined;
  let fallbackRequestId: string | undefined;

  if (!toolOutput) {
    fallbackRequestId = createModelRequestId();
    fallbackResult = await invokeText({
      ...textInput,
      requestId: fallbackRequestId,
      system: buildJsonFallbackSystem(textInput.system, jsonFallbackInstruction, jsonFallbackExample),
    });
    toolOutput = parseTextOutput(String(fallbackResult.text ?? ''), coerce);
    source = toolOutput ? 'jsonFallback' : 'none';
    attempts.push(buildAttemptDiagnostics('jsonFallback', fallbackRequestId, fallbackResult, source));
  }

  const output = resolveOutput(toolOutput, { normalize, validate });
  const diagnostics: StructuredResultDiagnostics = {
    requestId,
    fallbackRequestId,
    modelKey: String(textInput.modelKey),
    status: output ? 'returned' : 'parse_failed',
    source,
    usedJsonFallback: Boolean(fallbackResult),
    attempts,
    parsed: diagnosticSummary?.(output),
    recordedAt: Date.now(),
  };

  return {
    output,
    toolOutput,
    result,
    fallbackResult,
    diagnostics,
  };
}
