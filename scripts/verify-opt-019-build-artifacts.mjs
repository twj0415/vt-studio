import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  assert(content.includes(needle), `${relativePath} missing ${needle}`);
}

function getTrackedFiles(paths) {
  const output = execFileSync('git', ['ls-files', '--', ...paths], {
    cwd: workspaceRoot,
    encoding: 'utf-8',
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function verifyGitignore() {
  const requiredRules = [
    'node_modules',
    '.pnpm-store',
    '.node-gyp',
    '.npm-cache',
    'dist',
    'out',
    '.vite',
    '.electron-vite',
    'coverage',
    '.runtime',
    'data',
    'temp',
    'cache',
    '*.tsbuildinfo',
    '*.log',
    'pnpm-debug.log*',
    '.DS_Store',
    'Thumbs.db',
  ];

  for (const rule of requiredRules) {
    assertIncludes('.gitignore', rule);
  }
}

function verifyGeneratedPathsAreUntracked() {
  const generatedPaths = [
    'node_modules',
    '.pnpm-store',
    '.node-gyp',
    '.npm-cache',
    'dist',
    'out',
    '.vite',
    '.electron-vite',
    'coverage',
    '.runtime',
    'data',
    'temp',
    'cache',
  ];
  const tracked = getTrackedFiles(generatedPaths);

  assert(tracked.length === 0, `generated/runtime paths are tracked: ${tracked.join(', ')}`);
}

function verifyNoSuspiciousRootFragments() {
  const blockedExactNames = new Set(["!docs.includes(e)", 'c.url))].sort()', 'm[1]', "l.includes('OPT-050", "l.includes('settings"]);
  const suspicious = readdirSync(workspaceRoot).filter((name) => {
    const fullPath = join(workspaceRoot, name);
    if (!statSync(fullPath).isFile()) {
      return false;
    }

    return blockedExactNames.has(name) || /^l\.includes\('/.test(name);
  });

  assert(suspicious.length === 0, `root has command-fragment residue: ${suspicious.join(', ')}`);
}

function verifyDocs() {
  assertIncludes('docs/00-项目规范.md', '源码、产物和运行数据边界');
  assertIncludes('docs/00-项目规范.md', '构建产物，可删除、可重新生成、不能提交');
  assertIncludes('docs/00-项目规范.md', '依赖和本机缓存，可删除、可重新安装、不能提交');
  assertIncludes('docs/00-项目规范.md', 'runtime 数据，不能放项目源码目录');
  assertIncludes('docs/tasks/OPT-019-out-dist缓存产物清理规范.md', '状态：已完成');
  assertIncludes('docs/tasks/OPT-019-out-dist缓存产物清理规范.md', '不删除 out、node_modules、.pnpm-store、.node-gyp、.npm-cache');
}

function main() {
  verifyGitignore();
  verifyGeneratedPathsAreUntracked();
  verifyNoSuspiciousRootFragments();
  verifyDocs();

  assert(!existsSync(join(workspaceRoot, "l.includes('OPT-050")), 'stale command fragment still exists: l.includes(OPT-050');
  assert(!existsSync(join(workspaceRoot, "l.includes('settings")), 'stale command fragment still exists: l.includes(settings');

  console.log('OPT-019 build artifact verification passed');
}

main();
