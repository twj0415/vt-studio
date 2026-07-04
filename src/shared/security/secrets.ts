export const SECRET_REPLACEMENT = '[已隐藏]';
export const SECRET_CONFIGURED_LABEL = '[已配置]';

const SENSITIVE_KEY_PARTS = [
  'apikey',
  'api_key',
  'api-key',
  'accesskey',
  'access_key',
  'secretkey',
  'secret_key',
  'authorization',
  'password',
  'passwd',
  'secret',
  'token',
  'credential',
  'privatekey',
  'private_key',
] as const;

const SENSITIVE_ASSIGNMENT_RE =
  /\b(api[-_ ]?key|access[-_ ]?key|secret[-_ ]?key|authorization|token|secret|password|credential|private[-_ ]?key)\b\s*[:=]\s*['"]?[^'",\s&]+/gi;
const BEARER_RE = /\bbearer\s+[a-z0-9._~+/=-]{6,}/gi;
const COMMON_SECRET_RE = /\b(sk|ak|rk|pk|pat)-[a-zA-Z0-9._-]{10,}\b/g;
const URL_SECRET_QUERY_RE =
  /([?&](?:api[_-]?key|access[_-]?key|token|secret|password|authorization|access_token|refresh_token|signature|sign)=)[^&#\s]+/gi;
const WINDOWS_USER_PATH_RE = /([a-zA-Z]:\\Users\\)[^\\\s]+/g;

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/\s+/g, '');
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

export function isSensitiveInput(input: { key: string; type?: string }): boolean {
  return input.type === 'password' || isSensitiveKey(input.key);
}

export function hasConfiguredSecret(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function maskSecret(value: unknown): string {
  return hasConfiguredSecret(value) ? SECRET_CONFIGURED_LABEL : '';
}

export function sanitizeSensitiveText(value: string): string {
  return value
    .replace(BEARER_RE, `Bearer ${SECRET_REPLACEMENT}`)
    .replace(SENSITIVE_ASSIGNMENT_RE, (match) => {
      const separatorIndex = Math.max(match.indexOf(':'), match.indexOf('='));
      return separatorIndex >= 0 ? `${match.slice(0, separatorIndex + 1)}${SECRET_REPLACEMENT}` : SECRET_REPLACEMENT;
    })
    .replace(COMMON_SECRET_RE, SECRET_REPLACEMENT)
    .replace(URL_SECRET_QUERY_RE, `$1${SECRET_REPLACEMENT}`)
    .replace(WINDOWS_USER_PATH_RE, '$1***');
}

export function redactSensitiveValue(value: unknown, key = ''): unknown {
  if (key && isSensitiveKey(key)) {
    return SECRET_REPLACEMENT;
  }

  if (typeof value === 'string') {
    return sanitizeSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [itemKey, itemValue] of Object.entries(value as Record<string, unknown>)) {
    result[itemKey] = redactSensitiveValue(itemValue, itemKey);
  }
  return result;
}

export function toPublicSecretState(value: unknown): { configured: boolean; masked: string } {
  const configured = hasConfiguredSecret(value);
  return {
    configured,
    masked: configured ? SECRET_CONFIGURED_LABEL : '',
  };
}
