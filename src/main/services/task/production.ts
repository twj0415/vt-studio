import type { CreateTaskInput, CreateTaskResult, UpdateTaskMetaInput } from './types';
import { createTask, updateTaskMeta } from './service';

export type ProductionTaskCategory =
  | '提取资源'
  | '生成资源图'
  | '生成导演计划'
  | '生成分镜表'
  | '智能拆分分镜'
  | '生成分镜图'
  | '生成视频提示词'
  | '生成视频'
  | '导出'
  | '生产助手';

export type ProductionTaskRelatedObjects = Record<string, unknown>;

export interface ProductionTaskCreateInput extends Omit<CreateTaskInput, 'category' | 'relatedObjects'> {
  category: ProductionTaskCategory;
  relatedObjects?: ProductionTaskRelatedObjects;
}

export interface ProductionModelDiagnosticsInput {
  taskId: number;
  relatedObjects?: ProductionTaskRelatedObjects;
  modelDiagnostics: unknown;
}

export function formatProductionRelatedObjects(input: ProductionTaskRelatedObjects = {}): ProductionTaskRelatedObjects {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

export function createProductionTask(input: ProductionTaskCreateInput): CreateTaskResult {
  return createTask({
    ...input,
    relatedObjects: input.relatedObjects ? formatProductionRelatedObjects(input.relatedObjects) : undefined,
  });
}

export function recordProductionModelDiagnostics(input: ProductionModelDiagnosticsInput): void {
  const payload: UpdateTaskMetaInput = {
    taskId: input.taskId,
    relatedObjects: formatProductionRelatedObjects({
      ...(input.relatedObjects ?? {}),
      modelDiagnostics: input.modelDiagnostics,
    }),
  };

  updateTaskMeta(payload);
}
