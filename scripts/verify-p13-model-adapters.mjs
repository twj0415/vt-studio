import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing ${needle}`);
  }
}

function assertNotIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (content.includes(needle)) {
    throw new Error(`${relativePath} should not include ${needle}`);
  }
}

function assertNoEmptyVendorImplementations() {
  const vendorDir = join(workspaceRoot, 'resources/default-data/vendors');
  const files = readdirSync(vendorDir).filter((file) => file.endsWith('.ts'));

  for (const file of files) {
    const relativePath = `resources/default-data/vendors/${file}`;
    const lines = read(relativePath).split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineNumber = index + 1;
      const allowedCanonicalQuery = file === 'volcengineSd2.ts' && trimmed === 'if (!Object.keys(params).length) return "";';

      if (!allowedCanonicalQuery && trimmed.includes('return "";')) {
        throw new Error(`${relativePath}:${lineNumber} has empty string adapter return`);
      }

      if (/=>\s*\{\s*\};/.test(trimmed)) {
        throw new Error(`${relativePath}:${lineNumber} has empty adapter function`);
      }
    });
  }
}

assertIncludes('docs/tasks/P13-真实模型适配与端到端生成验收批.md', '状态：已完成');
assertIncludes('docs/tasks/P13-真实模型适配与端到端生成验收批.md', '不新增演示数据');
assertIncludes('docs/tasks/P13-真实模型适配与端到端生成验收批.md', '不声明已真实跑通外部 API');

assertIncludes('src/main/services/model/vendor-runner.ts', 'Object.assign(runtime.vendor, normalizedVendor)');
assertIncludes('src/main/services/model/vendor-service.ts', 'createConnectionRuntimeFromAdapter');
assertIncludes('src/main/services/model/vendor-service.ts', 'enrichConnectionInputValues');
assertIncludes('src/main/services/model/vendor-service.ts', 'toAtlasCloudMediaBaseUrl');
assertIncludes('src/main/services/model/vendor-service.ts', 'CONNECTION_PROJECTION_ADAPTER_KEY');
assertNotIncludes('src/main/services/model/vendor-service.ts', 'createBuiltinConnectionRuntime');

assertIncludes('src/main/services/model/media.ts', 'normalizeMediaResult');
assertIncludes('src/main/services/model/media.ts', 'assertBase64Payload');
assertIncludes('src/main/services/model/media.ts', '模型未返回');
assertIncludes('src/main/services/model/media.ts', 'MODEL_ERROR');

assertIncludes('src/main/services/settings/model-config.ts', 'runVendorImageTest');
assertIncludes('src/main/services/settings/model-config.ts', 'runVendorVideoTest');
assertIncludes('src/main/services/settings/model-config.ts', "if (model.type === 'image')");
assertIncludes('src/main/services/settings/model-config.ts', "if (model.type === 'video')");
assertIncludes('src/main/services/settings/model-config.ts', 'TTS 测试入口尚未接入');

assertIncludes('src/renderer/src/features/settings/components/ModelTestDialog.vue', 'resultText');
assertIncludes('src/renderer/src/features/settings/components/ModelTestDialog.vue', 'result.filePath');
assertIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', 'getCapabilityTestPrompt(summary.capability)');
assertNotIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', '第一版先打通文本');
assertNotIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', '媒体测试会在后续能力任务接入');

assertNoEmptyVendorImplementations();

console.log('P13 model adapter verification passed');
