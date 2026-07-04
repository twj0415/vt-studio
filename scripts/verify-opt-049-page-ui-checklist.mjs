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

const taskPath = 'docs/tasks/OPT-049-全页面交互UI整改清单.md';

for (const required of [
  '登录页',
  '全局工作台',
  '项目页',
  '设置页',
  '任务中心',
  '小说/原文页',
  '剧本 Agent 页',
  '剧本页',
  '资产页',
  '角景页',
  '生产页',
  '导出页',
  'ModuleScaffold',
  '全局样式',
]) {
  assertIncludes(taskPath, required);
}

for (const required of [
  '第一批只改项目页、任务中心、原文页',
  '新增普通布局优先 Tailwind',
  '新增可见文案必须同时补 `zh-CN` 和 `en`',
  '主页面滚动层不能被弹窗/表格/卡片锁死',
  '失败状态必须给用户可理解原因',
  '生产和导出不抢跑',
]) {
  assertIncludes(taskPath, required);
}

assertIncludes('docs/TODO-优化与缺口.md', 'OPT-049 全页面交互 UI 整改清单');
assertIncludes('docs/TODO-优化与缺口.md', '第一批页面已完成：项目页、任务中心、原文页');
assertIncludes('docs/03-执行进度.md', 'OPT-049 全页面交互 UI 整改清单第一批已完成、第二批已完成、第三批已完成');
assertIncludes('docs/03-执行进度.md', 'OPT-049 第四批已重新规划为全局壳层顶部、设置页、弹窗/抽屉和组件化交互统一重构');
assertIncludes('scripts/verify.mjs', "'verify-opt-049-page-ui-checklist.mjs'");

console.log('[verify-opt-049-page-ui-checklist] passed');
