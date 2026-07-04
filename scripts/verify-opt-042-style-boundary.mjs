import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();

function repoPath(filePath) {
  return relative(root, filePath).split(sep).join('/');
}

function readRequired(relativePath) {
  const filePath = join(root, relativePath);
  if (!existsSync(filePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }

  return readFileSync(filePath, 'utf8');
}

function assertIncludes(relativePath, expected) {
  const content = readRequired(relativePath);
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} should include: ${expected}`);
  }
}

function listFiles(dir, extensions) {
  const result = [];
  for (const item of readdirSync(dir)) {
    const filePath = join(dir, item);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      result.push(...listFiles(filePath, extensions));
    } else if (extensions.some((extension) => item.endsWith(extension))) {
      result.push(filePath);
    }
  }

  return result;
}

assertIncludes('tailwind.config.ts', "content: ['./src/renderer/index.html', './src/renderer/**/*.{vue,ts}']");
assertIncludes('tailwind.config.ts', "app: 'var(--vt-surface-app)'");
assertIncludes('tailwind.config.ts', "panel: 'var(--vt-surface-panel)'");
assertIncludes('tailwind.config.ts', "primary: 'var(--vt-text-primary)'");
assertIncludes('tailwind.config.ts', "DEFAULT: 'var(--vt-brand)'");
assertIncludes('tailwind.config.ts', "success: 'var(--vt-success)'");
assertIncludes('postcss.config.cjs', 'tailwindcss: {}');
assertIncludes('postcss.config.cjs', 'autoprefixer: {}');
assertIncludes('src/renderer/src/styles/tokens.scss', '--vt-surface-app');
assertIncludes('src/renderer/src/styles/tokens.scss', '--td-brand-color');
assertIncludes('src/renderer/src/styles/index.scss', "@use './tokens.scss';");
assertIncludes('src/renderer/src/styles/index.scss', '@tailwind base;');
assertIncludes('src/renderer/src/styles/index.scss', '@tailwind components;');
assertIncludes('src/renderer/src/styles/index.scss', '@tailwind utilities;');
assertIncludes('src/renderer/src/styles/index.scss', 'Style boundary:');
assertIncludes('src/renderer/src/styles/index.scss', 'Prefer Tailwind for normal page layout');
assertIncludes('src/renderer/src/main.ts', "import './styles/index.scss';");

const rendererFiles = listFiles(join(root, 'src', 'renderer', 'src'), ['.vue', '.ts', '.tsx', '.js', '.jsx']);
const globalStyleImporters = rendererFiles
  .filter((filePath) => readFileSync(filePath, 'utf8').includes("styles/index.scss") || readFileSync(filePath, 'utf8').includes("styles\\index.scss"))
  .map(repoPath);

if (globalStyleImporters.length !== 1 || globalStyleImporters[0] !== 'src/renderer/src/main.ts') {
  throw new Error(`Global index.scss should only be imported by src/renderer/src/main.ts, found:\n${globalStyleImporters.join('\n') || '(none)'}`);
}

assertIncludes('docs/00-项目规范.md', '页面布局、间距、颜色、字号、边框、hover、响应式优先使用 Tailwind');
assertIncludes('docs/00-项目规范.md', '不把普通页面样式继续塞进 src/renderer/src/styles/index.scss');
assertIncludes('docs/tasks/TEMPLATE-功能执行文档模板.md', '样式方案：能用 Tailwind 的全部用 Tailwind');
assertIncludes('docs/TODO-优化与缺口.md', 'OPT-042 Tailwind 优先和 SCSS 边界治理');
assertIncludes('docs/tasks/OPT-042-Tailwind优先和SCSS边界治理.md', 'SCSS 只负责 Tailwind 不适合的全局能力和第三方覆盖');

const verifyFile = readRequired('scripts/verify.mjs');
if (!verifyFile.includes("'verify-opt-042-style-boundary.mjs'")) {
  throw new Error('scripts/verify.mjs should include verify-opt-042-style-boundary.mjs');
}

console.log('[verify-opt-042-style-boundary] passed');
