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

function assertNotIncludes(relativePath, pattern) {
  const content = read(relativePath);
  if (pattern.test(content)) {
    throw new Error(`${relativePath} should not match ${pattern}`);
  }
}

assertIncludes('src/renderer/src/router/index.ts', "import ProjectOverviewHome from '@renderer/features/project-overview/ProjectOverviewHome.vue';");
assertIncludes('src/renderer/src/router/index.ts', "path: 'project-overview'");
assertIncludes('src/renderer/src/router/index.ts', "name: 'project-overview'");
assertIncludes('src/renderer/src/router/index.ts', "meta: { titleKey: 'route.projectOverview', requiresProject: true }");

const menu = read('src/renderer/src/router/menu.ts');
const novelIndex = menu.indexOf("routeName: 'novel'");
const exportIndex = menu.indexOf("routeName: 'export'");
if (menu.includes("titleKey: 'route.projectOverview'") || menu.includes("routeName: 'project-overview'")) {
  throw new Error('project overview should stay out of the visible project step menu');
}
if (novelIndex === -1) {
  throw new Error('project step menu should start with novel');
}
if (exportIndex === -1) {
  throw new Error('project menu should include export entry');
}
assertIncludes('src/renderer/src/router/menu.ts', 'projectWorkspaceRouteNames');
assertIncludes('src/renderer/src/router/menu.ts', "'project-overview'");
assertIncludes('src/renderer/src/router/menu.ts', "descriptionKey: 'routeDescription.export'");

assertIncludes('src/main/services/project.ts', "const targetRoute = 'project-overview';");
assertIncludes('src/shared/types/project.ts', "targetRoute: 'project-overview' | 'novel' | 'script';");

const overviewFile = 'src/renderer/src/features/project-overview/ProjectOverviewHome.vue';
assertIncludes(overviewFile, "const baseSteps: FlowStepBase[]");
assertIncludes(overviewFile, "key: 'setup'");
assertIncludes(overviewFile, "key: 'source'");
assertIncludes(overviewFile, "key: 'scriptAgent'");
assertIncludes(overviewFile, "key: 'extractAssets'");
assertIncludes(overviewFile, "key: 'assetImages'");
assertIncludes(overviewFile, "key: 'cornerScape'");
assertIncludes(overviewFile, "key: 'storyboard'");
assertIncludes(overviewFile, "key: 'imageReview'");
assertIncludes(overviewFile, "key: 'video'");
assertIncludes(overviewFile, "key: 'export'");
assertIncludes(overviewFile, "currentProject.value?.sourceType === 'novel'");
assertIncludes(overviewFile, "step.disabled ? t('projectOverview.skippedAction')");
assertNotIncludes(overviewFile, /[\p{Script=Han}]/u);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
assertIncludes(messagesFile, "projectOverview: '流程总览'");
assertIncludes(messagesFile, "projectOverview: 'Flow Overview'");
assertIncludes(messagesFile, "projectOverview: {");
assertIncludes(messagesFile, "title: '项目流程总览'");
assertIncludes(messagesFile, "title: 'Project Flow Overview'");
assertIncludes(messagesFile, "export: '导出前校验素材、构建时间线并输出剪映草稿。'");
assertIncludes(messagesFile, "export: 'Validate materials, build the timeline, and export a Jianying draft.'");

assertIncludes('docs/tasks/OPT-051-项目流程总览和流程驱动交互.md', '# OPT-051 项目流程总览和流程驱动交互');
assertIncludes('docs/tasks/OPT-051-项目流程总览和流程驱动交互.md', '最后大白话');

console.log('[verify-opt-051-project-flow-overview] passed');
