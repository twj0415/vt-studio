import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'vt-studio-opt-052-'));
const bundleDirectory = join(workspaceRoot, 'node_modules', '.cache', 'vt-studio');
const bundlePath = join(bundleDirectory, 'verify-opt-052-bundle.cjs');
const entryPath = join(tempRoot, 'verify-opt-052-entry.ts');
const loggerStubPath = join(tempRoot, 'logger-stub.ts');

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing ${needle}`);
  }
}

function importPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

const entrySource = `
  import { runVendorCode } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/model/vendor-runner.ts')))};

  function createAdapterSource(body: string) {
    return \`
      exports.vendor = {
        id: "verify-security",
        name: "Verify Security",
        author: "VT Studio",
        inputs: [],
        inputValues: {},
        models: [{ name: "Verify Image", modelName: "verify-image", type: "image", mode: ["text"] }]
      };
      exports.textRequest = function () { throw new Error("not used"); };
      exports.imageRequest = async function () { \${body} };
      exports.videoRequest = async function () { throw new Error("not used"); };
      exports.ttsRequest = async function () { throw new Error("not used"); };
    \`;
  }

  async function expectReject(run: () => unknown | Promise<unknown>, expected: string, label: string) {
    try {
      await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(expected)) {
        return;
      }
      throw new Error(label + " 抛错不符合预期：" + message);
    }
    throw new Error(label + " 未被拦截");
  }

  async function main() {
    await expectReject(
      () => runVendorCode("while (true) {}", { initTimeoutMs: 100 }),
      "供应商代码运行失败",
      "无限循环初始化",
    );

    const fileRuntime = runVendorCode(createAdapterSource('await fetch("file:///tmp/secret.txt"); return "";'), {
      requestTimeoutMs: 1000,
    });
    await expectReject(
      () => fileRuntime.imageRequest!({ prompt: "x", size: "1K", aspectRatio: "16:9" }, fileRuntime.vendor!.models[0] as any),
      "file:",
      "危险协议",
    );

    const allowlistRuntime = runVendorCode(createAdapterSource('await fetch("https://blocked.example.com/test"); return "";'), {
      requestTimeoutMs: 1000,
      allowedHosts: ["allowed.example.com"],
    });
    await expectReject(
      () => allowlistRuntime.imageRequest!({ prompt: "x", size: "1K", aspectRatio: "16:9" }, allowlistRuntime.vendor!.models[0] as any),
      "未授权域名",
      "allowlist 域名限制",
    );

    const pollRuntime = runVendorCode(createAdapterSource(
      'const result = await pollTask(async () => ({ completed: false }), 1, 60000); if (result.error !== "timeout") throw new Error("poll not capped"); return "ok";',
    ), {
      pollMaxAttempts: 2,
      pollTimeoutMs: 60000,
    });
    const pollResult = await pollRuntime.imageRequest!({ prompt: "x", size: "1K", aspectRatio: "16:9" }, pollRuntime.vendor!.models[0] as any);
    if (pollResult !== "ok") {
      throw new Error("pollTask 未按上限返回");
    }

    const loggerRuntime = runVendorCode(createAdapterSource('logger("authorization: Bearer abc token=secret " + "x".repeat(5000)); return "ok";'));
    await loggerRuntime.imageRequest!({ prompt: "x", size: "1K", aspectRatio: "16:9" }, loggerRuntime.vendor!.models[0] as any);
  }

  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;

try {
  assertIncludes('src/shared/types/vendor.ts', 'adapterMd5');
  assertIncludes('src/shared/types/vendor.ts', 'lastError');
  assertIncludes('src/main/services/settings/vendor.ts', 'getAdapterMd5');
  assertIncludes('src/renderer/src/features/settings/components/VendorConfig.vue', 'settings.vendorConfig.lastError');

  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(entryPath, entrySource);
  writeFileSync(loggerStubPath, `
    export const logger = {
      debug() {},
      info() {},
      detail() {},
      warn() {},
      error() {},
      fatal() {},
      section() {},
    };
  `);
  await build({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: [
      '@ai-sdk/*',
      'ai',
      'axios',
      'electron',
      'form-data',
      'jsonwebtoken',
      'qwen-ai-provider-v5',
      'sharp',
      'sucrase',
      'vercel-minimax-ai-provider',
      'vm2',
      'zhipu-ai-provider',
    ],
    alias: {
      '@shared': join(workspaceRoot, 'src/shared'),
    },
    plugins: [
      {
        name: 'logger-stub',
        setup(build) {
          build.onResolve({ filter: /^(\.\/logger|\.\.\/logger)$/ }, () => ({ path: loggerStubPath }));
        },
      },
    ],
    logLevel: 'silent',
  });

  if (!existsSync(bundlePath)) {
    throw new Error('验证 bundle 未生成');
  }

  const result = spawnSync(process.execPath, [bundlePath], {
    cwd: workspaceRoot,
    stdio: 'inherit',
    timeout: 30000,
    env: process.env,
  });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`OPT-052 verification failed with exit code ${result.status}, signal ${result.signal ?? 'none'}`);
  }

  console.log('[verify-opt-052] adapter security boundary is enforced');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
}
