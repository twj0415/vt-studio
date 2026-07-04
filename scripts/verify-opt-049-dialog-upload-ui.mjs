import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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

function listVueFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listVueFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.vue')) {
      files.push(fullPath);
    }
  }
  return files;
}

const filePickerPath = 'src/renderer/src/components/VtFilePicker.vue';
assertIncludes(filePickerPath, '<t-button');
assertIncludes(filePickerPath, 'type="file"');
assertIncludes(filePickerPath, 'aria-hidden="true"');
assertIncludes(filePickerPath, 'emit(\'change\', files)');

for (const relativePath of [
  'src/renderer/src/features/assets/AssetsHome.vue',
  'src/renderer/src/features/novel/NovelHome.vue',
  'src/renderer/src/features/script/ScriptHome.vue',
  'src/renderer/src/features/project/components/ManualFormDialog.vue',
]) {
  assertIncludes(relativePath, 'VtFilePicker');
  assertNotIncludes(relativePath, 'type="file"');
}

const fileInputViolations = [];
const allowedFilePicker = filePickerPath.replaceAll('/', '\\');
for (const file of listVueFiles(join(root, 'src/renderer/src'))) {
  const rel = relative(root, file);
  if (rel === filePickerPath || rel === allowedFilePicker) {
    continue;
  }
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/<input\s+[^>]*type=["']file["']/.test(line)) {
      fileInputViolations.push(`${rel}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (fileInputViolations.length) {
  throw new Error(`File selection must use VtFilePicker instead of page-level raw input:\n${fileInputViolations.join('\n')}`);
}

const stylePath = 'src/renderer/src/styles/index.scss';
for (const expected of [
  '.t-dialog__ctx .t-dialog__header',
  '.t-dialog__ctx .t-dialog__body',
  '.t-dialog__ctx .t-dialog__footer',
  '.t-drawer__body',
  '.t-drawer__footer',
  'scrollbar-gutter: stable',
]) {
  assertIncludes(stylePath, expected);
}

assertIncludes('docs/tasks/OPT-049-全页面交互UI整改清单.md', '文件上传入口组件化');
assertIncludes('docs/tasks/OPT-049-全页面交互UI整改清单.md', '弹窗/抽屉深层治理');
assertIncludes('docs/TODO-优化与缺口.md', '文件上传入口组件化');
assertIncludes('scripts/verify.mjs', "'verify-opt-049-dialog-upload-ui.mjs'");

console.log('[verify-opt-049-dialog-upload-ui] passed');
