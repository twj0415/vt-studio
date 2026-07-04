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

const mainFile = 'src/renderer/src/main.ts';
const appFile = 'src/renderer/src/App.vue';
const helperFile = 'src/renderer/src/utils/renderer-error-boundary.ts';
const boundaryFile = 'src/renderer/src/components/RendererErrorBoundary.vue';
const messagesFile = 'src/renderer/src/i18n/messages.ts';
const taskFile = 'docs/tasks/OPT-041-renderer全局错误边界.md';
const verifyFile = 'scripts/verify.mjs';

const main = read(mainFile);
assertIncludes(main, "import { registerRendererErrorBoundary } from './utils/renderer-error-boundary';", mainFile);
assertIncludes(main, 'registerRendererErrorBoundary(app, router);', mainFile);

const app = read(appFile);
assertIncludes(app, "import RendererErrorBoundary from '@renderer/components/RendererErrorBoundary.vue';", appFile);
assertIncludes(app, '<RendererErrorBoundary>', appFile);
assertIncludes(app, '<RouterView />', appFile);

const helper = read(helperFile);
assertIncludes(helper, 'export function reportRendererError', helperFile);
assertIncludes(helper, 'export function registerRendererErrorBoundary', helperFile);
assertIncludes(helper, 'app.config.errorHandler', helperFile);
assertIncludes(helper, "window.addEventListener('error'", helperFile);
assertIncludes(helper, "window.addEventListener('unhandledrejection'", helperFile);
assertIncludes(helper, 'router.onError', helperFile);
assertIncludes(helper, 'MessagePlugin.error', helperFile);
assertIncludes(helper, 'ERROR_TOAST_THROTTLE_MS', helperFile);
assertIncludes(helper, "translate('rendererError.toast')", helperFile);

const boundary = read(boundaryFile);
assertIncludes(boundary, 'onErrorCaptured', boundaryFile);
assertIncludes(boundary, 'reportRendererError', boundaryFile);
assertIncludes(boundary, "errorText.value = t('rendererError.boundaryLogged')", boundaryFile);
assertIncludes(boundary, "router.push({ name: 'projects' });", boundaryFile);

const messages = read(messagesFile);
assertIncludes(messages, 'rendererError:', messagesFile);
assertIncludes(messages, "toast: '页面运行异常，已记录错误来源'", messagesFile);
assertIncludes(messages, "boundaryLogged: '错误来源已记录到开发者控制台。'", messagesFile);
assertIncludes(messages, "toast: 'Page runtime error recorded'", messagesFile);
assertIncludes(messages, "boundaryLogged: 'The error source has been written to the developer console.'", messagesFile);

const task = read(taskFile);
assertIncludes(task, '# OPT-041 renderer 全局错误边界', taskFile);
assertIncludes(task, '要做什么功能：怎么做', taskFile);
assertIncludes(task, '最后大白话', taskFile);

const verify = read(verifyFile);
assertIncludes(verify, "'verify-opt-041-renderer-error-boundary.mjs'", verifyFile);

console.log('[verify-opt-041-renderer-error-boundary] passed');
