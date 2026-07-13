<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AddIcon, DeleteIcon, DownloadIcon, EditIcon, FolderOpenIcon, MoreIcon, RefreshIcon, UploadIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import type { DropdownOption } from 'tdesign-vue-next/es/dropdown';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import ProjectFormDialog from './components/ProjectFormDialog.vue';
import { useAppStore } from '@renderer/stores/app';
import { PROJECT_IMAGE_QUALITY_VALUES, PROJECT_VIDEO_RATIO_VALUES } from '@shared/constants/dictionaries';
import type {
  ProjectDeleteImpact,
  ProjectFlowStatsResult,
  ProjectPageStateResult,
  ProjectSavePayload,
  ProjectSummary,
} from '@shared/types/project';

type ProjectCardAction = 'edit' | 'duplicate' | 'import' | 'export' | 'delete';

const legacyProjectKindKey = ['source', 'Type'].join('');
const legacyProjectKindValue = ['scr', 'ipt'].join('');

const router = useRouter();
const { t, locale } = useI18n();
const appStore = useAppStore();
const loading = ref(false);
const savingProject = ref(false);
const pageState = ref<ProjectPageStateResult>({
  projects: [],
  imageModels: [],
  videoModels: [],
  visualManuals: [],
  directorManuals: [],
  imageQualityOptions: [...PROJECT_IMAGE_QUALITY_VALUES],
  videoRatioOptions: [...PROJECT_VIDEO_RATIO_VALUES],
});

const projectDialogVisible = ref(false);
const projectDialogMode = ref<'create' | 'edit'>('create');
const activeProject = ref<ProjectSummary | null>(null);
const deleteDialogVisible = ref(false);
const deletingProject = ref(false);
const deleteProjectImpact = ref<ProjectDeleteImpact | null>(null);
const deleteFiles = ref(false);
const exportingPackageId = ref<number | null>(null);
const importDialogVisible = ref(false);
const importPackagePath = ref('');
const importingPackage = ref(false);
const projectStats = ref<Record<number, ProjectFlowStatsResult | null>>({});

const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

async function loadPageState(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.project.getPageState();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    pageState.value = response.data;
    await loadProjectFlowStats(response.data.projects);
  } finally {
    loading.value = false;
  }
}

async function loadProjectFlowStats(projects: ProjectSummary[]): Promise<void> {
  const entries = await Promise.all(
    projects.map(async (project) => {
      try {
        const response = await window.vtStudio.project.getFlowStats({ projectId: project.id });
        return [project.id, isOk(response) ? response.data : null] as const;
      } catch {
        return [project.id, null] as const;
      }
    })
  );
  projectStats.value = Object.fromEntries(entries) as Record<number, ProjectFlowStatsResult | null>;
}

function openCreateDialog(): void {
  activeProject.value = null;
  projectDialogMode.value = 'create';
  projectDialogVisible.value = true;
}

function openImportPackageDialog(): void {
  importPackagePath.value = '';
  importDialogVisible.value = true;
}

function openEditDialog(project: ProjectSummary): void {
  activeProject.value = project;
  projectDialogMode.value = 'edit';
  projectDialogVisible.value = true;
}

async function saveProject(payload: ProjectSavePayload): Promise<void> {
  savingProject.value = true;
  try {
    const response = projectDialogMode.value === 'create'
      ? await window.vtStudio.project.create(payload)
      : await window.vtStudio.project.update(payload);
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t(projectDialogMode.value === 'create' ? 'project.message.created' : 'project.message.updated'));
    projectDialogVisible.value = false;
    if (currentProjectId.value && currentProjectId.value === response.data.project.id) {
      appStore.setCurrentProject({
        id: String(response.data.project.id),
        name: response.data.project.name,
        templateType: response.data.project.templateType,
      });
    }
    await loadPageState();
  } finally {
    savingProject.value = false;
  }
}

async function duplicateProject(project: ProjectSummary): Promise<void> {
  const payload = {
    templateType: project.templateType,
    [legacyProjectKindKey]: legacyProjectKindValue,
    name: t('project.copyName', { name: project.name }),
    genre: project.genre,
    description: project.description,
    imageModelId: project.imageModelId,
    imageQuality: project.imageQuality,
    videoModelId: project.videoModelId,
    videoMode: project.videoMode,
    videoRatio: project.videoRatio,
    visualManualId: project.visualManualId,
    directorManualId: project.directorManualId,
  } as unknown as ProjectSavePayload;
  const response = await window.vtStudio.project.create(payload);
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }

  MessagePlugin.success(t('project.message.duplicated'));
  await loadPageState();
}

async function openProject(project: ProjectSummary): Promise<void> {
  const response = await window.vtStudio.project.open({ projectId: project.id });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    openEditDialog(project);
    return;
  }

  appStore.setCurrentProject(response.data.project);
  await router.push({ name: response.data.targetRoute });
}

function formatLockText(impact: ProjectDeleteImpact): string {
  if (impact.runningLocks.length === 0) {
    return t('project.delete.noLocks');
  }

  return impact.runningLocks.map((lock) => t('project.delete.lockItem', { label: lock.label, count: lock.count })).join(' / ');
}

const deleteImpactRows = computed(() => {
  const impact = deleteProjectImpact.value;
  if (!impact) {
    return [];
  }

  return [
    { label: t('project.delete.runningTasks'), value: impact.runningTaskCount, danger: impact.runningTaskCount > 0 },
    { label: t('project.delete.runningLocks'), value: impact.runningLockCount, danger: impact.runningLockCount > 0 },
    { label: t('project.delete.lockDetails'), value: formatLockText(impact), danger: impact.runningLockCount > 0 },
    { label: t('project.delete.taskRecords'), value: impact.taskCount },
    { label: t('project.delete.memoryRecords'), value: impact.memoryCount },
    { label: t('project.delete.directory'), value: impact.projectDirectory },
  ];
});

function getDeleteImpactRowClass(row: { danger?: boolean }): string {
  return row.danger
    ? 'border-red-200/80 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
    : 'border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] text-[var(--vt-text-primary)]';
}

async function confirmDeleteProject(project: ProjectSummary): Promise<void> {
  const impactResponse = await window.vtStudio.project.getDeleteImpact({ projectId: project.id });
  if (!isOk(impactResponse)) {
    MessagePlugin.error(impactResponse.msg);
    return;
  }

  deleteFiles.value = false;
  deleteProjectImpact.value = impactResponse.data.impact;
  deleteDialogVisible.value = true;
}

async function openPackageDirectory(packagePath: string): Promise<void> {
  const response = await window.vtStudio.project.openPackageDirectory({ packagePath });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
  }
}

async function exportProjectPackage(project: ProjectSummary): Promise<void> {
  exportingPackageId.value = project.id;
  try {
    const response = await window.vtStudio.project.exportPackage({ projectId: project.id });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('project.package.exported', { name: response.data.packageName }));
    const dialog = DialogPlugin.confirm({
      header: t('project.package.exportDoneTitle'),
      body: t('project.package.exportDoneBody', { path: response.data.packagePath }),
      confirmBtn: t('project.package.openPackage'),
      cancelBtn: t('project.package.close'),
      async onConfirm() {
        await openPackageDirectory(response.data.packagePath);
        dialog.destroy();
      },
    });
  } finally {
    exportingPackageId.value = null;
  }
}

async function importProjectPackage(): Promise<void> {
  const packagePath = importPackagePath.value.trim();
  if (!packagePath) {
    MessagePlugin.warning(t('project.package.pathRequired'));
    return;
  }

  importingPackage.value = true;
  try {
    const response = await window.vtStudio.project.importPackage({ packagePath });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    importDialogVisible.value = false;
    MessagePlugin.success(t('project.package.imported', { name: response.data.project.name }));
    if (response.data.warnings.length > 0) {
      MessagePlugin.warning(response.data.warnings.join(' / '));
    }
    await loadPageState();
  } finally {
    importingPackage.value = false;
  }
}

function getProjectActionOptions(project: ProjectSummary): DropdownOption[] {
  return [
    {
      content: t('project.edit'),
      value: 'edit' satisfies ProjectCardAction,
      prefixIcon: () => h(EditIcon),
    },
    {
      content: t('project.duplicate'),
      value: 'duplicate' satisfies ProjectCardAction,
      prefixIcon: () => h(AddIcon),
    },
    {
      content: t('project.package.importAction'),
      value: 'import' satisfies ProjectCardAction,
      prefixIcon: () => h(UploadIcon),
    },
    {
      content: t('project.package.exportAction'),
      value: 'export' satisfies ProjectCardAction,
      disabled: exportingPackageId.value === project.id,
      prefixIcon: () => h(DownloadIcon),
    },
    {
      content: t('project.delete.action'),
      value: 'delete' satisfies ProjectCardAction,
      theme: 'error',
      prefixIcon: () => h(DeleteIcon),
    },
  ];
}

function handleProjectCardAction(project: ProjectSummary, dropdownItem: DropdownOption, event: MouseEvent): void {
  event.stopPropagation();
  const action = dropdownItem.value as ProjectCardAction;

  if (action === 'edit') {
    openEditDialog(project);
    return;
  }

  if (action === 'duplicate') {
    void duplicateProject(project);
    return;
  }

  if (action === 'import') {
    openImportPackageDialog();
    return;
  }

  if (action === 'export') {
    void exportProjectPackage(project);
    return;
  }

  if (action === 'delete') {
    void confirmDeleteProject(project);
  }
}

async function runDeleteProject(): Promise<void> {
  if (!deleteProjectImpact.value) {
    return;
  }

  deletingProject.value = true;
  try {
    const response = await window.vtStudio.project.delete({
      projectId: deleteProjectImpact.value.projectId,
      deleteFiles: deleteFiles.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    if (currentProjectId.value === deleteProjectImpact.value.projectId) {
      appStore.clearCurrentProject();
      await router.push({ name: 'projects' });
    }
    deleteDialogVisible.value = false;
    deleteProjectImpact.value = null;
    MessagePlugin.success(t(deleteFiles.value ? 'project.message.deletedWithFiles' : 'project.message.deleted'));
    await loadPageState();
  } finally {
    deletingProject.value = false;
  }
}

onMounted(() => {
  void loadPageState();
});

function formatUpdatedAt(updatedAt: number): string {
  return new Date(updatedAt).toLocaleString(locale.value, { hour12: false });
}

function getStats(project: ProjectSummary): ProjectFlowStatsResult | null {
  return projectStats.value[project.id] ?? null;
}

function getStageKey(project: ProjectSummary): string {
  const stats = getStats(project);
  if (!stats || stats.contentCount === 0) {
    return 'content';
  }
  if (stats.selectedVideoTrackCount > 0 && stats.videoTrackCount > 0 && stats.selectedVideoTrackCount === stats.videoTrackCount) {
    return 'export';
  }
  if (stats.videoTrackCount > 0) {
    return 'video';
  }
  if (stats.storyboardImageReadyCount > 0) {
    return 'storyboardImage';
  }
  if (stats.storyboardCount > 0) {
    return 'storyboardTable';
  }
  if (stats.assetCount > 0) {
    return 'assets';
  }
  return 'directorPlan';
}

function getStatusKey(project: ProjectSummary): string {
  const stats = getStats(project);
  if (!stats) {
    return 'missing';
  }
  if (stats.runningTaskCount > 0 || stats.assetImageRunningCount > 0 || stats.storyboardImageRunningCount > 0 || stats.videoRunningCount > 0) {
    return 'running';
  }
  if (stats.failedTaskCount > 0 || stats.assetImageFailedCount > 0 || stats.storyboardImageFailedCount > 0 || stats.videoFailedCount > 0) {
    return 'failed';
  }
  if (stats.contentCount === 0 || stats.storyboardCount === 0 || stats.videoTrackCount === 0) {
    return 'missing';
  }
  return 'normal';
}

function getStatusTheme(project: ProjectSummary): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  const status = getStatusKey(project);
  if (status === 'running') {
    return 'primary';
  }
  if (status === 'failed') {
    return 'danger';
  }
  if (status === 'missing') {
    return 'warning';
  }
  return 'success';
}

function getCompletion(project: ProjectSummary): number {
  const stats = getStats(project);
  if (!stats) {
    return 0;
  }

  const checks = [
    stats.contentCount > 0,
    stats.assetCount > 0,
    stats.storyboardCount > 0,
    stats.storyboardCount > 0 && stats.storyboardImageReadyCount >= stats.storyboardCount,
    stats.videoTrackCount > 0,
    stats.videoTrackCount > 0 && stats.selectedVideoTrackCount >= stats.videoTrackCount,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function getCompletionText(project: ProjectSummary): string {
  const stats = getStats(project);
  if (!stats) {
    return t('project.card.statsLoading');
  }

  return t('project.card.completionValue', {
    assets: stats.assetCount,
    storyboards: stats.storyboardCount,
    images: stats.storyboardImageReadyCount,
    videos: stats.selectedVideoTrackCount,
  });
}
</script>

<template>
  <div class="project-page">
    <section class="project-page-head">
      <div>
        <h3>{{ t('project.title') }}</h3>
        <p>{{ t('project.summary') }}</p>
      </div>
      <div class="project-page-actions">
        <VtButton variant="outline" @click="openImportPackageDialog">
          <template #icon><UploadIcon /></template>
          {{ t('project.package.importAction') }}
        </VtButton>
        <VtButton variant="outline" :loading="loading" @click="loadPageState">
          <template #icon><RefreshIcon /></template>
          {{ t('project.refresh') }}
        </VtButton>
        <VtButton theme="primary" @click="openCreateDialog">
          <template #icon><AddIcon /></template>
          {{ t('project.create') }}
        </VtButton>
      </div>
    </section>

    <section v-if="pageState.projects.length > 0" class="project-card-grid">
      <article v-for="project in pageState.projects" :key="project.id" class="project-card" @click="openProject(project)">
        <div class="project-card-cover">
          <VtEmptyState size="small" />
          <t-tag class="project-card-ratio" size="small" variant="light">{{ project.videoRatio }}</t-tag>
          <t-tag class="project-card-status" size="small" :theme="getStatusTheme(project)" variant="light">
            {{ t(`project.card.status.${getStatusKey(project)}`) }}
          </t-tag>
        </div>
        <div class="project-card-head">
          <div class="project-card-title">
            <strong>{{ project.name }}</strong>
            <small>{{ t(`project.templateType.${project.templateType}`) }} · {{ project.genre }}</small>
          </div>
          <div class="project-card-actions" @click.stop>
            <t-dropdown
              trigger="click"
              placement="bottom-right"
              :options="getProjectActionOptions(project)"
              @click="(dropdownItem, context) => handleProjectCardAction(project, dropdownItem, context.e)"
            >
              <VtButton shape="square" size="small" variant="text" icon-only :aria-label="t('project.moreActions')">
                <template #icon><MoreIcon /></template>
              </VtButton>
            </t-dropdown>
          </div>
        </div>
        <p>{{ project.description }}</p>
        <div class="project-card-progress">
          <div>
            <span>{{ t(`project.card.stage.${getStageKey(project)}`) }}</span>
            <strong>{{ getCompletion(project) }}%</strong>
          </div>
          <t-progress :percentage="getCompletion(project)" :show-info="false" size="small" />
          <small>{{ getCompletionText(project) }}</small>
        </div>
        <div class="project-card-meta">
          <span>{{ t('project.card.imageMeta', { model: project.imageModelLabel, quality: project.imageQuality }) }}</span>
          <span>{{ t('project.card.videoMeta', { model: project.videoModelLabel, mode: project.videoModeLabel, ratio: project.videoRatio }) }}</span>
          <span>{{ t('project.card.visualManualMeta', { name: project.visualManualName }) }}</span>
          <span>{{ t('project.card.directorManualMeta', { name: project.directorManualName }) }}</span>
        </div>
        <div class="project-card-foot">
          <small>{{ formatUpdatedAt(project.updatedAt) }}</small>
          <VtButton size="small" theme="primary" variant="text" @click.stop="openProject(project)">
            <template #icon><FolderOpenIcon /></template>
            {{ t('project.open') }}
          </VtButton>
        </div>
      </article>
    </section>
    <VtEmptyState v-else class="project-empty-state" fill />

    <ProjectFormDialog
      v-model:visible="projectDialogVisible"
      :saving="savingProject"
      :mode="projectDialogMode"
      :project="activeProject"
      :image-models="pageState.imageModels"
      :video-models="pageState.videoModels"
      :visual-manuals="pageState.visualManuals"
      :director-manuals="pageState.directorManuals"
      :image-quality-options="pageState.imageQualityOptions"
      :video-ratio-options="pageState.videoRatioOptions"
      @submit="saveProject"
    />

    <VtDialog
      :visible="importDialogVisible"
      :title="t('project.package.importTitle')"
      width="680px"
      :confirm-text="t('project.package.importConfirm')"
      :cancel-text="t('project.cancel')"
      :confirm-loading="importingPackage"
      @update:visible="(value) => (importDialogVisible = value)"
      @confirm="importProjectPackage"
    >
      <div class="space-y-4">
        <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3 text-sm text-[var(--vt-text-secondary)]">
          {{ t('project.package.importHint') }}
        </div>
        <t-input v-model="importPackagePath" :placeholder="t('project.package.pathPlaceholder')" clearable />
      </div>
    </VtDialog>

    <VtDialog
      :visible="deleteDialogVisible"
      :title="t('project.delete.title')"
      width="720px"
      :confirm-text="t('project.delete.confirmProject')"
      :cancel-text="t('project.cancel')"
      :confirm-loading="deletingProject"
      @update:visible="(value) => (deleteDialogVisible = value)"
      @confirm="runDeleteProject"
    >
      <div v-if="deleteProjectImpact" class="project-delete-dialog space-y-4">
        <div class="rounded-md border border-red-200/80 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <strong class="block text-sm">{{ t('project.delete.summary', { name: deleteProjectImpact.projectName }) }}</strong>
          <span class="mt-1 block">{{ t('project.delete.dangerHint') }}</span>
        </div>
        <dl class="grid gap-2 sm:grid-cols-2">
          <div v-for="row in deleteImpactRows" :key="row.label" class="rounded-md border p-3" :class="getDeleteImpactRowClass(row)">
            <dt class="text-xs font-medium opacity-70">{{ row.label }}</dt>
            <dd class="mt-1 break-words text-sm font-medium">{{ row.value }}</dd>
          </div>
        </dl>
        <t-checkbox v-model="deleteFiles">{{ t('project.delete.files') }}</t-checkbox>
      </div>
    </VtDialog>
  </div>
</template>
