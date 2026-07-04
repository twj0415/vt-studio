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

const scriptFile = 'src/renderer/src/features/script/ScriptHome.vue';
const script = read(scriptFile);
includes(script, 'DEFAULT_SCRIPT_REG', scriptFile);
includes(script, `t('script.import.episodeName'`, scriptFile);
includes(script, `t('script.import.episodeNameWithTitle'`, scriptFile);
notIncludes(script, '第${number}集', scriptFile);

const agentFile = 'src/renderer/src/features/script-agent/ScriptAgentHome.vue';
const agent = read(agentFile);
assert(!/[\p{Script=Han}]/u.test(agent), `${agentFile} should not include Chinese hard-coded text`);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `episodeName: '第{number}集'`, messagesFile);
includes(messages, `episodeNameWithTitle: '第{number}集 {title}'`, messagesFile);
includes(messages, `episodeName: 'Episode {number}'`, messagesFile);
includes(messages, `episodeNameWithTitle: 'Episode {number} - {title}'`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第十五批-剧本页.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第十五批：剧本页', taskFile);
includes(task, 'DEFAULT_SCRIPT_REG', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-script-i18n.mjs'`, verifyFile);

console.log('[verify-opt-047-script-i18n] passed');
