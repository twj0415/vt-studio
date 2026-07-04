import { getStatusMsg, getStatusMsgKey, VT_STATUS, type VtStatusCode } from '../constants/status';

export interface VtErrorOptions {
  statusCode?: VtStatusCode;
  msg?: string;
  errorKey?: string;
  msgKey?: string;
  requestId?: string;
  detail?: unknown;
  cause?: unknown;
}

export class VtError extends Error {
  readonly statusCode: VtStatusCode;
  readonly errorKey?: string;
  readonly msgKey: string;
  readonly requestId?: string;
  readonly detail?: unknown;
  override readonly cause?: unknown;

  constructor(options: VtErrorOptions = {}) {
    const statusCode = options.statusCode ?? VT_STATUS.FAIL;

    super(options.msg ?? getStatusMsg(statusCode));
    this.name = 'VtError';
    this.statusCode = statusCode;
    this.msgKey = options.msgKey ?? options.errorKey ?? getStatusMsgKey(statusCode);
    this.errorKey = options.errorKey ?? this.msgKey;
    this.requestId = options.requestId;
    this.detail = options.detail;
    this.cause = options.cause;
  }
}

export function isVtError(error: unknown): error is VtError {
  return error instanceof VtError;
}
