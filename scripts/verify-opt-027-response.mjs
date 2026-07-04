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

assertIncludes('src/shared/types/response.ts', 'export interface VtErrorResponseData');
assertIncludes('src/shared/types/response.ts', 'errorCode: VtStatusCode;');
assertIncludes('src/shared/types/response.ts', 'msgKey: string;');
assertIncludes('src/shared/types/response.ts', 'requestId: string;');
assertIncludes('src/shared/types/response.ts', 'export interface VtResponse');
assertIncludes('src/shared/types/response.ts', 'msg: string;');

assertIncludes('src/shared/constants/status.ts', 'export function getStatusMsgKey');
assertIncludes('src/shared/errors/vt-error.ts', 'readonly msgKey: string;');
assertIncludes('src/shared/errors/vt-error.ts', 'readonly requestId?: string;');
assertIncludes('src/shared/errors/normalize.ts', 'requestId?: string;');

assertIncludes('src/main/services/result.ts', 'function createRequestId()');
assertIncludes('src/main/services/result.ts', 'errorCode');
assertIncludes('src/main/services/result.ts', 'msgKey');
assertIncludes('src/main/services/result.ts', 'requestId');
assertIncludes('src/main/services/result.ts', 'detail');
assertIncludes('src/main/ipc/handle.ts', 'const response = errorToResponse(error);');
assertIncludes('src/main/ipc/handle.ts', 'logServiceError(`IPC:${channel}`, error, response.data.requestId);');

assertIncludes('src/renderer/src/i18n/messages.ts', 'status: {');
assertIncludes('src/renderer/src/i18n/messages.ts', "70002: 'API Key 缺失'");
assertIncludes('src/renderer/src/i18n/messages.ts', "70002: 'API key is missing'");

assertNotIncludes('src/main/services/result.ts', 'message:');

console.log('OPT-027 response contract verification passed');
