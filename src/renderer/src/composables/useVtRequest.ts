import { ref, type Ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { VT_STATUS, type VtStatusCode } from '@shared/constants/status';
import type { VtErrorResponseData, VtResponse } from '@shared/types/response';

type Translate = (key: string, named?: Record<string, unknown>) => string;
type TranslateExists = (key: string) => boolean;

interface TranslateHelpers {
  t: Translate;
  te: TranslateExists;
}

export interface VtRequestErrorInfo {
  code: number;
  errorCode?: VtStatusCode;
  msgKey?: string;
  requestId?: string;
  msg: string;
  displayMessage: string;
  rawError?: unknown;
}

export interface VtRequestRunOptions<TData extends object> {
  showError?: boolean;
  showSuccess?: boolean;
  successMessage?: string;
  successMessageKey?: string;
  errorMessage?: string;
  errorMessageKey?: string;
  lock?: boolean;
  onSuccess?: (data: TData, response: VtResponse<TData>) => void | Promise<void>;
  onError?: (error: VtRequestErrorInfo) => void | Promise<void>;
}

export interface VtRequestOptions {
  loading?: Ref<boolean>;
  showError?: boolean;
  lock?: boolean;
}

export function isVtOk<TData extends object>(response: VtResponse<TData>): response is VtResponse<TData> & { code: 200 } {
  return response.code === VT_STATUS.OK;
}

function hasErrorData(value: unknown): value is Partial<VtErrorResponseData> {
  return Boolean(value && typeof value === 'object');
}

function translateIfExists(key: string | undefined, helpers: TranslateHelpers): string | null {
  if (!key) {
    return null;
  }

  return helpers.te(key) ? helpers.t(key) : null;
}

function normalizeThrownMessage(error: unknown, helpers: TranslateHelpers): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return helpers.t('request.unexpectedError');
}

export function formatVtErrorMessage(
  input: Pick<VtRequestErrorInfo, 'msg' | 'msgKey' | 'requestId'>,
  helpers: TranslateHelpers,
  override?: { message?: string; messageKey?: string },
): string {
  const message = override?.message ?? translateIfExists(override?.messageKey, helpers) ?? translateIfExists(input.msgKey, helpers) ?? input.msg ?? helpers.t('request.failed');

  if (!input.requestId) {
    return message;
  }

  return helpers.t('request.failedWithRequestId', {
    message,
    requestId: input.requestId,
  });
}

export function extractVtErrorInfo<TData extends object>(
  response: VtResponse<TData>,
  helpers: TranslateHelpers,
  override?: { message?: string; messageKey?: string },
): VtRequestErrorInfo {
  const data: Partial<VtErrorResponseData> = hasErrorData(response.data) ? (response.data as Partial<VtErrorResponseData>) : {};
  const msgKey = typeof data.msgKey === 'string' ? data.msgKey : undefined;
  const requestId = typeof data.requestId === 'string' ? data.requestId : undefined;
  const errorCode = typeof data.errorCode === 'number' ? (data.errorCode as VtStatusCode) : undefined;
  const msg = response.msg || translateIfExists(msgKey, helpers) || helpers.t('request.failed');

  return {
    code: response.code,
    errorCode,
    msgKey,
    requestId,
    msg,
    displayMessage: formatVtErrorMessage({ msg, msgKey, requestId }, helpers, override),
  };
}

export function extractThrownErrorInfo(
  error: unknown,
  helpers: TranslateHelpers,
  override?: { message?: string; messageKey?: string },
): VtRequestErrorInfo {
  const msg = normalizeThrownMessage(error, helpers);

  return {
    code: VT_STATUS.FAIL,
    errorCode: VT_STATUS.FAIL,
    msgKey: 'status.400',
    msg,
    rawError: error,
    displayMessage: formatVtErrorMessage({ msg, msgKey: 'status.400' }, helpers, override),
  };
}

export function useVtRequest(options: VtRequestOptions = {}) {
  const innerLoading = ref(false);
  const loading = options.loading ?? innerLoading;
  const helpers = useI18n() as unknown as TranslateHelpers;

  async function run<TData extends object>(request: () => Promise<VtResponse<TData>>, runOptions: VtRequestRunOptions<TData> = {}): Promise<TData | null> {
    const shouldLock = runOptions.lock ?? options.lock ?? true;

    if (shouldLock && loading.value) {
      return null;
    }

    loading.value = true;

    try {
      const response = await request();

      if (isVtOk(response)) {
        const successMessage = runOptions.successMessage ?? translateIfExists(runOptions.successMessageKey, helpers);
        if (runOptions.showSuccess && successMessage) {
          MessagePlugin.success(successMessage);
        }

        await runOptions.onSuccess?.(response.data, response);
        return response.data;
      }

      const errorInfo = extractVtErrorInfo(response, helpers, {
        message: runOptions.errorMessage,
        messageKey: runOptions.errorMessageKey,
      });

      if (runOptions.showError ?? options.showError ?? true) {
        MessagePlugin.error(errorInfo.displayMessage);
      }

      await runOptions.onError?.(errorInfo);
      return null;
    } catch (error) {
      const errorInfo = extractThrownErrorInfo(error, helpers, {
        message: runOptions.errorMessage,
        messageKey: runOptions.errorMessageKey,
      });

      if (runOptions.showError ?? options.showError ?? true) {
        MessagePlugin.error(errorInfo.displayMessage);
      }

      await runOptions.onError?.(errorInfo);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    run,
  };
}
