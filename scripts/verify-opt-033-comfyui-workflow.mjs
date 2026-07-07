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

assertIncludes('src/shared/types/comfyui-workflow.ts', 'COMFYUI_WORKFLOW_SCHEMA');
assertIncludes('src/shared/types/comfyui-workflow.ts', 'ComfyUiWorkflowManifest');
assertIncludes('src/shared/types/comfyui-workflow.ts', 'referenceImages');

assertIncludes('src/main/services/model/comfyui-workflow.ts', 'parseComfyUiWorkflowManifest');
assertIncludes('src/main/services/model/comfyui-workflow.ts', 'validateComfyUiWorkflowManifest');
assertIncludes('src/main/services/model/comfyui-workflow.ts', 'executeComfyUiImageWorkflow');
assertIncludes('src/main/services/model/comfyui-workflow.ts', '/upload/image');
assertIncludes('src/main/services/model/comfyui-workflow.ts', '/prompt');
assertIncludes('src/main/services/model/comfyui-workflow.ts', '/history/');
assertIncludes('src/main/services/model/comfyui-workflow.ts', '/view?');
assertIncludes('src/main/services/model/comfyui-workflow.ts', 'MODEL_TIMEOUT');
assertIncludes('src/main/services/model/comfyui-workflow.ts', 'outputs.images');
assertIncludes('src/main/services/model/comfyui-workflow.ts', '原生 ComfyUI workflow');

assertIncludes('src/main/services/model/builtin-vendors.ts', 'executeComfyUiImageWorkflow');
assertIncludes('src/main/services/model/builtin-vendors.ts', 'workflowManifest');
assertIncludes('src/main/services/model/builtin-vendors.ts', "vendorId === 'comfyui'");
assertNotIncludes('src/main/services/model/builtin-vendors.ts', "description: '本地 ComfyUI 工作流增强 adapter，后续接 workflow");

assertIncludes('src/shared/types/model-config.ts', 'workflowManifest?: string');
assertIncludes('src/main/services/settings/model-config.ts', 'validateComfyUiWorkflowManifest');
assertIncludes('src/main/services/settings/model-config.ts', '缺少 ComfyUI Endpoint');
assertIncludes('src/main/services/settings/model-config.ts', 'workflowManifest: draft.workflowManifest?.trim() || previous?.workflowManifest ||');
assertIncludes('src/main/services/settings/model-config.ts', "workflow: connection.workflowManifest ?? ''");
assertIncludes('src/main/services/settings/model-config.ts', "'workflowManifest'");

assertIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', 'settings.modelService.form.workflowManifest');
assertIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', 'serviceForm.workflowManifest');
assertIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', 'settings.modelService.validation.endpointRequired');
assertIncludes('src/renderer/src/i18n/messages.ts', "endpointRequired: 'ComfyUI Endpoint 不能为空'");
assertIncludes('src/renderer/src/styles/index.scss', '.workflow-manifest-textarea textarea');

assertIncludes('docs/tasks/OPT-033-ComfyUI-workflow规范.md', 'vt.comfyui.workflow.v1');
assertIncludes('docs/tasks/OPT-033-ComfyUI-workflow规范.md', '参考项目没有完整 ComfyUI workflow');
assertIncludes('docs/TODO-优化与缺口.md', 'OPT-033 ComfyUI workflow 规范');

console.log('[verify-opt-033] comfyui workflow boundary is wired');
