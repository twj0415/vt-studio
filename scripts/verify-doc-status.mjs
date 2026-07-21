import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const requiredDocs = [
  'README.md',
  '项目功能清单.md',
  '技术栈.md',
  '开发规则.md',
  '通用视频生产流程设计.md',
  '模型能力审计与设计.md',
  '后续目标与待办.md',
];

const forbiddenDocs = [
  '当前项目对比参考项目还不够的地方.md',
  'ai-short-drama-production-refactor-requirements.md',
  'AI短剧制作流程框架设计.md',
  'reference-toonflow-project-to-video-export-implementation.md',
  'vt-studio-ai-short-drama-desktop-redesign.html',
  'TODO-优化与缺口.md',
  '03-执行进度.md',
];

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertIncludes(relativePath, expected) {
  const content = read(relativePath);
  assert(content.includes(expected), `${relativePath} 缺少内容：${expected}`);
}

function verifyDocFiles() {
  const docsDir = join(workspaceRoot, 'docs');
  const names = readdirSync(docsDir, { withFileTypes: true }).map((entry) => entry.name);

  for (const name of requiredDocs) {
    assert(existsSync(join(docsDir, name)), `缺少文档：docs/${name}`);
  }

  for (const name of forbiddenDocs) {
    assert(!existsSync(join(docsDir, name)), `旧文档不应继续保留：docs/${name}`);
  }

  const unexpected = names.filter((name) => !requiredDocs.includes(name));
  assert(unexpected.length === 0, `docs 目录存在未登记文件：${unexpected.join(', ')}`);
}

function verifyEntryLinks() {
  assertIncludes('AGENTS.md', 'docs/README.md');
  assertIncludes('AGENTS.md', 'docs/项目功能清单.md');
  assertIncludes('AGENTS.md', 'docs/技术栈.md');
  assertIncludes('AGENTS.md', 'docs/开发规则.md');
  assertIncludes('AGENTS.md', 'docs/通用视频生产流程设计.md');
  assertIncludes('AGENTS.md', 'docs/模型能力审计与设计.md');
  assertIncludes('AGENTS.md', 'docs/后续目标与待办.md');

  for (const name of requiredDocs.filter((name) => name !== 'README.md')) {
    assertIncludes('docs/README.md', name);
  }
}

function verifyWorkflowRules() {
  assertIncludes('docs/通用视频生产流程设计.md', '内容 -> 资源 -> 分镜 -> 分镜画面 -> 视频 -> 导出');
  assertIncludes('docs/通用视频生产流程设计.md', '“导演计划”不得作为用户顶部独立步骤');
  assertIncludes('docs/开发规则.md', 'D:\\software\\nodejs\\pnpm.cmd');
  assertIncludes('docs/技术栈.md', 'pnpm@10.24.0');

  const workflow = read('docs/通用视频生产流程设计.md');
  assert(!workflow.includes('内容 -> 资源 -> 导演计划 -> 分镜'), '流程文档不应把导演计划写成顶部主步骤');
}

function verifyTodoDocument() {
  const todo = read('docs/后续目标与待办.md');
  const ids = [...todo.matchAll(/^## (TODO-\d{3}) /gm)].map((match) => match[1]);

  assert(ids.length > 0, '后续目标与待办.md 必须至少包含一个 TODO');
  assert(new Set(ids).size === ids.length, '后续目标与待办.md 存在重复 TODO ID');
  assert(todo.includes('状态：'), '后续目标与待办.md 的 TODO 必须写状态');
  assert(todo.includes('优先级：'), '后续目标与待办.md 的 TODO 必须写优先级');
  assert(todo.includes('验收：'), '后续目标与待办.md 的 TODO 必须写验收标准');
}

function main() {
  verifyDocFiles();
  verifyEntryLinks();
  verifyWorkflowRules();
  verifyTodoDocument();
  console.log('Document verification passed');
}

main();
