import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const rendererRoot = join(root, 'src', 'renderer', 'src');

const ignoredFiles = new Set(['src/renderer/src/i18n/messages.ts']);

const allowedFragments = new Map([
  [
    'src/renderer/src/features/novel/NovelHome.vue',
    [
      "const DEFAULT_CHAPTER_REG = '/第\\\\s*([0-9０-９零一二三四五六七八九十百千万]+)\\\\s*[章回节]\\\\s*([^\\\\n\\\\r]*)/g';",
      'const volumeRegex = /^(第[\\d一二三四五六七八九十百千]+卷)\\s*([^\\n第]*)/gm;',
    ],
  ],
  [
    'src/renderer/src/features/script/ScriptHome.vue',
    ["const DEFAULT_SCRIPT_REG = '/第\\\\s*([0-9０-９零一二三四五六七八九十百千万]+)\\\\s*集\\\\s*([^\\\\n\\\\r]*)/g';"],
  ],
]);

function toRepoPath(file) {
  return relative(root, file).split(sep).join('/');
}

function listFiles(dir) {
  const result = [];
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...listFiles(fullPath));
    } else if (/\.(vue|ts|tsx|js|jsx)$/.test(item)) {
      result.push(fullPath);
    }
  }
  return result;
}

function stripAllowedFragments(repoPath, content) {
  let next = content;
  for (const fragment of allowedFragments.get(repoPath) ?? []) {
    next = next.replace(fragment, '');
  }
  return next;
}

const offenders = [];

for (const file of listFiles(rendererRoot)) {
  const repoPath = toRepoPath(file);
  if (ignoredFiles.has(repoPath)) continue;

  const content = stripAllowedFragments(repoPath, readFileSync(file, 'utf8'));
  if (/[\p{Script=Han}]/u.test(content)) {
    offenders.push(repoPath);
  }
}

if (offenders.length > 0) {
  throw new Error(`Renderer Chinese hard-coded text found outside i18n/allowed parser rules:\n${offenders.join('\n')}`);
}

const verifyFile = readFileSync(join(root, 'scripts', 'verify.mjs'), 'utf8');
if (!verifyFile.includes("'verify-opt-047-renderer-i18n-sweep.mjs'")) {
  throw new Error('scripts/verify.mjs should include verify-opt-047-renderer-i18n-sweep.mjs');
}

console.log('[verify-opt-047-renderer-i18n-sweep] passed');
