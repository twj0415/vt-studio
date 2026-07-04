<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RefreshIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';

interface StorageEntry {
  key: string;
  value: string;
  masked: boolean;
  protected: boolean;
}

type EditorMode = 'create' | 'edit';

const { t, locale } = useI18n();
const loading = ref(false);
const saving = ref(false);
const opening = ref(false);
const keyword = ref('');
const aiDevToolsEnabled = ref(false);
const isDev = ref(false);
const entries = ref<StorageEntry[]>([]);
const editorVisible = ref(false);
const clearDialogVisible = ref(false);
const clearConfirmText = ref('');
const editor = reactive({
  mode: 'create' as EditorMode,
  originalKey: '',
  key: '',
  value: '',
});

const PROTECTED_KEYS = new Set(['token', 'user', 'userId', 'vtStudio.locale', 'vtStudio.localeInitialized', 'vtStudio.appearance']);
const PROTECTED_PREFIXES = ['vtStudio.'];
const SENSITIVE_KEY_PARTS = ['token', 'secret', 'key', 'password', 'authorization'];

const filteredEntries = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) {
    return entries.value;
  }

  return entries.value.filter((entry) => entry.key.toLowerCase().includes(query) || entry.value.toLowerCase().includes(query));
});

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function isProtectedKey(key: string): boolean {
  return PROTECTED_KEYS.has(key) || PROTECTED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function isStateReloadKey(key: string): boolean {
  return isProtectedKey(key);
}

function formatPreview(entry: StorageEntry): string {
  if (entry.masked) {
    return t('settings.devConfig.storage.maskedValue');
  }

  if (!entry.value) {
    return t('settings.devConfig.storage.emptyValue');
  }

  return entry.value.length > 160 ? `${entry.value.slice(0, 160)}...` : entry.value;
}

function resetEditor(): void {
  editor.mode = 'create';
  editor.originalKey = '';
  editor.key = '';
  editor.value = '';
}

function refreshEntries(): void {
  const nextEntries: StorageEntry[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) {
      continue;
    }

    nextEntries.push({
      key,
      value: window.localStorage.getItem(key) ?? '',
      masked: isSensitiveKey(key),
      protected: isProtectedKey(key),
    });
  }

  entries.value = nextEntries.sort((left, right) => left.key.localeCompare(right.key, locale.value));
}

function getClearConfirmPhrase(): string {
  return t('settings.devConfig.storage.clearConfirmPhrase');
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.dev.get();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    aiDevToolsEnabled.value = response.data.enabled;
    isDev.value = response.data.isDev;
    refreshEntries();
  } finally {
    loading.value = false;
  }
}

async function saveConfig(): Promise<void> {
  saving.value = true;
  try {
    const response = await window.vtStudio.settings.dev.save({ enabled: aiDevToolsEnabled.value });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    aiDevToolsEnabled.value = response.data.enabled;
    isDev.value = response.data.isDev;
    MessagePlugin.success(t('settings.devConfig.saved'));
  } finally {
    saving.value = false;
  }
}

async function openDevTools(): Promise<void> {
  opening.value = true;
  try {
    const response = await window.vtStudio.settings.dev.openDevTools();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    if (response.data.opened) {
      MessagePlugin.success(t('settings.devConfig.devtoolsOpened'));
    }
  } finally {
    opening.value = false;
  }
}

async function copyText(value: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    MessagePlugin.success(successMessage);
  } catch {
    MessagePlugin.error(t('settings.devConfig.storage.copyFailed'));
  }
}

function openCreateDialog(): void {
  resetEditor();
  editor.mode = 'create';
  editorVisible.value = true;
}

function openEditDialog(entry: StorageEntry): void {
  editor.mode = 'edit';
  editor.originalKey = entry.key;
  editor.key = entry.key;
  editor.value = entry.value;
  editorVisible.value = true;
}

function formatJsonDraft(): void {
  if (!editor.value.trim()) {
    MessagePlugin.warning(t('settings.devConfig.storage.emptyValue'));
    return;
  }

  try {
    editor.value = JSON.stringify(JSON.parse(editor.value), null, 2);
    MessagePlugin.success(t('settings.devConfig.storage.formatted'));
  } catch {
    MessagePlugin.error(t('settings.devConfig.storage.invalidJson'));
  }
}

function closeEditor(): void {
  editorVisible.value = false;
  resetEditor();
}

function scheduleReloadIfNeeded(keys: string[]): void {
  if (!keys.some((key) => isStateReloadKey(key))) {
    return;
  }

  MessagePlugin.info(t('settings.devConfig.storage.reloadSoon'));
  window.setTimeout(() => {
    window.location.reload();
  }, 280);
}

function persistEditor(): void {
  const nextKey = editor.key.trim();
  const nextValue = editor.value;
  const touchedKeys = new Set<string>();

  if (editor.mode === 'edit' && editor.originalKey && editor.originalKey !== nextKey) {
    window.localStorage.removeItem(editor.originalKey);
    touchedKeys.add(editor.originalKey);
  }

  window.localStorage.setItem(nextKey, nextValue);
  touchedKeys.add(nextKey);
  refreshEntries();
  closeEditor();
  MessagePlugin.success(editor.mode === 'create' ? t('settings.devConfig.storage.created') : t('settings.devConfig.storage.saved'));
  scheduleReloadIfNeeded([...touchedKeys]);
}

function saveEditor(): void {
  const nextKey = editor.key.trim();
  if (!nextKey) {
    MessagePlugin.warning(t('settings.devConfig.storage.keyRequired'));
    return;
  }

  const duplicate = entries.value.some((entry) => entry.key === nextKey && entry.key !== editor.originalKey);
  if (duplicate) {
    MessagePlugin.warning(t('settings.devConfig.storage.duplicateKey'));
    return;
  }

  const requiresConfirm = isProtectedKey(nextKey) || (editor.originalKey && isProtectedKey(editor.originalKey));
  if (!requiresConfirm) {
    persistEditor();
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('settings.devConfig.storage.protectedSaveTitle'),
    body: t('settings.devConfig.storage.protectedSaveBody'),
    confirmBtn: t('settings.devConfig.storage.protectedConfirm'),
    cancelBtn: t('settings.devConfig.storage.cancel'),
    theme: 'warning',
    onConfirm() {
      persistEditor();
      dialog.destroy();
    },
  });
}

function deleteEntry(entry: StorageEntry): void {
  const dialog = DialogPlugin.confirm({
    header: t('settings.devConfig.storage.deleteTitle'),
    body: entry.protected ? t('settings.devConfig.storage.deleteProtectedBody', { key: entry.key }) : t('settings.devConfig.storage.deleteBody', { key: entry.key }),
    confirmBtn: t('settings.devConfig.storage.deleteConfirm'),
    cancelBtn: t('settings.devConfig.storage.cancel'),
    theme: 'danger',
    onConfirm() {
      window.localStorage.removeItem(entry.key);
      refreshEntries();
      MessagePlugin.success(t('settings.devConfig.storage.deleted'));
      scheduleReloadIfNeeded([entry.key]);
      dialog.destroy();
    },
  });
}

function openClearDialog(): void {
  clearConfirmText.value = '';
  clearDialogVisible.value = true;
}

function clearAll(): void {
  if (clearConfirmText.value !== getClearConfirmPhrase()) {
    MessagePlugin.warning(t('settings.devConfig.storage.clearConfirmMismatch'));
    return;
  }

  window.localStorage.clear();
  refreshEntries();
  clearDialogVisible.value = false;
  MessagePlugin.success(t('settings.devConfig.storage.cleared'));
  MessagePlugin.info(t('settings.devConfig.storage.reloadSoon'));
  window.setTimeout(() => {
    window.location.reload();
  }, 280);
}

defineExpose({ loadConfig });
onMounted(loadConfig);
</script>

<template>
  <section class="developer-config-section">
    <div class="developer-config-head">
      <div>
        <strong>{{ t('settings.devConfig.title') }}</strong>
        <p>{{ t('settings.devConfig.hint') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadConfig">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.devConfig.refresh') }}
        </t-button>
      </div>
    </div>

    <div class="developer-config-warning" v-if="!isDev">
      {{ t('settings.devConfig.devOnly') }}
    </div>

    <div class="developer-config-toolbar">
      <div class="developer-config-status">
        <div>
          <span>{{ t('settings.devConfig.aiDevTools') }}</span>
          <b>{{ aiDevToolsEnabled ? t('settings.devConfig.enabled') : t('settings.devConfig.disabled') }}</b>
        </div>
        <div>
          <span>{{ t('settings.devConfig.environment') }}</span>
          <b>{{ isDev ? t('settings.devConfig.devEnvironment') : t('settings.devConfig.productionEnvironment') }}</b>
        </div>
      </div>

      <div class="settings-actions">
        <t-switch v-model="aiDevToolsEnabled" :disabled="!isDev || saving" />
        <t-button theme="primary" :disabled="!isDev" :loading="saving" @click="saveConfig">{{ t('settings.devConfig.save') }}</t-button>
        <t-button variant="outline" :disabled="!isDev" :loading="opening" @click="openDevTools">{{ t('settings.devConfig.openDevTools') }}</t-button>
      </div>
    </div>

    <div class="developer-storage-section">
      <div class="developer-storage-head">
        <div>
          <strong>{{ t('settings.devConfig.storage.title') }}</strong>
          <p>{{ t('settings.devConfig.storage.hint') }}</p>
        </div>
        <div class="settings-actions">
          <t-input v-model="keyword" :placeholder="t('settings.devConfig.storage.searchPlaceholder')" clearable />
          <t-button theme="primary" @click="openCreateDialog">{{ t('settings.devConfig.storage.add') }}</t-button>
          <t-button theme="danger" variant="outline" @click="openClearDialog">{{ t('settings.devConfig.storage.clearAll') }}</t-button>
        </div>
      </div>

      <div class="developer-storage-impact">
        {{ t('settings.devConfig.storage.impact') }}
      </div>

      <div class="developer-storage-grid">
        <article v-for="entry in filteredEntries" :key="entry.key" class="developer-storage-card">
          <div class="developer-storage-card-head">
            <div>
              <strong>{{ entry.key }}</strong>
              <small>{{ entry.protected ? t('settings.devConfig.storage.protectedTag') : t('settings.devConfig.storage.normalTag') }}</small>
            </div>
            <t-tag :theme="entry.masked ? 'warning' : 'success'" variant="light">
              {{ entry.masked ? t('settings.devConfig.storage.maskedTag') : t('settings.devConfig.storage.plainTag') }}
            </t-tag>
          </div>
          <pre>{{ formatPreview(entry) }}</pre>
          <div class="developer-storage-card-actions">
            <t-button size="small" variant="outline" @click="copyText(entry.key, t('settings.devConfig.storage.keyCopied'))">{{ t('settings.devConfig.storage.copyKey') }}</t-button>
            <t-button size="small" variant="outline" @click="copyText(entry.value, t('settings.devConfig.storage.valueCopied'))">{{ t('settings.devConfig.storage.copyValue') }}</t-button>
            <t-button size="small" variant="outline" @click="openEditDialog(entry)">{{ t('settings.devConfig.storage.edit') }}</t-button>
            <t-button size="small" theme="danger" variant="outline" @click="deleteEntry(entry)">{{ t('settings.devConfig.storage.delete') }}</t-button>
          </div>
        </article>
        <t-empty v-if="filteredEntries.length === 0" :description="t('settings.devConfig.storage.empty')" />
      </div>
    </div>

    <t-dialog v-model:visible="editorVisible" :header="editor.mode === 'create' ? t('settings.devConfig.storage.createTitle') : t('settings.devConfig.storage.editTitle')" :confirm-btn="t('settings.devConfig.storage.save')" :cancel-btn="t('settings.devConfig.storage.cancel')" width="760px" @confirm="saveEditor" @close="closeEditor">
      <div class="developer-editor">
        <div class="developer-editor-toolbar">
          <t-input v-model="editor.key" :placeholder="t('settings.devConfig.storage.keyPlaceholder')" :disabled="editor.mode === 'edit'" />
          <t-button variant="outline" @click="formatJsonDraft">{{ t('settings.devConfig.storage.formatJson') }}</t-button>
        </div>
        <t-textarea v-model="editor.value" class="code-editor developer-editor-textarea" :placeholder="t('settings.devConfig.storage.valuePlaceholder')" :autosize="{ minRows: 18, maxRows: 28 }" />
      </div>
    </t-dialog>

    <t-dialog v-model:visible="clearDialogVisible" :header="t('settings.devConfig.storage.clearDialogTitle')" :confirm-btn="t('settings.devConfig.storage.clearConfirm')" :cancel-btn="t('settings.devConfig.storage.cancel')" width="680px" @confirm="clearAll">
      <div class="developer-clear-dialog">
        <p>{{ t('settings.devConfig.storage.clearDialogBody') }}</p>
        <t-input v-model="clearConfirmText" :placeholder="t('settings.devConfig.storage.clearConfirmPlaceholder', { phrase: getClearConfirmPhrase() })" />
      </div>
    </t-dialog>
  </section>
</template>
