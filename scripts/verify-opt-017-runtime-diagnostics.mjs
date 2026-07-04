import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'vt-studio-opt-017-'));
const bundleDirectory = join(workspaceRoot, 'node_modules', '.cache', 'vt-studio');
const bundlePath = join(bundleDirectory, 'verify-opt-017-bundle.cjs');
const entryPath = join(tempRoot, 'verify-opt-017-entry.ts');

function importPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

async function assertIncludes(relativePath, needle) {
  const content = await readFile(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing ${needle}`);
  }
}

await assertIncludes('src/shared/types/file-management.ts', 'export interface FileRuntimeInfo');
await assertIncludes('src/shared/types/file-management.ts', "FileRuntimeSource = 'custom-env' | 'dev-temp' | 'electron-user-data'");
await assertIncludes('src/main/services/settings/file-management.ts', 'function getRuntimeInfo()');
await assertIncludes('src/main/services/settings/file-management.ts', 'insideWorkspace: isInsideDirectory');
await assertIncludes('src/main/services/settings/file-management.ts', "cleanableKeys: ['cache', 'temp']");
await assertIncludes('src/main/services/settings/file-management.ts', "recoverableKeys: ['modelPrompt', 'skills', 'assets']");
await assertIncludes('src/main/services/settings/file-management.ts', "protectedKeys: ['projects', 'exports', 'models', 'logs']");
await assertIncludes('src/renderer/src/features/settings/components/FileManagement.vue', 'runtimeInfo');
await assertIncludes('src/renderer/src/features/settings/components/FileManagement.vue', 'files.runtime.title');
await assertIncludes('src/renderer/src/i18n/messages.ts', "title: '运行目录诊断'");
await assertIncludes('src/renderer/src/i18n/messages.ts', "title: 'Runtime Directory Diagnostics'");
await assertIncludes('docs/tasks/OPT-017-runtime诊断和恢复策略.md', '# OPT-017 runtime 诊断和恢复策略');
await assertIncludes('docs/TODO-优化与缺口.md', '### 【√】OPT-017 runtime 诊断和恢复策略');

const entrySource = `
  import { app } from 'electron';
  import { configureGpu } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/gpu.ts')))};
  import { configureRuntime } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/runtime.ts')))};
  import { initializeFileSystem } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/file-system/index.ts')))};
  import { listOpenableDirectories } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/settings/file-management.ts')))};

  async function main() {
    process.env.VT_STUDIO_USER_DATA = ${JSON.stringify(tempRoot.replace(/\\/g, '\\\\'))};
    configureGpu();
    configureRuntime();
    initializeFileSystem();

    const result = listOpenableDirectories();
    const runtime = result.runtime;
    if (!runtime || runtime.userData !== process.env.VT_STUDIO_USER_DATA) throw new Error('runtime userData 诊断不正确');
    if (runtime.source !== 'custom-env') throw new Error('runtime source 诊断不正确');
    if (!runtime.cleanableKeys.includes('cache') || !runtime.cleanableKeys.includes('temp')) throw new Error('可清理目录缺失');
    if (!runtime.recoverableKeys.includes('skills') || !runtime.recoverableKeys.includes('modelPrompt')) throw new Error('可恢复目录缺失');
    if (!runtime.protectedKeys.includes('projects') || !runtime.protectedKeys.includes('exports')) throw new Error('保护目录缺失');
    if (!Array.isArray(result.directories) || !result.directories.some((item) => item.key === 'cache')) throw new Error('目录白名单缺失');

    app.quit();
  }

  module.exports = main().catch((error) => {
    console.error(error);
    app.exit(1);
  });
`;

try {
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(entryPath, entrySource);
  await build({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['@huggingface/transformers', 'better-sqlite3', 'electron', 'sharp', 'vm2'],
    alias: {
      '@shared': join(workspaceRoot, 'src/shared'),
    },
    logLevel: 'silent',
  });

  if (!existsSync(bundlePath)) {
    throw new Error('验证 bundle 未生成');
  }

  const electronBin = process.platform === 'win32'
    ? join(workspaceRoot, 'node_modules', '.bin', 'electron.CMD')
    : join(workspaceRoot, 'node_modules', '.bin', 'electron');
  const command = process.platform === 'win32' ? 'cmd.exe' : electronBin;
  const args = process.platform === 'win32' ? ['/c', electronBin, bundlePath] : [bundlePath];
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    timeout: 60000,
  });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`OPT-017 verification failed with exit code ${result.status}, signal ${result.signal ?? 'none'}`);
  }

  console.log('OPT-017 runtime diagnostics verification passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
}
