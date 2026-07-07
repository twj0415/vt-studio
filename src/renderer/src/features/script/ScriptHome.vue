<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AddIcon, DeleteIcon, DownloadIcon, EditIcon, PlayCircleIcon, RefreshIcon, SearchIcon, UploadIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import VtFilePicker from '@renderer/components/VtFilePicker.vue';
import WorkflowNextStepHint from '@renderer/features/shared/WorkflowNextStepHint.vue';
import { useAppStore } from '@renderer/stores/app';
import { readDocxText } from '@renderer/utils/docx-text';
import { SCRIPT_EXTRACT_STATUS, type ScriptExtractStatus } from '@shared/types/script-agent';
import type { ScriptAssetItem, ScriptItem } from '@shared/types/script';

interface DraftScript {
  tempId: string;
  name: string;
  content: string;
}

const DEFAULT_SCRIPT_REG = '/第\\s*([0-9０-９零一二三四五六七八九十百千万]+)\\s*集\\s*([^\\n\\r]*)/g';
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const POLL_INTERVAL = 3000;

const { t } = useI18n();
const appStore = useAppStore();
const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));

const loading = ref(false);
const refreshing = ref(false);
const scripts = ref<ScriptItem[]>([]);
const assets = ref<ScriptAssetItem[]>([]);
const scriptEpisodeLength = ref(5000);
const selectedScriptIds = ref<number[]>([]);
const filters = reactive({
  keyword: '',
});

const saveVisible = ref(false);
const saveMode = ref<'create' | 'edit'>('create');
const saveLoading = ref(false);
const editingScript = ref<ScriptItem | null>(null);
const saveForm = reactive({
  name: '',
  content: '',
  assetIds: [] as number[],
});

const batchVisible = ref(false);
const batchStep = ref<'input' | 'preview'>('input');
const batchSaving = ref(false);
const batchText = ref('');
const batchRegex = ref(DEFAULT_SCRIPT_REG);
const batchRegexError = ref('');
const draftScripts = ref<DraftScript[]>([]);
const selectedDraftIds = ref<string[]>([]);
const aiRegexLoading = ref(false);

const detailVisible = ref(false);
const detailTitle = ref('');
const detailContent = ref('');

let pollTimer: number | null = null;

const selectableScripts = computed(() => scripts.value.filter((script) => !isExtractLocked(script.extractStatus)));
const isCurrentPageAllSelected = computed(() => selectableScripts.value.length > 0 && selectableScripts.value.every((script) => selectedScriptIds.value.includes(script.id)));
const runningScriptIds = computed(() => scripts.value.filter((script) => script.extractStatus === SCRIPT_EXTRACT_STATUS.WAITING || script.extractStatus === SCRIPT_EXTRACT_STATUS.RUNNING).map((script) => script.id));
const scriptStatusSummary = computed(() => {
  const failed = scripts.value.filter((script) => script.extractStatus === SCRIPT_EXTRACT_STATUS.FAILED).length;
  const extracted = scripts.value.filter((script) => script.extractStatus === SCRIPT_EXTRACT_STATUS.SUCCEEDED).length;
  const idle = scripts.value.filter((script) => script.extractStatus === SCRIPT_EXTRACT_STATUS.IDLE).length;
  return {
    total: scripts.value.length,
    selected: selectedScriptIds.value.length,
    running: runningScriptIds.value.length,
    failed,
    extracted,
    idle,
  };
});
const selectedDraftScripts = computed(() => draftScripts.value.filter((script) => selectedDraftIds.value.includes(script.tempId)));
const selectedDraftChars = computed(() => selectedDraftScripts.value.reduce((sum, script) => sum + script.content.length, 0));
const saveContentOverLimit = computed(() => saveForm.content.length > scriptEpisodeLength.value);
const batchContentOverLimit = computed(() => selectedDraftScripts.value.some((script) => script.content.length > scriptEpisodeLength.value));
const assetOptions = computed(() => assets.value.map((asset) => ({ label: `${getAssetTypeLabel(asset.type)} / ${asset.name}`, value: asset.id })));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function isExtractLocked(status: ScriptExtractStatus): boolean {
  return status === SCRIPT_EXTRACT_STATUS.WAITING || status === SCRIPT_EXTRACT_STATUS.RUNNING;
}

function clearPollTimer(): void {
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePoll(): void {
  clearPollTimer();
  if (runningScriptIds.value.length === 0 || !currentProjectId.value) {
    return;
  }

  pollTimer = window.setTimeout(() => {
    void pollExtractStatus();
  }, POLL_INTERVAL);
}

function replaceScript(updated: ScriptItem): void {
  const index = scripts.value.findIndex((script) => script.id === updated.id);
  if (index >= 0) {
    scripts.value[index] = updated;
  }
}

async function pollExtractStatus(): Promise<void> {
  const ids = runningScriptIds.value;
  if (ids.length === 0 || !currentProjectId.value) {
    clearPollTimer();
    return;
  }

  const response = await window.vtStudio.script.pollExtractStatus({
    projectId: currentProjectId.value,
    scriptIds: ids,
  });
  if (isOk(response) && response.data.scripts.length > 0) {
    response.data.scripts.forEach(replaceScript);
    await loadScripts({ keepDataOnError: true, asRefresh: true });
  }

  schedulePoll();
}

async function loadScripts(options: { keepDataOnError?: boolean; asRefresh?: boolean } = {}): Promise<void> {
  if (!currentProjectId.value) {
    scripts.value = [];
    assets.value = [];
    selectedScriptIds.value = [];
    clearPollTimer();
    return;
  }

  if (options.asRefresh) {
    refreshing.value = true;
  } else {
    loading.value = true;
  }

  try {
    const response = await window.vtStudio.script.list({
      projectId: currentProjectId.value,
      keyword: filters.keyword || null,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      if (!options.keepDataOnError) {
        scripts.value = [];
        assets.value = [];
      }
      return;
    }

    scripts.value = response.data.scripts;
    assets.value = response.data.assets;
    scriptEpisodeLength.value = response.data.scriptEpisodeLength;
    selectedScriptIds.value = selectedScriptIds.value.filter((id) => scripts.value.some((script) => script.id === id));
    schedulePoll();
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function refreshScripts(): Promise<void> {
  await loadScripts({ keepDataOnError: true, asRefresh: true });
}

async function searchScripts(): Promise<void> {
  await loadScripts();
}

function previewText(value: string | null, limit = 100): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return t('script.emptyText');
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function openDetail(title: string, content: string | null): void {
  detailTitle.value = title;
  detailContent.value = content?.trim() || t('script.emptyText');
  detailVisible.value = true;
}

function toggleScriptSelection(script: ScriptItem): void {
  if (isExtractLocked(script.extractStatus)) {
    return;
  }

  selectedScriptIds.value = selectedScriptIds.value.includes(script.id)
    ? selectedScriptIds.value.filter((id) => id !== script.id)
    : [...selectedScriptIds.value, script.id];
}

function toggleCurrentPageSelection(): void {
  if (isCurrentPageAllSelected.value) {
    const currentIds = new Set(selectableScripts.value.map((script) => script.id));
    selectedScriptIds.value = selectedScriptIds.value.filter((id) => !currentIds.has(id));
    return;
  }

  selectedScriptIds.value = Array.from(new Set([...selectedScriptIds.value, ...selectableScripts.value.map((script) => script.id)]));
}

function clearScriptSelection(): void {
  selectedScriptIds.value = [];
}

function resetSaveForm(): void {
  editingScript.value = null;
  saveForm.name = '';
  saveForm.content = '';
  saveForm.assetIds = [];
}

function openCreateDialog(): void {
  resetSaveForm();
  saveMode.value = 'create';
  saveVisible.value = true;
}

function openEditDialog(script: ScriptItem): void {
  if (isExtractLocked(script.extractStatus)) {
    MessagePlugin.warning(t('script.locked'));
    return;
  }

  editingScript.value = script;
  saveMode.value = 'edit';
  saveForm.name = script.name;
  saveForm.content = script.content;
  saveForm.assetIds = script.relatedAssets.map((asset) => asset.id);
  saveVisible.value = true;
}

async function readScriptFile(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase();
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error(t('script.import.fileTooLarge'));
  }
  if (lowerName.endsWith('.doc')) {
    throw new Error(t('script.import.docUnsupported'));
  }
  if (lowerName.endsWith('.docx')) {
    return readDocxText(file, t('script.import.docxParseFailed'));
  }
  if (file.type !== 'text/plain' && !lowerName.endsWith('.txt')) {
    throw new Error(t('script.import.unsupportedFile'));
  }

  return file.text();
}

async function handleSaveFile(files: File[]): Promise<void> {
  const file = files[0];
  if (!file) {
    return;
  }

  try {
    saveForm.content = await readScriptFile(file);
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : t('script.import.unsupportedFile'));
  }
}

async function handleBatchFile(files: File[]): Promise<void> {
  const file = files[0];
  if (!file) {
    return;
  }

  try {
    batchText.value = await readScriptFile(file);
    parseBatchScripts();
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : t('script.import.unsupportedFile'));
  }
}

async function saveScript(): Promise<void> {
  if (!currentProjectId.value) {
    MessagePlugin.warning(t('script.noProject'));
    return;
  }
  if (!saveForm.name.trim() || !saveForm.content.trim()) {
    MessagePlugin.warning(t('script.form.required'));
    return;
  }
  if (saveContentOverLimit.value) {
    MessagePlugin.warning(t('script.form.overLimit'));
    return;
  }

  saveLoading.value = true;
  try {
    const response = await window.vtStudio.script.save({
      projectId: currentProjectId.value,
      script: {
        id: editingScript.value?.id ?? null,
        name: saveForm.name,
        content: saveForm.content,
        assetIds: saveForm.assetIds,
      },
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(saveMode.value === 'create' ? t('script.form.created') : t('script.form.saved'));
    saveVisible.value = false;
    await loadScripts({ keepDataOnError: true });
  } finally {
    saveLoading.value = false;
  }
}

function createScriptRegex(value: string): RegExp {
  const normalized = value.trim() || DEFAULT_SCRIPT_REG;
  const slashPattern = normalized.match(/^\/([\s\S]*)\/([a-z]*)$/i);
  if (slashPattern) {
    const [, pattern, flags] = slashPattern;
    return new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  }

  return new RegExp(normalized, 'g');
}

function parseBatchScripts(): void {
  batchRegexError.value = '';
  const content = batchText.value.replace(/\r\n/g, '\n').trim();
  if (!content) {
    draftScripts.value = [];
    selectedDraftIds.value = [];
    return;
  }

  try {
    const regex = createScriptRegex(batchRegex.value);
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      matches.push(match);
      if (match.index === regex.lastIndex) {
        regex.lastIndex += 1;
      }
    }

    const parsed = matches.map((item, index) => {
      const next = matches[index + 1];
      const start = item.index + item[0].length;
      const end = next ? next.index : content.length;
      const number = item[1]?.trim() || String(index + 1);
      const title = item[2]?.trim();
      const scriptContent = content.slice(start, end).trim();
      return {
        tempId: `script-${index + 1}-${item.index}`,
        name: title ? t('script.import.episodeNameWithTitle', { number, title }) : t('script.import.episodeName', { number }),
        content: scriptContent,
      };
    }).filter((script) => script.content);

    draftScripts.value = parsed.length > 0
      ? parsed
      : [
          {
            tempId: 'script-fulltext',
            name: t('script.import.fullTextScript'),
            content,
          },
        ];
    selectedDraftIds.value = draftScripts.value.map((script) => script.tempId);
  } catch (error) {
    draftScripts.value = [];
    selectedDraftIds.value = [];
    batchRegexError.value = error instanceof Error ? error.message : t('script.import.parseFailed');
  }
}

function openBatchDialog(): void {
  batchVisible.value = true;
  batchStep.value = 'input';
  batchText.value = '';
  batchRegex.value = DEFAULT_SCRIPT_REG;
  batchRegexError.value = '';
  draftScripts.value = [];
  selectedDraftIds.value = [];
}

function goBatchPreview(): void {
  parseBatchScripts();
  if (batchRegexError.value) {
    MessagePlugin.error(batchRegexError.value);
    return;
  }
  if (draftScripts.value.length === 0) {
    MessagePlugin.warning(t('script.import.emptyParsed'));
    return;
  }

  batchStep.value = 'preview';
}

function toggleDraftSelection(tempId: string): void {
  selectedDraftIds.value = selectedDraftIds.value.includes(tempId)
    ? selectedDraftIds.value.filter((id) => id !== tempId)
    : [...selectedDraftIds.value, tempId];
}

function toggleAllDrafts(): void {
  selectedDraftIds.value = selectedDraftIds.value.length === draftScripts.value.length ? [] : draftScripts.value.map((script) => script.tempId);
}

async function generateParseRegex(): Promise<void> {
  if (!currentProjectId.value) {
    MessagePlugin.warning(t('script.noProject'));
    return;
  }
  if (!batchText.value.trim()) {
    MessagePlugin.warning(t('script.import.emptyText'));
    return;
  }

  aiRegexLoading.value = true;
  try {
    const response = await window.vtStudio.script.generateParseRegex({
      projectId: currentProjectId.value,
      content: batchText.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    batchRegex.value = response.data.regex;
    parseBatchScripts();
    MessagePlugin.success(t('script.import.regexGenerated'));
  } finally {
    aiRegexLoading.value = false;
  }
}

async function saveBatchScripts(): Promise<void> {
  if (!currentProjectId.value) {
    MessagePlugin.warning(t('script.noProject'));
    return;
  }
  const selected = selectedDraftScripts.value;
  if (selected.length === 0) {
    MessagePlugin.warning(t('script.import.noSelection'));
    return;
  }
  if (batchContentOverLimit.value) {
    MessagePlugin.warning(t('script.form.overLimit'));
    return;
  }

  batchSaving.value = true;
  try {
    const response = await window.vtStudio.script.batchCreate({
      projectId: currentProjectId.value,
      scripts: selected.map(({ name, content }) => ({ name, content })),
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('script.import.saved', { count: response.data.scripts.length }));
    batchVisible.value = false;
    await loadScripts({ keepDataOnError: true });
  } finally {
    batchSaving.value = false;
  }
}

async function runDelete(scriptIds: number[]): Promise<void> {
  if (!currentProjectId.value || scriptIds.length === 0) {
    return;
  }

  const response = scriptIds.length === 1
    ? await window.vtStudio.script.delete({ projectId: currentProjectId.value, scriptId: scriptIds[0]! })
    : await window.vtStudio.script.batchDelete({ projectId: currentProjectId.value, scriptIds });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }

  MessagePlugin.success(t('script.delete.deleted'));
  selectedScriptIds.value = selectedScriptIds.value.filter((id) => !scriptIds.includes(id));
  await loadScripts({ keepDataOnError: true });
}

function confirmDeleteScript(script: ScriptItem): void {
  if (isExtractLocked(script.extractStatus)) {
    MessagePlugin.warning(t('script.locked'));
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('script.delete.singleTitle'),
    body: t('script.delete.singleBody', { title: script.name }),
    confirmBtn: t('script.delete.confirm'),
    cancelBtn: t('script.cancel'),
    theme: 'danger',
    async onConfirm() {
      await runDelete([script.id]);
      dialog.destroy();
    },
  });
}

function confirmBatchDelete(): void {
  if (selectedScriptIds.value.length === 0) {
    MessagePlugin.warning(t('script.delete.noSelection'));
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('script.delete.batchTitle'),
    body: t('script.delete.batchBody', { count: selectedScriptIds.value.length }),
    confirmBtn: t('script.delete.confirm'),
    cancelBtn: t('script.cancel'),
    theme: 'danger',
    async onConfirm() {
      await runDelete([...selectedScriptIds.value]);
      dialog.destroy();
    },
  });
}

async function exportZip(): Promise<void> {
  if (!currentProjectId.value) {
    MessagePlugin.warning(t('script.noProject'));
    return;
  }
  if (selectedScriptIds.value.length === 0) {
    MessagePlugin.warning(t('script.export.noSelection'));
    return;
  }

  const response = await window.vtStudio.script.exportZip({
    projectId: currentProjectId.value,
    scriptIds: [...selectedScriptIds.value],
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  if (response.data.canceled) {
    return;
  }

  MessagePlugin.success(t('script.export.done', { path: response.data.filePath }));
}

async function extractAssets(): Promise<void> {
  if (!currentProjectId.value) {
    MessagePlugin.warning(t('script.noProject'));
    return;
  }
  if (selectedScriptIds.value.length === 0) {
    MessagePlugin.warning(t('script.extract.noSelection'));
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('script.extract.title'),
    body: t('script.extract.body', { count: selectedScriptIds.value.length }),
    confirmBtn: t('script.extract.confirm'),
    cancelBtn: t('script.cancel'),
    theme: 'warning',
    async onConfirm() {
      const response = await window.vtStudio.script.extractAssets({
        projectId: currentProjectId.value,
        scriptIds: [...selectedScriptIds.value],
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }

      selectedScriptIds.value = [];
      MessagePlugin.success(t('script.extract.started'));
      dialog.destroy();
      await loadScripts({ keepDataOnError: true });
    },
  });
}

function getStatusLabel(status: ScriptExtractStatus): string {
  return t(`script.status.${status}`);
}

function getStatusTheme(status: ScriptExtractStatus): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === SCRIPT_EXTRACT_STATUS.WAITING) {
    return 'warning';
  }
  if (status === SCRIPT_EXTRACT_STATUS.RUNNING) {
    return 'primary';
  }
  if (status === SCRIPT_EXTRACT_STATUS.SUCCEEDED) {
    return 'success';
  }
  if (status === SCRIPT_EXTRACT_STATUS.FAILED) {
    return 'danger';
  }

  return 'default';
}

function getAssetTypeLabel(type: ScriptAssetItem['type']): string {
  return t(`script.assetType.${type}`);
}

watch(batchText, () => {
  if (batchVisible.value && batchStep.value === 'input') {
    parseBatchScripts();
  }
});

watch(batchRegex, () => {
  if (batchVisible.value && batchStep.value === 'input') {
    parseBatchScripts();
  }
});

onMounted(() => {
  void loadScripts();
});

onUnmounted(() => {
  clearPollTimer();
});
</script>

<template>
  <div class="script-page">
    <section class="script-page-head">
      <div>
        <p class="eyebrow">{{ t('common.project') }}</p>
        <h3>{{ t('script.title') }}</h3>
        <p>{{ t('script.summary') }}</p>
      </div>
      <div class="script-page-actions">
        <VtButton variant="outline" :loading="refreshing" @click="refreshScripts">
          <template #icon><RefreshIcon /></template>
          {{ t('script.refresh') }}
        </VtButton>
        <VtButton variant="outline" @click="openBatchDialog">
          <template #icon><UploadIcon /></template>
          {{ t('script.import.open') }}
        </VtButton>
        <VtButton theme="primary" variant="base" @click="openCreateDialog">
          <template #icon><AddIcon /></template>
          {{ t('script.form.create') }}
        </VtButton>
      </div>
    </section>

    <WorkflowNextStepHint hint-key="script" next-route-name="assets" />

    <section class="script-status-strip" :aria-label="t('script.statusSummary.label')">
      <div>
        <span>{{ t('script.statusSummary.total') }}</span>
        <strong>{{ scriptStatusSummary.total }}</strong>
      </div>
      <div>
        <span>{{ t('script.statusSummary.extracted') }}</span>
        <strong>{{ scriptStatusSummary.extracted }}</strong>
      </div>
      <div>
        <span>{{ t('script.statusSummary.running') }}</span>
        <strong>{{ scriptStatusSummary.running }}</strong>
      </div>
      <div :class="{ 'is-danger': scriptStatusSummary.failed > 0 }">
        <span>{{ t('script.statusSummary.failed') }}</span>
        <strong>{{ scriptStatusSummary.failed }}</strong>
      </div>
    </section>

    <section class="script-toolbar">
      <label>
        <span>{{ t('script.filters.name') }}</span>
        <t-input v-model="filters.keyword" :placeholder="t('script.filters.namePlaceholder')" clearable @enter="searchScripts" />
      </label>
      <div class="script-toolbar-actions">
        <VtButton variant="outline" @click="searchScripts">
          <template #icon><SearchIcon /></template>
          {{ t('script.search') }}
        </VtButton>
      </div>
    </section>

    <section class="script-batchbar">
      <div class="script-selection-copy">
        <strong>{{ t('script.selection.count', { count: selectedScriptIds.length }) }}</strong>
        <span>{{ t('script.selection.hint') }}</span>
      </div>
      <div class="script-toolbar-actions">
        <VtButton v-if="selectedScriptIds.length > 0" variant="text" @click="clearScriptSelection">
          {{ t('script.selection.clear') }}
        </VtButton>
        <VtButton variant="outline" :disabled="selectedScriptIds.length === 0" @click="exportZip">
          <template #icon><DownloadIcon /></template>
          {{ t('script.export.action') }}
        </VtButton>
        <VtButton variant="outline" :disabled="selectedScriptIds.length === 0" @click="confirmBatchDelete">
          <template #icon><DeleteIcon /></template>
          {{ t('script.delete.batch') }}
        </VtButton>
        <VtButton theme="primary" variant="base" :disabled="selectedScriptIds.length === 0" @click="extractAssets">
          <template #icon><PlayCircleIcon /></template>
          {{ t('script.extract.action') }}
        </VtButton>
      </div>
    </section>

    <section class="script-list-section">
      <div class="script-list-head">
        <div>
          <strong>{{ t('script.list.title') }}</strong>
          <p>{{ t('script.list.count', { count: scripts.length, selected: selectedScriptIds.length }) }}</p>
        </div>
        <t-tag v-if="runningScriptIds.length > 0" theme="primary" variant="light">{{ t('script.extract.runningCount', { count: runningScriptIds.length }) }}</t-tag>
      </div>

      <t-loading :loading="loading">
        <div class="script-list-toolbar-row">
          <label class="script-check-row">
            <t-checkbox :checked="isCurrentPageAllSelected" :disabled="selectableScripts.length === 0" @change="toggleCurrentPageSelection" />
            <span>{{ isCurrentPageAllSelected ? t('script.list.unselectAll') : t('script.list.selectAll') }}</span>
          </label>
        </div>

        <div class="script-result-grid">
          <article v-for="script in scripts" :key="script.id" class="script-result-card" @click="openEditDialog(script)">
            <div class="script-result-card-head">
              <label class="script-check-row" @click.stop>
                <t-checkbox :checked="selectedScriptIds.includes(script.id)" :disabled="isExtractLocked(script.extractStatus)" @change="toggleScriptSelection(script)" />
              </label>
              <button class="script-result-title" type="button" @click.stop="openEditDialog(script)">
                <span>{{ script.name }}</span>
              </button>
              <t-tag :theme="getStatusTheme(script.extractStatus)" variant="light">{{ getStatusLabel(script.extractStatus) }}</t-tag>
            </div>
            <button class="script-result-preview" type="button" @click.stop="openDetail(script.name, script.content)">
              {{ previewText(script.content, 180) }}
            </button>
            <div class="script-asset-tags">
              <t-tag v-for="asset in script.relatedAssets" :key="asset.id" size="small" variant="light">{{ getAssetTypeLabel(asset.type) }} / {{ asset.name }}</t-tag>
              <span v-if="script.relatedAssets.length === 0">{{ t('script.list.noAssets') }}</span>
            </div>
            <button v-if="script.extractStatus === SCRIPT_EXTRACT_STATUS.FAILED" class="script-error-link" type="button" @click.stop="openDetail(t('script.detail.errorTitle'), script.errorReason)">
              {{ previewText(script.errorReason, 100) }}
            </button>
            <div class="script-result-actions" @click.stop>
              <VtButton size="small" variant="outline" :disabled="isExtractLocked(script.extractStatus)" @click="openEditDialog(script)">
                <template #icon><EditIcon /></template>
                {{ t('script.form.edit') }}
              </VtButton>
              <VtButton size="small" variant="outline" :disabled="isExtractLocked(script.extractStatus)" @click="confirmDeleteScript(script)">
                <template #icon><DeleteIcon /></template>
                {{ t('script.delete.action') }}
              </VtButton>
            </div>
          </article>
        </div>
        <VtEmptyState v-if="!loading && scripts.length === 0" :description="currentProjectId ? t('script.empty') : t('script.noProject')">
          <template v-if="currentProjectId" #action>
            <VtButton theme="primary" variant="base" @click="openCreateDialog">{{ t('script.form.create') }}</VtButton>
          </template>
        </VtEmptyState>
      </t-loading>
    </section>

    <t-dialog :visible="saveVisible" :header="saveMode === 'create' ? t('script.form.createTitle') : t('script.form.editTitle')" width="880px" :confirm-btn="t('script.save')" :cancel-btn="t('script.cancel')" :confirm-loading="saveLoading" @update:visible="(value) => (saveVisible = value)" @confirm="saveScript">
      <div class="script-form">
        <label>
          <span>{{ t('script.form.name') }}</span>
          <t-input v-model="saveForm.name" :maxlength="80" :placeholder="t('script.form.namePlaceholder')" />
        </label>
        <div class="script-upload-panel">
          <div>
            <strong>{{ t('script.import.fileTitle') }}</strong>
            <p>{{ t('script.import.fileHint') }}</p>
          </div>
          <VtFilePicker
            accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            :label="t('script.import.pickFile')"
            @change="handleSaveFile"
          />
        </div>
        <label>
          <span>{{ t('script.form.content') }}</span>
          <t-textarea v-model="saveForm.content" :placeholder="t('script.form.contentPlaceholder')" :autosize="{ minRows: 12, maxRows: 18 }" />
        </label>
        <div class="script-form-meta" :class="{ 'is-danger': saveContentOverLimit }">
          {{ t('script.form.charCount', { count: saveForm.content.length, limit: scriptEpisodeLength }) }}
        </div>
        <label>
          <span>{{ t('script.form.assets') }}</span>
          <t-select v-model="saveForm.assetIds" multiple clearable :options="assetOptions" :placeholder="assets.length > 0 ? t('script.form.assetsPlaceholder') : t('script.form.noAssets')" />
        </label>
      </div>
    </t-dialog>

    <t-dialog :visible="batchVisible" :header="t('script.import.title')" width="940px" :footer="false" @update:visible="(value) => (batchVisible = value)">
      <div class="script-import-dialog">
        <div class="script-step-row">
          <t-tag :theme="batchStep === 'input' ? 'primary' : 'default'" variant="light">1. {{ t('script.import.stepInput') }}</t-tag>
          <t-tag :theme="batchStep === 'preview' ? 'primary' : 'default'" variant="light">2. {{ t('script.import.stepPreview') }}</t-tag>
        </div>

        <div v-if="batchStep === 'input'" class="script-import-input">
          <div class="script-upload-panel">
            <div>
              <strong>{{ t('script.import.fileTitle') }}</strong>
              <p>{{ t('script.import.fileHint') }}</p>
            </div>
            <VtFilePicker
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              :label="t('script.import.pickFile')"
              @change="handleBatchFile"
            />
          </div>
          <div class="script-regex-row">
            <t-input v-model="batchRegex" :placeholder="t('script.import.regexPlaceholder')" :status="batchRegexError ? 'error' : 'default'" />
            <VtButton variant="outline" :loading="aiRegexLoading" @click="generateParseRegex">{{ t('script.import.aiRegex') }}</VtButton>
          </div>
          <t-textarea v-model="batchText" :placeholder="t('script.import.placeholder')" :autosize="{ minRows: 12, maxRows: 18 }" />
          <div class="script-form-meta" :class="{ 'is-danger': Boolean(batchRegexError) }">
            <span>{{ t('script.import.charCount', { count: batchText.length }) }}</span>
            <span>{{ t('script.import.parsedCount', { count: draftScripts.length }) }}</span>
            <span v-if="batchRegexError">{{ batchRegexError }}</span>
          </div>
          <div class="script-dialog-footer">
            <VtButton variant="outline" @click="batchVisible = false">{{ t('script.cancel') }}</VtButton>
            <VtButton theme="primary" variant="base" :disabled="draftScripts.length === 0" @click="goBatchPreview">{{ t('script.import.next') }}</VtButton>
          </div>
        </div>

        <div v-else class="script-import-preview">
          <div class="script-import-preview-head">
            <div>
              <strong>{{ t('script.import.previewTitle') }}</strong>
              <p>{{ t('script.import.selectedInfo', { count: selectedDraftIds.length, chars: selectedDraftChars }) }}</p>
            </div>
            <VtButton variant="outline" @click="toggleAllDrafts">{{ selectedDraftIds.length === draftScripts.length ? t('script.import.unselectAll') : t('script.import.selectAll') }}</VtButton>
          </div>
          <div class="script-draft-list">
            <div v-for="script in draftScripts" :key="script.tempId" class="script-draft-item" :class="{ selected: selectedDraftIds.includes(script.tempId), over: script.content.length > scriptEpisodeLength }" role="button" tabindex="0" @click="toggleDraftSelection(script.tempId)" @keydown.enter.prevent="toggleDraftSelection(script.tempId)" @keydown.space.prevent="toggleDraftSelection(script.tempId)">
              <t-checkbox :checked="selectedDraftIds.includes(script.tempId)" @click.stop @change="toggleDraftSelection(script.tempId)" />
              <div>
                <strong>{{ script.name }}</strong>
                <span>{{ t('script.import.itemInfo', { chars: script.content.length }) }}</span>
                <p>{{ previewText(script.content, 140) }}</p>
              </div>
            </div>
          </div>
          <div class="script-dialog-footer">
            <VtButton variant="outline" @click="batchStep = 'input'">{{ t('script.import.back') }}</VtButton>
            <VtButton theme="primary" variant="base" :loading="batchSaving" :disabled="selectedDraftIds.length === 0 || batchContentOverLimit" @click="saveBatchScripts">{{ t('script.import.save') }}</VtButton>
          </div>
        </div>
      </div>
    </t-dialog>

    <VtDialog :visible="detailVisible" :title="detailTitle" width="780px" :footer="false" @update:visible="(value) => (detailVisible = value)">
      <pre class="script-detail-content">{{ detailContent }}</pre>
    </VtDialog>
  </div>
</template>
