<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CheckIcon, ImageIcon, PlayCircleIcon, RefreshIcon, SearchIcon, SoundIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import WorkflowNextStepHint from '@renderer/features/shared/WorkflowNextStepHint.vue';
import { useAppStore } from '@renderer/stores/app';
import { PROJECT_IMAGE_QUALITY_VALUES, type ProjectImageQuality } from '@shared/constants/dictionaries';
import { ASSET_TASK_STATUS, GENERATABLE_ASSET_TYPES, type AssetAudioSummary, type AssetItem, type GeneratableAssetType } from '@shared/types/assets';

const POLL_INTERVAL = 3000;

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));

const loading = ref(false);
const refreshing = ref(false);
const assets = ref<AssetItem[]>([]);
const audioAssets = ref<AssetAudioSummary[]>([]);
const selectedIds = ref<number[]>([]);
const selectedTypes = ref<GeneratableAssetType[]>([...GENERATABLE_ASSET_TYPES]);
const keyword = ref('');
const defaultImageModel = ref<string | null>(null);
const defaultResolution = ref<ProjectImageQuality>('1K');
const batchSize = ref(5);
const batchForm = reactive({
  model: '',
  resolution: '1K' as ProjectImageQuality,
  extraInstruction: '',
});

const drawerVisible = ref(false);
const currentAsset = ref<AssetItem | null>(null);
const editForm = reactive({
  prompt: '',
  model: '',
  resolution: '1K' as ProjectImageQuality,
  audioAssetId: null as number | null,
});
const detailVisible = ref(false);
const detailTitle = ref('');
const detailContent = ref('');

let promptPollTimer: number | null = null;
let imagePollTimer: number | null = null;
let audioPollTimer: number | null = null;

const filteredAssets = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  return assets.value.filter((asset) => !key || normalizeAssetText(asset.name).toLowerCase().includes(key) || normalizeAssetText(asset.description).toLowerCase().includes(key));
});
const allSelected = computed(() => filteredAssets.value.length > 0 && filteredAssets.value.every((asset) => selectedIds.value.includes(asset.id)));
const selectedAssets = computed(() => assets.value.filter((asset) => selectedIds.value.includes(asset.id)));
const runningPromptIds = computed(() => assets.value.filter((asset) => asset.promptStatus === ASSET_TASK_STATUS.RUNNING).map((asset) => asset.id));
const runningImageIds = computed(() => assets.value.filter((asset) => asset.imageStatus === ASSET_TASK_STATUS.RUNNING).map((asset) => asset.id));
const runningAudioIds = computed(() => assets.value.filter((asset) => asset.audioBindStatus === ASSET_TASK_STATUS.RUNNING).map((asset) => asset.id));
const audioOptions = computed(() => audioAssets.value.map((audio) => ({ label: `${audio.name}${audio.voiceGender ? ` / ${audio.voiceGender}` : ''}`, value: audio.id })));
const typeOptions = computed(() => GENERATABLE_ASSET_TYPES.map((type) => ({ label: t(`assets.type.${type}`), value: type })));
const imageQualityOptions = computed(() => PROJECT_IMAGE_QUALITY_VALUES.map((value) => ({ label: value, value })));
const hasActiveFilters = computed(() => keyword.value.trim().length > 0 || selectedTypes.value.length !== GENERATABLE_ASSET_TYPES.length);
const cornerStatusSummary = computed(() => ({
  total: filteredAssets.value.length,
  selected: selectedIds.value.length,
  promptReady: filteredAssets.value.filter(hasPrompt).length,
  imageReady: filteredAssets.value.filter((asset) => Boolean(asset.media)).length,
  audioReady: filteredAssets.value.filter((asset) => Boolean(asset.boundAudio)).length,
  running: filteredAssets.value.filter(isAssetRunning).length,
  failed: filteredAssets.value.filter(hasAssetFailed).length,
}));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function normalizeAssetText(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function hasPrompt(asset: AssetItem): boolean {
  return Boolean(normalizeAssetText(asset.prompt).trim());
}

function clearPollTimers(): void {
  [promptPollTimer, imagePollTimer, audioPollTimer].forEach((timer) => {
    if (timer) {
      window.clearTimeout(timer);
    }
  });
  promptPollTimer = null;
  imagePollTimer = null;
  audioPollTimer = null;
}

function schedulePoll(): void {
  clearPollTimers();
  if (!currentProjectId.value) {
    return;
  }
  if (runningPromptIds.value.length > 0) {
    promptPollTimer = window.setTimeout(() => void pollPromptStatus(), POLL_INTERVAL);
  }
  if (runningImageIds.value.length > 0) {
    imagePollTimer = window.setTimeout(() => void pollImageStatus(), POLL_INTERVAL);
  }
  if (runningAudioIds.value.length > 0) {
    audioPollTimer = window.setTimeout(() => void pollAudioStatus(), POLL_INTERVAL);
  }
}

async function pollPromptStatus(): Promise<void> {
  if (!currentProjectId.value || runningPromptIds.value.length === 0) {
    return;
  }
  const response = await window.vtStudio.assets.pollPromptStatus({ projectId: currentProjectId.value, assetIds: [...runningPromptIds.value] });
  if (isOk(response) && response.data.assets.length > 0) {
    await loadCornerAssets({ keepDataOnError: true, asRefresh: true });
  } else {
    schedulePoll();
  }
}

async function pollImageStatus(): Promise<void> {
  if (!currentProjectId.value || runningImageIds.value.length === 0) {
    return;
  }
  const response = await window.vtStudio.assets.pollImageStatus({ projectId: currentProjectId.value, assetIds: [...runningImageIds.value] });
  if (isOk(response) && response.data.assets.length > 0) {
    await loadCornerAssets({ keepDataOnError: true, asRefresh: true });
  } else {
    schedulePoll();
  }
}

async function pollAudioStatus(): Promise<void> {
  if (!currentProjectId.value || runningAudioIds.value.length === 0) {
    return;
  }
  const response = await window.vtStudio.cornerScape.pollAudioBindStatus({ projectId: currentProjectId.value, assetIds: [...runningAudioIds.value] });
  if (isOk(response) && response.data.assets.length > 0) {
    await loadCornerAssets({ keepDataOnError: true, asRefresh: true });
  } else {
    schedulePoll();
  }
}

async function loadCornerAssets(options: { keepDataOnError?: boolean; asRefresh?: boolean } = {}): Promise<void> {
  if (!currentProjectId.value) {
    assets.value = [];
    audioAssets.value = [];
    selectedIds.value = [];
    clearPollTimers();
    return;
  }

  if (options.asRefresh) {
    refreshing.value = true;
  } else {
    loading.value = true;
  }
  try {
    const response = await window.vtStudio.cornerScape.list({
      projectId: currentProjectId.value,
      types: [...selectedTypes.value],
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      if (!options.keepDataOnError) {
        assets.value = [];
        audioAssets.value = [];
      }
      return;
    }
    assets.value = response.data.assets;
    audioAssets.value = response.data.audioAssets;
    defaultImageModel.value = response.data.imageModelId;
    defaultResolution.value = response.data.imageQuality;
    batchSize.value = response.data.assetsBatchGenerateSize;
    batchForm.model = batchForm.model || response.data.imageModelId || '';
    batchForm.resolution = response.data.imageQuality;
    selectedIds.value = selectedIds.value.filter((id) => assets.value.some((asset) => asset.id === id));
    if (currentAsset.value) {
      const fresh = assets.value.find((asset) => asset.id === currentAsset.value?.id);
      if (fresh) {
        currentAsset.value = fresh;
        editForm.audioAssetId = fresh.boundAudio?.id ?? null;
      }
    }
    schedulePoll();
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function toggleSelection(asset: AssetItem): void {
  selectedIds.value = selectedIds.value.includes(asset.id) ? selectedIds.value.filter((id) => id !== asset.id) : [...selectedIds.value, asset.id];
}

function toggleAll(): void {
  selectedIds.value = allSelected.value ? selectedIds.value.filter((id) => !filteredAssets.value.some((asset) => asset.id === id)) : Array.from(new Set([...selectedIds.value, ...filteredAssets.value.map((asset) => asset.id)]));
}

function selectPromptEmpty(): void {
  selectedIds.value = assets.value.filter((asset) => !hasPrompt(asset)).map((asset) => asset.id);
}

function selectImageEmpty(): void {
  selectedIds.value = assets.value.filter((asset) => !asset.media).map((asset) => asset.id);
}

function selectFailed(): void {
  selectedIds.value = assets.value.filter((asset) => asset.promptStatus === ASSET_TASK_STATUS.FAILED || asset.imageStatus === ASSET_TASK_STATUS.FAILED || asset.audioBindStatus === ASSET_TASK_STATUS.FAILED).map((asset) => asset.id);
}

function resetCornerFilters(): void {
  keyword.value = '';
  selectedTypes.value = [...GENERATABLE_ASSET_TYPES];
}

function goProjects(): void {
  void router.push({ name: 'projects' });
}

function goAssets(): void {
  void router.push({ name: 'assets' });
}

function goProduction(): void {
  void router.push({ name: 'production' });
}

async function batchGeneratePrompts(): Promise<void> {
  if (!currentProjectId.value || selectedIds.value.length === 0) {
    MessagePlugin.warning(t('cornerScape.noSelection'));
    return;
  }
  const response = await window.vtStudio.assets.batchGeneratePrompts({
    projectId: currentProjectId.value,
    assetIds: [...selectedIds.value],
    extraInstruction: batchForm.extraInstruction || null,
    concurrentCount: batchSize.value,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('cornerScape.promptStarted'));
  selectedIds.value = [];
  await loadCornerAssets({ keepDataOnError: true });
}

async function batchGenerateImages(): Promise<void> {
  if (!currentProjectId.value || selectedIds.value.length === 0) {
    MessagePlugin.warning(t('cornerScape.noSelection'));
    return;
  }
  if (!batchForm.model.trim()) {
    MessagePlugin.warning(t('cornerScape.modelRequired'));
    return;
  }
  if (selectedAssets.value.some((asset) => !hasPrompt(asset))) {
    MessagePlugin.warning(t('cornerScape.promptRequired'));
    return;
  }
  const response = await window.vtStudio.assets.batchGenerateImages({
    projectId: currentProjectId.value,
    assetIds: [...selectedIds.value],
    model: batchForm.model,
    resolution: batchForm.resolution,
    concurrentCount: batchSize.value,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('cornerScape.imageStarted'));
  selectedIds.value = [];
  await loadCornerAssets({ keepDataOnError: true });
}

async function batchBindAudio(): Promise<void> {
  if (!currentProjectId.value || selectedIds.value.length === 0) {
    MessagePlugin.warning(t('cornerScape.noSelection'));
    return;
  }
  const response = await window.vtStudio.cornerScape.batchBindAudio({
    projectId: currentProjectId.value,
    assetIds: [...selectedIds.value],
    concurrentCount: batchSize.value,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('cornerScape.audioStarted'));
  selectedIds.value = [];
  await loadCornerAssets({ keepDataOnError: true });
}

function openDrawer(asset: AssetItem): void {
  currentAsset.value = asset;
  editForm.prompt = normalizeAssetText(asset.prompt);
  editForm.model = batchForm.model || defaultImageModel.value || '';
  editForm.resolution = asset.media?.resolution ?? defaultResolution.value;
  editForm.audioAssetId = asset.boundAudio?.id ?? null;
  drawerVisible.value = true;
}

async function savePrompt(): Promise<void> {
  if (!currentProjectId.value || !currentAsset.value) {
    return;
  }
  const response = await window.vtStudio.assets.save({
    projectId: currentProjectId.value,
    asset: {
      id: currentAsset.value.id,
      type: currentAsset.value.type,
      name: currentAsset.value.name,
      description: currentAsset.value.description,
      remark: currentAsset.value.remark,
      prompt: editForm.prompt,
    },
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('cornerScape.promptSaved'));
  await loadCornerAssets({ keepDataOnError: true });
}

async function polishPrompt(): Promise<void> {
  if (!currentProjectId.value || !currentAsset.value) {
    return;
  }
  const response = await window.vtStudio.assets.generatePrompt({
    projectId: currentProjectId.value,
    assetId: currentAsset.value.id,
    extraInstruction: batchForm.extraInstruction || null,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('cornerScape.promptStarted'));
  drawerVisible.value = false;
  await loadCornerAssets({ keepDataOnError: true });
}

async function generateImage(): Promise<void> {
  if (!currentProjectId.value || !currentAsset.value) {
    return;
  }
  if (!editForm.model.trim()) {
    MessagePlugin.warning(t('cornerScape.modelRequired'));
    return;
  }
  if (!editForm.prompt.trim()) {
    MessagePlugin.warning(t('cornerScape.promptRequired'));
    return;
  }
  const response = await window.vtStudio.assets.generateImage({
    projectId: currentProjectId.value,
    assetId: currentAsset.value.id,
    model: editForm.model,
    resolution: editForm.resolution,
    prompt: editForm.prompt,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('cornerScape.imageStarted'));
  drawerVisible.value = false;
  await loadCornerAssets({ keepDataOnError: true });
}

async function updateAudioBinding(value: number | null): Promise<void> {
  if (!currentProjectId.value || !currentAsset.value) {
    return;
  }
  const response = await window.vtStudio.cornerScape.updateAudioBinding({
    projectId: currentProjectId.value,
    assetId: currentAsset.value.id,
    audioAssetId: value,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('cornerScape.audioSaved'));
  await loadCornerAssets({ keepDataOnError: true });
}

async function selectHistory(mediaId: number): Promise<void> {
  if (!currentProjectId.value || !currentAsset.value) {
    return;
  }
  const response = await window.vtStudio.assets.selectMedia({
    projectId: currentProjectId.value,
    assetId: currentAsset.value.id,
    mediaId,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('cornerScape.imageSelected'));
  await loadCornerAssets({ keepDataOnError: true });
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
  MessagePlugin.success(t('cornerScape.cancelled'));
  await loadCornerAssets({ keepDataOnError: true });
}

function previewText(value: string | null, limit = 110): string {
  const text = value?.trim() ?? '';
  if (!text) {
    return t('assets.emptyText');
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function isAssetRunning(asset: AssetItem): boolean {
  return asset.promptStatus === ASSET_TASK_STATUS.RUNNING || asset.imageStatus === ASSET_TASK_STATUS.RUNNING || asset.audioBindStatus === ASSET_TASK_STATUS.RUNNING;
}

function hasAssetFailed(asset: AssetItem): boolean {
  return asset.promptStatus === ASSET_TASK_STATUS.FAILED || asset.imageStatus === ASSET_TASK_STATUS.FAILED || asset.audioBindStatus === ASSET_TASK_STATUS.FAILED;
}

function getAssetErrorReason(asset: AssetItem): string | null {
  return asset.promptErrorReason || asset.imageErrorReason || asset.audioBindErrorReason || null;
}

function openDetail(title: string, content: string | null): void {
  detailTitle.value = title;
  detailContent.value = content?.trim() || t('assets.emptyText');
  detailVisible.value = true;
}

function getStatusTheme(asset: AssetItem): 'primary' | 'success' | 'danger' | 'default' {
  if (isAssetRunning(asset)) {
    return 'primary';
  }
  if (hasAssetFailed(asset)) {
    return 'danger';
  }
  if (asset.media) {
    return 'success';
  }
  return 'default';
}

watch(selectedTypes, () => {
  void loadCornerAssets();
});

watch(currentProjectId, () => {
  selectedIds.value = [];
  void loadCornerAssets();
});

onMounted(() => {
  void loadCornerAssets();
});

onUnmounted(() => {
  clearPollTimers();
});
</script>

<template>
  <div class="corner-page">
    <section class="corner-head">
      <div>
        <p class="eyebrow">{{ t('common.project') }}</p>
        <h3>{{ t('cornerScape.title') }}</h3>
        <p>{{ t('cornerScape.summary') }}</p>
      </div>
      <VtButton variant="outline" :loading="refreshing" @click="loadCornerAssets({ keepDataOnError: true, asRefresh: true })">
        <template #icon><RefreshIcon /></template>
        {{ t('cornerScape.refresh') }}
      </VtButton>
    </section>

    <WorkflowNextStepHint hint-key="cornerScape" next-route-name="production" />

    <section class="corner-status-strip" :aria-label="t('cornerScape.statusSummary.label')">
      <div>
        <span>{{ t('cornerScape.statusSummary.total') }}</span>
        <strong>{{ cornerStatusSummary.total }}</strong>
      </div>
      <div>
        <span>{{ t('cornerScape.statusSummary.promptReady') }}</span>
        <strong>{{ cornerStatusSummary.promptReady }}</strong>
      </div>
      <div>
        <span>{{ t('cornerScape.statusSummary.imageReady') }}</span>
        <strong>{{ cornerStatusSummary.imageReady }}</strong>
      </div>
      <div>
        <span>{{ t('cornerScape.statusSummary.audioReady') }}</span>
        <strong>{{ cornerStatusSummary.audioReady }}</strong>
      </div>
      <div :class="{ 'is-danger': cornerStatusSummary.failed > 0 }">
        <span>{{ t('cornerScape.statusSummary.failed') }}</span>
        <strong>{{ cornerStatusSummary.failed }}</strong>
      </div>
    </section>

    <section class="corner-layout">
      <aside class="corner-side">
        <div class="corner-side-block">
          <strong>{{ t('cornerScape.batch.title') }}</strong>
          <p>{{ t('cornerScape.batch.count', { count: filteredAssets.length, selected: selectedIds.length }) }}</p>
          <p>{{ t('cornerScape.selection.hint', { count: selectedIds.length }) }}</p>
        </div>
        <label>
          <span>{{ t('cornerScape.batch.types') }}</span>
          <t-checkbox-group v-model="selectedTypes" :options="typeOptions" />
        </label>
        <label>
          <span>{{ t('cornerScape.batch.model') }}</span>
          <t-input v-model="batchForm.model" :placeholder="defaultImageModel || t('cornerScape.batch.modelPlaceholder')" />
        </label>
        <label>
          <span>{{ t('cornerScape.batch.resolution') }}</span>
          <t-select v-model="batchForm.resolution" :options="imageQualityOptions" />
        </label>
        <label>
          <span>{{ t('cornerScape.batch.extra') }}</span>
          <t-textarea v-model="batchForm.extraInstruction" :autosize="{ minRows: 4, maxRows: 7 }" :placeholder="t('cornerScape.batch.extraPlaceholder')" />
        </label>
        <div class="corner-quick-grid">
          <VtButton variant="outline" size="small" @click="toggleAll">{{ allSelected ? t('cornerScape.unselectAll') : t('cornerScape.selectAll') }}</VtButton>
          <VtButton variant="outline" size="small" @click="selectPromptEmpty">{{ t('cornerScape.selectPromptEmpty') }}</VtButton>
          <VtButton variant="outline" size="small" @click="selectImageEmpty">{{ t('cornerScape.selectImageEmpty') }}</VtButton>
          <VtButton variant="outline" size="small" @click="selectFailed">{{ t('cornerScape.selectFailed') }}</VtButton>
        </div>
        <div class="corner-action-stack">
          <VtButton theme="primary" variant="base" :disabled="selectedIds.length === 0" @click="batchGeneratePrompts">
            <template #icon><PlayCircleIcon /></template>
            {{ t('cornerScape.batch.prompt') }}
          </VtButton>
          <VtButton theme="primary" variant="outline" :disabled="selectedIds.length === 0" @click="batchGenerateImages">
            <template #icon><ImageIcon /></template>
            {{ t('cornerScape.batch.image') }}
          </VtButton>
          <VtButton theme="primary" variant="outline" :disabled="selectedIds.length === 0" @click="batchBindAudio">
            <template #icon><SoundIcon /></template>
            {{ t('cornerScape.batch.audio') }}
          </VtButton>
        </div>
      </aside>

      <main class="corner-main">
        <div class="corner-toolbar">
          <t-input v-model="keyword" :placeholder="t('cornerScape.searchPlaceholder')" clearable>
            <template #prefix-icon><SearchIcon /></template>
          </t-input>
        </div>
        <t-loading :loading="loading">
          <div class="corner-grid">
            <article v-for="asset in filteredAssets" :key="asset.id" class="corner-card" @click="openDrawer(asset)">
              <div class="corner-card-media">
                <img v-if="asset.media?.thumbnailUrl || asset.media?.url" :src="asset.media.thumbnailUrl || asset.media.url || ''" :alt="asset.name" />
                <span v-else>{{ t('cornerScape.waitingImage') }}</span>
                <button v-if="asset.imageStatus === ASSET_TASK_STATUS.RUNNING && asset.mediaId" type="button" @click.stop="cancelImage(asset)">{{ t('cornerScape.cancel') }}</button>
              </div>
              <div class="corner-card-body">
                <div class="corner-card-title">
                  <label class="script-check-row" @click.stop>
                    <t-checkbox :checked="selectedIds.includes(asset.id)" @change="toggleSelection(asset)" />
                  </label>
                  <strong>{{ asset.name }}</strong>
                  <t-tag :theme="getStatusTheme(asset)" size="small" variant="light">{{ t(`assets.type.${asset.type}`) }}</t-tag>
                </div>
                <p>{{ previewText(asset.description) }}</p>
                <div class="corner-tags">
                  <t-tag :theme="asset.prompt ? 'success' : 'default'" size="small" variant="light">{{ asset.prompt ? t('cornerScape.hasPrompt') : t('cornerScape.noPrompt') }}</t-tag>
                  <t-tag :theme="asset.media ? 'success' : asset.imageStatus === ASSET_TASK_STATUS.FAILED ? 'danger' : 'default'" size="small" variant="light">{{ asset.media ? t('cornerScape.hasImage') : asset.imageStatus === ASSET_TASK_STATUS.FAILED ? t('cornerScape.imageFailed') : t('cornerScape.noImage') }}</t-tag>
                  <t-tag :theme="asset.boundAudio ? 'success' : 'default'" size="small" variant="light">{{ asset.boundAudio?.name || t('cornerScape.noAudio') }}</t-tag>
                  <t-tag v-if="isAssetRunning(asset)" theme="primary" size="small" variant="light">{{ t('cornerScape.running') }}</t-tag>
                </div>
                <button v-if="hasAssetFailed(asset)" class="corner-error-link" type="button" @click.stop="openDetail(t('cornerScape.detail.errorTitle'), getAssetErrorReason(asset))">
                  {{ previewText(getAssetErrorReason(asset), 96) }}
                </button>
              </div>
            </article>
          </div>
          <VtEmptyState v-if="!loading && filteredAssets.length === 0" :description="currentProjectId ? t('cornerScape.empty') : t('cornerScape.noProject')">
            <template #action>
              <div class="flex flex-wrap justify-center gap-2">
                <VtButton v-if="!currentProjectId" theme="primary" variant="base" @click="goProjects">{{ t('cornerScape.emptyActionProjects') }}</VtButton>
                <template v-else-if="hasActiveFilters">
                  <VtButton theme="primary" variant="base" @click="resetCornerFilters">{{ t('cornerScape.emptyActionReset') }}</VtButton>
                  <VtButton variant="outline" @click="goAssets">{{ t('cornerScape.emptyActionAssets') }}</VtButton>
                </template>
                <template v-else>
                  <VtButton theme="primary" variant="base" @click="goAssets">{{ t('cornerScape.emptyActionAssets') }}</VtButton>
                  <VtButton variant="outline" @click="goProduction">{{ t('cornerScape.emptyActionProduction') }}</VtButton>
                </template>
              </div>
            </template>
          </VtEmptyState>
        </t-loading>
      </main>
    </section>

    <t-drawer v-model:visible="drawerVisible" :header="currentAsset?.name || t('cornerScape.drawer.title')" size="560px">
      <div v-if="currentAsset" class="corner-drawer">
        <div class="corner-drawer-preview">
          <img v-if="currentAsset.media?.url" :src="currentAsset.media.url" :alt="currentAsset.name" />
          <span v-else>{{ t('cornerScape.waitingImage') }}</span>
        </div>
        <label>
          <span>{{ t('cornerScape.drawer.prompt') }}</span>
          <t-textarea v-model="editForm.prompt" :autosize="{ minRows: 8, maxRows: 12 }" @blur="savePrompt" />
        </label>
        <label>
          <span>{{ t('cornerScape.drawer.audio') }}</span>
          <t-select v-model="editForm.audioAssetId" clearable :options="audioOptions" :placeholder="audioOptions.length ? t('cornerScape.drawer.audioPlaceholder') : t('cornerScape.drawer.noAudio')" @change="(value) => updateAudioBinding((value as number | undefined) ?? null)" />
        </label>
        <div class="corner-drawer-row">
          <label>
            <span>{{ t('cornerScape.drawer.model') }}</span>
            <t-input v-model="editForm.model" />
          </label>
          <label>
            <span>{{ t('cornerScape.drawer.resolution') }}</span>
            <t-select v-model="editForm.resolution" :options="imageQualityOptions" />
          </label>
        </div>
        <div class="corner-drawer-actions">
          <VtButton variant="outline" @click="polishPrompt">{{ t('cornerScape.drawer.polish') }}</VtButton>
          <VtButton theme="primary" variant="base" @click="generateImage">{{ t('cornerScape.drawer.generate') }}</VtButton>
        </div>
        <div class="corner-history">
          <strong>{{ t('cornerScape.drawer.history') }}</strong>
          <div class="corner-history-grid">
            <button v-for="media in currentAsset.mediaHistory" :key="media.id" type="button" :class="{ selected: media.id === currentAsset.mediaId }" @click="selectHistory(media.id)">
              <img v-if="media.thumbnailUrl || media.url" :src="media.thumbnailUrl || media.url || ''" :alt="currentAsset.name" />
              <span v-else>{{ t(`assets.status.${media.status}`) }}</span>
              <CheckIcon v-if="media.id === currentAsset.mediaId" />
            </button>
          </div>
        </div>
      </div>
    </t-drawer>

    <VtDialog :visible="detailVisible" :title="detailTitle" width="760px" :footer="false" @update:visible="(value) => (detailVisible = value)">
      <pre class="asset-detail-content">{{ detailContent }}</pre>
    </VtDialog>
  </div>
</template>
