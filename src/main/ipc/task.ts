import type { ListTasksInput, TaskCategoryOptionsPayload } from '@shared/types/task';
import { getTaskCategoryOptions, getTaskProjectOptions, listTasks } from '../services/task';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerTaskIpc(): void {
  handleIpc('task:list', (_event, payload) => listTasks(readObjectArg<ListTasksInput>(payload)));
  handleIpc('task:category-options', (_event, payload) => getTaskCategoryOptions(readObjectArg<TaskCategoryOptionsPayload>(payload)));
  handleIpc('task:project-options', () => getTaskProjectOptions());
}
