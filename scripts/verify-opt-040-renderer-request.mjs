import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(content, needle, file) {
  assert(content.includes(needle), `${file} should include ${needle}`);
}

function assertNotIncludes(content, needle, file) {
  assert(!content.includes(needle), `${file} should not include ${needle}`);
}

function assertNoLocalOkHelper(content, file) {
  assert(!/function\s+isOk\s*\(/.test(content), `${file} should not define local isOk()`);
  assert(!/code\s*={2,3}\s*200/.test(content), `${file} should not compare response.code directly to 200`);
  assert(!/MessagePlugin\.error\s*\(\s*response\.msg\s*\)/.test(content), `${file} should not show response.msg directly`);
}

const helperFile = 'src/renderer/src/composables/useVtRequest.ts';
const requestDiagnosticsFile = 'src/renderer/src/features/settings/components/RequestDiagnostics.vue';
const taskCenterFile = 'src/renderer/src/features/task-center/TaskCenter.vue';
const messagesFile = 'src/renderer/src/i18n/messages.ts';
const verifyFile = 'scripts/verify.mjs';

const helper = read(helperFile);
assertIncludes(helper, 'export function useVtRequest', helperFile);
assertIncludes(helper, 'export function isVtOk', helperFile);
assertIncludes(helper, 'extractVtErrorInfo', helperFile);
assertIncludes(helper, 'formatVtErrorMessage', helperFile);
assertIncludes(helper, 'requestId', helperFile);
assertIncludes(helper, 'msgKey', helperFile);
assertIncludes(helper, 'MessagePlugin.error', helperFile);

const requestDiagnostics = read(requestDiagnosticsFile);
assertIncludes(requestDiagnostics, "import { useVtRequest } from '@renderer/composables/useVtRequest';", requestDiagnosticsFile);
assertIncludes(requestDiagnostics, 'const request = useVtRequest({ loading });', requestDiagnosticsFile);
assertNoLocalOkHelper(requestDiagnostics, requestDiagnosticsFile);
assertNotIncludes(requestDiagnostics, 'MessagePlugin', requestDiagnosticsFile);

const taskCenter = read(taskCenterFile);
assertIncludes(taskCenter, "import { useVtRequest } from '@renderer/composables/useVtRequest';", taskCenterFile);
assertIncludes(taskCenter, 'const taskRequest = useVtRequest({ loading });', taskCenterFile);
assertIncludes(taskCenter, 'const refreshRequest = useVtRequest({ loading: refreshing });', taskCenterFile);
assertNoLocalOkHelper(taskCenter, taskCenterFile);
assertNotIncludes(taskCenter, 'MessagePlugin', taskCenterFile);

const messages = read(messagesFile);
assertIncludes(messages, "failedWithRequestId: '{message}（请求ID：{requestId}）'", messagesFile);
assertIncludes(messages, "failedWithRequestId: '{message} (Request ID: {requestId})'", messagesFile);
assertIncludes(messages, "unexpectedError: '请求执行异常'", messagesFile);
assertIncludes(messages, "unexpectedError: 'Request execution failed'", messagesFile);

const verify = read(verifyFile);
assertIncludes(verify, "'verify-opt-040-renderer-request.mjs'", verifyFile);

console.log('[verify-opt-040-renderer-request] passed');
