import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function assertIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} should include: ${expected}`);
  }
}

function assertNotIncludes(relativePath, unexpected) {
  const content = read(relativePath);
  if (content.includes(unexpected)) {
    throw new Error(`${relativePath} should not include: ${unexpected}`);
  }
}

assertIncludes('src/renderer/src/router/index.ts', 'ResourceLibraryHome');
assertIncludes('src/renderer/src/router/index.ts', "name: 'resource-library'");
assertIncludes('src/renderer/src/router/menu.ts', "routeName: 'resource-library'");
assertIncludes('src/renderer/src/layouts/WorkbenchLayout.vue', "'resource-library': FileIcon");

assertIncludes('src/renderer/src/features/resource-library/ResourceLibraryHome.vue', 'ManualFormDialog');
assertIncludes('src/renderer/src/features/resource-library/ResourceLibraryHome.vue', '<PromptConfig');
assertIncludes('src/renderer/src/features/resource-library/ResourceLibraryHome.vue', '<ModelPromptConfig');
assertIncludes('src/renderer/src/features/resource-library/ResourceLibraryHome.vue', '<SkillManagement');
assertIncludes('src/renderer/src/features/resource-library/ResourceLibraryHome.vue', 'resource-library-panel-actions');
assertNotIncludes('src/renderer/src/features/resource-library/ResourceLibraryHome.vue', 'resource-library-head');

assertIncludes('src/renderer/src/features/project/ProjectHome.vue', 'openResourceLibrary');
assertIncludes('src/renderer/src/features/project/ProjectHome.vue', 'project-resource-strip');
assertNotIncludes('src/renderer/src/features/project/ProjectHome.vue', 'project-manual-section');
assertNotIncludes('src/renderer/src/features/project/ProjectHome.vue', 'project-resource-section');
assertNotIncludes('src/renderer/src/features/project/ProjectHome.vue', 'ManualFormDialog');

assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "key: 'basic'");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "key: 'account'");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "key: 'generation'");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "key: 'workspace'");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "key: 'creation'");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "key: 'about'");
assertIncludes('src/renderer/src/features/settings/SettingsHome.vue', "key: 'advanced'");
assertNotIncludes('src/renderer/src/features/settings/SettingsHome.vue', '<PromptConfig');
assertNotIncludes('src/renderer/src/features/settings/SettingsHome.vue', '<SkillManagement');

assertIncludes('src/renderer/src/styles/index.scss', '::-webkit-scrollbar');
assertIncludes('src/renderer/src/styles/index.scss', '.resource-library-layout');
assertIncludes('src/renderer/src/styles/index.scss', '.settings-category-section');
assertIncludes('src/renderer/src/styles/index.scss', '.project-resource-strip');
assertIncludes('src/renderer/src/styles/index.scss', '.resource-library-panel-actions');
assertNotIncludes('src/renderer/src/styles/index.scss', '.resource-library-head');
assertNotIncludes('src/renderer/src/styles/index.scss', '.project-resource-section');

assertIncludes('src/renderer/src/i18n/messages.ts', 'resourceLibrary:');
assertIncludes('src/renderer/src/i18n/messages.ts', "'resource-library':");

console.log('[verify-resource-library-ia] passed');
