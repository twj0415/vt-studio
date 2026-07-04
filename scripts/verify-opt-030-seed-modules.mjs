import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'vt-studio-opt-030-'));
const bundleDirectory = join(workspaceRoot, 'node_modules', '.cache', 'vt-studio');
const bundlePath = join(bundleDirectory, 'verify-opt-030-bundle.cjs');
const entryPath = join(tempRoot, 'verify-opt-030-entry.ts');

function importPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

async function assertIncludes(relativePath, needle) {
  const content = await readFile(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

async function assertNotIncludes(relativePath, needle) {
  const content = await readFile(join(workspaceRoot, relativePath), 'utf-8');
  if (content.includes(needle)) {
    throw new Error(`${relativePath} 不应继续包含 ${needle}`);
  }
}

await assertIncludes('src/main/services/database/seed.ts', "import { seedUsers } from './seed-users'");
await assertIncludes('src/main/services/database/seed.ts', "import { seedDefaultAssetRecords } from './seed-default-assets'");
await assertNotIncludes('src/main/services/database/seed.ts', 'EVENT_EXTRACTION_DATA');
await assertNotIncludes('src/main/services/database/seed.ts', 'AGENT_CONFIGS');
await assertIncludes('src/main/services/database/seed-helpers.ts', 'export function insertIfMissing');
await assertIncludes('src/main/services/database/seed-helpers.ts', 'export function readJsonColumn');
await assertIncludes('src/main/services/database/seed-helpers.ts', 'export function writeJsonColumn');
await assertIncludes('src/main/services/database/seed-default-assets.ts', "from './seed-helpers'");
await assertIncludes('src/main/services/database/seed-default-assets.ts', "from './seed-manuals'");
await assertIncludes('src/main/services/database/seed-default-assets.ts', "from './seed-model-prompts'");
await assertIncludes('src/main/services/database/seed-manuals.ts', 'export function seedManualRecords');
await assertIncludes('src/main/services/database/seed-model-prompts.ts', 'export function seedModelPromptTemplates');
await assertNotIncludes('src/main/services/database/seed-default-assets.ts', 'function readSettingJson');
await assertNotIncludes('src/main/services/database/seed-default-assets.ts', 'function saveSettingJson');
await assertIncludes('docs/tasks/OPT-030-seed模块化和幂等helper.md', '# OPT-030 seed 模块化和幂等 helper');
await assertIncludes('docs/TODO-优化与缺口.md', '### 【√】OPT-030 seed 模块化和幂等 helper');

const entrySource = `
  import { app } from 'electron';
  import { configureGpu } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/gpu.ts')))};
  import { configureRuntime } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/runtime.ts')))};
  import { initializeFileSystem } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/file-system/index.ts')))};
  import { closeDatabase, getDatabase, runMigrations, runSeed } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/database/index.ts')))};
  import { syncDefaultAssets } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/default-assets/index.ts')))};
  import { DEFAULT_MAIN_SKILLS, DEFAULT_REFERENCE_SKILLS, DEFAULT_SKILL_ATTRIBUTIONS } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/default-assets/registry.ts')))};

  function countRows(tableName) {
    return getDatabase().prepare(\`SELECT COUNT(*) as count FROM \${tableName}\`).get().count;
  }

  function countSetting(key) {
    return getDatabase().prepare('SELECT COUNT(*) as count FROM app_settings WHERE key = ?').get(key).count;
  }

  async function main() {
    process.env.VT_STUDIO_USER_DATA = ${JSON.stringify(tempRoot.replace(/\\/g, '\\\\'))};
    configureGpu();
    configureRuntime();
    initializeFileSystem();
    syncDefaultAssets();
    runMigrations();

    const before = {
      users: countRows('users'),
      tokenKey: countSetting('tokenKey'),
      prompts: countRows('prompts'),
      skills: countRows('skill_list'),
      attributions: countRows('skill_attributions'),
    };

    runSeed();
    runSeed();

    const after = {
      users: countRows('users'),
      tokenKey: countSetting('tokenKey'),
      prompts: countRows('prompts'),
      skills: countRows('skill_list'),
      attributions: countRows('skill_attributions'),
    };

    if (before.users !== 1 || after.users !== 1) throw new Error('users seed 不幂等');
    if (before.tokenKey !== 1 || after.tokenKey !== 1) throw new Error('tokenKey seed 不幂等');
    if (before.prompts !== 4 || after.prompts !== 4) throw new Error('prompts seed 不幂等');
    const expectedSkillCount = DEFAULT_MAIN_SKILLS.length + DEFAULT_REFERENCE_SKILLS.length;
    if (before.skills !== expectedSkillCount || after.skills !== expectedSkillCount) throw new Error('skill_list seed 不幂等');
    if (before.attributions !== DEFAULT_SKILL_ATTRIBUTIONS.length || after.attributions !== DEFAULT_SKILL_ATTRIBUTIONS.length) {
      throw new Error('skill_attributions seed 不幂等');
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
    throw new Error(`OPT-030 verification failed with exit code ${result.status}, signal ${result.signal ?? 'none'}`);
  }

  console.log('OPT-030 seed module verification passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
}
