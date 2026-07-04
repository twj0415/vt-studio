import { readdirSync, readFileSync, statSync } from 'node:fs';
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

function walkFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory)) {
    const filePath = join(directory, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      result.push(...walkFiles(filePath));
      continue;
    }

    if (/\.(ts|tsx|vue)$/.test(entry)) {
      result.push(filePath);
    }
  }

  return result;
}

const bannedRendererModelImports = new Set([
  'ai',
  '@ai-sdk/anthropic',
  '@ai-sdk/deepseek',
  '@ai-sdk/google',
  '@ai-sdk/openai',
  '@ai-sdk/openai-compatible',
  '@ai-sdk/xai',
  'qwen-ai-provider-v5',
  'vercel-minimax-ai-provider',
  'zhipu-ai-provider',
]);

function assertRendererDoesNotImportModelSdk() {
  const rendererRoot = join(workspaceRoot, 'src', 'renderer', 'src');
  const importPattern = /from\s+['"]([^'"]+)['"]/g;

  for (const filePath of walkFiles(rendererRoot)) {
    const content = readFileSync(filePath, 'utf-8');
    let match;
    while ((match = importPattern.exec(content))) {
      const source = match[1];
      if (bannedRendererModelImports.has(source) || source.startsWith('@ai-sdk/')) {
        throw new Error(`${filePath} imports model SDK ${source}`);
      }
    }
  }
}

assertIncludes('src/main/services/model/gateway.ts', 'export async function runModelCall');
assertIncludes('src/main/services/model/gateway.ts', 'export function resolveModelCallContext');
assertIncludes('src/main/services/model/gateway.ts', 'OPENAI_COMPATIBLE_VENDOR_IDS');
assertIncludes('src/main/services/model/gateway.ts', 'custom-adapter');
assertIncludes('src/main/services/model/gateway.ts', 'workflow');
assertIncludes('src/main/services/model/gateway.ts', 'requestId');
assertIncludes('src/main/services/model/gateway.ts', 'MODEL_ERROR');

assertIncludes('src/main/services/model/text.ts', 'resolveModelCallContext<TextModelConfig>');
assertIncludes('src/main/services/model/text.ts', 'runModelCall(context');
assertNotIncludes('src/main/services/model/text.ts', 'splitModelId');
assertNotIncludes('src/main/services/model/text.ts', 'getVendorRuntime');

assertIncludes('src/main/services/model/media.ts', 'resolveModelCallContext<TModel>');
assertIncludes('src/main/services/model/media.ts', 'runModelCall(context');
assertIncludes('src/main/services/model/media.ts', 'generateImageByModel');
assertIncludes('src/main/services/model/media.ts', 'generateVideoByModel');
assertIncludes('src/main/services/model/media.ts', 'generateAudioByModel');

assertIncludes('src/main/services/model/vendor-runner.ts', 'timeout: safePolicy.initTimeoutMs');
assertNotIncludes('src/main/services/model/vendor-runner.ts', 'timeout: 0');
assertIncludes('docs/tasks/OPT-006-多协议模型调用统一.md', '不做 adapter 沙盒安全');
assertIncludes('docs/TODO-优化与缺口.md', 'OPT-052 自定义 adapter 安全边界');

assertRendererDoesNotImportModelSdk();

console.log('[verify-opt-006] model gateway is wired');
