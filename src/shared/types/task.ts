import {
  TASK_STATUSES,
  TASK_STATUS_VALUES as SHARED_TASK_STATUS_VALUES,
} from '../constants/dictionaries';

export const TASK_STATUS = TASK_STATUSES;

export type TaskStatus = (typeof SHARED_TASK_STATUS_VALUES)[number];

export const TASK_STATUS_VALUES = SHARED_TASK_STATUS_VALUES;

export interface TaskRecord {
  id: number;
  projectId: number | null;
  category: string;
  relatedObjects: string | null;
  modelName: string | null;
  description: string | null;
  status: TaskStatus;
  startedAt: number;
  finishedAt: number | null;
  errorReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskListItem extends TaskRecord {
  projectName: string | null;
}

export interface CreateTaskInput {
  projectId?: number | null;
  category: string;
  relatedObjects?: unknown;
  modelName?: string | null;
  description?: string | null;
}

export interface UpdateTaskMetaInput {
  taskId: number;
  relatedObjects?: unknown;
  modelName?: string | null;
  description?: string | null;
}

export interface TaskListPayload {
  page?: number;
  limit?: number;
  projectId?: number | null;
  category?: string | null;
  status?: TaskStatus | null;
}

export type ListTasksInput = TaskListPayload;

export interface TaskCategoryOptionsPayload {
  projectId?: number | null;
}

export interface TaskListResult {
  data: TaskListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface TaskProjectOption {
  id: number;
  name: string;
}

export interface TaskProjectOptionsResult {
  projects: TaskProjectOption[];
}

export interface TaskCategoryOptionsResult {
  categories: string[];
}

export interface CreateTaskResult {
  taskId: number;
  status: TaskStatus;
  startedAt: number;
}
