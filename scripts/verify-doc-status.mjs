import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function extractTodoSections(content) {
  const matches = [...content.matchAll(/^### 【(?<mark>√| )】(?<id>OPT-\d{3}) (?<title>.+)$/gm)];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return {
      id: match.groups.id,
      mark: match.groups.mark,
      title: match.groups.title.trim(),
      body: content.slice(match.index, next?.index ?? content.length),
    };
  });
}

function getField(body, label) {
  const match = body.match(new RegExp(`^- ${label}：(.+)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

function resolveDocPath(relativePath) {
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith(`docs\\`) || normalizedPath.startsWith('docs/')) {
    return join(workspaceRoot, normalizedPath);
  }

  if (normalizedPath.startsWith(`tasks\\`) || normalizedPath.startsWith('tasks/')) {
    return join(workspaceRoot, 'docs', normalizedPath);
  }

  if (normalizedPath.startsWith(`features\\`) || normalizedPath.startsWith('features/')) {
    return join(workspaceRoot, 'docs', normalizedPath);
  }

  const taskPath = join(workspaceRoot, 'docs', 'tasks', normalizedPath);
  if (existsSync(taskPath)) return taskPath;

  const featurePath = join(workspaceRoot, 'docs', 'features', normalizedPath);
  if (existsSync(featurePath)) return featurePath;

  return join(workspaceRoot, normalizedPath);
}

function verifyTodoStatus() {
  const content = read('docs/TODO-优化与缺口.md');
  const sections = extractTodoSections(content);
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const orderRows = [...content.matchAll(/^\| \d+ \| `(OPT-\d{3})` .+? \| (.+?) \| .+? \|$/gm)];
  const completedOrderIds = new Set();

  for (const row of orderRows) {
    const [, id, status] = row;
    if (status.includes('已完成')) {
      completedOrderIds.add(id);
      const section = sectionById.get(id);
      assert(section, `TODO 推荐顺序里 ${id} 标为已完成，但正文没有对应章节`);
      assert(section.mark === '√', `TODO 推荐顺序里 ${id} 标为已完成，但正文没有标记为【√】`);
    }
  }

  for (const section of sections.filter((item) => item.mark === '√')) {
    assert(section.body.includes('处理状态：已完成'), `${section.id} 已标记【√】，但处理状态不是已完成`);
    assert(getField(section.body, '完成时间'), `${section.id} 缺少完成时间`);
    assert(getField(section.body, '涉及文件'), `${section.id} 缺少涉及文件`);
    assert(getField(section.body, '验证结果'), `${section.id} 缺少验证结果`);

    const taskLine = section.body.match(/^关联任务：(.+)$/m)?.[1]?.trim() ?? '';
    const ruleLine = section.body.match(/^关联规则：(.+)$/m)?.[1]?.trim() ?? '';
    assert(taskLine || ruleLine, `${section.id} 缺少关联任务或关联规则`);

    if (taskLine) {
      const paths = [...taskLine.matchAll(/`([^`]+\.md)`/g)].map((match) => match[1]);
      assert(paths.length > 0, `${section.id} 的关联任务必须写成可检查的 md 路径`);
      for (const relativePath of paths) {
        assert(existsSync(resolveDocPath(relativePath)), `${section.id} 关联任务不存在：${relativePath}`);
      }
    }

    if (completedOrderIds.has(section.id)) continue;
    assert(
      !section.body.includes('推荐处理顺序') || completedOrderIds.has(section.id),
      `${section.id} 已完成但未在推荐顺序里标记已完成`,
    );
  }
}

function verifyProgressLinks() {
  const content = read('docs/03-执行进度.md');
  const links = [...content.matchAll(/`([^`]+\.md)`/g)].map((match) => match[1]);

  for (const relativePath of links) {
    if (relativePath.includes('*')) continue;
    if (!relativePath.startsWith('tasks/') && !relativePath.startsWith('features/')) continue;

    const fullPath = resolveDocPath(relativePath);
    assert(existsSync(fullPath), `03-执行进度.md 引用的文档不存在：${relativePath}`);
  }
}

function main() {
  verifyTodoStatus();
  verifyProgressLinks();
  console.log('Document status verification passed');
}

main();
