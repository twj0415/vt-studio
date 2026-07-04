<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AddIcon, DeleteIcon, DownloadIcon, EditIcon, FolderOpenIcon, RefreshIcon, UploadIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import ProjectFormDialog from './components/ProjectFormDialog.vue';
import ManualFormDialog from './components/ManualFormDialog.vue';
import { useAppStore } from '@renderer/stores/app';
import { PROJECT_IMAGE_QUALITY_VALUES, PROJECT_VIDEO_RATIO_VALUES } from '@shared/constants/dictionaries';
import type {
  ProjectDeleteImpact,
  ProjectManualDetail,
  ProjectManualKind,
  ProjectPageStateResult,
  ProjectSavePayload,
  ProjectSummary,
} from '@shared/types/project';

const router = useRouter();
const { t, locale } = useI18n();
const appStore = useAppStore();
const loading = ref(false);
const savingProject = ref(false);
const savingManual = ref(false);
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

const manualDialogVisible = ref(false);
const manualKind = ref<ProjectManualKind>('visual');
const activeManual = ref<ProjectManualDetail | null>(null);

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
  } finally {
    loading.value = false;
  }
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
        sourceType: response.data.project.sourceType,
      });
    }
    await loadPageState();
  } finally {
    savingProject.value = false;
  }
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

function openCreateManual(kind: ProjectManualKind): void {
  manualKind.value = kind;
  activeManual.value = {
    id: 0,
    kind,
    name: '',
    path: '',
    coverRelativePath: null,
    coverUrl: null,
    referenceCount: 0,
    updatedAt: Date.now(),
    tabs: [],
  };
  manualDialogVisible.value = true;
}

async function openEditManual(kind: ProjectManualKind, id: number): Promise<void> {
  const response = await window.vtStudio.project.getManual({ kind, id });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }

  manualKind.value = kind;
  activeManual.value = response.data.manual;
  manualDialogVisible.value = true;
}

async function submitManual(payload: Parameters<typeof window.vtStudio.project.saveManual>[0]): Promise<void> {
  savingManual.value = true;
  try {
    const response = await window.vtStudio.project.saveManual(payload);
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t(payload.kind === 'visual' ? 'project.message.visualManualSaved' : 'project.message.directorManualSaved'));
    manualDialogVisible.value = false;
    await loadPageState();
  } finally {
    savingManual.value = false;
  }
}

async function deleteManual(kind: ProjectManualKind, id: number): Promise<void> {
  const dialog = DialogPlugin.confirm({
    header: t(kind === 'visual' ? 'project.delete.visualManualTitle' : 'project.delete.directorManualTitle'),
    body: t('project.delete.manualBody'),
    confirmBtn: t('project.delete.confirmManual'),
    cancelBtn: t('project.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.project.deleteManual({ kind, id });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }

      MessagePlugin.success(t(kind === 'visual' ? 'project.message.visualManualDeleted' : 'project.message.directorManualDeleted'));
      dialog.destroy();
      await loadPageState();
    },
  });
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
</script>

<template>
  <div class="project-page">
    <section class="project-page-head">
      <div>
        <p class="eyebrow">{{ t('common.global') }}</p>
        <h3>{{ t('project.title') }}</h3>
        <p>{{ t('project.summary') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" @click="openImportPackageDialog">
          <template #icon><UploadIcon /></template>
          {{ t('project.package.importAction') }}
        </t-button>
        <t-button variant="outline" :loading="loading" @click="loadPageState">
          <template #icon><RefreshIcon /></template>
          {{ t('project.refresh') }}
        </t-button>
        <t-button theme="primary" @click="openCreateDialog">
          <template #icon><AddIcon /></template>
          {{ t('project.create') }}
        </t-button>
      </div>
    </section>

    <section class="project-card-grid">
      <article v-for="project in pageState.projects" :key="project.id" class="project-card" @click="openProject(project)">
        <div class="project-card-head">
          <div>
            <strong>{{ project.name }}</strong>
            <small>{{ t(`project.sourceType.${project.sourceType}`) }} · {{ project.genre }}</small>
          </div>
          <div class="project-card-actions">
            <t-button size="small" variant="outline" @click.stop="openEditDialog(project)">
              <template #icon><EditIcon /></template>
              {{ t('project.edit') }}
            </t-button>
            <t-button size="small" variant="outline" :loading="exportingPackageId === project.id" @click.stop="exportProjectPackage(project)">
              <template #icon><DownloadIcon /></template>
              {{ t('project.package.exportAction') }}
            </t-button>
            <t-button size="small" variant="outline" @click.stop="confirmDeleteProject(project)">
              <template #icon><DeleteIcon /></template>
              {{ t('project.delete.action') }}
            </t-button>
          </div>
        </div>
        <p>{{ project.description }}</p>
        <div class="project-card-meta">
          <span>{{ t('project.card.imageMeta', { model: project.imageModelLabel, quality: project.imageQuality }) }}</span>
          <span>{{ t('project.card.videoMeta', { model: project.videoModelLabel, mode: project.videoModeLabel, ratio: project.videoRatio }) }}</span>
          <span>{{ t('project.card.visualManualMeta', { name: project.visualManualName }) }}</span>
          <span>{{ t('project.card.directorManualMeta', { name: project.directorManualName }) }}</span>
        </div>
        <div class="project-card-foot">
          <small>{{ formatUpdatedAt(project.updatedAt) }}</small>
          <t-button size="small" theme="primary" variant="text">
            <template #icon><FolderOpenIcon /></template>
            {{ t('project.open') }}
          </t-button>
        </div>
      </article>
      <t-empty v-if="pageState.projects.length === 0" :description="t('project.empty')" />
    </section>

    <section class="project-manual-section">
      <div class="project-manual-head">
        <div>
          <strong>{{ t('project.manual.visual') }}</strong>
          <p>{{ t('project.manual.visualSummary') }}</p>
        </div>
        <t-button theme="primary" variant="outline" @click="openCreateManual('visual')">{{ t('project.manual.addVisual') }}</t-button>
      </div>
      <div class="project-manual-grid">
        <article v-for="manual in pageState.visualManuals" :key="`visual-${manual.id}`" class="project-manual-card">
          <div class="project-manual-card-head">
            <div>
              <strong>{{ manual.name }}</strong>
              <small>{{ manual.path }}</small>
            </div>
            <t-tag variant="light">{{ t('project.manual.referenceCount', { count: manual.referenceCount }) }}</t-tag>
          </div>
          <img v-if="manual.coverUrl" :src="manual.coverUrl" :alt="t('project.manual.coverAlt')" class="project-manual-cover" />
          <div class="project-card-actions">
            <t-button size="small" variant="outline" @click="openEditManual('visual', manual.id)">{{ t('project.edit') }}</t-button>
            <t-button size="small" variant="outline" @click="deleteManual('visual', manual.id)">{{ t('project.delete.action') }}</t-button>
          </div>
        </article>
      </div>
    </section>

    <section class="project-manual-section">
      <div class="project-manual-head">
        <div>
          <strong>{{ t('project.manual.director') }}</strong>
          <p>{{ t('project.manual.directorSummary') }}</p>
        </div>
        <t-button theme="primary" variant="outline" @click="openCreateManual('director')">{{ t('project.manual.addDirector') }}</t-button>
      </div>
      <div class="project-manual-grid">
        <article v-for="manual in pageState.directorManuals" :key="`director-${manual.id}`" class="project-manual-card">
          <div class="project-manual-card-head">
            <div>
              <strong>{{ manual.name }}</strong>
              <small>{{ manual.path }}</small>
            </div>
            <t-tag variant="light">{{ t('project.manual.referenceCount', { count: manual.referenceCount }) }}</t-tag>
          </div>
          <img v-if="manual.coverUrl" :src="manual.coverUrl" :alt="t('project.manual.coverAlt')" class="project-manual-cover" />
          <div class="project-card-actions">
            <t-button size="small" variant="outline" @click="openEditManual('director', manual.id)">{{ t('project.edit') }}</t-button>
            <t-button size="small" variant="outline" @click="deleteManual('director', manual.id)">{{ t('project.delete.action') }}</t-button>
          </div>
        </article>
      </div>
    </section>

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

    <ManualFormDialog
      v-model:visible="manualDialogVisible"
      :saving="savingManual"
      :kind="manualKind"
      :manual="activeManual"
      @submit="submitManual"
    />

    <t-dialog
      :visible="importDialogVisible"
      :header="t('project.package.importTitle')"
      width="680px"
      :confirm-btn="t('project.package.importConfirm')"
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
    </t-dialog>

    <t-dialog
      :visible="deleteDialogVisible"
      :header="t('project.delete.title')"
      width="720px"
      :confirm-btn="t('project.delete.confirmProject')"
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
    </t-dialog>
  </div>
</template>
