import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function assertIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} should include: ${expected}`);
  }
}

function assertNotIncludes(relativePath, unexpected) {
  const content = read(relativePath);
  if (content.includes(unexpected)) {
    throw new Error(`${relativePath} should not include: ${unexpected}`);
  }
}

const scriptAgentPath = 'src/renderer/src/features/script-agent/ScriptAgentHome.vue';
assertIncludes(scriptAgentPath, 'script-plan-panel');
assertIncludes(scriptAgentPath, 'script-output-panel');
assertIncludes(scriptAgentPath, "active: 'skeleton'");
assertNotIncludes(scriptAgentPath, "workspaceTabs.active = 'scripts'");

const sourcePath = 'src/renderer/src/features/novel/NovelHome.vue';
assertIncludes(sourcePath, 'retryingChapterId');
assertIncludes(sourcePath, 'retryChapterEvent');
assertIncludes(sourcePath, "t('source.generate.retry')");
assertIncludes(sourcePath, "t('source.generate.retryStarted')");

const loginPath = 'src/renderer/src/features/auth/LoginHome.vue';
assertIncludes(loginPath, 'reloadLogin');
assertIncludes(loginPath, "t('login.recoveryTitle')");
assertIncludes(loginPath, "t('login.recoveryHint')");
assertIncludes(loginPath, 'login-error-actions');

const scaffoldPath = 'src/renderer/src/features/shared/ModuleScaffold.vue';
assertIncludes(scaffoldPath, 'module-next-step');
assertIncludes(scaffoldPath, "t('scaffold.nextStepTitle')");
assertIncludes(scaffoldPath, '<t-tag');

const stylePath = 'src/renderer/src/styles/index.scss';
for (const expected of [
  'grid-template-columns: minmax(280px, 0.95fr) minmax(300px, 1fr) minmax(320px, 1.08fr)',
  '.script-output-panel',
  '.module-next-step',
  '.login-error-actions',
]) {
  assertIncludes(stylePath, expected);
}

const messagesPath = 'src/renderer/src/i18n/messages.ts';
for (const expected of [
  'nextStepTitle',
  'nextStepSummary',
  'recoveryTitle',
  'recoveryHint',
  'retryStarted',
  'Retry Analysis',
]) {
  assertIncludes(messagesPath, expected);
}

assertIncludes('docs/tasks/OPT-049-全页面交互UI整改清单.md', '最终收口已完成');
assertIncludes('docs/TODO-优化与缺口.md', '当前剩余内容：无');
assertIncludes('docs/03-执行进度.md', 'OPT-049-6');
assertIncludes('scripts/verify.mjs', "'verify-opt-049-final-ui.mjs'");

console.log('[verify-opt-049-final-ui] passed');
