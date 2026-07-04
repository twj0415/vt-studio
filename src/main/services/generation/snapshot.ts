import { createHash } from 'node:crypto';
import { toManualPromptContentSnapshot, type ManualPromptBundle, type ManualPromptContentSnapshot } from '../project/manual-prompt';
import type { ResolvedModelPromptTemplate } from '../settings/model-prompt';

export interface GenerationPromptTemplateSnapshot {
  id: number | null;
  name: string;
  type: string;
  source: 'mapping' | 'default' | 'fallback' | 'none';
  modelType?: string;
  modelMode?: string;
  content: string;
  contentHash: string;
  updatedAt: number | null;
}

export interface GenerationSnapshotInput {
  source: string;
  model: string | null;
  modelMode?: string | null;
  taskId?: number | null;
  requestId?: string | null;
  userPrompt?: string | null;
  finalPrompt?: string | null;
  negativePrompt?: string | null;
  seed?: number | string | null;
  promptTemplate?: GenerationPromptTemplateSnapshot | null;
  manuals?: Partial<Record<'visual' | 'director', ManualPromptBundle | null>>;
  references?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createPromptTemplateSnapshot(
  resolved: ResolvedModelPromptTemplate | null | undefined,
  fallbackContent?: string | null,
  fallbackName = 'fallback',
): GenerationPromptTemplateSnapshot | null {
  if (resolved) {
    return {
      id: resolved.template.id,
      name: resolved.template.name,
      type: resolved.template.type,
      source: resolved.source,
      modelType: resolved.modelType,
      modelMode: resolved.modelMode,
      content: resolved.template.content,
      contentHash: hashText(resolved.template.content),
      updatedAt: resolved.template.updatedAt,
    };
  }

  const content = fallbackContent?.trim() ?? '';
  if (!content) {
    return null;
  }

  return {
    id: null,
    name: fallbackName,
    type: 'fallback',
    source: 'fallback',
    content,
    contentHash: hashText(content),
    updatedAt: null,
  };
}

function manualContentSnapshot(bundle: ManualPromptBundle | null | undefined): ManualPromptContentSnapshot | null {
  return bundle ? toManualPromptContentSnapshot(bundle) : null;
}

export function createGenerationSnapshot(input: GenerationSnapshotInput): Record<string, unknown> {
  return {
    schemaVersion: 1,
    source: input.source,
    model: {
      id: input.model,
      mode: input.modelMode ?? null,
    },
    prompt: {
      userPrompt: input.userPrompt ?? null,
      finalPrompt: input.finalPrompt ?? null,
      negativePrompt: input.negativePrompt ?? null,
      template: input.promptTemplate ?? null,
    },
    manuals: {
      visual: manualContentSnapshot(input.manuals?.visual),
      director: manualContentSnapshot(input.manuals?.director),
    },
    runtime: {
      requestId: input.requestId ?? null,
      taskId: input.taskId ?? null,
      seed: input.seed ?? null,
      createdAt: Date.now(),
    },
    references: input.references ?? {},
    ...(input.extra ?? {}),
  };
}
