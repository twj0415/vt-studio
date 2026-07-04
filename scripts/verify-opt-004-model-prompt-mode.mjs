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

assertIncludes('src/main/services/settings/model-prompt.ts', 'export function resolveModelPromptTemplate');
assertIncludes('src/main/services/settings/model-prompt.ts', 'getMappingByTarget(connectionId, modelName, input.modelType, modelMode)');
assertIncludes('src/main/services/settings/model-prompt.ts', "getMappingByTarget(connectionId, modelName, input.modelType, '')");
assertIncludes('src/main/services/settings/model-prompt.ts', 'findDefaultVideoPromptTemplate(modelName, modelMode)');
assertIncludes('src/main/services/settings/model-prompt.ts', 'Seedance 2.0 多参数模式');
assertIncludes('src/main/services/settings/model-prompt.ts', 'Wan 2.6 单图首帧模式');
assertIncludes('src/main/services/settings/model-prompt.ts', '通用首尾帧模式');
assertIncludes('src/main/services/settings/model-prompt.ts', '通用多参数模式');

assertIncludes('src/main/services/production/service.ts', "import { resolveModelPromptTemplate } from '../settings/model-prompt'");
assertIncludes('src/main/services/production/service.ts', "import { getEffectivePromptByType } from '../settings/prompt'");
assertIncludes('src/main/services/production/service.ts', 'invokeText({');
assertIncludes('src/main/services/production/service.ts', "modelKey: 'universalAi'");
assertIncludes('src/main/services/production/service.ts', "getEffectivePromptByType('videoPromptGeneration')");
assertIncludes('src/main/services/production/service.ts', 'readProductionVideoManuals(project)');
assertIncludes('src/main/services/production/service.ts', '视频提示词生成手册规范');
assertIncludes('src/main/services/production/service.ts', 'buildVideoPromptInput(project, script, track, modelName, modeKey)');
assertIncludes('src/main/services/production/service.ts', '<storyboardItem');
assertIncludes('src/main/services/production/service.ts', 'stripThink(result.text ??');
assertIncludes('src/main/services/production/service.ts', 'runProductionVideoPromptGeneration(project, script, trackIds, task.taskId)');
assertIncludes('src/main/services/production/service.ts', 'video prompt generations failed');
assertNotIncludes('src/main/services/production/service.ts', 'createPlaceholderSuccessTask');

console.log('[verify-opt-004] video model mode prompt mapping is wired into generation');
