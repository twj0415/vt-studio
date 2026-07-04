import type { VtStatusCode } from '../constants/status';

export type EmptyData = Record<string, never>;

export type VtResponseCode = 200 | 400;

export interface VtErrorResponseData {
  errorCode: VtStatusCode;
  msgKey: string;
  requestId: string;
}

export interface VtSuccessResponse<TData extends object = EmptyData> {
  code: 200;
  data: TData;
  msg: string;
}

export interface VtFailResponse {
  code: 400;
  data: VtErrorResponseData;
  msg: string;
}

export interface VtResponse<TData extends object = EmptyData> {
  code: VtResponseCode;
  data: TData;
  msg: string;
}
