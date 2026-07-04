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

const componentFile = 'src/renderer/src/features/settings/components/DatabaseManagement.vue';
const component = read(componentFile);

assert(!/[\p{Script=Han}]/u.test(component), 'DatabaseManagement.vue should not include Chinese hard-coded text');
includes(component, `import { useI18n } from 'vue-i18n';`, componentFile);
includes(component, `const { t, locale } = useI18n();`, componentFile);
includes(component, `settings.databaseManagement.title`, componentFile);
includes(component, `settings.databaseManagement.warning.secrets`, componentFile);
includes(component, `settings.databaseManagement.confirmPhrase.import`, componentFile);
includes(component, `settings.databaseManagement.message.backupGenerated`, componentFile);
includes(component, `settings.databaseManagement.importDialog.body`, componentFile);
includes(component, `getImportConfirmPayloadText()`, componentFile);
includes(component, `getClearAllConfirmPayloadText()`, componentFile);
notIncludes(component, `数据库管理`, componentFile);
notIncludes(component, `完整数据库备份包含模型密钥`, componentFile);
notIncludes(component, `当前锁定`, componentFile);
notIncludes(component, `输入：清空全部数据`, componentFile);

const messagesFile = 'src/renderer/src/i18n/messages.ts';
const messages = read(messagesFile);
includes(messages, `databaseManagement: {`, messagesFile);
includes(messages, `title: '数据库管理'`, messagesFile);
includes(messages, `title: 'Database Management'`, messagesFile);
includes(messages, `confirmPhrase`, messagesFile);
includes(messages, `backupContainsSecrets`, messagesFile);
includes(messages, `clearAllDialog`, messagesFile);

const taskFile = 'docs/tasks/OPT-047-可见文案i18n治理-第十批-设置数据库管理.md';
const task = read(taskFile);
includes(task, '# OPT-047 可见文案 i18n 治理 - 第十批：设置数据库管理', taskFile);
includes(task, '最后大白话', taskFile);

const verifyFile = 'scripts/verify.mjs';
const verify = read(verifyFile);
includes(verify, `'verify-opt-047-database-management-i18n.mjs'`, verifyFile);

const legacyVerifyFile = 'scripts/verify-f-002-010.mjs';
const legacyVerify = read(legacyVerifyFile);
includes(legacyVerify, `settings.databaseManagement.placeholder.confirmPhrase`, legacyVerifyFile);
notIncludes(legacyVerify, `DatabaseManagement.vue', '输入：清空全部数据'`, legacyVerifyFile);

const secretVerifyFile = 'scripts/verify-opt-035-secret-boundary.mjs';
const secretVerify = read(secretVerifyFile);
includes(secretVerify, `settings.databaseManagement.message.backupContainsSecrets`, secretVerifyFile);
includes(secretVerify, `settings.databaseManagement.backup.containsSecrets`, secretVerifyFile);

const locksVerifyFile = 'scripts/verify-opt-038-business-locks.mjs';
const locksVerify = read(locksVerifyFile);
includes(locksVerify, `settings.databaseManagement.message.currentLocks`, locksVerifyFile);

console.log('[verify-opt-047-database-management-i18n] passed');
