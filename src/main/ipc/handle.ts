import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { VtError } from '@shared/errors';
import type { VtFailResponse, VtResponse } from '@shared/types/response';
import { createFailResponse, createSuccessResponse, errorToResponse, logServiceError } from '../services/result';

type IpcHandler<TData extends object> = (event: IpcMainInvokeEvent, ...args: unknown[]) => TData | Promise<TData>;

export const VtIpcError = VtError;

export function handleIpc<TData extends object>(channel: string, handler: IpcHandler<TData>): void {
  ipcMain.handle(channel, async (event, ...args): Promise<VtResponse<TData> | VtFailResponse> => {
    try {
      const data = await handler(event, ...args);
      return createSuccessResponse(data);
    } catch (error) {
      const response = errorToResponse(error);
      logServiceError(`IPC:${channel}`, error, response.data.requestId);
      return response;
    }
  });
}

export { createFailResponse, createSuccessResponse };
