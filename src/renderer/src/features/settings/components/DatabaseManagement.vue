<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { DataBaseIcon, DeleteIcon, DownloadIcon, RefreshIcon, UploadIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import type { DatabaseBackupItem, DatabaseManagementInfo, DatabaseTableInfo } from '@shared/types/database-management';

const { t, locale } = useI18n();

const IMPORT_CONFIRM_TEXT = '\u5bfc\u5165\u6570\u636e\u5e93';
const CLEAR_ALL_CONFIRM_TEXT = '\u6e05\u7a7a\u5168\u90e8\u6570\u636e';

const loading = ref(false);
const exporting = ref(false);
const importing = ref(false);
const clearingTable = ref(false);
const clearingAll = ref(false);
const checkingTasks = ref(false);
const info = ref<DatabaseManagementInfo | null>(null);
const backups = ref<DatabaseBackupItem[]>([]);
const tables = ref<DatabaseTableInfo[]>([]);

const form = reactive({
  selectedBackupName: '',
  importConfirmText: '',
  selectedTableName: '',
  tableConfirmText: '',
  clearAllConfirmText: '',
});

const selectedTable = computed(() => tables.value.find((table) => table.name === form.selectedTableName) ?? null);
const canImport = computed(() => Boolean(form.selectedBackupName) && form.importConfirmText === getImportConfirmPhrase());
const canClearTable = computed(() => {
  const table = selectedTable.value;
  return Boolean(table) && !table?.protected && form.tableConfirmText === form.selectedTableName;
});
const canClearAll = computed(() => form.clearAllConfirmText === getClearAllConfirmPhrase());

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function getImportConfirmPhrase(): string {
  return t('settings.databaseManagement.confirmPhrase.import');
}

function getClearAllConfirmPhrase(): string {
  return t('settings.databaseManagement.confirmPhrase.clearAll');
}

function getImportConfirmPayloadText(): string {
  return form.importConfirmText === getImportConfirmPhrase() ? IMPORT_CONFIRM_TEXT : form.importConfirmText;
}

function getClearAllConfirmPayloadText(): string {
  return form.clearAllConfirmText === getClearAllConfirmPhrase() ? CLEAR_ALL_CONFIRM_TEXT : form.clearAllConfirmText;
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString(locale.value, { hour12: false });
}

function formatRunningLocks(locks: DatabaseManagementInfo['runningLocks']): string {
  if (locks.length === 0) {
    return t('settings.databaseManagement.lock.none');
  }

  return locks.map((lock) => t('settings.databaseManagement.lock.item', { label: lock.label, count: lock.count })).join(t('settings.databaseManagement.lock.separator'));
}

async function loadDatabaseState(): Promise<void> {
  loading.value = true;
  try {
    const [infoResponse, backupsResponse, tablesResponse] = await Promise.all([window.vtStudio.settings.database.info(), window.vtStudio.settings.database.listBackups(), window.vtStudio.settings.database.listTables()]);

    if (!isOk(infoResponse)) {
      MessagePlugin.error(infoResponse.msg);
      return;
    }
    if (!isOk(backupsResponse)) {
      MessagePlugin.error(backupsResponse.msg);
      return;
    }
    if (!isOk(tablesResponse)) {
      MessagePlugin.error(tablesResponse.msg);
      return;
    }

    info.value = infoResponse.data.info;
    backups.value = backupsResponse.data.backups;
    tables.value = tablesResponse.data.tables;

    if (!form.selectedBackupName && backups.value[0]) {
      form.selectedBackupName = backups.value[0].name;
    }
    if (!form.selectedTableName) {
      form.selectedTableName = tables.value.find((table) => !table.protected)?.name ?? '';
    }
  } finally {
    loading.value = false;
  }
}

async function exportBackup(): Promise<void> {
  exporting.value = true;
  try {
    const response = await window.vtStudio.settings.database.export();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('settings.databaseManagement.message.backupGenerated', { name: response.data.backup.name }));
    if (response.data.containsSecrets) {
      MessagePlugin.warning(t('settings.databaseManagement.message.backupContainsSecrets'));
    }
    await loadDatabaseState();
  } finally {
    exporting.value = false;
  }
}

async function checkRunningTasks(): Promise<void> {
  checkingTasks.value = true;
  try {
    const response = await window.vtStudio.settings.database.checkRunningTasks();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.info(response.data.runningLockCount > 0 ? t('settings.databaseManagement.message.currentLocks', { locks: formatRunningLocks(response.data.runningLocks) }) : t('settings.databaseManagement.message.noRunningLocks'));
    await loadDatabaseState();
  } finally {
    checkingTasks.value = false;
  }
}

async function importBackup(): Promise<void> {
  if (!canImport.value) {
    MessagePlugin.warning(t('settings.databaseManagement.message.importConfirmRequired', { phrase: getImportConfirmPhrase() }));
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('settings.databaseManagement.importDialog.title'),
    body: t('settings.databaseManagement.importDialog.body', { name: form.selectedBackupName }),
    confirmBtn: t('settings.databaseManagement.importDialog.confirm'),
    cancelBtn: t('settings.databaseManagement.cancel'),
    theme: 'danger',
    async onConfirm() {
      importing.value = true;
      try {
        const response = await window.vtStudio.settings.database.import({
          backupName: form.selectedBackupName,
          confirmText: getImportConfirmPayloadText(),
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        MessagePlugin.success(t('settings.databaseManagement.message.imported', { name: response.data.autoBackupName }));
        form.importConfirmText = '';
        dialog.destroy();
        await loadDatabaseState();
      } finally {
        importing.value = false;
      }
    },
  });
}

async function clearSelectedTable(): Promise<void> {
  if (!selectedTable.value) {
    MessagePlugin.warning(t('settings.databaseManagement.message.selectTable'));
    return;
  }
  if (selectedTable.value.protected) {
    MessagePlugin.warning(t('settings.databaseManagement.message.protectedTable'));
    return;
  }
  if (!canClearTable.value) {
    MessagePlugin.warning(t('settings.databaseManagement.message.tableConfirmRequired', { name: form.selectedTableName }));
    return;
  }

  const tableName = form.selectedTableName;
  const dialog = DialogPlugin.confirm({
    header: t('settings.databaseManagement.clearTableDialog.title'),
    body: t('settings.databaseManagement.clearTableDialog.body', { tableName, module: selectedTable.value.module }),
    confirmBtn: t('settings.databaseManagement.clearTableDialog.confirm'),
    cancelBtn: t('settings.databaseManagement.cancel'),
    theme: 'danger',
    async onConfirm() {
      clearingTable.value = true;
      try {
        const response = await window.vtStudio.settings.database.clearTable({
          tableName,
          confirmText: form.tableConfirmText,
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        tables.value = response.data.tables;
        form.tableConfirmText = '';
        MessagePlugin.success(t('settings.databaseManagement.message.tableCleared', { tableName: response.data.tableName, deleted: response.data.deleted }));
        dialog.destroy();
        await loadDatabaseState();
      } finally {
        clearingTable.value = false;
      }
    },
  });
}

async function clearAllData(): Promise<void> {
  if (!canClearAll.value) {
    MessagePlugin.warning(t('settings.databaseManagement.message.clearAllConfirmRequired', { phrase: getClearAllConfirmPhrase() }));
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('settings.databaseManagement.clearAllDialog.title'),
    body: t('settings.databaseManagement.clearAllDialog.body'),
    confirmBtn: t('settings.databaseManagement.clearAllDialog.confirm'),
    cancelBtn: t('settings.databaseManagement.cancel'),
    theme: 'danger',
    async onConfirm() {
      clearingAll.value = true;
      try {
        const response = await window.vtStudio.settings.database.clearAll({
          confirmText: getClearAllConfirmPayloadText(),
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        info.value = response.data.info;
        tables.value = response.data.tables;
        form.clearAllConfirmText = '';
        MessagePlugin.success(t('settings.databaseManagement.message.clearAllDone', { name: response.data.autoBackupName }));
        dialog.destroy();
        await loadDatabaseState();
      } finally {
        clearingAll.value = false;
      }
    },
  });
}

defineExpose({ loadDatabaseState });
onMounted(loadDatabaseState);
</script>

<template>
  <section class="database-management-section">
    <div class="database-management-head">
      <div>
        <strong>{{ t('settings.databaseManagement.title') }}</strong>
        <p>{{ t('settings.databaseManagement.hint') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" :loading="checkingTasks" @click="checkRunningTasks">
          <template #icon><DataBaseIcon /></template>
          {{ t('settings.databaseManagement.checkTasks') }}
        </t-button>
        <t-button variant="outline" :loading="loading" @click="loadDatabaseState">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.databaseManagement.refresh') }}
        </t-button>
        <t-button theme="primary" :loading="exporting" @click="exportBackup">
          <template #icon><DownloadIcon /></template>
          {{ t('settings.databaseManagement.exportBackup') }}
        </t-button>
      </div>
    </div>

    <div class="database-warning">
      {{ t('settings.databaseManagement.warning.danger') }}
    </div>

    <div class="database-warning">
      {{ t('settings.databaseManagement.warning.secrets') }}
    </div>

    <div class="database-info-grid">
      <div>
        <span>{{ t('settings.databaseManagement.info.size') }}</span>
        <b>{{ info ? formatBytes(info.sizeBytes) : '-' }}</b>
      </div>
      <div>
        <span>{{ t('settings.databaseManagement.info.tables') }}</span>
        <b>{{ info?.tableCount ?? '-' }}</b>
      </div>
      <div>
        <span>{{ t('settings.databaseManagement.info.migrations') }}</span>
        <b>{{ info?.migrationCount ?? '-' }}</b>
      </div>
      <div>
        <span>{{ t('settings.databaseManagement.info.runningTasks') }}</span>
        <b>{{ info?.runningTaskCount ?? '-' }}</b>
      </div>
      <div>
        <span>{{ t('settings.databaseManagement.info.runningLocks') }}</span>
        <b>{{ info?.runningLockCount ?? '-' }}</b>
      </div>
    </div>

    <div v-if="info?.runningLocks?.length" class="database-warning">
      {{ t('settings.databaseManagement.message.currentLocks', { locks: formatRunningLocks(info.runningLocks) }) }}
    </div>

    <div class="database-path-panel">
      <span>{{ t('settings.databaseManagement.info.path') }}</span>
      <b>{{ info?.filePath ?? '-' }}</b>
    </div>

    <div class="database-panels">
      <div class="database-panel">
        <div class="database-panel-head">
          <div>
            <strong>{{ t('settings.databaseManagement.backup.title') }}</strong>
            <p>{{ t('settings.databaseManagement.backup.hint') }}</p>
          </div>
          <t-tag variant="light">{{ t('settings.databaseManagement.backup.count', { count: backups.length }) }}</t-tag>
        </div>
        <t-select v-model="form.selectedBackupName" :placeholder="t('settings.databaseManagement.backup.selectPlaceholder')">
          <t-option v-for="backup in backups" :key="backup.name" :value="backup.name" :label="backup.name" />
        </t-select>
        <div class="database-backup-list">
          <div v-for="backup in backups" :key="backup.name">
            <span>{{ backup.name }}</span>
            <small>{{ formatBytes(backup.sizeBytes) }} / {{ formatDate(backup.createdAt) }} / {{ backup.containsSecrets ? t('settings.databaseManagement.backup.containsSecrets') : t('settings.databaseManagement.backup.noSecrets') }}</small>
          </div>
          <t-empty v-if="backups.length === 0" :description="t('settings.databaseManagement.backup.empty')" />
        </div>
        <div class="database-danger-row">
          <t-input v-model="form.importConfirmText" :placeholder="t('settings.databaseManagement.placeholder.confirmPhrase', { phrase: getImportConfirmPhrase() })" />
          <t-button theme="danger" variant="outline" :disabled="!canImport" :loading="importing" @click="importBackup">
            <template #icon><UploadIcon /></template>
            {{ t('settings.databaseManagement.import') }}
          </t-button>
        </div>
      </div>

      <div class="database-panel">
        <div class="database-panel-head">
          <div>
            <strong>{{ t('settings.databaseManagement.table.title') }}</strong>
            <p>{{ t('settings.databaseManagement.table.hint') }}</p>
          </div>
          <t-tag variant="light">{{ t('settings.databaseManagement.table.count', { count: tables.length }) }}</t-tag>
        </div>
        <t-select v-model="form.selectedTableName" :placeholder="t('settings.databaseManagement.table.selectPlaceholder')">
          <t-option v-for="table in tables" :key="table.name" :value="table.name" :label="`${table.name} (${table.rowCount})`" :disabled="table.protected" />
        </t-select>
        <div v-if="selectedTable" class="database-table-detail">
          <div>
            <span>{{ t('settings.databaseManagement.table.module') }}</span>
            <b>{{ selectedTable.module }}</b>
          </div>
          <div>
            <span>{{ t('settings.databaseManagement.table.rows') }}</span>
            <b>{{ selectedTable.rowCount }}</b>
          </div>
          <t-tag :theme="selectedTable.protected ? 'danger' : 'warning'" variant="light">
            {{ selectedTable.protected ? t('settings.databaseManagement.table.protected') : t('settings.databaseManagement.table.clearable') }}
          </t-tag>
        </div>
        <div class="database-danger-row">
          <t-input v-model="form.tableConfirmText" :placeholder="form.selectedTableName ? t('settings.databaseManagement.placeholder.tableName', { name: form.selectedTableName }) : t('settings.databaseManagement.placeholder.tableNameRequired')" />
          <t-button theme="danger" variant="outline" :disabled="!canClearTable" :loading="clearingTable" @click="clearSelectedTable">
            <template #icon><DeleteIcon /></template>
            {{ t('settings.databaseManagement.clearTable') }}
          </t-button>
        </div>
      </div>
    </div>

    <div class="database-clear-all-panel">
      <div>
        <strong>{{ t('settings.databaseManagement.clearAll.title') }}</strong>
        <p>{{ t('settings.databaseManagement.clearAll.hint') }}</p>
      </div>
      <div class="database-danger-row">
        <t-input v-model="form.clearAllConfirmText" :placeholder="t('settings.databaseManagement.placeholder.confirmPhrase', { phrase: getClearAllConfirmPhrase() })" />
        <t-button theme="danger" :disabled="!canClearAll" :loading="clearingAll" @click="clearAllData">
          <template #icon><DeleteIcon /></template>
          {{ t('settings.databaseManagement.clearAll.action') }}
        </t-button>
      </div>
    </div>
  </section>
</template>
