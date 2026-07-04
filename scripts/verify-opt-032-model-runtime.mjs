import { readFileSync } from 'node:fs';
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

assertIncludes('src/shared/constants/status.ts', 'MODEL_TIMEOUT');
assertIncludes('src/main/services/model/gateway.ts', 'export interface ModelCallRunOptions');
assertIncludes('src/main/services/model/gateway.ts', 'timeoutMs');
assertIncludes('src/main/services/model/gateway.ts', 'normalizeRetryOptions');
assertIncludes('src/main/services/model/gateway.ts', 'shouldRetryModelError');
assertIncludes('src/main/services/model/gateway.ts', 'assertModelCallNotCancelled');
assertIncludes('src/main/services/model/gateway.ts', 'VT_STATUS.TASK_CANCELLED');
assertIncludes('src/main/services/model/gateway.ts', 'getBusinessSettings().config.requestTimeoutMs');
assertIncludes('src/main/services/model/gateway.ts', 'logger.warn');

assertIncludes('src/main/services/model/types.ts', 'taskId?: number');
assertIncludes('src/main/services/model/types.ts', 'isCancelled?: () => boolean');
assertIncludes('src/main/services/model/types.ts', 'ModelCallRetryOptions');

assertIncludes('src/main/services/model/media.ts', 'cloneRuntimeInput');
assertIncludes('src/main/services/model/media.ts', 'const { task: _task, requestId: _requestId, ...runtimeInput } = input');
assertIncludes('src/main/services/model/media.ts', 'assertReferencePayloads');
assertIncludes('src/main/services/model/media.ts', 'assertHttpMediaUrl');
assertIncludes('src/main/services/model/media.ts', 'runModelCall(context');
assertIncludes('src/main/services/model/media.ts', 'retry: options.retry ?? { maxAttempts: 2');
assertIncludes('src/main/services/model/media.ts', 'retry: options.retry ?? false');
assertNotIncludes('src/main/services/model/media.ts', 'runtime.imageRequest!(input, model)');
assertNotIncludes('src/main/services/model/media.ts', 'runtime.videoRequest!(input, model)');
assertNotIncludes('src/main/services/model/media.ts', 'runtime.ttsRequest!(input, model)');

assertIncludes('src/main/services/assets/migrations.ts', '0014_add_asset_media_task_id');
assertIncludes('src/main/services/assets/service.ts', 'task_id: number | null');
assertIncludes('src/main/services/assets/service.ts', 'attachMediaTask');
assertIncludes('src/main/services/assets/service.ts', 'isMediaGenerationCancelled');
assertIncludes('src/main/services/assets/service.ts', 'taskId,');
assertIncludes('src/main/services/assets/service.ts', 'safeCancelTask(media.task_id');

assertIncludes('src/main/services/production/service.ts', 'isStoryboardImageCancelled');
assertIncludes('src/main/services/production/service.ts', 'isDerivedAssetImageCancelled');
assertIncludes('src/main/services/production/service.ts', 'isProductionVideoCancelled');
assertIncludes('src/main/services/production/service.ts', 'generateProductionStoryboardImage(project, script, storyboardId, modelKey, taskId)');
assertIncludes('src/main/services/production/service.ts', 'generateProductionDerivedAssetImage(project, script, assetId, modelKey, taskId)');
assertIncludes('src/main/services/production/service.ts', 'generateProductionVideoCandidate(project, script, videoId, modelKey, taskId)');

console.log('[verify-opt-032] model runtime cancellation, timeout and retry rules are wired');
