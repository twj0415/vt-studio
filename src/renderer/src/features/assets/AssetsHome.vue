<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AddIcon, DeleteIcon, EditIcon, FileIcon, ImageIcon, PlayCircleIcon, RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import VtFilePicker from '@renderer/components/VtFilePicker.vue';
import WorkflowNextStepHint from '@renderer/features/shared/WorkflowNextStepHint.vue';
import { useAppStore } from '@renderer/stores/app';
import { DEPENDENCY_STATUSES, type DependencyStatus } from '@shared/constants/dictionaries';
import { ASSET_TASK_STATUS, ASSET_TYPES, GENERATABLE_ASSET_TYPES, type AssetItem, type AssetType, type GeneratableAssetType } from '@shared/types/assets';

type TabType = AssetType;

const POLL_INTERVAL = 3000;
const ACCEPT_MEDIA = 'image/*,video/*,audio/*';
const ACCEPT_AUDIO = 'audio/*';

const { t } = useI18n();
const appStore = useAppStore();
const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));

const activeType = ref<TabType>(ASSET_TYPES.ROLE);
const loading = ref(false);
const refreshing = ref(false);
const assets = ref<AssetItem[]>([]);
const selectedIds = ref<number[]>([]);
const total = ref(0);
const page = ref(1);
const limit = ref(24);
const keyword = ref('');

const formVisible = ref(false);
const formLoading = ref(false);
const editingAsset = ref<AssetItem | null>(null);
const form = reactive({
  name: '',
  description: '',
  remark: '',
  prompt: '',
  voiceGender: '',
});

const imageVisible = ref(false);
const imageLoading = ref(false);
const imageAsset = ref<AssetItem | null>(null);
const imageForm = reactive({
  model: '',
  resolution: '1K' as '1K' | '2K' | '4K',
  prompt: '',
  referenceImageDataUrl: '',
});

const batchImageVisible = ref(false);
const batchImageLoading = ref(false);
const batchImageForm = reactive({
  model: '',
  resolution: '1K' as '1K' | '2K' | '4K',
});

const detailVisible = ref(false);
const detailTitle = ref('');
const detailContent = ref('');

let promptPollTimer: number | null = null;
let imagePollTimer: number | null = null;

const tabs = computed(() => [
  { value: ASSET_TYPES.ROLE, label: t('assets.type.role') },
  { value: ASSET_TYPES.SCENE, label: t('assets.type.scene') },
  { value: ASSET_TYPES.TOOL, label: t('assets.type.tool') },
  { value: ASSET_TYPES.CLIP, label: t('assets.type.clip') },
  { value: ASSET_TYPES.AUDIO, label: t('assets.type.audio') },
]);
const isGeneratableTab = computed(() => GENERATABLE_ASSET_TYPES.includes(activeType.value as GeneratableAssetType));
const selectableAssets = computed(() => assets.value.filter((asset) => !isRunning(asset)));
const allSelected = computed(() => selectableAssets.value.length > 0 && selectableAssets.value.every((asset) => selectedIds.value.includes(asset.id)));
const runningPromptIds = computed(() => flattenAssets(assets.value).filter((asset) => asset.promptStatus === ASSET_TASK_STATUS.RUNNING).map((asset) => asset.id));
const runningImageIds = computed(() => flattenAssets(assets.value).filter((asset) => asset.imageStatus === ASSET_TASK_STATUS.RUNNING).map((asset) => asset.id));
const selectedAssets = computed(() => flattenAssets(assets.value).filter((asset) => selectedIds.value.includes(asset.id)));
const assetStatusSummary = computed(() => {
  const items = flattenAssets(assets.value);
  return {
    total: total.value || assets.value.length,
    selected: selectedIds.value.length,
    ready: items.filter((asset) => Boolean(asset.media)).length,
    running: items.filter(isRunning).length,
    failed: items.filter((asset) => asset.promptStatus === ASSET_TASK_STATUS.FAILED || asset.imageStatus === ASSET_TASK_STATUS.FAILED || asset.audioBindStatus === ASSET_TASK_STATUS.FAILED).length,
    dependencyIssues: items.filter((asset) => isDependencyInvalid(asset.dependencyStatus)).length,
    promptMissing: items.filter((asset) => isGeneratableAsset(asset) && !asset.prompt.trim()).length,
  };
});

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function flattenAssets(items: AssetItem[]): AssetItem[] {
  return items.flatMap((asset) => [asset, ...asset.children]);
}

function isRunning(asset: AssetItem): boolean {
  return asset.promptStatus === ASSET_TASK_STATUS.RUNNING || asset.imageStatus === ASSET_TASK_STATUS.RUNNING || asset.audioBindStatus === ASSET_TASK_STATUS.RUNNING;
}

function isGeneratableAsset(asset: AssetItem): boolean {
  return GENERATABLE_ASSET_TYPES.includes(asset.type as GeneratableAssetType);
}

function clearPromptPoll(): void {
  if (promptPollTimer) {
    window.clearTimeout(promptPollTimer);
    promptPollTimer = null;
  }
}

function clearImagePoll(): void {
  if (imagePollTimer) {
    window.clearTimeout(imagePollTimer);
    imagePollTimer = null;
  }
}

function schedulePoll(): void {
  clearPromptPoll();
  clearImagePoll();
  if (!currentProjectId.value) {
    return;
  }
  if (runningPromptIds.value.length > 0) {
    promptPollTimer = window.setTimeout(() => void pollPromptStatus(), POLL_INTERVAL);
  }
  if (runningImageIds.value.length > 0) {
    imagePollTimer = window.setTimeout(() => void pollImageStatus(), POLL_INTERVAL);
  }
}

async function pollPromptStatus(): Promise<void> {
  if (!currentProjectId.value || runningPromptIds.value.length === 0) {
    clearPromptPoll();
    return;
  }
  const response = await window.vtStudio.assets.pollPromptStatus({ projectId: currentProjectId.value, assetIds: [...runningPromptIds.value] });
  if (isOk(response) && response.data.assets.length > 0) {
    await loadAssets({ keepDataOnError: true, asRefresh: true });
  } else {
    schedulePoll();
  }
}

async function pollImageStatus(): Promise<void> {
  if (!currentProjectId.value || runningImageIds.value.length === 0) {
    clearImagePoll();
    return;
  }
  const response = await window.vtStudio.assets.pollImageStatus({ projectId: currentProjectId.value, assetIds: [...runningImageIds.value] });
  if (isOk(response) && response.data.assets.length > 0) {
    await loadAssets({ keepDataOnError: true, asRefresh: true });
  } else {
    schedulePoll();
  }
}

async function loadAssets(options: { keepDataOnError?: boolean; asRefresh?: boolean } = {}): Promise<void> {
  if (!currentProjectId.value) {
    assets.value = [];
    selectedIds.value = [];
    total.value = 0;
    clearPromptPoll();
    clearImagePoll();
    return;
  }

  if (options.asRefresh) {
    refreshing.value = true;
  } else {
    loading.value = true;
  }
  try {
    const response = await window.vtStudio.assets.list({
      projectId: currentProjectId.value,
      type: activeType.value,
      keyword: keyword.value || null,
      page: page.value,
      limit: limit.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      if (!options.keepDataOnError) {
        assets.value = [];
        total.value = 0;
      }
      return;
    }
    assets.value = response.data.data;
    total.value = response.data.total;
    selectedIds.value = selectedIds.value.filter((id) => flattenAssets(assets.value).some((asset) => asset.id === id));
    schedulePoll();
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function refreshAssets(): Promise<void> {
  await loadAssets({ keepDataOnError: true, asRefresh: true });
}

function resetForm(): void {
  editingAsset.value = null;
  form.name = '';
  form.description = '';
  form.remark = '';
  form.prompt = '';
  form.voiceGender = '';
}

function openCreateForm(): void {
  resetForm();
  formVisible.value = true;
}

function openEditForm(asset: AssetItem): void {
  if (isRunning(asset)) {
    MessagePlugin.warning(t('assets.runningLocked'));
    return;
  }
  editingAsset.value = asset;
  form.name = asset.name;
  form.description = asset.description;
  form.remark = asset.remark;
  form.prompt = asset.prompt;
  form.voiceGender = asset.voiceGender ?? '';
  formVisible.value = true;
}

async function saveForm(): Promise<void> {
  if (!currentProjectId.value) {
    MessagePlugin.warning(t('assets.noProject'));
    return;
  }
  if (!form.name.trim()) {
    MessagePlugin.warning(t('assets.form.required'));
    return;
  }
  formLoading.value = true;
  try {
    const response = await window.vtStudio.assets.save({
      projectId: currentProjectId.value,
      asset: {
        id: editingAsset.value?.id ?? null,
        parentId: editingAsset.value?.parentId ?? null,
        type: editingAsset.value?.type ?? activeType.value,
        name: form.name,
        description: form.description,
        remark: form.remark,
        prompt: form.prompt,
        voiceGender: form.voiceGender,
      },
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(editingAsset.value ? t('assets.form.saved') : t('assets.form.created'));
    formVisible.value = false;
    await loadAssets({ keepDataOnError: true });
  } finally {
    formLoading.value = false;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(t('assets.upload.readFailed')));
    reader.readAsDataURL(file);
  });
}

async function handleUpload(files: File[]): Promise<void> {
  const file = files[0];
  if (!file || !currentProjectId.value) {
    return;
  }
  try {
    const response = await window.vtStudio.assets.uploadMedia({
      projectId: currentProjectId.value,
      type: activeType.value === ASSET_TYPES.AUDIO ? 'audio' : 'clip',
      fileName: file.name,
      dataUrl: await readFileAsDataUrl(file),
      name: file.name,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('assets.upload.done'));
    await loadAssets({ keepDataOnError: true });
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : t('assets.upload.failed'));
  }
}

function toggleSelection(asset: AssetItem): void {
  if (isRunning(asset)) {
    return;
  }
  selectedIds.value = selectedIds.value.includes(asset.id) ? selectedIds.value.filter((id) => id !== asset.id) : [...selectedIds.value, asset.id];
}

function toggleAll(): void {
  if (allSelected.value) {
    const currentIds = new Set(selectableAssets.value.map((asset) => asset.id));
    selectedIds.value = selectedIds.value.filter((id) => !currentIds.has(id));
    return;
  }
  selectedIds.value = Array.from(new Set([...selectedIds.value, ...selectableAssets.value.map((asset) => asset.id)]));
}

async function runDelete(assetIds: number[]): Promise<void> {
  if (!currentProjectId.value || assetIds.length === 0) {
    return;
  }
  const response = assetIds.length === 1
    ? await window.vtStudio.assets.delete({ projectId: currentProjectId.value, assetId: assetIds[0]! })
    : await window.vtStudio.assets.batchDelete({ projectId: currentProjectId.value, assetIds });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('assets.delete.done'));
  selectedIds.value = selectedIds.value.filter((id) => !assetIds.includes(id));
  await loadAssets({ keepDataOnError: true });
}

function confirmDelete(asset: AssetItem): void {
  if (isRunning(asset)) {
    MessagePlugin.warning(t('assets.runningLocked'));
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('assets.delete.title'),
    body: t('assets.delete.body', { name: asset.name }),
    confirmBtn: t('assets.delete.confirm'),
    cancelBtn: t('assets.cancel'),
    theme: 'danger',
    async onConfirm() {
      await runDelete([asset.id]);
      dialog.destroy();
    },
  });
}

function confirmBatchDelete(): void {
  if (selectedIds.value.length === 0) {
    MessagePlugin.warning(t('assets.delete.noSelection'));
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('assets.delete.batchTitle'),
    body: t('assets.delete.batchBody', { count: selectedIds.value.length }),
    confirmBtn: t('assets.delete.confirm'),
    cancelBtn: t('assets.cancel'),
    theme: 'danger',
    async onConfirm() {
      await runDelete([...selectedIds.value]);
      dialog.destroy();
    },
  });
}

async function batchGeneratePrompts(): Promise<void> {
  if (!currentProjectId.value || selectedIds.value.length === 0) {
    MessagePlugin.warning(t('assets.generate.noSelection'));
    return;
  }
  const validIds = selectedAssets.value.filter(isGeneratableAsset).map((asset) => asset.id);
  if (validIds.length === 0) {
    MessagePlugin.warning(t('assets.generate.noGeneratable'));
    return;
  }
  const response = await window.vtStudio.assets.batchGeneratePrompts({ projectId: currentProjectId.value, assetIds: validIds });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('assets.generate.promptStarted'));
  selectedIds.value = [];
  await loadAssets({ keepDataOnError: true });
}

function openBatchImageDialog(): void {
  if (selectedIds.value.length === 0) {
    MessagePlugin.warning(t('assets.generate.noSelection'));
    return;
  }
  batchImageVisible.value = true;
}

async function batchGenerateImages(): Promise<void> {
  if (!currentProjectId.value) {
    return;
  }
  const validAssets = selectedAssets.value.filter(isGeneratableAsset);
  if (validAssets.length === 0) {
    MessagePlugin.warning(t('assets.generate.noGeneratable'));
    return;
  }
  if (!batchImageForm.model.trim()) {
    MessagePlugin.warning(t('assets.generate.modelRequired'));
    return;
  }
  const noPrompt = validAssets.filter((asset) => !asset.prompt.trim());
  if (noPrompt.length > 0) {
    MessagePlugin.warning(t('assets.generate.promptRequired'));
    return;
  }
  batchImageLoading.value = true;
  try {
    const response = await window.vtStudio.assets.batchGenerateImages({
      projectId: currentProjectId.value,
      assetIds: validAssets.map((asset) => asset.id),
      model: batchImageForm.model,
      resolution: batchImageForm.resolution,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('assets.generate.imageStarted'));
    selectedIds.value = [];
    batchImageVisible.value = false;
    await loadAssets({ keepDataOnError: true });
  } finally {
    batchImageLoading.value = false;
  }
}

function openImageDialog(asset: AssetItem): void {
  if (!isGeneratableAsset(asset)) {
    return;
  }
  imageAsset.value = asset;
  imageForm.prompt = asset.prompt;
  imageForm.model = '';
  imageForm.resolution = '1K';
  imageForm.referenceImageDataUrl = '';
  imageVisible.value = true;
}

async function handleReferenceImage(files: File[]): Promise<void> {
  const file = files[0];
  if (!file) {
    return;
  }
  imageForm.referenceImageDataUrl = await readFileAsDataUrl(file);
}

async function generateSinglePrompt(asset: AssetItem): Promise<void> {
  if (!currentProjectId.value) {
    return;
  }
  const response = await window.vtStudio.assets.generatePrompt({ projectId: currentProjectId.value, assetId: asset.id });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('assets.generate.promptStarted'));
  await loadAssets({ keepDataOnError: true });
}

async function generateSingleImage(): Promise<void> {
  if (!currentProjectId.value || !imageAsset.value) {
    return;
  }
  if (!imageForm.model.trim()) {
    MessagePlugin.warning(t('assets.generate.modelRequired'));
    return;
  }
  if (!imageForm.prompt.trim()) {
    MessagePlugin.warning(t('assets.generate.promptRequired'));
    return;
  }
  imageLoading.value = true;
  try {
    const response = await window.vtStudio.assets.generateImage({
      projectId: currentProjectId.value,
      assetId: imageAsset.value.id,
      model: imageForm.model,
      resolution: imageForm.resolution,
      prompt: imageForm.prompt,
      referenceImageDataUrl: imageForm.referenceImageDataUrl || null,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('assets.generate.imageStarted'));
    imageVisible.value = false;
    await loadAssets({ keepDataOnError: true });
  } finally {
    imageLoading.value = false;
  }
}

async function selectMedia(asset: AssetItem, mediaId: number): Promise<void> {
  if (!currentProjectId.value) {
    return;
  }
  const response = await window.vtStudio.assets.selectMedia({ projectId: currentProjectId.value, assetId: asset.id, mediaId });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('assets.generate.selected'));
  await loadAssets({ keepDataOnError: true });
}

async function deleteMedia(mediaId: number): Promise<void> {
  if (!currentProjectId.value) {
    return;
  }
  const response = await window.vtStudio.assets.deleteMedia({ projectId: currentProjectId.value, mediaId });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('assets.generate.mediaDeleted'));
  await loadAssets({ keepDataOnError: true });
}

async function cancelImage(asset: AssetItem): Promise<void> {
  if (!currentProjectId.value || !asset.mediaId) {
    return;
  }
  const response = await window.vtStudio.assets.cancelImage({ projectId: currentProjectId.value, mediaId: asset.mediaId });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('assets.generate.cancelled'));
  await loadAssets({ keepDataOnError: true });
}

function openDetail(title: string, content: string | null): void {
  detailTitle.value = title;
  detailContent.value = content?.trim() || t('assets.emptyText');
  detailVisible.value = true;
}

function getGenerationRecord(metadata: Record<string, unknown> | null | undefined): unknown {
  return metadata?.generationSnapshot ?? null;
}

function hasGenerationRecord(metadata: Record<string, unknown> | null | undefined): boolean {
  const record = getGenerationRecord(metadata);
  return Boolean(record && typeof record === 'object' && Object.keys(record).length > 0);
}

function openGenerationRecord(title: string, metadata: Record<string, unknown> | null | undefined): void {
  const record = getGenerationRecord(metadata);
  detailTitle.value = title;
  detailContent.value = record ? JSON.stringify(record, null, 2) : t('assets.generationRecord.empty');
  detailVisible.value = true;
}

function previewText(value: string | null, limit = 90): string {
  const text = value?.trim() ?? '';
  if (!text) {
    return t('assets.emptyText');
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function getStatusTheme(status: AssetItem['imageStatus']): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === ASSET_TASK_STATUS.RUNNING) {
    return 'primary';
  }
  if (status === ASSET_TASK_STATUS.SUCCEEDED) {
    return 'success';
  }
  if (status === ASSET_TASK_STATUS.FAILED || status === ASSET_TASK_STATUS.CANCELLED) {
    return 'danger';
  }
  return 'default';
}

function isDependencyInvalid(status: DependencyStatus): boolean {
  return status !== DEPENDENCY_STATUSES.VALID;
}

function getDependencyTheme(status: DependencyStatus): 'success' | 'warning' | 'danger' | 'default' {
  if (status === DEPENDENCY_STATUSES.VALID) {
    return 'success';
  }
  if (status === DEPENDENCY_STATUSES.MISSING_DEPENDENCY || status === DEPENDENCY_STATUSES.BLOCKED) {
    return 'danger';
  }
  if (status === DEPENDENCY_STATUSES.STALE || status === DEPENDENCY_STATUSES.NEEDS_REVIEW) {
    return 'warning';
  }
  return 'default';
}

function getMediaIconText(asset: AssetItem): string {
  return asset.media?.kind === 'audio' ? 'A' : asset.media?.kind === 'video' ? 'V' : 'I';
}

watch(activeType, () => {
  page.value = 1;
  selectedIds.value = [];
  void loadAssets();
});

watch(currentProjectId, () => {
  page.value = 1;
  selectedIds.value = [];
  void loadAssets();
});

onMounted(() => {
  void loadAssets();
});

onUnmounted(() => {
  clearPromptPoll();
  clearImagePoll();
});
</script>

<template>
  <div class="assets-page">
    <section class="assets-page-head">
      <div>
        <p class="eyebrow">{{ t('common.project') }}</p>
        <h3>{{ t('assets.title') }}</h3>
        <p>{{ t('assets.summary') }}</p>
      </div>
      <div class="assets-actions">
        <VtButton variant="outline" :loading="refreshing" @click="refreshAssets">
          <template #icon><RefreshIcon /></template>
          {{ t('assets.refresh') }}
        </VtButton>
        <VtFilePicker
          v-if="activeType === ASSET_TYPES.CLIP || activeType === ASSET_TYPES.AUDIO"
          theme="primary"
          :accept="activeType === ASSET_TYPES.AUDIO ? ACCEPT_AUDIO : ACCEPT_MEDIA"
          :label="t('assets.upload.action')"
          @change="handleUpload"
        />
        <VtButton v-else theme="primary" variant="base" @click="openCreateForm">
          <template #icon><AddIcon /></template>
          {{ t('assets.form.create') }}
        </VtButton>
      </div>
    </section>

    <WorkflowNextStepHint hint-key="assets" next-route-name="corner-scape" />

    <section class="assets-status-strip" :aria-label="t('assets.statusSummary.label')">
      <div>
        <span>{{ t('assets.statusSummary.total') }}</span>
        <strong>{{ assetStatusSummary.total }}</strong>
      </div>
      <div>
        <span>{{ t('assets.statusSummary.ready') }}</span>
        <strong>{{ assetStatusSummary.ready }}</strong>
      </div>
      <div>
        <span>{{ t('assets.statusSummary.running') }}</span>
        <strong>{{ assetStatusSummary.running }}</strong>
      </div>
      <div :class="{ 'is-danger': assetStatusSummary.failed > 0 }">
        <span>{{ t('assets.statusSummary.failed') }}</span>
        <strong>{{ assetStatusSummary.failed }}</strong>
      </div>
      <div :class="{ 'is-warning': assetStatusSummary.dependencyIssues > 0 }">
        <span>{{ t('assets.statusSummary.dependencyIssues') }}</span>
        <strong>{{ assetStatusSummary.dependencyIssues }}</strong>
      </div>
    </section>

    <section class="assets-toolbar">
      <t-tabs v-model="activeType" theme="card">
        <t-tab-panel v-for="tab in tabs" :key="tab.value" :value="tab.value" :label="tab.label" />
      </t-tabs>
      <div class="assets-search-row">
        <t-input v-model="keyword" :placeholder="t('assets.searchPlaceholder')" clearable @enter="loadAssets()" />
        <VtButton variant="outline" @click="loadAssets()">
          <template #icon><SearchIcon /></template>
          {{ t('assets.search') }}
        </VtButton>
      </div>
    </section>

    <section class="assets-batchbar">
      <label class="script-check-row">
        <t-checkbox :checked="allSelected" :disabled="selectableAssets.length === 0" @change="toggleAll" />
        <span>{{ allSelected ? t('assets.unselectAll') : t('assets.selectAll') }}</span>
      </label>
      <div class="assets-selection-copy">
        <strong>{{ t('assets.selection.count', { count: selectedIds.length }) }}</strong>
        <span>{{ t('assets.selection.hint') }}</span>
      </div>
      <VtButton v-if="isGeneratableTab" variant="outline" :disabled="selectedIds.length === 0" @click="batchGeneratePrompts">
        <template #icon><PlayCircleIcon /></template>
        {{ t('assets.generate.batchPrompt') }}
      </VtButton>
      <VtButton v-if="isGeneratableTab" variant="outline" :disabled="selectedIds.length === 0" @click="openBatchImageDialog">
        <template #icon><ImageIcon /></template>
        {{ t('assets.generate.batchImage') }}
      </VtButton>
      <VtButton variant="outline" :disabled="selectedIds.length === 0" @click="confirmBatchDelete">
        <template #icon><DeleteIcon /></template>
        {{ t('assets.delete.batch') }}
      </VtButton>
    </section>

    <t-loading :loading="loading">
      <section class="assets-grid">
        <article v-for="asset in assets" :key="asset.id" class="asset-card">
          <div class="asset-card-media">
            <img v-if="asset.media?.thumbnailUrl || asset.media?.url" :src="asset.media.thumbnailUrl || asset.media.url || ''" :alt="asset.name" />
            <div v-else class="asset-media-empty">{{ getMediaIconText(asset) }}</div>
            <t-tag class="asset-status-tag" :theme="getStatusTheme(asset.imageStatus)" variant="light">{{ t(`assets.status.${asset.imageStatus}`) }}</t-tag>
          </div>
          <div class="asset-card-body">
            <div class="asset-card-title">
              <label class="script-check-row">
                <t-checkbox :checked="selectedIds.includes(asset.id)" :disabled="isRunning(asset)" @change="toggleSelection(asset)" />
              </label>
              <strong>{{ asset.name }}</strong>
            </div>
            <p>{{ previewText(asset.description, 120) }}</p>
            <div class="asset-tags">
              <t-tag size="small" variant="light">{{ t(`assets.type.${asset.type}`) }}</t-tag>
              <t-tooltip
                v-if="isDependencyInvalid(asset.dependencyStatus)"
                :content="asset.dependencyReason || t(`assets.dependencyStatus.${asset.dependencyStatus}`)"
              >
                <t-tag
                size="small"
                :theme="getDependencyTheme(asset.dependencyStatus)"
                variant="light">
                  {{ t(`assets.dependencyStatus.${asset.dependencyStatus}`) }}
                </t-tag>
              </t-tooltip>
              <t-tag v-if="asset.promptStatus === ASSET_TASK_STATUS.RUNNING" size="small" theme="primary" variant="light">{{ t('assets.generate.promptRunning') }}</t-tag>
              <t-tag v-if="asset.boundAudio" size="small" theme="success" variant="light">{{ asset.boundAudio.name }}</t-tag>
            </div>
          </div>
          <div class="asset-card-actions">
            <VtButton size="small" variant="outline" @click="openEditForm(asset)">
              <template #icon><EditIcon /></template>
              {{ t('assets.form.edit') }}
            </VtButton>
            <VtButton v-if="isGeneratableAsset(asset)" size="small" variant="outline" @click="generateSinglePrompt(asset)">{{ t('assets.generate.prompt') }}</VtButton>
            <VtButton v-if="isGeneratableAsset(asset)" size="small" variant="outline" @click="openImageDialog(asset)">{{ t('assets.generate.image') }}</VtButton>
            <VtButton v-if="asset.imageStatus === ASSET_TASK_STATUS.RUNNING && asset.mediaId" size="small" variant="outline" @click="cancelImage(asset)">{{ t('assets.generate.cancel') }}</VtButton>
            <VtButton size="small" variant="outline" @click="confirmDelete(asset)">
              <template #icon><DeleteIcon /></template>
              {{ t('assets.delete.action') }}
            </VtButton>
          </div>
          <div v-if="asset.prompt || asset.promptErrorReason || asset.imageErrorReason || asset.dependencyReason || hasGenerationRecord(asset.media?.metadata)" class="asset-card-foot">
            <button v-if="asset.prompt" type="button" @click="openDetail(t('assets.promptTitle'), asset.prompt)">{{ previewText(asset.prompt, 96) }}</button>
            <button v-if="asset.promptErrorReason || asset.imageErrorReason" class="is-error" type="button" @click="openDetail(t('assets.errorTitle'), asset.promptErrorReason || asset.imageErrorReason)">{{ previewText(asset.promptErrorReason || asset.imageErrorReason, 96) }}</button>
            <button v-if="asset.dependencyReason" class="is-error" type="button" @click="openDetail(t('assets.dependencyReasonTitle'), asset.dependencyReason)">{{ previewText(asset.dependencyReason, 96) }}</button>
            <button v-if="hasGenerationRecord(asset.media?.metadata)" type="button" @click="openGenerationRecord(t('assets.generationRecord.title'), asset.media?.metadata)">
              <FileIcon />
              {{ t('assets.generationRecord.action') }}
            </button>
          </div>
        </article>
      </section>
      <VtEmptyState v-if="!loading && assets.length === 0" :description="currentProjectId ? t('assets.empty') : t('assets.noProject')">
        <template v-if="currentProjectId" #action>
          <VtButton theme="primary" variant="base" @click="openCreateForm">{{ activeType === ASSET_TYPES.CLIP || activeType === ASSET_TYPES.AUDIO ? t('assets.upload.action') : t('assets.form.create') }}</VtButton>
          </template>
        </VtEmptyState>
    </t-loading>

    <t-dialog :visible="formVisible" :header="editingAsset ? t('assets.form.editTitle') : t('assets.form.createTitle')" width="720px" :confirm-btn="t('assets.save')" :cancel-btn="t('assets.cancel')" :confirm-loading="formLoading" @update:visible="(value) => (formVisible = value)" @confirm="saveForm">
      <div class="asset-form">
        <label>
          <span>{{ t('assets.form.name') }}</span>
          <t-input v-model="form.name" :placeholder="t('assets.form.namePlaceholder')" />
        </label>
        <label v-if="activeType === ASSET_TYPES.AUDIO || editingAsset?.type === ASSET_TYPES.AUDIO">
          <span>{{ t('assets.form.voiceGender') }}</span>
          <t-input v-model="form.voiceGender" :placeholder="t('assets.form.voiceGenderPlaceholder')" />
        </label>
        <label>
          <span>{{ t('assets.form.description') }}</span>
          <t-textarea v-model="form.description" :placeholder="t('assets.form.descriptionPlaceholder')" :autosize="{ minRows: 4, maxRows: 8 }" />
        </label>
        <label>
          <span>{{ t('assets.form.remark') }}</span>
          <t-input v-model="form.remark" :placeholder="t('assets.form.remarkPlaceholder')" />
        </label>
        <label v-if="isGeneratableTab || editingAsset?.type === ASSET_TYPES.ROLE || editingAsset?.type === ASSET_TYPES.SCENE || editingAsset?.type === ASSET_TYPES.TOOL">
          <span>{{ t('assets.form.prompt') }}</span>
          <t-textarea v-model="form.prompt" :placeholder="t('assets.form.promptPlaceholder')" :autosize="{ minRows: 5, maxRows: 10 }" />
        </label>
      </div>
    </t-dialog>

    <t-dialog :visible="imageVisible" :header="t('assets.generate.imageTitle')" width="980px" :confirm-btn="t('assets.generate.startImage')" :cancel-btn="t('assets.cancel')" :confirm-loading="imageLoading" @update:visible="(value) => (imageVisible = value)" @confirm="generateSingleImage">
      <div class="asset-image-dialog">
        <div class="asset-form">
          <label>
            <span>{{ t('assets.generate.model') }}</span>
            <t-input v-model="imageForm.model" :placeholder="t('assets.generate.modelPlaceholder')" />
          </label>
          <label>
            <span>{{ t('assets.generate.resolution') }}</span>
            <t-select v-model="imageForm.resolution" :options="['1K', '2K', '4K'].map((value) => ({ label: value, value }))" />
          </label>
          <label>
            <span>{{ t('assets.form.prompt') }}</span>
            <t-textarea v-model="imageForm.prompt" :autosize="{ minRows: 8, maxRows: 12 }" />
          </label>
          <VtFilePicker
            accept="image/*"
            :label="imageForm.referenceImageDataUrl ? t('assets.generate.referenceReady') : t('assets.generate.reference')"
            @change="handleReferenceImage"
          />
        </div>
        <div class="asset-history">
          <strong>{{ t('assets.generate.history') }}</strong>
          <div class="asset-history-grid">
            <button v-for="media in imageAsset?.mediaHistory ?? []" :key="media.id" type="button" :class="{ selected: media.id === imageAsset?.mediaId }" @click="imageAsset && selectMedia(imageAsset, media.id)">
              <img v-if="media.thumbnailUrl || media.url" :src="media.thumbnailUrl || media.url || ''" :alt="imageAsset?.name || ''" />
              <span v-else>{{ t(`assets.status.${media.status}`) }}</span>
              <small>{{ t(`assets.status.${media.status}`) }}</small>
            </button>
          </div>
          <VtButton v-if="hasGenerationRecord(imageAsset?.media?.metadata)" variant="outline" size="small" @click="openGenerationRecord(t('assets.generationRecord.title'), imageAsset?.media?.metadata)">
            <template #icon><FileIcon /></template>
            {{ t('assets.generationRecord.action') }}
          </VtButton>
          <VtButton v-if="imageAsset?.mediaHistory.length" variant="outline" size="small" @click="deleteMedia(imageAsset!.mediaHistory[0]!.id)">{{ t('assets.generate.deleteLatest') }}</VtButton>
        </div>
      </div>
    </t-dialog>

    <t-dialog :visible="batchImageVisible" :header="t('assets.generate.batchImageTitle')" width="520px" :confirm-btn="t('assets.generate.startImage')" :cancel-btn="t('assets.cancel')" :confirm-loading="batchImageLoading" @update:visible="(value) => (batchImageVisible = value)" @confirm="batchGenerateImages">
      <div class="asset-form">
        <label>
          <span>{{ t('assets.generate.model') }}</span>
          <t-input v-model="batchImageForm.model" :placeholder="t('assets.generate.modelPlaceholder')" />
        </label>
        <label>
          <span>{{ t('assets.generate.resolution') }}</span>
          <t-select v-model="batchImageForm.resolution" :options="['1K', '2K', '4K'].map((value) => ({ label: value, value }))" />
        </label>
      </div>
    </t-dialog>

    <VtDialog :visible="detailVisible" :title="detailTitle" width="760px" :footer="false" @update:visible="(value) => (detailVisible = value)">
      <pre class="asset-detail-content">{{ detailContent }}</pre>
    </VtDialog>
  </div>
</template>
