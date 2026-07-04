import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'vt-studio-opt-053-'));
const bundleDirectory = join(workspaceRoot, 'node_modules', '.cache', 'vt-studio');
const bundlePath = join(bundleDirectory, 'verify-opt-053-bundle.cjs');
const entryPath = join(tempRoot, 'verify-opt-053-entry.ts');

function importPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

const staticChecks = [
  ['src/main/services/model/connection-projection.ts', 'CONNECTION_PROJECTION_ADAPTER_KEY'],
  ['src/main/services/settings/model-config.ts', 'diagnoseModelConnectionConsistency'],
  ['src/main/services/settings/model-config.ts', 'assertNoConnectionReferences'],
  ['src/main/services/settings/vendor.ts', 'assertNotConnectionProjection'],
  ['src/shared/types/vendor.ts', 'managedBy'],
  ['src/renderer/src/features/settings/components/VendorConfig.vue', 'settings.vendorConfig.vendorSource.modelService'],
];

for (const [relativePath, needle] of staticChecks) {
  const filePath = join(workspaceRoot, relativePath);
  const content = await import('node:fs').then(({ readFileSync }) => readFileSync(filePath, 'utf-8'));
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

const entrySource = `
  import { app } from 'electron';
  import { configureRuntime } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/app/runtime.ts')))};
  import { initializeFileSystem } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/file-system/index.ts')))};
  import { closeDatabase, getDatabase, runMigrations, runSeed } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/database/index.ts')))};
  import { createTask, cancelTask } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/task/service.ts')))};
  import { getVendorList } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/settings/vendor.ts')))};
  import {
    deleteApiConnection,
    diagnoseModelConnectionConsistency,
    saveApiConnection,
    saveResourceBinding,
  } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/settings/model-config.ts')))};

  function getVendorRow(id: string) {
    return getDatabase().prepare('SELECT * FROM model_vendors WHERE id = ? LIMIT 1').get(id);
  }

  function assertThrowsConflict(run: () => unknown, label: string) {
    try {
      run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('引用')) {
        return;
      }
      throw new Error(label + ' 抛错不是引用阻断：' + message);
    }
    throw new Error(label + ' 未阻止删除');
  }

  async function main() {
    process.env.VT_STUDIO_USER_DATA = ${JSON.stringify(tempRoot.replace(/\\/g, '\\\\'))};
    configureRuntime();
    initializeFileSystem();
    runMigrations();
    runSeed();

    const saved = saveApiConnection({
      connection: {
        name: 'OPT-053 验证连接',
        serviceType: 'advanced',
        baseUrl: 'http://127.0.0.1:18053/v1',
        apiKey: 'test-key',
        capabilities: [],
        models: [
          { id: 'verify-text', displayName: 'Verify Text', modelName: 'verify-text', type: 'text', think: false },
          { id: 'verify-image', displayName: 'Verify Image', modelName: 'verify-image', type: 'image', imageModes: ['text'] },
          {
            id: 'verify-video',
            displayName: 'Verify Video',
            modelName: 'verify-video',
            type: 'video',
            videoModes: ['text'],
            durationOptions: [5],
            resolutionOptions: ['720p'],
          },
        ],
      },
    });
    const connectionId = saved.connection.id;

    const initialRow = getVendorRow(connectionId);
    if (!initialRow) throw new Error('保存普通连接后未写入 model_vendors 投影');
    const initialInputs = JSON.parse(initialRow.input_values);
    if (initialInputs.__adapterVendorId !== 'atlascloud') throw new Error('投影未记录 adapterVendorId');
    if (initialInputs.__connectionName !== 'OPT-053 验证连接') throw new Error('投影未记录连接名称');
    if (JSON.parse(initialRow.models).length !== 3) throw new Error('投影未同步模型列表');

    const vendorList = getVendorList();
    const projectionVendor = vendorList.vendors.find((vendor) => vendor.id === connectionId);
    if (!projectionVendor) throw new Error('高级 vendor 列表未显示连接投影');
    if (projectionVendor.managedBy !== 'model-service' || !projectionVendor.readOnly || projectionVendor.codeEditable) {
      throw new Error('连接投影未标记为模型服务生成只读项');
    }

    getDatabase().prepare('UPDATE model_vendors SET models = ?, enabled = ? WHERE id = ?').run('[]', 0, connectionId);
    const staleReport = diagnoseModelConnectionConsistency();
    if (!staleReport.issues.some((issue) => issue.type === 'stale-vendor-projection' && issue.connectionId === connectionId)) {
      throw new Error('诊断未发现陈旧投影');
    }
    const staleRepair = diagnoseModelConnectionConsistency({ repair: true });
    if (!staleRepair.issues.some((issue) => issue.type === 'stale-vendor-projection' && issue.repaired)) {
      throw new Error('陈旧投影未被修复');
    }
    const repairedRow = getVendorRow(connectionId);
    if (repairedRow.enabled !== 1 || JSON.parse(repairedRow.models).length !== 3) {
      throw new Error('陈旧投影修复结果不正确');
    }

    getDatabase().prepare('DELETE FROM model_vendors WHERE id = ?').run(connectionId);
    const missingRepair = diagnoseModelConnectionConsistency({ repair: true });
    if (!missingRepair.issues.some((issue) => issue.type === 'missing-vendor-projection' && issue.repaired)) {
      throw new Error('缺失投影未被诊断修复');
    }
    if (!getVendorRow(connectionId)) throw new Error('缺失投影修复后仍不存在');

    saveResourceBinding({
      capability: 'text',
      binding: { connectionId, modelName: 'verify-text' },
    });
    assertThrowsConflict(() => deleteApiConnection({ connectionId }), '默认模型绑定');
    saveResourceBinding({ capability: 'text', binding: null });
    saveResourceBinding({ capability: 'image', binding: null });
    saveResourceBinding({ capability: 'video', binding: null });

    const task = createTask({
      category: 'OPT-053 验证任务',
      modelName: connectionId + ':verify-text',
      description: 'running task reference guard',
    });
    assertThrowsConflict(() => deleteApiConnection({ connectionId }), '运行中任务');
    cancelTask(task.taskId, 'OPT-053 验证完成');

    const now = Date.now();
    getDatabase()
      .prepare(
        'INSERT INTO projects (source_type, name, genre, description, image_model_id, image_quality, video_model_id, video_mode, video_ratio, visual_manual_id, director_manual_id, workspace_path, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('novel', 'OPT-053 项目引用', '测试', '测试项目', connectionId + ':verify-image', 'standard', connectionId + ':verify-video', 'text', '16:9', 1, 1, '', 1, now, now);
    assertThrowsConflict(() => deleteApiConnection({ connectionId }), '项目模型引用');
    getDatabase().prepare('DELETE FROM projects WHERE name = ?').run('OPT-053 项目引用');

    deleteApiConnection({ connectionId });
    if (getVendorRow(connectionId)) throw new Error('删除普通连接后投影未删除');

    getDatabase()
      .prepare('INSERT INTO model_vendors (id, input_values, models, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('conn_orphan_opt053', JSON.stringify({ __adapterVendorId: 'openai', __connectionName: '孤儿投影' }), '[]', 1, now, now);
    const orphanRepair = diagnoseModelConnectionConsistency({ repair: true });
    if (!orphanRepair.issues.some((issue) => issue.type === 'orphan-vendor-projection' && issue.vendorId === 'conn_orphan_opt053' && issue.repaired)) {
      throw new Error('孤儿投影未被诊断');
    }
    if (getVendorRow('conn_orphan_opt053').enabled !== 0) throw new Error('孤儿投影未被禁用');

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
      '@ai-sdk/*',
      '@electron-toolkit/*',
      '@huggingface/transformers',
      'ai',
      'axios',
      'better-sqlite3',
      'electron',
      'form-data',
      'jsonwebtoken',
      'onnxruntime-web',
      'qwen-ai-provider-v5',
      'sharp',
      'sucrase',
      'tdesign-icons-vue-next',
      'tdesign-vue-next',
      'vercel-minimax-ai-provider',
      'vm2',
      'zhipu-ai-provider',
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
      VT_STUDIO_VERIFY_OPT_053: '1',
    },
  });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`OPT-053 Electron verification failed with exit code ${result.status}, signal ${result.signal ?? 'none'}`);
  }

  console.log('OPT-053 model connection projection verification passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
}
