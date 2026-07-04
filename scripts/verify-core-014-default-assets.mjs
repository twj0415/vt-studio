import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'vt-studio-core-014-'));
const bundleDirectory = join(workspaceRoot, 'node_modules', '.cache', 'vt-studio');
const bundlePath = join(bundleDirectory, 'verify-core-014-bundle.cjs');
const entryPath = join(tempRoot, 'verify-core-014-entry.ts');

function importPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

const staticChecks = [
  ['src/main/services/default-assets/registry.ts', 'buildDefaultResourceRegistry'],
  ['src/main/services/default-assets/diagnostics.ts', 'diagnoseDefaultAssets'],
  ['src/main/services/default-assets/index.ts', 'DEFAULT_RESOURCE_TARGETS'],
  ['src/main/services/database/seed-skills.ts', 'DEFAULT_MAIN_SKILLS'],
  ['src/main/services/database/seed-manuals.ts', 'legacyRelativePaths'],
  ['src/shared/constants/manuals.ts', 'driector_skills'],
  ['src/renderer/src/features/project/components/ManualFormDialog.vue', 'PROJECT_MANUAL_TABS'],
  ['src/main/services/project.ts', 'getProjectManualTabs'],
];

for (const [relativePath, needle] of staticChecks) {
  const content = await import('node:fs').then(({ readFileSync }) => readFileSync(join(workspaceRoot, relativePath), 'utf-8'));
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

const entrySource = `
  import { existsSync, rmSync } from 'node:fs';
  import { app } from 'electron';
  import { configureGpu } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/gpu.ts')))};
  import { configureRuntime } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/runtime.ts')))};
  import { initializeFileSystem, getRuntimeDirectories, safeJoin } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/file-system/index.ts')))};
  import { closeDatabase, getDatabase, runMigrations, runSeed } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/database/index.ts')))};
  import { syncDefaultAssets } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/default-assets/index.ts')))};
  import { diagnoseDefaultAssets } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/default-assets/diagnostics.ts')))};
  import {
    DEFAULT_DIRECTOR_MANUALS,
    DEFAULT_MAIN_SKILLS,
    DEFAULT_MODEL_PROMPTS,
    DEFAULT_REFERENCE_SKILLS,
    DEFAULT_VENDOR_IDS,
    DEFAULT_VISUAL_MANUALS,
    buildDefaultResourceRegistry,
  } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/default-assets/registry.ts')))};
  import { getBuiltinVendorIds } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/model/builtin-vendors.ts')))};

  function countRows(tableName) {
    return getDatabase().prepare(\`SELECT COUNT(*) as count FROM \${tableName}\`).get().count;
  }

  function assertNoDiagnosticErrors(label, result) {
    if (result.errors > 0) {
      const sample = result.items
        .filter((item) => item.status === 'error')
        .slice(0, 8)
        .map((item) => \`\${item.id}: \${item.message}\`)
        .join('\\n');
      throw new Error(\`\${label} 存在默认资源错误:\\n\${sample}\`);
    }
  }

  async function main() {
    process.env.VT_STUDIO_USER_DATA = ${JSON.stringify(tempRoot.replace(/\\/g, '\\\\'))};
    configureGpu();
    configureRuntime();
    initializeFileSystem();

    const registry = buildDefaultResourceRegistry();
    if (registry.length < 40) throw new Error('默认资源 registry 数量异常');

    const builtinVendorIds = getBuiltinVendorIds();
    const missingBuiltin = builtinVendorIds.filter((vendorId) => !DEFAULT_VENDOR_IDS.includes(vendorId));
    if (missingBuiltin.length > 0) {
      throw new Error(\`registry 缺少内置供应商: \${missingBuiltin.join(', ')}\`);
    }

    const syncResult = syncDefaultAssets();
    if (!syncResult.available || syncResult.copied <= 0 || syncResult.missingTargets.length > 0) {
      throw new Error('默认资源同步结果异常');
    }

    runMigrations();
    runSeed();

    const repaired = diagnoseDefaultAssets({ repair: false });
    assertNoDiagnosticErrors('初始诊断', repaired);

    if (countRows('model_vendors') < DEFAULT_VENDOR_IDS.length) throw new Error('默认供应商未完整 seed');
    if (countRows('skill_list') < DEFAULT_MAIN_SKILLS.length + DEFAULT_REFERENCE_SKILLS.length) throw new Error('默认 Skill 未完整 seed');
    if (countRows('skill_attributions') < 14) throw new Error('Skill 归属未完整 seed');
    if (countRows('model_prompt_templates') < DEFAULT_MODEL_PROMPTS.length) throw new Error('默认模型提示词未完整 seed');
    if (countRows('visual_manuals') < DEFAULT_VISUAL_MANUALS.length) throw new Error('默认视觉手册未完整 seed');
    if (countRows('director_manuals') < DEFAULT_DIRECTOR_MANUALS.length) throw new Error('默认导演手册未完整 seed');

    const directories = getRuntimeDirectories();
    const promptPath = safeJoin(directories.modelPrompt, 'video/seedance2Multi-parameterMode.md');
    rmSync(promptPath, { force: true });
    const brokenFile = diagnoseDefaultAssets({ repair: false });
    if (!brokenFile.items.some((item) => item.id === 'model-prompt:video/seedance2Multi-parameterMode.md' && item.status === 'warning')) {
      throw new Error('删除 runtime 默认提示词后未被诊断发现');
    }
    const recoveredFile = diagnoseDefaultAssets({ repair: true });
    assertNoDiagnosticErrors('文件恢复后诊断', recoveredFile);
    if (!existsSync(promptPath)) throw new Error('默认提示词文件未恢复');

    const targetSkillId = DEFAULT_REFERENCE_SKILLS[0].id;
    getDatabase().prepare('DELETE FROM skill_attributions WHERE skill_id = ?').run(targetSkillId);
    getDatabase().prepare('DELETE FROM skill_list WHERE id = ?').run(targetSkillId);
    const brokenDb = diagnoseDefaultAssets({ repair: false });
    if (!brokenDb.items.some((item) => item.id === \`database:skill:\${targetSkillId}\` && item.status === 'error')) {
      throw new Error('删除默认 Skill 记录后未被诊断发现');
    }
    const recoveredDb = diagnoseDefaultAssets({ repair: true });
    assertNoDiagnosticErrors('数据库恢复后诊断', recoveredDb);
    if (!getDatabase().prepare('SELECT id FROM skill_list WHERE id = ? LIMIT 1').get(targetSkillId)) {
      throw new Error('默认 Skill 记录未恢复');
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
      'sharp',
      'vm2',
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
    timeout: 60000,
    env: {
      ...process.env,
      VT_STUDIO_VERIFY_CORE_014: '1',
    },
  });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`CORE-014 Electron verification failed with exit code ${result.status}, signal ${result.signal ?? 'none'}`);
  }

  console.log('CORE-014 default assets verification passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
}
