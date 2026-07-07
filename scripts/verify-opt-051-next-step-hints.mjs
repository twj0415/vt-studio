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

function assertNoChinese(relativePath) {
  const content = read(relativePath);
  if (/[\p{Script=Han}]/u.test(content)) {
    throw new Error(`${relativePath} should not include Chinese hard-coded text`);
  }
}

const componentFile = 'src/renderer/src/features/shared/WorkflowNextStepHint.vue';
assertIncludes(componentFile, "defineProps<");
assertIncludes(componentFile, "workflowHint.${hintKey}.title");
assertIncludes(componentFile, "workflowHint.overviewAction");
assertIncludes(componentFile, "router.push({ name: routeName })");
assertNoChinese(componentFile);

const pageHints = [
  ['src/renderer/src/features/script-agent/ScriptAgentHome.vue', 'hint-key="scriptAgent"', 'next-route-name="script"'],
  ['src/renderer/src/features/script/ScriptHome.vue', 'hint-key="script"', 'next-route-name="assets"'],
  ['src/renderer/src/features/assets/AssetsHome.vue', 'hint-key="assets"', 'next-route-name="corner-scape"'],
  ['src/renderer/src/features/corner-scape/CornerScapeHome.vue', 'hint-key="cornerScape"', 'next-route-name="production"'],
  ['src/renderer/src/features/production/ProductionHome.vue', 'hint-key="production"', 'next-route-name="export"'],
  ['src/renderer/src/features/export/ExportHome.vue', 'hint-key="export"', 'next-route-name="project-overview"'],
];

for (const [file, hintKey, nextRoute] of pageHints) {
  assertIncludes(file, "WorkflowNextStepHint");
  assertIncludes(file, hintKey);
  assertIncludes(file, nextRoute);
}

assertIncludes('src/renderer/src/features/novel/NovelHome.vue', 'class="source-table-section"');
if (read('src/renderer/src/features/novel/NovelHome.vue').includes('WorkflowNextStepHint')) {
  throw new Error('NovelHome.vue should keep the source page focused on the chapter table card without a top next-step hint');
}

const messagesFile = 'src/renderer/src/i18n/messages.ts';
assertIncludes(messagesFile, "workflowHint: {");
assertIncludes(messagesFile, "overviewAction: '流程总览'");
assertIncludes(messagesFile, "overviewAction: 'Flow Overview'");
assertIncludes(messagesFile, "title: '先确认剧本，再从剧本提取资产'");
assertIncludes(messagesFile, "title: 'Confirm scripts, then extract assets from scripts'");
assertIncludes(messagesFile, "summary: '图片不满意可以暂停替换或重新生成；视频轨道选中最终候选后，再进入导出页做素材校验。'");
assertIncludes(messagesFile, "summary: 'Pause to replace or regenerate unsuitable images. After each video track has a selected candidate, move to export validation.'");

const taskFile = 'docs/tasks/OPT-051-项目流程总览和流程驱动交互.md';
assertIncludes(taskFile, '第二批');
assertIncludes(taskFile, '原文页保持为单一卡片入口');

const verifyFile = 'scripts/verify.mjs';
assertIncludes(verifyFile, "'verify-opt-051-next-step-hints.mjs'");

console.log('[verify-opt-051-next-step-hints] passed');
