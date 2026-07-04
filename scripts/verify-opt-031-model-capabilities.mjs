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

assertIncludes('src/shared/constants/model-capabilities.ts', 'VIDEO_MODE_PRESETS');
assertIncludes('src/shared/constants/model-capabilities.ts', 'serializeVideoMode');
assertIncludes('src/shared/constants/model-capabilities.ts', 'parseVideoModeKey');
assertIncludes('src/shared/constants/model-capabilities.ts', 'getVideoModeReferenceLimits');
assertIncludes('src/shared/types/model-config.ts', 'capabilityMatrix: ModelCapabilityMatrixItem[]');

assertIncludes('src/main/services/model/capability-matrix.ts', 'normalizeRegisteredModel');
assertIncludes('src/main/services/model/capability-matrix.ts', 'vendorModelToRegisteredModel');
assertIncludes('src/main/services/model/capability-matrix.ts', 'registeredModelToVendorModel');
assertIncludes('src/main/services/model/capability-matrix.ts', 'buildCapabilityMatrixForConnections');
assertIncludes('src/main/services/model/capability-matrix.ts', 'assertVendorVideoModeSupported');

assertIncludes('src/main/services/settings/model-config.ts', 'registeredModelToVendorModel');
assertIncludes('src/main/services/settings/model-config.ts', 'buildCapabilityMatrixForConnections(connections)');
assertIncludes('src/main/services/settings/model-config.ts', 'capabilityMatrix');

assertIncludes('src/main/services/settings/model-prompt.ts', 'resource.capabilityMatrix');
assertIncludes('src/main/services/settings/model-prompt.ts', 'item.modeKey');
assertIncludes('src/main/services/settings/model-prompt.ts', 'ON CONFLICT(connection_id, model_name, model_type, model_mode)');

assertIncludes('src/main/services/model/media.ts', 'assertVendorVideoModeSupported(model, modeForCapability)');
assertIncludes('src/main/services/model/media.ts', 'getVideoModeReferenceLimits(modeForCapability)');
assertIncludes('src/main/services/project.ts', 'serializeVideoMode');
assertIncludes('src/main/services/production/service.ts', 'parseVideoModeKey(normalized)');

assertIncludes('src/renderer/src/features/settings/components/VendorConfig.vue', 'VIDEO_MODE_PRESETS');
assertIncludes('src/renderer/src/features/settings/components/VendorConfig.vue', 'parseVideoModeKey(key)');
assertIncludes('src/renderer/src/features/settings/components/ModelPromptConfig.vue', 'model.binding?.modelMode ?? model.modelMode');

assertIncludes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'response.data.capabilityMatrix.filter');
assertIncludes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'trackForm.model || null');
assertIncludes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'getVideoModeReferenceLimits(mode)');
assertIncludes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'parseVideoModeKey(value)');
assertNotIncludes('src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'project-default-video-model');

console.log('[verify-opt-031] model capability matrix is wired');
