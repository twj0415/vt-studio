import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing ${needle}`);
  }
}

function assertNotIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (content.includes(needle)) {
    throw new Error(`${relativePath} should not include ${needle}`);
  }
}

assertIncludes('src/shared/types/request-settings.ts', 'ModelRequestDiagnosticItem');
assertIncludes('src/shared/types/request-settings.ts', 'modelRequests: ModelRequestDiagnosticItem[]');

assertIncludes('src/main/services/model/request-diagnostics.ts', 'MAX_MODEL_REQUESTS = 80');
assertIncludes('src/main/services/model/request-diagnostics.ts', 'sanitizeSensitiveText');
assertIncludes('src/main/services/model/request-diagnostics.ts', 'WINDOWS_PATH_RE');
assertIncludes('src/main/services/model/request-diagnostics.ts', 'recordModelRequestStart');
assertIncludes('src/main/services/model/request-diagnostics.ts', 'recordModelRequestRetry');
assertIncludes('src/main/services/model/request-diagnostics.ts', 'recordModelRequestSuccess');
assertIncludes('src/main/services/model/request-diagnostics.ts', 'recordModelRequestFailure');
assertIncludes('src/main/services/model/request-diagnostics.ts', 'listModelRequestDiagnostics');
assertNotIncludes('src/main/services/model/request-diagnostics.ts', 'stack:');

assertIncludes('src/main/services/model/gateway.ts', 'recordModelRequestStart');
assertIncludes('src/main/services/model/gateway.ts', 'recordModelRequestAttempt');
assertIncludes('src/main/services/model/gateway.ts', 'recordModelRequestRetry');
assertIncludes('src/main/services/model/gateway.ts', 'recordModelRequestSuccess');
assertIncludes('src/main/services/model/gateway.ts', 'recordModelRequestFailure');

assertIncludes('src/main/services/settings/request-diagnostics.ts', 'listModelRequestDiagnostics');
assertIncludes('src/main/services/settings/request-diagnostics.ts', 'modelRequests: listModelRequestDiagnostics()');

assertIncludes('src/renderer/src/features/settings/components/RequestDiagnostics.vue', 'modelRequests');
assertIncludes('src/renderer/src/features/settings/components/RequestDiagnostics.vue', 'settings.requestDiagnostics.modelRequestsTitle');
assertIncludes('src/renderer/src/features/settings/components/RequestDiagnostics.vue', 'useI18n');
assertIncludes('src/renderer/src/features/settings/components/RequestDiagnostics.vue', 'getStatusTheme');

assertIncludes('src/renderer/src/i18n/messages.ts', 'requestDiagnostics');
assertIncludes('src/renderer/src/i18n/messages.ts', '模型调用超时');
assertIncludes('src/renderer/src/i18n/messages.ts', 'Model call timed out');
assertIncludes('src/renderer/src/styles/index.scss', '.request-diagnostics-table');

console.log('[verify-opt-014] model request observability is wired');
