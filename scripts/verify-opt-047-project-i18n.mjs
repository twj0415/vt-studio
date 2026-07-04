import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(content, needle, file) {
  assert(content.includes(needle), `${file} should include ${needle}`);
}

const projectFiles = [
  'src/renderer/src/features/project/ProjectHome.vue',
  'src/renderer/src/features/project/components/ProjectFormDialog.vue',
  'src/renderer/src/features/project/components/ManualFormDialog.vue',
];

for (const file of projectFiles) {
  assert(!/[\p{Script=Han}]/u.test(read(file)), `${file} should not include Chinese hard-coded text`);
}

const homeFile = 'src/renderer/src/features/project/ProjectHome.vue';
const home = read(homeFile);
includes(home, `useI18n`, homeFile);
includes(home, `t('project.title')`, homeFile);
includes(home, `t('project.delete.summary'`, homeFile);
includes(home, `t('project.delete.dangerHint')`, homeFile);
includes(home, `toLocaleString(locale.value`, homeFile);

const formFile = 'src/renderer/src/features/project/components/ProjectFormDialog.vue';
const form = read(formFile);
includes(form, `t('project.form.createTitle')`, formFile);
includes(form, `t('project.form.videoMode')`, formFile);
includes(form, `t('project.form.validation.models')`, formFile);

const manualFile = 'src/renderer/src/features/project/components/ManualFormDialog.vue';
const manual = read(manualFile);
includes(manual, `'project.manualForm.createTitle'`, manualFile);
includes(manual, `t('project.manualForm.validation.markdown')`, manualFile);
includes(manual, `t('project.manualForm.tabPlaceholder'`, manualFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `project: {`, messagesFile);
includes(messages, `title: '项目管理'`, messagesFile);
includes(messages, `title: 'Projects'`, messagesFile);
includes(messages, `videoMode: '视频模式'`, messagesFile);
includes(messages, `videoMode: 'Video Mode'`, messagesFile);
includes(messages, `summary: '将删除项目「{name}」'`, messagesFile);
includes(messages, `summary: 'Delete project "{name}"'`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第十三批-项目管理页.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第十三批：项目管理页', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-project-i18n.mjs'`, verifyFile);

console.log('[verify-opt-047-project-i18n] passed');
