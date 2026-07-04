import { getStatusMsg, getStatusMsgKey, VT_STATUS, type VtStatusCode } from '@shared/constants/status';
import { isVtError, normalizeUnknownError, VtError } from '@shared/errors';
import type { VtFailResponse, VtResponse } from '@shared/types/response';
import { logger } from './logger';

interface FailResponseOptions {
  msg?: string;
  errorCode?: VtStatusCode;
  msgKey?: string;
  requestId?: string;
}

function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSuccessResponse<TData extends object>(data: TData, msg = getStatusMsg(VT_STATUS.OK)): VtResponse<TData> {
  return { code: VT_STATUS.OK, data, msg };
}

export function createFailResponse(options: string | FailResponseOptions = {}): VtFailResponse {
  const normalizedOptions = typeof options === 'string' ? { msg: options } : options;
  const errorCode = normalizedOptions.errorCode ?? VT_STATUS.FAIL;
  const msgKey = normalizedOptions.msgKey ?? getStatusMsgKey(errorCode);
  const requestId = normalizedOptions.requestId ?? createRequestId();
  const msg = normalizedOptions.msg ?? getStatusMsg(errorCode);

  return {
    code: VT_STATUS.FAIL,
    data: {
      errorCode,
      msgKey,
      requestId,
    },
    msg,
  };
}

export function createError(
  statusCode: VtStatusCode,
  msg?: string,
  detail?: unknown,
  options: Pick<FailResponseOptions, 'msgKey' | 'requestId'> = {},
): VtError {
  return new VtError({ statusCode, msg, detail, msgKey: options.msgKey, requestId: options.requestId });
}

export function errorToResponse(error: unknown): VtFailResponse {
  if (isVtError(error)) {
    return createFailResponse({
      msg: error.message || getStatusMsg(error.statusCode),
      errorCode: error.statusCode,
      msgKey: error.msgKey,
      requestId: error.requestId,
    });
  }

  return createFailResponse({
    msg: getStatusMsg(VT_STATUS.SYSTEM_ERROR),
    errorCode: VT_STATUS.SYSTEM_ERROR,
  });
}

export function logServiceError(scope: string, error: unknown, requestId?: string): void {
  logger.error(scope, requestId ? `服务调用失败（${requestId}）` : '服务调用失败', {
    requestId,
    error: normalizeUnknownError(error),
  });
}
