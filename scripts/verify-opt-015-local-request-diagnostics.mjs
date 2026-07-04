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

assertIncludes('src/shared/types/request-settings.ts', 'SocketDiagnosticsInfo');
assertIncludes('src/shared/types/request-settings.ts', 'MediaRouteDiagnosticsInfo');
assertIncludes('src/shared/types/request-settings.ts', 'LocalRequestDiagnosticItem');
assertIncludes('src/shared/types/request-settings.ts', 'localRequests: LocalRequestDiagnosticItem[]');

assertIncludes('src/main/services/local-request-diagnostics.ts', 'recordLocalRequestFailure');
assertIncludes('src/main/services/local-request-diagnostics.ts', '/media/[signed-resource]');
assertIncludes('src/main/services/local-request-diagnostics.ts', 'MAX_LOCAL_REQUEST_FAILURES = 80');

assertIncludes('src/main/app/server.ts', 'recordLocalRequestFailure');
assertIncludes('src/main/app/server.ts', "reason: 'routeNotFound'");

assertIncludes('src/main/services/media/path.ts', 'listMediaRoots');
assertIncludes('src/main/services/media/request-handler.ts', 'recordMediaFailure');
assertIncludes('src/main/services/media/request-handler.ts', "'invalidSignature'");
assertIncludes('src/main/services/media/request-handler.ts', "'fileMissing'");
assertIncludes('src/main/services/media/request-handler.ts', "'invalidRange'");

assertIncludes('src/main/services/socket/index.ts', 'getSocketDiagnostics');
assertIncludes('src/main/services/socket/index.ts', 'connectedCount');

assertIncludes('src/main/services/settings/request-diagnostics.ts', 'getSocketDiagnostics');
assertIncludes('src/main/services/settings/request-diagnostics.ts', 'listLocalRequestDiagnostics');
assertIncludes('src/main/services/settings/request-diagnostics.ts', 'listMediaRoots');
assertIncludes('src/main/services/settings/request-diagnostics.ts', 'localRequests: listLocalRequestDiagnostics()');

assertIncludes('src/renderer/src/features/settings/components/RequestDiagnostics.vue', 'settings.requestDiagnostics.socketStatus');
assertIncludes('src/renderer/src/features/settings/components/RequestDiagnostics.vue', 'settings.requestDiagnostics.localFailuresTitle');
assertIncludes('src/renderer/src/features/settings/components/RequestDiagnostics.vue', 'getLocalRequestKindLabel');

assertIncludes('src/renderer/src/i18n/messages.ts', 'Recent Local Request Failures');
assertIncludes('src/renderer/src/styles/index.scss', '.request-diagnostics-runtime-grid');

console.log('[verify-opt-015] local request diagnostics are wired');
