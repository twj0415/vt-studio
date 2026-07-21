import { MessagePlugin } from 'tdesign-vue-next';
import type { MessageOptions } from 'tdesign-vue-next/es/message/type';

export type VtFeedbackTone = 'success' | 'warning' | 'error' | 'info' | 'loading';

export interface VtFeedbackLabels {
  reason: string;
  nextStep: string;
  requestId: string;
  action: string;
}

export interface VtFeedbackPayload {
  title?: string;
  message?: string;
  reason?: string;
  nextStep?: string;
  requestId?: string;
  actionText?: string;
  duration?: number;
  options?: Omit<MessageOptions, 'content' | 'theme' | 'duration'>;
  labels?: Partial<VtFeedbackLabels>;
}

const DEFAULT_LABELS: VtFeedbackLabels = {
  reason: '原因',
  nextStep: '下一步',
  requestId: '请求',
  action: '操作',
};

function normalizePayload(input: string | VtFeedbackPayload): VtFeedbackPayload {
  return typeof input === 'string' ? { message: input } : input;
}

export function formatVtFeedbackText(input: string | VtFeedbackPayload): string {
  const payload = normalizePayload(input);
  const labels = { ...DEFAULT_LABELS, ...payload.labels };
  const lines: string[] = [];
  const title = payload.title?.trim();
  const message = payload.message?.trim();

  if (title && message) {
    lines.push(`${title}：${message}`);
  } else if (title || message) {
    lines.push(title || message || '');
  }

  if (payload.reason?.trim()) {
    lines.push(`${labels.reason}：${payload.reason.trim()}`);
  }

  if (payload.nextStep?.trim()) {
    lines.push(`${labels.nextStep}：${payload.nextStep.trim()}`);
  }

  if (payload.actionText?.trim()) {
    lines.push(`${labels.action}：${payload.actionText.trim()}`);
  }

  if (payload.requestId?.trim()) {
    lines.push(`${labels.requestId}：${payload.requestId.trim()}`);
  }

  return lines.filter(Boolean).join('；');
}

export function showVtFeedback(tone: VtFeedbackTone, input: string | VtFeedbackPayload) {
  const payload = normalizePayload(input);
  const content = formatVtFeedbackText(payload);
  const options: MessageOptions = {
    closeBtn: true,
    duration: payload.duration ?? (tone === 'error' ? 5200 : 3200),
    placement: 'top-right',
    ...payload.options,
    content,
  };

  if (tone === 'success') {
    return MessagePlugin.success(options);
  }

  if (tone === 'warning') {
    return MessagePlugin.warning(options);
  }

  if (tone === 'error') {
    return MessagePlugin.error(options);
  }

  if (tone === 'loading') {
    return MessagePlugin.loading(options);
  }

  return MessagePlugin.info(options);
}

export function useVtFeedback() {
  return {
    format: formatVtFeedbackText,
    show: showVtFeedback,
    success: (payload: string | VtFeedbackPayload) => showVtFeedback('success', payload),
    warning: (payload: string | VtFeedbackPayload) => showVtFeedback('warning', payload),
    error: (payload: string | VtFeedbackPayload) => showVtFeedback('error', payload),
    info: (payload: string | VtFeedbackPayload) => showVtFeedback('info', payload),
    loading: (payload: string | VtFeedbackPayload) => showVtFeedback('loading', payload),
  };
}
