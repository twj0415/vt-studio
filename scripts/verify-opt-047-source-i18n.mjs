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

function notIncludes(content, needle, file) {
  assert(!content.includes(needle), `${file} should not include ${needle}`);
}

const novelFile = 'src/renderer/src/features/novel/NovelHome.vue';
const novel = read(novelFile);
includes(novel, `t('source.import.defaultVolumeName')`, novelFile);
includes(novel, 'getDefaultVolumeName()', novelFile);
includes(novel, 'DEFAULT_CHAPTER_REG', novelFile);
includes(novel, 'volumeRegex', novelFile);
notIncludes(novel, `DEFAULT_VOLUME_NAME = '正文卷'`, novelFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `defaultVolumeName: '正文卷'`, messagesFile);
includes(messages, `defaultVolumeName: 'Main Volume'`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第十四批-原文小说页.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第十四批：原文/小说页', taskFile);
includes(task, '中文章节正则', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-source-i18n.mjs'`, verifyFile);

console.log('[verify-opt-047-source-i18n] passed');
