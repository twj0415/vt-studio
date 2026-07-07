import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'vt-studio-klingai-'));
const bundleDirectory = join(workspaceRoot, 'node_modules', '.cache', 'vt-studio');
const bundlePath = join(bundleDirectory, 'verify-klingai-video-adapter.cjs');
const entryPath = join(tempRoot, 'verify-klingai-video-adapter-entry.ts');
const loggerStubPath = join(tempRoot, 'logger-stub.ts');
const adapterSource = readFileSync(join(workspaceRoot, 'resources/default-data/vendors/klingai.ts'), 'utf-8');

function importPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

const entrySource = `
  import { Buffer } from 'node:buffer';
  import { createServer } from 'node:http';
  import { runVendorCode } from ${JSON.stringify(importPath(join(workspaceRoot, 'src/main/services/model/vendor-runner.ts')))};

  const adapterSource = ${JSON.stringify(adapterSource)};
  const requests: Array<{ method: string; url: string; body: any }> = [];
  let origin = '';

  function readJsonBody(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        if (!text) {
          resolve({});
          return;
        }

        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  function writeJson(res: any, payload: unknown): void {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  function createMockServer() {
    const routeToTask: Record<string, string> = {
      '/v1/videos/text2video': 'task-text',
      '/v1/videos/image2video': 'task-image',
      '/v1/videos/multi-image2video': 'task-multi-image',
      '/v1/videos/omni-video': 'task-omni',
    };

    return createServer(async (req, res) => {
      const url = req.url || '/';

      if (req.method === 'GET' && url.startsWith('/media/')) {
        const body = Buffer.concat([Buffer.from('vt-studio-klingai-video-'), Buffer.alloc(64, 7)]);
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(body.byteLength) });
        res.end(body);
        return;
      }

      if (req.method === 'POST' && routeToTask[url]) {
        const body = await readJsonBody(req);
        requests.push({ method: req.method, url, body });
        writeJson(res, { code: 0, data: { task_id: routeToTask[url] } });
        return;
      }

      if (req.method === 'GET') {
        for (const [route, taskId] of Object.entries(routeToTask)) {
          if (url === route + '/' + taskId) {
            requests.push({ method: req.method, url, body: null });
            writeJson(res, {
              code: 0,
              data: {
                task_status: 'succeed',
                task_result: { videos: [{ url: origin + '/media/' + taskId + '.mp4' }] },
              },
            });
            return;
          }
        }
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 404, message: 'not found: ' + req.method + ' ' + url }));
    });
  }

  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
      throw new Error(message);
    }
  }

  async function expectReject(run: () => Promise<unknown>, expected: string, label: string): Promise<void> {
    try {
      await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(expected)) {
        return;
      }
      throw new Error(label + ' 抛错不符合预期：' + message);
    }

    throw new Error(label + ' 未抛错');
  }

  function findVideoModel(runtime: any, modelName: string): any {
    const model = runtime.vendor.models.find((item: any) => item.type === 'video' && item.modelName === modelName);
    assert(model, '未找到可灵视频模型：' + modelName);
    return model;
  }

  function setKlingInputs(runtime: any): void {
    runtime.vendor.inputValues.accessKey = 'access-key';
    runtime.vendor.inputValues.secretKey = 'secret-key';
    runtime.vendor.inputValues.baseUrl = origin;
  }

  function imageRef(seed: number) {
    return {
      type: 'image' as const,
      sourceType: 'base64' as const,
      base64: 'data:image/png;base64,' + Buffer.alloc(80, seed).toString('base64'),
    };
  }

  function videoRef() {
    return {
      type: 'video' as const,
      sourceType: 'base64' as const,
      base64: 'data:video/mp4;base64,' + Buffer.alloc(80, 4).toString('base64'),
    };
  }

  async function assertVideoResult(value: string, label: string): Promise<void> {
    assert(value.startsWith('data:video/mp4;base64,'), label + ' 未返回 video/mp4 base64');
  }

  function lastRequest(url: string) {
    const request = [...requests].reverse().find((item) => item.url === url && item.method === 'POST');
    assert(request, '未捕获请求：' + url);
    return request;
  }

  async function main() {
    const server = createMockServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address !== 'string', 'mock 服务端口获取失败');
    origin = 'http://127.0.0.1:' + address.port;

    try {
      const runtime = runVendorCode(adapterSource, {
        allowedHosts: ['127.0.0.1'],
        requestTimeoutMs: 5000,
        pollTimeoutMs: 10000,
        pollMaxAttempts: 5,
      });

      await expectReject(
        () => runtime.videoRequest!({ duration: 5, resolution: '1080p', aspectRatio: '16:9', prompt: 'test', referenceList: [], audio: false, mode: 'text' }, findVideoModel(runtime, 'kling-v2-5-turbo:std')),
        'Access Key',
        '缺少 Access Key',
      );

      setKlingInputs(runtime);

      await assertVideoResult(
        await runtime.videoRequest!({ duration: 5, resolution: '1080p', aspectRatio: '16:9', prompt: 'city wall dusk', referenceList: [], audio: false, mode: 'text' }, findVideoModel(runtime, 'kling-v2-5-turbo:std')),
        '文生视频',
      );
      const textRequest = lastRequest('/v1/videos/text2video');
      assert(textRequest.body.model_name === 'kling-v2-5-turbo', '文生视频 model_name 不正确');
      assert(textRequest.body.mode === 'std', '文生视频 mode 不正确');
      assert(textRequest.body.aspect_ratio === '16:9', '文生视频 aspect_ratio 不正确');

      await assertVideoResult(
        await runtime.videoRequest!({ duration: 5, resolution: '1080p', aspectRatio: '9:16', prompt: 'walk forward', referenceList: [imageRef(1)], audio: false, mode: 'singleImage' }, findVideoModel(runtime, 'kling-v2-5-turbo:std')),
        '单图生视频',
      );
      const imageRequest = lastRequest('/v1/videos/image2video');
      assert(imageRequest.body.image && !String(imageRequest.body.image).startsWith('data:'), '单图生视频 image 应为纯 base64');
      assert(!imageRequest.body.image_tail, '单图生视频不应携带 image_tail');

      await assertVideoResult(
        await runtime.videoRequest!({ duration: 10, resolution: '1080p', aspectRatio: '16:9', prompt: 'transition', referenceList: [imageRef(2), imageRef(3)], audio: false, mode: 'startEndRequired' }, findVideoModel(runtime, 'kling-v2-5-turbo:pro')),
        '首尾帧生视频',
      );
      const startEndRequest = lastRequest('/v1/videos/image2video');
      assert(startEndRequest.body.image && startEndRequest.body.image_tail, '首尾帧生视频必须携带 image 和 image_tail');

      await assertVideoResult(
        await runtime.videoRequest!({ duration: 5, resolution: '720p', aspectRatio: '16:9', prompt: 'omni prompt', referenceList: [], audio: false, mode: 'text' }, findVideoModel(runtime, 'kling-video-o1:std')),
        'Omni 文生视频',
      );
      const omniRequest = lastRequest('/v1/videos/omni-video');
      assert(omniRequest.body.model_name === 'kling-video-o1', 'Omni model_name 不正确');
      assert(omniRequest.body.aspect_ratio === '16:9', 'Omni 文生视频应携带 aspect_ratio');

      await assertVideoResult(
        await runtime.videoRequest!({ duration: 5, resolution: '720p', aspectRatio: '16:9', prompt: 'multi image prompt', referenceList: [imageRef(5), imageRef(6)], audio: false, mode: ['imageReference:4'] }, findVideoModel(runtime, 'kling-v1-6:std')),
        '多图片参考生视频',
      );
      const multiImageRequest = lastRequest('/v1/videos/multi-image2video');
      assert(Array.isArray(multiImageRequest.body.image_list) && multiImageRequest.body.image_list.length === 2, '多图片参考 image_list 数量不正确');

      await expectReject(
        () => runtime.videoRequest!({ duration: 5, resolution: '720p', aspectRatio: '16:9', prompt: 'video ref', referenceList: [videoRef()], audio: false, mode: ['videoReference:1'] }, findVideoModel(runtime, 'kling-video-o1:std')),
        '视频参考输入',
        '未实现的视频参考模式',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;

try {
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
    throw new Error(`KlingAI adapter verification failed with exit code ${result.status}, signal ${result.signal ?? 'none'}`);
  }

  console.log('[verify-klingai] video adapter passed');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
}
