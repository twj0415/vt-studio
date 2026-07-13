<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { CheckIcon, ErrorCircleIcon, FileExportIcon, FolderOpenIcon, RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import WorkflowNextStepHint from '@renderer/features/shared/WorkflowNextStepHint.vue';
import { useVtRequest } from '@renderer/composables/useVtRequest';
import { useAppStore } from '@renderer/stores/app';
import type { ExportCreateJianyingDraftResult, ExportHistoryDetail, ExportHistoryItem, ExportTimeline, ExportValidateAssetsResult, ExportValidationFailure } from '@shared/types/export';
import type { ProductionContentItem } from '@shared/types/production';

type StepState = 'done' | 'active' | 'blocked' | 'pending';

interface ExportStep {
  key: 'select' | 'timeline' | 'validate' | 'export' | 'result';
  state: StepState;
}

const { t, locale } = useI18n();
const router = useRouter();
const appStore = useAppStore();

const contentLoading = ref(false);
const timelineLoading = ref(false);
const validationLoading = ref(false);
const exportLoading = ref(false);
const openDirectoryLoading = ref(false);
const historyLoading = ref(false);
const historyDetailLoading = ref(false);
const contents = ref<ProductionContentItem[]>([]);
const selectedContentId = ref<number | null>(null);
const timeline = ref<ExportTimeline | null>(null);
const validation = ref<ExportValidateAssetsResult | null>(null);
const exportResult = ref<ExportCreateJianyingDraftResult | null>(null);
const histories = ref<ExportHistoryItem[]>([]);
const historyTotal = ref(0);
const activeHistory = ref<ExportHistoryDetail | null>(null);
const historyDetailVisible = ref(false);
const draftName = ref('');
const copyAssets = ref(true);

const contentRequest = useVtRequest({ loading: contentLoading });
const timelineRequest = useVtRequest({ loading: timelineLoading });
const validationRequest = useVtRequest({ loading: validationLoading });
const exportRequest = useVtRequest({ loading: exportLoading });
const openDirectoryRequest = useVtRequest({ loading: openDirectoryLoading });
const historyRequest = useVtRequest({ loading: historyLoading });
const historyDetailRequest = useVtRequest({ loading: historyDetailLoading });

const currentProject = computed(() => appStore.currentProject);
const currentProjectId = computed(() => Number(currentProject.value?.id ?? 0));
const selectedContent = computed(() => contents.value.find((content) => content.id === selectedContentId.value) ?? null);
const contentOptions = computed(() => contents.value.map((content) => ({
  label: content.title,
  value: content.id,
  content: t('exportCenter.scriptOptionMeta', { id: content.id }),
})));
const latestFailures = computed(() => {
  if (exportResult.value?.failures.length) {
    return exportResult.value.failures;
  }

  return validation.value?.failures ?? [];
});
const resultPath = computed(() => exportResult.value?.draftPath ?? null);
const resultTaskId = computed(() => exportResult.value?.taskId ?? null);
const hasTimeline = computed(() => Boolean(timeline.value));
const hasValidValidation = computed(() => Boolean(validation.value?.valid));
const canLoadExportData = computed(() => currentProjectId.value > 0 && Boolean(selectedContentId.value));
const canExport = computed(() => canLoadExportData.value && hasValidValidation.value && !exportLoading.value);
const validationState = computed<StepState>(() => {
  if (!selectedContentId.value) {
    return 'blocked';
  }
  if (!validation.value) {
    return hasTimeline.value ? 'active' : 'pending';
  }

  return validation.value.valid ? 'done' : 'blocked';
});
const exportSteps = computed<ExportStep[]>(() => [
  { key: 'select', state: selectedContentId.value ? 'done' : 'active' },
  { key: 'timeline', state: hasTimeline.value ? 'done' : selectedContentId.value ? 'active' : 'blocked' },
  { key: 'validate', state: validationState.value },
  { key: 'export', state: exportResult.value?.succeeded ? 'done' : hasValidValidation.value ? 'active' : 'blocked' },
  { key: 'result', state: exportResult.value ? (exportResult.value.succeeded ? 'done' : 'blocked') : 'pending' },
]);

function resetExportData(): void {
  timeline.value = null;
  validation.value = null;
  exportResult.value = null;
  draftName.value = selectedContent.value ? selectedContent.value.title : '';
  copyAssets.value = true;
}

function formatSeconds(durationMs: number): string {
  return (Math.max(0, durationMs) / 1000).toFixed(1);
}

function formatDateTime(timestamp: number): string {
  if (!timestamp) {
    return t('exportCenter.emptyValue');
  }

  const localeName = String(locale.value).startsWith('en') ? 'en-US' : 'zh-CN';
  return new Intl.DateTimeFormat(localeName, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function normalizeExportDetailValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeExportDetailValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalizedKey = key.toLowerCase();
    const nextKey = normalizedKey.includes('script') && normalizedKey.includes('id')
      ? 'contentId'
      : normalizedKey.includes('script') && normalizedKey.includes('name')
        ? 'contentName'
        : key;
    return [nextKey, normalizeExportDetailValue(item)];
  }));
}

function formatJson(value: unknown): string {
  return JSON.stringify(normalizeExportDetailValue(value), null, 2);
}

function failureTrackLabel(failure: ExportValidationFailure): string {
  return failure.trackId ? String(failure.trackId) : t('exportCenter.emptyValue');
}

function failureReasonLabel(reason: ExportValidationFailure['reason']): string {
  return t(`exportCenter.failureReason.${reason}`);
}

function stepTheme(state: StepState): 'success' | 'primary' | 'warning' | 'danger' | 'default' {
  if (state === 'done') {
    return 'success';
  }
  if (state === 'active') {
    return 'primary';
  }
  if (state === 'blocked') {
    return 'danger';
  }
  return 'default';
}

function historyStatusTheme(status: ExportHistoryItem['status']): 'success' | 'primary' | 'warning' | 'danger' | 'default' {
  if (status === 'succeeded') {
    return 'success';
  }
  if (status === 'failed') {
    return 'danger';
  }
  if (status === 'running' || status === 'validating') {
    return 'primary';
  }
  return 'default';
}

function historyStatusLabel(status: ExportHistoryItem['status']): string {
  return t(`exportCenter.historyStatus.${status}`);
}

async function loadContents(): Promise<void> {
  if (!currentProjectId.value) {
    contents.value = [];
    selectedContentId.value = null;
    histories.value = [];
    historyTotal.value = 0;
    resetExportData();
    return;
  }

  const data = await contentRequest.run(() => window.vtStudio.production.content.list({
    projectId: currentProjectId.value,
  }));
  if (!data) {
    contents.value = [];
    selectedContentId.value = null;
    resetExportData();
    return;
  }

  contents.value = data.contents;
  if (!contents.value.some((content) => content.id === selectedContentId.value)) {
    selectedContentId.value = data.currentContentId ?? contents.value[0]?.id ?? null;
  }
  resetExportData();
  await loadHistory();
}

async function loadHistory(): Promise<void> {
  if (!currentProjectId.value) {
    histories.value = [];
    historyTotal.value = 0;
    activeHistory.value = null;
    return;
  }

  const data = await historyRequest.run(() => window.vtStudio.export.listHistory({
    projectId: currentProjectId.value,
    contentId: selectedContentId.value,
    limit: 20,
  }));
  if (!data) {
    histories.value = [];
    historyTotal.value = 0;
    return;
  }

  histories.value = data.histories;
  historyTotal.value = data.total;
}

async function buildTimeline(): Promise<void> {
  if (!canLoadExportData.value || !selectedContentId.value) {
    MessagePlugin.warning(t('exportCenter.noScriptSelected'));
    return;
  }

  const data = await timelineRequest.run(() => window.vtStudio.export.buildTimeline({
    projectId: currentProjectId.value,
    contentId: selectedContentId.value!,
  }));
  if (!data) {
    timeline.value = null;
    validation.value = null;
    return;
  }

  timeline.value = data.timeline;
  validation.value = null;
  exportResult.value = null;
  MessagePlugin.success(t('exportCenter.timelineBuilt'));
}

async function validateAssets(): Promise<void> {
  if (!canLoadExportData.value || !selectedContentId.value) {
    MessagePlugin.warning(t('exportCenter.noScriptSelected'));
    return;
  }

  const data = await validationRequest.run(() => window.vtStudio.export.validateAssets({
    projectId: currentProjectId.value,
    contentId: selectedContentId.value!,
  }));
  if (!data) {
    validation.value = null;
    return;
  }

  validation.value = data;
  timeline.value = data.timeline;
  exportResult.value = null;

  if (data.valid) {
    MessagePlugin.success(t('exportCenter.validationPassed'));
  } else {
    MessagePlugin.warning(t('exportCenter.validationFailed', { count: data.failures.length }));
  }
}

async function createJianyingDraft(): Promise<void> {
  if (!canLoadExportData.value || !selectedContentId.value) {
    MessagePlugin.warning(t('exportCenter.noScriptSelected'));
    return;
  }

  if (!validation.value) {
    await validateAssets();
  }

  if (!validation.value?.valid) {
    MessagePlugin.warning(t('exportCenter.fixBeforeExport'));
    return;
  }

  const data = await exportRequest.run(() => window.vtStudio.export.createJianyingDraft({
    projectId: currentProjectId.value,
    contentId: selectedContentId.value!,
    draftName: draftName.value || null,
    copyAssets: copyAssets.value,
  }));
  if (!data) {
    return;
  }

  exportResult.value = data;
  timeline.value = data.timeline ?? timeline.value;

  if (data.succeeded) {
    MessagePlugin.success(t('exportCenter.exportSucceeded'));
  } else {
    MessagePlugin.error(t('exportCenter.exportFailed'));
  }

  await loadHistory();
}

async function openExportDirectory(): Promise<void> {
  if (!resultPath.value) {
    return;
  }

  await openDirectoryRequest.run(() => window.vtStudio.export.openDirectory({ path: resultPath.value! }), {
    showSuccess: true,
    successMessageKey: 'exportCenter.directoryOpened',
  });
}

async function copyOutputPath(): Promise<void> {
  if (!resultPath.value) {
    return;
  }

  await navigator.clipboard.writeText(resultPath.value);
  MessagePlugin.success(t('exportCenter.pathCopied'));
}

async function copyTaskId(): Promise<void> {
  if (!resultTaskId.value) {
    return;
  }

  await navigator.clipboard.writeText(String(resultTaskId.value));
  MessagePlugin.success(t('exportCenter.taskIdCopied'));
}

async function showHistoryDetail(history: ExportHistoryItem): Promise<void> {
  const data = await historyDetailRequest.run(() => window.vtStudio.export.getHistoryDetail({
    projectId: currentProjectId.value,
    id: history.id,
  }));
  if (!data) {
    return;
  }

  activeHistory.value = data.history;
  historyDetailVisible.value = true;
}

async function openHistoryDirectory(history: ExportHistoryItem): Promise<void> {
  if (!history.outputPath) {
    MessagePlugin.warning(t('exportCenter.historyNoOutputPath'));
    return;
  }

  await openDirectoryRequest.run(() => window.vtStudio.export.openDirectory({ path: history.outputPath! }), {
    showSuccess: true,
    successMessageKey: 'exportCenter.directoryOpened',
  });
}

async function copyHistoryPath(history: ExportHistoryItem): Promise<void> {
  if (!history.outputPath) {
    MessagePlugin.warning(t('exportCenter.historyNoOutputPath'));
    return;
  }

  await navigator.clipboard.writeText(history.outputPath);
  MessagePlugin.success(t('exportCenter.pathCopied'));
}

async function copyHistoryTaskId(history: ExportHistoryItem): Promise<void> {
  if (!history.taskId) {
    MessagePlugin.warning(t('exportCenter.historyNoTaskId'));
    return;
  }

  await navigator.clipboard.writeText(String(history.taskId));
  MessagePlugin.success(t('exportCenter.taskIdCopied'));
}

async function rerunHistory(history: ExportHistoryItem): Promise<void> {
  if (!contents.value.some((content) => content.id === history.contentId)) {
    MessagePlugin.warning(t('exportCenter.historyScriptMissing'));
    return;
  }

  selectedContentId.value = history.contentId;
  draftName.value = history.draftName;
  copyAssets.value = history.copyAssets;
  timeline.value = null;
  validation.value = null;
  exportResult.value = null;
  await validateAssets();
}

function goProduction(): void {
  void router.push({ name: 'production' });
}

function goTaskCenter(): void {
  void router.push({ name: 'tasks' });
}

watch(selectedContentId, () => {
  resetExportData();
  void loadHistory();
});

watch(currentProjectId, () => {
  void loadContents();
});

onMounted(() => {
  void loadContents();
});
</script>

<template>
  <div class="export-page">
    <WorkflowNextStepHint hint-key="export" next-route-name="project-overview" />

    <section class="rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-5 shadow-sm">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div class="min-w-0">
          <p class="eyebrow">{{ t('exportCenter.eyebrow') }}</p>
          <h3 class="m-0 text-xl font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.title') }}</h3>
          <p class="m-0 mt-2 max-w-3xl text-sm leading-6 text-[var(--vt-text-secondary)]">{{ t('exportCenter.summary') }}</p>
        </div>
        <div class="grid w-full gap-3 rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-4 xl:w-[360px]">
          <p class="m-0 text-xs font-medium uppercase text-[var(--vt-text-tertiary)]">{{ t('exportCenter.currentProject') }}</p>
          <strong class="truncate text-base text-[var(--vt-text-primary)]">{{ currentProject?.name ?? t('common.noProject') }}</strong>
          <p class="m-0 text-sm text-[var(--vt-text-secondary)]">{{ t('exportCenter.projectHint') }}</p>
          <div class="flex flex-wrap gap-2">
            <VtButton size="small" variant="outline" :loading="contentLoading" @click="loadContents">
              <template #icon><RefreshIcon /></template>
              {{ t('exportCenter.refresh') }}
            </VtButton>
            <VtButton size="small" variant="outline" @click="goProduction">
              {{ t('exportCenter.goProduction') }}
            </VtButton>
          </div>
        </div>
      </div>
    </section>

    <section class="export-layout grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside class="export-side-panel grid content-start gap-4 rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4 shadow-sm">
        <div>
          <h4 class="m-0 text-base font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.selectTitle') }}</h4>
          <p class="m-0 mt-1 text-sm leading-6 text-[var(--vt-text-secondary)]">{{ t('exportCenter.selectHint') }}</p>
        </div>

        <label class="grid gap-2">
          <span class="text-sm font-medium text-[var(--vt-text-secondary)]">{{ t('exportCenter.script') }}</span>
          <t-select
            v-model="selectedContentId"
            :options="contentOptions"
            :loading="contentLoading"
            :placeholder="contents.length ? t('exportCenter.scriptPlaceholder') : t('exportCenter.noScripts')"
            clearable
          />
        </label>

        <label class="grid gap-2">
          <span class="text-sm font-medium text-[var(--vt-text-secondary)]">{{ t('exportCenter.draftName') }}</span>
          <t-input v-model="draftName" :disabled="!selectedContentId" :placeholder="selectedContent?.title || t('exportCenter.draftNamePlaceholder')" />
        </label>

        <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <strong class="block text-sm text-[var(--vt-text-primary)]">{{ t('exportCenter.copyAssets') }}</strong>
              <p class="m-0 mt-1 text-xs leading-5 text-[var(--vt-text-tertiary)]">{{ t('exportCenter.copyAssetsHint') }}</p>
            </div>
            <t-switch v-model="copyAssets" />
          </div>
        </div>

        <div class="grid gap-2">
          <VtButton theme="primary" variant="base" :disabled="!selectedContentId" :loading="validationLoading" @click="validateAssets">
            <template #icon><SearchIcon /></template>
            {{ t('exportCenter.checkAssets') }}
          </VtButton>
          <VtButton variant="outline" :disabled="!selectedContentId" :loading="timelineLoading" @click="buildTimeline">
            {{ t('exportCenter.buildTimeline') }}
          </VtButton>
          <VtButton theme="primary" variant="base" :disabled="!canExport" :loading="exportLoading" @click="createJianyingDraft">
            <template #icon><FileExportIcon /></template>
            {{ validation?.valid ? t('exportCenter.startExport') : t('exportCenter.needCheckFirst') }}
          </VtButton>
        </div>
      </aside>

      <section class="export-main-panel grid content-start gap-4">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4">
            <p class="m-0 text-xs font-medium text-[var(--vt-text-tertiary)]">{{ t('exportCenter.statScripts') }}</p>
            <strong class="mt-2 block text-2xl text-[var(--vt-text-primary)]">{{ contents.length }}</strong>
          </div>
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4">
            <p class="m-0 text-xs font-medium text-[var(--vt-text-tertiary)]">{{ t('exportCenter.statClips') }}</p>
            <strong class="mt-2 block text-2xl text-[var(--vt-text-primary)]">{{ timeline?.clips.length ?? 0 }}</strong>
          </div>
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4">
            <p class="m-0 text-xs font-medium text-[var(--vt-text-tertiary)]">{{ t('exportCenter.statDuration') }}</p>
            <strong class="mt-2 block text-2xl text-[var(--vt-text-primary)]">{{ formatSeconds(timeline?.durationMs ?? 0) }}</strong>
          </div>
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4">
            <p class="m-0 text-xs font-medium text-[var(--vt-text-tertiary)]">{{ t('exportCenter.statFailures') }}</p>
            <strong class="mt-2 block text-2xl text-[var(--vt-text-primary)]">{{ latestFailures.length }}</strong>
          </div>
        </div>

        <div class="grid gap-3 rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="m-0 text-base font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.stepsTitle') }}</h4>
              <p class="m-0 mt-1 text-sm text-[var(--vt-text-secondary)]">{{ t('exportCenter.stepsHint') }}</p>
            </div>
            <t-tag :theme="validation?.valid ? 'success' : latestFailures.length ? 'danger' : 'default'" variant="light">
              {{ validation?.valid ? t('exportCenter.readyToExport') : latestFailures.length ? t('exportCenter.hasFailures') : t('exportCenter.waitingCheck') }}
            </t-tag>
          </div>

          <div class="grid gap-3 lg:grid-cols-5">
            <article
              v-for="(step, index) in exportSteps"
              :key="step.key"
              class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--vt-fill-subtle)] text-xs font-semibold text-[var(--vt-text-primary)]">{{ index + 1 }}</span>
                <t-tag size="small" :theme="stepTheme(step.state)" variant="light">{{ t(`exportCenter.stepState.${step.state}`) }}</t-tag>
              </div>
              <strong class="mt-3 block text-sm text-[var(--vt-text-primary)]">{{ t(`exportCenter.step.${step.key}.title`) }}</strong>
              <p class="m-0 mt-1 text-xs leading-5 text-[var(--vt-text-secondary)]">{{ t(`exportCenter.step.${step.key}.summary`) }}</p>
            </article>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section class="grid content-start gap-3 rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 class="m-0 text-base font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.failureTitle') }}</h4>
                <p class="m-0 mt-1 text-sm text-[var(--vt-text-secondary)]">{{ t('exportCenter.failureHint') }}</p>
              </div>
              <VtButton size="small" variant="outline" @click="goProduction">{{ t('exportCenter.fixInProduction') }}</VtButton>
            </div>

            <div v-if="latestFailures.length" class="grid gap-2">
              <article
                v-for="failure in latestFailures"
                :key="`${failure.clipId}-${failure.sourceId}-${failure.reason}`"
                class="grid gap-2 rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <strong class="text-sm text-[var(--vt-danger)]">{{ failureReasonLabel(failure.reason) }}</strong>
                  <t-tag size="small" theme="danger" variant="light">{{ t('exportCenter.failureTrack', { track: failureTrackLabel(failure) }) }}</t-tag>
                </div>
                <p class="m-0 text-sm leading-6 text-[var(--vt-text-secondary)]">{{ failure.message }}</p>
                <code class="break-words rounded bg-[var(--vt-fill-subtle)] px-2 py-1 text-xs text-[var(--vt-text-primary)]">{{ failure.path || t('exportCenter.emptyValue') }}</code>
              </article>
            </div>
            <VtEmptyState v-else :description="validation ? t('exportCenter.noFailures') : t('exportCenter.noCheckYet')" />
          </section>

          <aside class="grid content-start gap-3 rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4 shadow-sm">
            <div>
              <h4 class="m-0 text-base font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.resultTitle') }}</h4>
              <p class="m-0 mt-1 text-sm leading-6 text-[var(--vt-text-secondary)]">{{ t('exportCenter.resultHint') }}</p>
            </div>

            <t-alert
              v-if="exportResult"
              :theme="exportResult.succeeded ? 'success' : 'error'"
              :message="exportResult.succeeded ? t('exportCenter.exportSucceeded') : t('exportCenter.exportFailed')"
            />
            <t-alert v-else theme="info" :message="t('exportCenter.noResult')" />

            <dl class="grid gap-2">
              <div class="rounded-md bg-[var(--vt-surface-app)] p-3">
                <dt class="text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.resultPath') }}</dt>
                <dd class="m-0 mt-1 break-words text-sm text-[var(--vt-text-primary)]">{{ resultPath || t('exportCenter.emptyValue') }}</dd>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-md bg-[var(--vt-surface-app)] p-3">
                  <dt class="text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.summaryClips') }}</dt>
                  <dd class="m-0 mt-1 text-sm font-semibold text-[var(--vt-text-primary)]">{{ exportResult?.summary.clipCount ?? 0 }}</dd>
                </div>
                <div class="rounded-md bg-[var(--vt-surface-app)] p-3">
                  <dt class="text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.summaryAssets') }}</dt>
                  <dd class="m-0 mt-1 text-sm font-semibold text-[var(--vt-text-primary)]">{{ exportResult?.summary.copiedAssetCount ?? 0 }}</dd>
                </div>
                <div class="rounded-md bg-[var(--vt-surface-app)] p-3">
                  <dt class="text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.summaryDuration') }}</dt>
                  <dd class="m-0 mt-1 text-sm font-semibold text-[var(--vt-text-primary)]">{{ formatSeconds(exportResult?.summary.durationMs ?? 0) }}</dd>
                </div>
              </div>
              <div class="rounded-md bg-[var(--vt-surface-app)] p-3">
                <dt class="text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.taskId') }}</dt>
                <dd class="m-0 mt-1 text-sm text-[var(--vt-text-primary)]">{{ exportResult?.taskId ?? t('exportCenter.emptyValue') }}</dd>
              </div>
            </dl>

            <div class="grid gap-2">
              <VtButton theme="primary" variant="base" :disabled="!resultPath" :loading="openDirectoryLoading" @click="openExportDirectory">
                <template #icon><FolderOpenIcon /></template>
                {{ t('exportCenter.openDirectory') }}
              </VtButton>
              <VtButton variant="outline" :disabled="!resultPath" @click="copyOutputPath">
                <template #icon><CheckIcon /></template>
                {{ t('exportCenter.copyPath') }}
              </VtButton>
              <VtButton variant="outline" :disabled="!resultTaskId" @click="copyTaskId">
                <template #icon><CheckIcon /></template>
                {{ t('exportCenter.copyTaskId') }}
              </VtButton>
              <VtButton variant="outline" @click="goTaskCenter">
                <template #icon><ErrorCircleIcon /></template>
                {{ t('exportCenter.goTaskCenter') }}
              </VtButton>
            </div>
          </aside>
        </div>

        <section class="grid gap-3 rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="m-0 text-base font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.historyTitle') }}</h4>
              <p class="m-0 mt-1 text-sm leading-6 text-[var(--vt-text-secondary)]">{{ t('exportCenter.historyHint') }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <t-tag variant="light">{{ t('exportCenter.historyTotal', { count: historyTotal }) }}</t-tag>
              <VtButton size="small" variant="outline" :loading="historyLoading" @click="loadHistory">
                <template #icon><RefreshIcon /></template>
                {{ t('exportCenter.refreshHistory') }}
              </VtButton>
            </div>
          </div>

          <div v-if="histories.length" class="grid gap-3">
            <article
              v-for="history in histories"
              :key="history.id"
              class="grid gap-3 rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <strong class="truncate text-sm text-[var(--vt-text-primary)]">{{ history.draftName }}</strong>
                    <t-tag size="small" :theme="historyStatusTheme(history.status)" variant="light">{{ historyStatusLabel(history.status) }}</t-tag>
                  </div>
                  <p class="m-0 mt-1 text-xs leading-5 text-[var(--vt-text-secondary)]">
                    {{ t('exportCenter.historyScriptMeta', { script: history.contentName, time: formatDateTime(history.createdAt) }) }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <VtButton size="small" variant="outline" :loading="historyDetailLoading" @click="showHistoryDetail(history)">
                    <template #icon><SearchIcon /></template>
                    {{ t('exportCenter.viewHistoryDetail') }}
                  </VtButton>
                  <VtButton size="small" variant="outline" @click="rerunHistory(history)">
                    <template #icon><RefreshIcon /></template>
                    {{ t('exportCenter.rerunHistory') }}
                  </VtButton>
                </div>
              </div>

              <div class="grid gap-2 sm:grid-cols-4">
                <div class="rounded bg-[var(--vt-fill-subtle)] px-3 py-2">
                  <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.summaryClips') }}</p>
                  <strong class="text-sm text-[var(--vt-text-primary)]">{{ history.clipCount }}</strong>
                </div>
                <div class="rounded bg-[var(--vt-fill-subtle)] px-3 py-2">
                  <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.summaryAssets') }}</p>
                  <strong class="text-sm text-[var(--vt-text-primary)]">{{ history.copiedAssetCount }}</strong>
                </div>
                <div class="rounded bg-[var(--vt-fill-subtle)] px-3 py-2">
                  <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.summaryDuration') }}</p>
                  <strong class="text-sm text-[var(--vt-text-primary)]">{{ formatSeconds(history.durationMs) }}</strong>
                </div>
                <div class="rounded bg-[var(--vt-fill-subtle)] px-3 py-2">
                  <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.taskId') }}</p>
                  <strong class="text-sm text-[var(--vt-text-primary)]">{{ history.taskId ?? t('exportCenter.emptyValue') }}</strong>
                </div>
              </div>

              <div class="rounded bg-[var(--vt-fill-subtle)] px-3 py-2">
                <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.resultPath') }}</p>
                <code class="mt-1 block break-words text-xs text-[var(--vt-text-primary)]">{{ history.outputPath || t('exportCenter.emptyValue') }}</code>
              </div>

              <div class="flex flex-wrap gap-2">
                <VtButton size="small" variant="outline" :disabled="!history.outputPath" :loading="openDirectoryLoading" @click="openHistoryDirectory(history)">
                  <template #icon><FolderOpenIcon /></template>
                  {{ t('exportCenter.openDirectory') }}
                </VtButton>
                <VtButton size="small" variant="outline" :disabled="!history.outputPath" @click="copyHistoryPath(history)">
                  <template #icon><CheckIcon /></template>
                  {{ t('exportCenter.copyPath') }}
                </VtButton>
                <VtButton size="small" variant="outline" :disabled="!history.taskId" @click="copyHistoryTaskId(history)">
                  <template #icon><CheckIcon /></template>
                  {{ t('exportCenter.copyTaskId') }}
                </VtButton>
                <VtButton size="small" variant="outline" @click="goTaskCenter">
                  <template #icon><ErrorCircleIcon /></template>
                  {{ t('exportCenter.goTaskCenter') }}
                </VtButton>
              </div>
            </article>
          </div>
          <VtEmptyState v-else :description="historyLoading ? t('exportCenter.historyLoading') : t('exportCenter.historyEmpty')" />
        </section>
      </section>
    </section>

    <VtDialog :visible="historyDetailVisible" :title="t('exportCenter.historyDetailTitle')" width="920px" :footer="false" @update:visible="(value) => (historyDetailVisible = value)">
      <div v-if="activeHistory" class="grid max-h-[72vh] gap-4 overflow-auto pr-1">
        <section class="grid gap-2 rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <strong class="text-sm text-[var(--vt-text-primary)]">{{ activeHistory.draftName }}</strong>
            <t-tag size="small" :theme="historyStatusTheme(activeHistory.status)" variant="light">{{ historyStatusLabel(activeHistory.status) }}</t-tag>
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <div>
              <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.historyCreatedAt') }}</p>
              <p class="m-0 mt-1 text-sm text-[var(--vt-text-primary)]">{{ formatDateTime(activeHistory.createdAt) }}</p>
            </div>
            <div>
              <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.historyUpdatedAt') }}</p>
              <p class="m-0 mt-1 text-sm text-[var(--vt-text-primary)]">{{ formatDateTime(activeHistory.updatedAt) }}</p>
            </div>
            <div>
              <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t('exportCenter.historyAppVersion') }}</p>
              <p class="m-0 mt-1 text-sm text-[var(--vt-text-primary)]">{{ activeHistory.appVersion }}</p>
            </div>
          </div>
        </section>

        <section class="grid gap-2">
          <h5 class="m-0 text-sm font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.historyMediaTitle') }}</h5>
          <div v-if="activeHistory.mediaSnapshot.files.length" class="grid gap-2">
            <article
              v-for="file in activeHistory.mediaSnapshot.files"
              :key="file.clipId"
              class="grid gap-1 rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3 text-xs text-[var(--vt-text-secondary)]"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <strong class="text-[var(--vt-text-primary)]">{{ file.clipId }}</strong>
                <t-tag size="small" :theme="file.exists ? 'success' : 'danger'" variant="light">
                  {{ file.exists ? t('exportCenter.historyFileExists') : t('exportCenter.historyFileMissing') }}
                </t-tag>
              </div>
              <p class="m-0 break-words">{{ t('exportCenter.historyRelativePath', { path: file.relativePath || t('exportCenter.emptyValue') }) }}</p>
              <p class="m-0 break-words">{{ t('exportCenter.historyCopiedPath', { path: file.copiedPath || t('exportCenter.emptyValue') }) }}</p>
              <p class="m-0">{{ t('exportCenter.historyFileMeta', { size: file.sizeBytes ?? t('exportCenter.emptyValue'), mime: file.mime || t('exportCenter.emptyValue') }) }}</p>
              <p class="m-0 break-words">{{ t('exportCenter.historyMd5', { md5: file.md5 || t('exportCenter.emptyValue') }) }}</p>
            </article>
          </div>
          <VtEmptyState v-else :description="t('exportCenter.historyNoMedia')" />
        </section>

        <section class="grid gap-2">
          <h5 class="m-0 text-sm font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.historyFailuresTitle') }}</h5>
          <div v-if="activeHistory.failures.length" class="grid gap-2">
            <article
              v-for="failure in activeHistory.failures"
              :key="`${failure.clipId}-${failure.sourceId}-${failure.reason}`"
              class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3"
            >
              <strong class="text-sm text-[var(--vt-danger)]">{{ failureReasonLabel(failure.reason) }}</strong>
              <p class="m-0 mt-1 text-sm leading-6 text-[var(--vt-text-secondary)]">{{ failure.message }}</p>
              <code class="mt-2 block break-words rounded bg-[var(--vt-fill-subtle)] px-2 py-1 text-xs text-[var(--vt-text-primary)]">{{ failure.path || t('exportCenter.emptyValue') }}</code>
            </article>
          </div>
          <VtEmptyState v-else :description="t('exportCenter.historyNoFailures')" />
        </section>

        <section class="grid gap-2">
          <h5 class="m-0 text-sm font-semibold text-[var(--vt-text-primary)]">{{ t('exportCenter.historyTimelineTitle') }}</h5>
          <pre class="m-0 max-h-64 overflow-auto rounded-md bg-[var(--vt-fill-subtle)] p-3 text-xs leading-5 text-[var(--vt-text-primary)]">{{ formatJson(activeHistory.timeline) }}</pre>
        </section>
      </div>
    </VtDialog>
  </div>
</template>
