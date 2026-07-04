import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'vt-studio-f-002-012-'));
const bundleDirectory = join(workspaceRoot, 'node_modules', '.cache', 'vt-studio');
const bundlePath = join(bundleDirectory, 'verify-f-002-012-bundle.cjs');
const entryPath = join(tempRoot, 'verify-f-002-012-entry.ts');

function importPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

const staticChecks = [
  ['docs/tasks/F-002-012-其他业务配置.md', '默认 `5`，最大 `8`'],
  ['src/main/ipc/settings.ts', 'settings:business:get'],
  ['src/main/ipc/settings.ts', 'settings:business:save'],
  ['src/preload/index.ts', 'settings:business:restore-default-chapter-reg'],
  ['src/shared/contracts/preload.ts', 'business: {'],
  ['src/renderer/src/features/settings/components/BusinessConfig.vue', 'settings.businessConfig.restoreDefaultRegex'],
  ['src/renderer/src/i18n/messages.ts', 'businessConfig: {'],
  ['src/main/services/settings/business-settings.ts', '资产生成并发数必须在 1-8 之间'],
];

for (const [relativePath, needle] of staticChecks) {
  const content = await import('node:fs').then(({ readFileSync }) => readFileSync(join(workspaceRoot, relativePath), 'utf-8'));
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

const entrySource = `
  import { app } from 'electron';
  import { configureGpu } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/gpu.ts')))};
  import { configureRuntime } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/runtime.ts')))};
  import { initializeFileSystem } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/file-system/directories.ts')))};
  import { closeDatabase, getDatabase } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/database/connection.ts')))};
  import {
    getBusinessSettings,
    restoreDefaultBusinessChapterReg,
    saveBusinessSettings,
  } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/settings/business-settings.ts')))};

  function createRequiredTables() {
    getDatabase().exec(\`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    \`);
  }

  async function expectBlocked(label, handler) {
    let blocked = false;
    try {
      await handler();
    } catch {
      blocked = true;
    }
    if (!blocked) {
      throw new Error(label);
    }
  }

  async function main() {
    process.env.VT_STUDIO_USER_DATA = ${JSON.stringify(tempRoot.replace(/\\/g, '\\\\'))};
    configureGpu();
    configureRuntime();
    initializeFileSystem();
    createRequiredTables();

    const initial = getBusinessSettings();
    if (initial.config.requestTimeoutMs !== 600000 || initial.config.canvasWheelMode !== 'zoom' || initial.config.assetsBatchGenerateSize !== 5) {
      throw new Error('默认业务配置不正确');
    }

    await expectBlocked('非法正则未阻止', () =>
      saveBusinessSettings({
        ...initial.config,
        chapterReg: '/([/g',
      }),
    );
    await expectBlocked('超时下限未阻止', () =>
      saveBusinessSettings({
        ...initial.config,
        requestTimeoutMs: 9000,
      }),
    );
    await expectBlocked('并发上限未阻止', () =>
      saveBusinessSettings({
        ...initial.config,
        assetsBatchGenerateSize: 9,
      }),
    );
    await expectBlocked('剧本长度下限未阻止', () =>
      saveBusinessSettings({
        ...initial.config,
        scriptEpisodeLength: 99,
      }),
    );

    const saved = saveBusinessSettings({
      chapterReg: '/第\\\\s*(\\\\d+)\\\\s*章/g',
      requestTimeoutMs: 120000,
      canvasWheelMode: 'scroll',
      showInteractionState: false,
      assetsBatchGenerateSize: 8,
      scriptEpisodeLength: 8000,
    });
    if (saved.config.requestTimeoutMs !== 120000 || saved.config.canvasWheelMode !== 'scroll' || saved.config.showInteractionState !== false || saved.config.assetsBatchGenerateSize !== 8) {
      throw new Error('业务配置保存失败');
    }

    const restored = restoreDefaultBusinessChapterReg();
    if (restored.config.chapterReg === saved.config.chapterReg) throw new Error('恢复默认正则未生效');
    if (restored.config.requestTimeoutMs !== 120000 || restored.config.canvasWheelMode !== 'scroll' || restored.config.assetsBatchGenerateSize !== 8) {
      throw new Error('恢复默认正则误改了其它字段');
    }

    closeDatabase();
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
    external: [
      '@huggingface/transformers',
      'better-sqlite3',
      'electron',
    ],
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
    timeout: 30000,
    env: {
      ...process.env,
      VT_STUDIO_VERIFY_F_002_012: '1',
    },
  });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`F-002-012 Electron verification failed with exit code ${result.status}, signal ${result.signal ?? 'none'}`);
  }

  console.log('F-002-012 business settings verification passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
}
