<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAppStore } from '@renderer/stores/app';
import { useVtRequest } from '@renderer/composables/useVtRequest';
import { PROJECT_TEMPLATE_TYPES } from '@shared/constants/dictionaries';
import type { ProjectFlowStatsResult } from '@shared/types/project';

type FlowStatus = 'done' | 'pending' | 'blocked' | 'skipped' | 'running' | 'failed';
type FlowStepKey =
  | 'setup'
  | 'content'
  | 'resources'
  | 'directorPlan'
  | 'storyboardTable'
  | 'storyboardImage'
  | 'video'
  | 'export';

interface FlowStepBase {
  key: FlowStepKey;
  routeName: string;
}

interface FlowStep extends FlowStepBase {
  index: number;
  disabled: boolean;
  displayStatus: FlowStatus;
}

const router = useRouter();
const appStore = useAppStore();
const { t } = useI18n();
const loading = ref(false);
const loadError = ref<string | null>(null);
const flowStats = ref<ProjectFlowStatsResult | null>(null);
const statsRequest = useVtRequest({ loading, showError: false });

const baseSteps: FlowStepBase[] = [
  { key: 'setup', routeName: 'projects' },
  { key: 'content', routeName: 'production' },
  { key: 'resources', routeName: 'production' },
  { key: 'directorPlan', routeName: 'production' },
  { key: 'storyboardTable', routeName: 'production' },
  { key: 'storyboardImage', routeName: 'production' },
  { key: 'video', routeName: 'production' },
  { key: 'export', routeName: 'production' },
];

const currentProject = computed(() => appStore.currentProject);
const currentProjectId = computed(() => Number(currentProject.value?.id ?? 0));
const stats = computed(() => flowStats.value ?? createEmptyStats(currentProjectId.value));
const currentTemplateType = computed(() => currentProject.value?.templateType ?? PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA);

const flowSteps = computed<FlowStep[]>(() =>
  baseSteps.map((step, index) => {
    const disabled = false;
    const status = resolveStepStatus(step.key, stats.value);
    return {
      ...step,
      index: index + 1,
      disabled,
      displayStatus: disabled ? 'skipped' : status,
    };
  }),
);

const completedCount = computed(() => flowSteps.value.filter((step) => step.displayStatus === 'done').length);
const actionableCount = computed(() => flowSteps.value.filter((step) => !step.disabled).length);
const nextStep = computed(() => flowSteps.value.find((step) => step.displayStatus !== 'done' && !step.disabled) ?? flowSteps.value.find((step) => !step.disabled));
const failedTaskSummaries = computed(() => stats.value.failedTaskSummaries);

function createEmptyStats(projectId: number): ProjectFlowStatsResult {
  return {
    projectId,
    templateType: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA,
    sourceChapterCount: 0,
    sourceEventSucceededCount: 0,
    sourceEventFailedCount: 0,
    sourceEventRunningCount: 0,
    sourceEventStaleCount: 0,
    agentWorkspaceCount: 0,
    contentCount: 0,
    resourceExtractSucceededCount: 0,
    resourceExtractFailedCount: 0,
    resourceExtractRunningCount: 0,
    assetCount: 0,
    visualAssetCount: 0,
    assetImageReadyCount: 0,
    assetImageFailedCount: 0,
    assetImageRunningCount: 0,
    audioAssetCount: 0,
    audioBindingReadyCount: 0,
    audioBindingFailedCount: 0,
    audioBindingRunningCount: 0,
    storyboardCount: 0,
    storyboardImageReadyCount: 0,
    storyboardImageFailedCount: 0,
    storyboardImageRunningCount: 0,
    videoTrackCount: 0,
    selectedVideoTrackCount: 0,
    videoCandidateCount: 0,
    videoReadyCount: 0,
    videoFailedCount: 0,
    videoRunningCount: 0,
    failedTaskCount: 0,
    runningTaskCount: 0,
    failedTaskSummaries: [],
  };
}

function resolveStepStatus(key: FlowStepKey, value: ProjectFlowStatsResult): FlowStatus {
  if (key === 'setup') {
    return 'done';
  }

  if (key === 'content') {
    return value.contentCount > 0 ? 'done' : 'pending';
  }

  if (key === 'resources') {
    if (value.contentCount === 0) {
      return 'blocked';
    }
    if (value.resourceExtractFailedCount > 0) {
      return 'failed';
    }
    if (value.resourceExtractRunningCount > 0) {
      return 'running';
    }
    return value.resourceExtractSucceededCount > 0 || value.assetCount > 0 ? 'done' : 'pending';
  }

  if (key === 'directorPlan') {
    if (value.contentCount === 0) {
      return 'blocked';
    }
    return value.storyboardCount > 0 ? 'done' : 'pending';
  }

  if (key === 'storyboardTable') {
    if (value.contentCount === 0) {
      return 'blocked';
    }
    return value.storyboardCount > 0 ? 'done' : 'pending';
  }

  if (key === 'storyboardImage') {
    if (value.storyboardCount === 0) {
      return 'blocked';
    }
    if (value.storyboardImageFailedCount > 0) {
      return 'failed';
    }
    if (value.storyboardImageRunningCount > 0) {
      return 'running';
    }
    return value.storyboardImageReadyCount >= value.storyboardCount ? 'done' : 'pending';
  }

  if (key === 'video') {
    if (value.videoTrackCount === 0) {
      return value.storyboardCount > 0 ? 'pending' : 'blocked';
    }
    if (value.videoFailedCount > 0) {
      return 'failed';
    }
    if (value.videoRunningCount > 0) {
      return 'running';
    }
    return value.selectedVideoTrackCount >= value.videoTrackCount ? 'done' : 'pending';
  }

  if (value.videoTrackCount === 0 || value.selectedVideoTrackCount < value.videoTrackCount) {
    return 'blocked';
  }

  return 'pending';
}

function statusTheme(status: FlowStatus): 'success' | 'warning' | 'danger' | 'default' | 'primary' {
  if (status === 'done') {
    return 'success';
  }
  if (status === 'running') {
    return 'primary';
  }
  if (status === 'pending') {
    return 'warning';
  }
  if (status === 'blocked' || status === 'failed') {
    return 'danger';
  }
  return 'default';
}

function progressWidth(): string {
  if (actionableCount.value <= 0) {
    return '0%';
  }

  return `${Math.round((completedCount.value / actionableCount.value) * 100)}%`;
}

function openStep(step: FlowStep): void {
  if (step.disabled) {
    return;
  }

  void router.push({ name: step.routeName });
}

function openFailedTasks(): void {
  if (!currentProjectId.value) {
    void router.push({ name: 'tasks', query: { status: 'failed' } });
    return;
  }

  void router.push({
    name: 'tasks',
    query: {
      projectId: String(currentProjectId.value),
      status: 'failed',
    },
  });
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString();
}

function metricParams(key: FlowStepKey): Record<string, number> {
  const value = stats.value;
  return {
    chapters: value.sourceChapterCount,
    sourceSucceeded: value.sourceEventSucceededCount,
    sourceFailed: value.sourceEventFailedCount,
    sourceRunning: value.sourceEventRunningCount,
    contents: value.contentCount,
    agentWorkspace: value.agentWorkspaceCount,
    extractSucceeded: value.resourceExtractSucceededCount,
    extractFailed: value.resourceExtractFailedCount,
    extractRunning: value.resourceExtractRunningCount,
    assets: value.assetCount,
    visualAssets: value.visualAssetCount,
    assetImagesReady: value.assetImageReadyCount,
    assetImagesFailed: value.assetImageFailedCount,
    assetImagesRunning: value.assetImageRunningCount,
    audioAssets: value.audioAssetCount,
    audioBindings: value.audioBindingReadyCount,
    audioBindingFailed: value.audioBindingFailedCount,
    audioBindingRunning: value.audioBindingRunningCount,
    storyboards: value.storyboardCount,
    storyboardImagesReady: value.storyboardImageReadyCount,
    storyboardImagesFailed: value.storyboardImageFailedCount,
    storyboardImagesRunning: value.storyboardImageRunningCount,
    videoTracks: value.videoTrackCount,
    selectedVideoTracks: value.selectedVideoTrackCount,
    videos: value.videoCandidateCount,
    videoReady: value.videoReadyCount,
    videoFailed: value.videoFailedCount,
    videoRunning: value.videoRunningCount,
    failedTasks: value.failedTaskCount,
    runningTasks: value.runningTaskCount,
    stepIndex: baseSteps.findIndex((step) => step.key === key) + 1,
  };
}

async function loadFlowStats(): Promise<void> {
  if (!currentProjectId.value) {
    flowStats.value = null;
    loadError.value = null;
    return;
  }

  loadError.value = null;
  const data = await statsRequest.run(() => window.vtStudio.project.getFlowStats({ projectId: currentProjectId.value }), {
    lock: false,
    onError: (error) => {
      loadError.value = error.displayMessage;
    },
  });

  if (data) {
    flowStats.value = data;
  }
}

watch(
  currentProjectId,
  () => {
    void loadFlowStats();
  },
  { immediate: true },
);
</script>

<template>
  <div class="project-overview-page">
    <section class="rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-5 shadow-sm">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div class="min-w-0">
          <p class="eyebrow">{{ t('common.project') }}</p>
          <h3 class="m-0 text-xl font-semibold text-[var(--vt-text-primary)]">{{ t('projectOverview.title') }}</h3>
          <p class="m-0 mt-2 max-w-3xl text-sm leading-6 text-[var(--vt-text-secondary)]">{{ t('projectOverview.summary') }}</p>
        </div>
        <div class="w-full rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-4 xl:w-[320px]">
          <p class="m-0 text-xs font-medium uppercase text-[var(--vt-text-tertiary)]">{{ t('projectOverview.currentProject') }}</p>
          <strong class="mt-2 block truncate text-base text-[var(--vt-text-primary)]">{{ currentProject?.name ?? t('common.noProject') }}</strong>
          <p class="m-0 mt-2 text-sm text-[var(--vt-text-secondary)]">
            {{ t('projectOverview.projectType', { type: t(`project.templateType.${currentTemplateType}`) }) }}
          </p>
          <t-button class="mt-3 w-full" size="small" theme="primary" variant="outline" :loading="loading" @click="loadFlowStats">
            {{ t('projectOverview.refreshStats') }}
          </t-button>
        </div>
      </div>

      <t-alert v-if="loadError" class="mt-5" theme="error" :message="loadError" />
      <t-alert
        v-if="stats.failedTaskCount > 0"
        class="mt-5"
        theme="error"
        :title="t('projectOverview.failedTasks.title', { count: stats.failedTaskCount })"
        :message="t('projectOverview.failedTasks.summary')"
      >
        <template #operation>
          <t-button size="small" theme="danger" variant="outline" @click="openFailedTasks">
            {{ t('projectOverview.failedTasks.openTaskCenter') }}
          </t-button>
        </template>
      </t-alert>

      <div class="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="m-0 text-sm font-medium text-[var(--vt-text-primary)]">
                {{ t('projectOverview.progressTitle', { done: completedCount, total: actionableCount }) }}
              </p>
              <p class="m-0 mt-1 text-xs text-[var(--vt-text-tertiary)]">{{ t('projectOverview.progressHint') }}</p>
            </div>
            <t-tag theme="primary" variant="light">{{ loading ? t('projectOverview.loadingStats') : t('projectOverview.realStats') }}</t-tag>
          </div>
          <div class="mt-4 h-2 overflow-hidden rounded-full bg-[var(--vt-fill-subtle)]">
            <div class="h-full rounded-full bg-[var(--vt-color-primary)] transition-all" :style="{ width: progressWidth() }" />
          </div>
        </div>

        <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-4">
          <p class="m-0 text-xs font-medium uppercase text-[var(--vt-text-tertiary)]">{{ t('projectOverview.nextStep') }}</p>
          <strong class="mt-2 block text-sm text-[var(--vt-text-primary)]">
            {{ nextStep ? t(`projectOverview.step.${nextStep.key}.title`) : t('projectOverview.noNextStep') }}
          </strong>
          <t-button v-if="nextStep" class="mt-3 w-full" theme="primary" @click="openStep(nextStep)">
            {{ t(`projectOverview.step.${nextStep.key}.action`) }}
          </t-button>
        </div>
      </div>
    </section>

    <section
      v-if="failedTaskSummaries.length > 0"
      class="rounded-lg border border-red-200/80 bg-red-50 p-4 text-red-800 shadow-sm dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="m-0 text-xs font-medium uppercase opacity-80">{{ t('projectOverview.failedTasks.eyebrow') }}</p>
          <h4 class="m-0 mt-1 text-base font-semibold">{{ t('projectOverview.failedTasks.recentTitle') }}</h4>
          <p class="m-0 mt-1 text-sm leading-6 opacity-90">{{ t('projectOverview.failedTasks.recentSummary') }}</p>
        </div>
        <t-button theme="danger" variant="outline" @click="openFailedTasks">
          {{ t('projectOverview.failedTasks.openTaskCenter') }}
        </t-button>
      </div>
      <div class="mt-4 grid gap-3 xl:grid-cols-3">
        <article v-for="task in failedTaskSummaries" :key="task.id" class="rounded-md border border-red-200/70 bg-white/70 p-3 dark:border-red-500/30 dark:bg-black/10">
          <div class="flex items-center justify-between gap-3">
            <strong class="min-w-0 truncate text-sm">{{ task.category }}</strong>
            <span class="shrink-0 text-xs opacity-70">#{{ task.id }}</span>
          </div>
          <p class="m-0 mt-2 line-clamp-2 text-sm opacity-90">{{ task.description || task.modelName || t('projectOverview.failedTasks.noDescription') }}</p>
          <p class="m-0 mt-2 line-clamp-3 whitespace-pre-wrap text-xs opacity-80">{{ task.errorReason || t('projectOverview.failedTasks.noReason') }}</p>
          <p class="m-0 mt-2 text-xs opacity-70">{{ t('projectOverview.failedTasks.updatedAt', { time: formatTime(task.updatedAt) }) }}</p>
        </article>
      </div>
    </section>

    <section class="grid gap-3 xl:grid-cols-2">
      <article
        v-for="step in flowSteps"
        :key="step.key"
        class="rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4 shadow-sm"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-start gap-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--vt-fill-subtle)] text-sm font-semibold text-[var(--vt-text-primary)]">
              {{ step.index }}
            </span>
            <div class="min-w-0">
              <h4 class="m-0 text-base font-semibold text-[var(--vt-text-primary)]">{{ t(`projectOverview.step.${step.key}.title`) }}</h4>
              <p class="m-0 mt-1 text-sm leading-6 text-[var(--vt-text-secondary)]">{{ t(`projectOverview.step.${step.key}.summary`) }}</p>
            </div>
          </div>
          <t-tag :theme="statusTheme(step.displayStatus)" variant="light">{{ t(`projectOverview.status.${step.displayStatus}`) }}</t-tag>
        </div>

        <dl class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-md bg-[var(--vt-surface-app)] p-3">
            <dt class="text-xs font-medium text-[var(--vt-text-tertiary)]">{{ t('projectOverview.metricLabel') }}</dt>
            <dd class="m-0 mt-1 text-sm text-[var(--vt-text-primary)]">{{ t(`projectOverview.step.${step.key}.metric`, metricParams(step.key)) }}</dd>
          </div>
          <div class="rounded-md bg-[var(--vt-surface-app)] p-3">
            <dt class="text-xs font-medium text-[var(--vt-text-tertiary)]">{{ t('projectOverview.blockerLabel') }}</dt>
            <dd class="m-0 mt-1 text-sm text-[var(--vt-text-primary)]">
              {{ t(`projectOverview.step.${step.key}.blocker`, metricParams(step.key)) }}
            </dd>
          </div>
        </dl>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p class="m-0 text-xs text-[var(--vt-text-tertiary)]">{{ t(`projectOverview.step.${step.key}.owner`) }}</p>
          <t-button
            size="small"
            theme="primary"
            variant="outline"
            :disabled="step.disabled"
            :aria-label="t('projectOverview.openStep', { name: t(`projectOverview.step.${step.key}.title`) })"
            @click="openStep(step)"
          >
            {{ step.disabled ? t('projectOverview.skippedAction') : t(`projectOverview.step.${step.key}.action`) }}
          </t-button>
        </div>
      </article>
    </section>
  </div>
</template>
