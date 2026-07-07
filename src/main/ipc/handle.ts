import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { VT_STATUS } from '@shared/constants/status';
import { normalizeUnknownError, VtError } from '@shared/errors';
import type { VtFailResponse, VtResponse } from '@shared/types/response';
import { logger } from '../services/logger';
import { createFailResponse, createSuccessResponse, errorToResponse, logServiceError } from '../services/result';

type IpcHandler<TData extends object> = (event: IpcMainInvokeEvent, ...args: unknown[]) => TData | Promise<TData>;
type IpcResponse<TData extends object> = VtResponse<TData> | VtFailResponse;

export const VtIpcError = VtError;

function toJsonCloneable<TValue>(value: TValue): TValue {
  const text = JSON.stringify(value, (_key, current: unknown) => {
    if (typeof current === 'bigint') {
      return current.toString();
    }

    if (typeof current === 'function' || typeof current === 'symbol') {
      return undefined;
    }

    if (current instanceof Error) {
      return normalizeUnknownError(current);
    }

    if (current instanceof Map) {
      return Object.fromEntries(current);
    }

    if (current instanceof Set) {
      return [...current];
    }

    return current;
  });

  if (typeof text !== 'string') {
    throw new TypeError('IPC response could not be serialized to JSON');
  }

  return JSON.parse(text) as TValue;
}

function ensureIpcResponseCloneable<TData extends object>(channel: string, response: IpcResponse<TData>): IpcResponse<TData> {
  try {
    structuredClone(response);
    return response;
  } catch (cloneError) {
    try {
      const jsonCloneableResponse = toJsonCloneable(response);
      structuredClone(jsonCloneableResponse);
      logger.warn(`IPC:${channel}`, '响应包含不可克隆数据，已转换为可传输 JSON', {
        error: normalizeUnknownError(cloneError),
      });
      return jsonCloneableResponse;
    } catch (serializeError) {
      const failResponse = createFailResponse({
        msg: 'IPC 响应数据不可序列化',
        errorCode: VT_STATUS.SYSTEM_ERROR,
      });
      logServiceError(`IPC:${channel}:serialize`, serializeError, failResponse.data.requestId);
      return failResponse;
    }
  }
}

export function handleIpc<TData extends object>(channel: string, handler: IpcHandler<TData>): void {
  ipcMain.handle(channel, async (event, ...args): Promise<VtResponse<TData> | VtFailResponse> => {
    try {
      const data = await handler(event, ...args);
      return ensureIpcResponseCloneable(channel, createSuccessResponse(data));
    } catch (error) {
      const response = errorToResponse(error);
      logServiceError(`IPC:${channel}`, error, response.data.requestId);
      return ensureIpcResponseCloneable<TData>(channel, response);
    }
  });
}

export { createFailResponse, createSuccessResponse };
