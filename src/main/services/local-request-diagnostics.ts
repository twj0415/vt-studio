import { randomUUID } from 'node:crypto';
import type { LocalRequestDiagnosticItem, LocalRequestDiagnosticKind } from '@shared/types/request-settings';

const MAX_LOCAL_REQUEST_FAILURES = 80;
const MAX_MESSAGE_LENGTH = 220;
const failures: LocalRequestDiagnosticItem[] = [];

function clampText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_MESSAGE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_MESSAGE_LENGTH)}...`;
}

function sanitizePath(path: string): string {
  const pathname = path.split('?')[0] || '/';
  if (pathname.startsWith('/media/')) {
    return '/media/[signed-resource]';
  }

  return clampText(pathname);
}

export function recordLocalRequestFailure(input: {
  kind: LocalRequestDiagnosticKind;
  method?: string | null;
  path: string;
  statusCode: number;
  reason: string;
  msg: string;
  startedAt: number;
}): void {
  failures.unshift({
    id: `local_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    kind: input.kind,
    method: (input.method || 'GET').toUpperCase(),
    path: sanitizePath(input.path),
    status: 'failed',
    statusCode: input.statusCode,
    reason: clampText(input.reason),
    msg: clampText(input.msg),
    startedAt: new Date(input.startedAt).toISOString(),
    durationMs: Math.max(0, Date.now() - input.startedAt),
  });

  if (failures.length > MAX_LOCAL_REQUEST_FAILURES) {
    failures.splice(MAX_LOCAL_REQUEST_FAILURES);
  }
}

export function listLocalRequestDiagnostics(): LocalRequestDiagnosticItem[] {
  return failures.map((item) => ({ ...item }));
}

export function clearLocalRequestDiagnostics(): void {
  failures.splice(0, failures.length);
}
