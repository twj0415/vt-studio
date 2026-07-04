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

function assertNotIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (content.includes(expected)) {
    throw new Error(`${relativePath} should not include: ${expected}`);
  }
}

assertIncludes('src/renderer/src/features/auth/LoginHome.vue', '@enter="submitLogin"');
assertIncludes('src/renderer/src/features/auth/LoginHome.vue', 'class="login-error" role="alert"');
assertIncludes('src/renderer/src/features/auth/LoginHome.vue', ':disabled="authStore.loading"');
assertIncludes('src/renderer/src/features/auth/LoginHome.vue', "t('login.missingCredentials')");
assertIncludes('src/renderer/src/features/auth/LoginHome.vue', "t('login.failed')");

assertIncludes('src/renderer/src/styles/index.scss', '.login-error');
assertIncludes('src/renderer/src/styles/index.scss', 'min-height: 100dvh');
assertIncludes('src/renderer/src/styles/index.scss', 'padding: clamp(20px, 5vw, 40px)');
assertNotIncludes('src/renderer/src/styles/index.scss', 'min-width: 960px');

assertIncludes('docs/tasks/OPT-049-全页面交互UI整改清单.md', '第三批已完成：登录页小窗口、错误提示和回车提交收口');
assertIncludes('docs/TODO-优化与缺口.md', '第三批页面已完成：登录页小窗口、错误提示和回车提交收口');
assertIncludes('docs/03-执行进度.md', 'OPT-049 全页面交互 UI 整改清单第三批已完成');

const verifyFile = read('scripts/verify.mjs');
if (!verifyFile.includes("'verify-opt-049-login-ui.mjs'")) {
  throw new Error('scripts/verify.mjs should include verify-opt-049-login-ui.mjs');
}

console.log('[verify-opt-049-login-ui] passed');
