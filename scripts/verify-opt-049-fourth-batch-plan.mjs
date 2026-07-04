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
const todoPath = 'docs/TODO-优化与缺口.md';
const progressPath = 'docs/03-执行进度.md';

for (const expected of [
  '第四批第一组已完成',
  '低高度 command bar',
  '设置页移除 `ModuleScaffold`',
  '左侧设置目录 + 右侧设置内容',
  '能用 TDesign 或已有封装组件',
  '禁止用原生 `title`',
  '`t-tooltip`',
  '裸 `input/checkbox/select/button`',
  '弹窗/抽屉统一治理',
]) {
  assertIncludes(taskPath, expected);
}

for (const expected of [
  '第四批第一组已完成：全局壳层顶部、设置页目录化、原生 title 清理、TDesign checkbox/tooltip 规则和生产工作台关键图标交互已收口',
  '图标按钮不依赖原生 `title`',
  '设置页首屏不再出现全局顶部、页面 hero、sticky quick cards 三层堆叠',
  '能用 TDesign 或项目已有封装组件就不用裸 HTML 控件',
]) {
  assertIncludes(todoPath, expected);
}

for (const expected of [
  'OPT-049 第四批已重新规划为全局壳层顶部、设置页、弹窗/抽屉和组件化交互统一重构',
  '第四批第一组已完成',
  '图标按钮不用原生 `title`',
  '统一 `t-tooltip`',
]) {
  assertIncludes(progressPath, expected);
}

assertIncludes('scripts/verify.mjs', "'verify-opt-049-fourth-batch-plan.mjs'");

console.log('[verify-opt-049-fourth-batch-plan] passed');
