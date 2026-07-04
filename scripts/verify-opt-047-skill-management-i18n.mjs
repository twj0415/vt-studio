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

const componentFile = 'src/renderer/src/features/settings/components/SkillManagement.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'SkillManagement.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t, locale } = useI18n();`, componentFile);
includes(component, `settings.skillManagement.title`, componentFile);
includes(component, `settings.skillManagement.riskDialog.title`, componentFile);
includes(component, `settings.skillManagement.message.fileMissingView`, componentFile);
includes(component, `settings.skillManagement.editorPlaceholder`, componentFile);
includes(component, `getSkillTypeText(skill.type)`, componentFile);
includes(component, `getFileStatusText(skill.fileStatus)`, componentFile);
notIncludes(component, 'Skill 结构风险', componentFile);
notIncludes(component, 'Skill 已保存', componentFile);
notIncludes(component, '文件正常', componentFile);
notIncludes(component, '正在读取 Skill', componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `skillManagement: {`, messagesFile);
includes(messages, `title: 'Skill 管理'`, messagesFile);
includes(messages, `title: 'Skill Management'`, messagesFile);
includes(messages, `riskDialog`, messagesFile);
includes(messages, `editorPlaceholder`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第四批-设置Skill管理.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第四批：设置 Skill 管理', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-skill-management-i18n.mjs'`, verifyFile);

console.log('[verify-opt-047-skill-management-i18n] passed');
