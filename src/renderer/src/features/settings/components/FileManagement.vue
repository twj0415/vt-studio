<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CopyIcon, FolderOpenIcon, RefreshIcon } from 'tdesign-icons-vue-next';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import type {
  FileLifecycleCleanupPayload,
  FileLifecycleDiagnoseResult,
  FileLifecycleIssue,
  FileManagementDirectoryGroup,
  FileManagementDirectoryItem,
  FileRuntimeInfo,
} from '@shared/types/file-management';

interface DirectoryGroupMeta {
  key: FileManagementDirectoryGroup;
  title: string;
  description: string;
}

const GROUPS: DirectoryGroupMeta[] = [
  { key: 'common', title: 'files.groups.common.title', description: 'files.groups.common.description' },
  { key: 'diagnostic', title: 'files.groups.diagnostic.title', description: 'files.groups.diagnostic.description' },
  { key: 'advanced', title: 'files.groups.advanced.title', description: 'files.groups.advanced.description' },
];

const loading = ref(false);
const lifecycleLoading = ref(false);
const cleanupLoading = ref('');
const openingKey = ref('');
const directories = ref<FileManagementDirectoryItem[]>([]);
const runtimeInfo = ref<FileRuntimeInfo | null>(null);
const lifecycle = ref<FileLifecycleDiagnoseResult | null>(null);
const { t } = useI18n();

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

const groupedDirectories = computed(() =>
  GROUPS.map((group) => ({
    ...group,
    items: directories.value.filter((item) => item.group === group.key),
  })),
);

const visibleLifecycleIssues = computed(() => lifecycle.value?.issues.slice(0, 8) ?? []);

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function issueLabel(issue: FileLifecycleIssue): string {
  return t(`files.lifecycle.issue.${issue.type}`);
}

function formatRuntimeKeys(keys: string[]): string {
  return keys.map((key) => t(`files.runtime.directory.${key}`)).join(' / ');
}

async function loadDirectories(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.files.listOpenableDirs();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    directories.value = response.data.directories;
    runtimeInfo.value = response.data.runtime;
  } finally {
    loading.value = false;
  }
}

async function loadLifecycle(): Promise<void> {
  lifecycleLoading.value = true;
  try {
    const response = await window.vtStudio.settings.files.diagnoseLifecycle();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    lifecycle.value = response.data;
  } finally {
    lifecycleLoading.value = false;
  }
}

async function cleanupLifecycle(action: 'orphans' | 'cache' | 'temp'): Promise<void> {
  const payload: FileLifecycleCleanupPayload = {
    includeOrphans: action === 'orphans',
    includeCache: action === 'cache',
    includeTemp: action === 'temp',
  };
  cleanupLoading.value = action;
  try {
    const response = await window.vtStudio.settings.files.cleanupLifecycle(payload);
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    lifecycle.value = response.data.diagnose;
    MessagePlugin.success(t('files.lifecycle.cleaned', { count: response.data.deletedCount, size: formatBytes(response.data.freedBytes) }));
  } finally {
    cleanupLoading.value = '';
  }
}

async function openDirectory(directory: FileManagementDirectoryItem): Promise<void> {
  openingKey.value = directory.key;
  try {
    const response = await window.vtStudio.settings.files.openDir({ key: directory.key });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(response.data.created ? t('files.createdAndOpened', { name: response.data.directory.name }) : t('files.opened', { name: response.data.directory.name }));
    await loadDirectories();
  } finally {
    openingKey.value = '';
  }
}

async function copyDirectoryPath(directory: FileManagementDirectoryItem): Promise<void> {
  try {
    await navigator.clipboard.writeText(directory.path);
    MessagePlugin.success(t('files.pathCopied', { name: directory.name }));
  } catch {
    MessagePlugin.error(t('files.copyPathFailed'));
  }
}

defineExpose({ loadDirectories });
onMounted(() => {
  void loadDirectories();
  void loadLifecycle();
});
</script>

<template>
  <section class="file-management-section">
    <div class="settings-inline-toolbar">
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadDirectories">
          <template #icon><RefreshIcon /></template>
          {{ t('files.refresh') }}
        </t-button>
      </div>
    </div>

    <div class="file-management-warning">
      {{ t('files.warning') }}
    </div>

    <section v-if="runtimeInfo" class="file-runtime-panel">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong class="block text-sm text-[var(--vt-text)]">{{ t('files.runtime.title') }}</strong>
          <p class="mt-1 text-xs text-[var(--vt-text-muted)]">{{ t('files.runtime.hint') }}</p>
        </div>
        <t-tag :theme="runtimeInfo.insideWorkspace ? 'danger' : 'success'" variant="light">
          {{ runtimeInfo.insideWorkspace ? t('files.runtime.insideWorkspace') : t('files.runtime.outsideWorkspace') }}
        </t-tag>
      </div>
      <div class="file-runtime-grid primary">
        <div class="file-runtime-cell">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.runtime.userData') }}</span>
          <strong class="mt-1 block break-all text-sm text-[var(--vt-text)]">{{ runtimeInfo.userData }}</strong>
        </div>
        <div class="file-runtime-cell">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.runtime.source') }}</span>
          <strong class="mt-1 block text-sm text-[var(--vt-text)]">{{ t(`files.runtime.sourceValue.${runtimeInfo.source}`) }}</strong>
          <small class="text-[var(--vt-text-muted)]">{{ t(`files.runtime.mode.${runtimeInfo.mode}`) }}</small>
        </div>
      </div>
      <div class="file-runtime-grid secondary">
        <div class="file-runtime-cell compact">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.runtime.cleanable') }}</span>
          <p class="mt-1 text-sm text-[var(--vt-text)]">{{ formatRuntimeKeys(runtimeInfo.cleanableKeys) }}</p>
        </div>
        <div class="file-runtime-cell compact">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.runtime.recoverable') }}</span>
          <p class="mt-1 text-sm text-[var(--vt-text)]">{{ formatRuntimeKeys(runtimeInfo.recoverableKeys) }}</p>
        </div>
        <div class="file-runtime-cell compact">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.runtime.protected') }}</span>
          <p class="mt-1 text-sm text-[var(--vt-text)]">{{ formatRuntimeKeys(runtimeInfo.protectedKeys) }}</p>
        </div>
      </div>
    </section>

    <section class="file-lifecycle-panel">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong class="block text-sm text-[var(--vt-text)]">{{ t('files.lifecycle.title') }}</strong>
          <p class="mt-1 text-xs text-[var(--vt-text-muted)]">{{ t('files.lifecycle.hint') }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <t-button size="small" variant="outline" :loading="lifecycleLoading" @click="loadLifecycle">
            <template #icon><RefreshIcon /></template>
            {{ t('files.lifecycle.diagnose') }}
          </t-button>
          <t-button size="small" variant="outline" theme="warning" :loading="cleanupLoading === 'orphans'" :disabled="!lifecycle?.summary.orphanProjectFileCount" @click="cleanupLifecycle('orphans')">
            {{ t('files.lifecycle.cleanOrphans') }}
          </t-button>
          <t-button size="small" variant="outline" :loading="cleanupLoading === 'cache'" :disabled="!lifecycle?.summary.cacheFileCount" @click="cleanupLifecycle('cache')">
            {{ t('files.lifecycle.cleanCache') }}
          </t-button>
          <t-button size="small" variant="outline" :loading="cleanupLoading === 'temp'" :disabled="!lifecycle?.summary.tempFileCount" @click="cleanupLifecycle('temp')">
            {{ t('files.lifecycle.cleanTemp') }}
          </t-button>
        </div>
      </div>

      <div v-if="lifecycle" class="file-lifecycle-stats">
        <div class="file-lifecycle-stat">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.lifecycle.referenced') }}</span>
          <strong class="mt-1 block text-base text-[var(--vt-text)]">{{ lifecycle.summary.referencedFileCount }}</strong>
          <small class="text-[var(--vt-text-muted)]">{{ formatBytes(lifecycle.summary.referencedBytes) }}</small>
        </div>
        <div class="file-lifecycle-stat">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.lifecycle.missing') }}</span>
          <strong class="mt-1 block text-base text-[var(--vt-danger)]">{{ lifecycle.summary.missingReferenceCount }}</strong>
        </div>
        <div class="file-lifecycle-stat">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.lifecycle.orphans') }}</span>
          <strong class="mt-1 block text-base text-[var(--vt-text)]">{{ lifecycle.summary.orphanProjectFileCount }}</strong>
          <small class="text-[var(--vt-text-muted)]">{{ formatBytes(lifecycle.summary.orphanBytes) }}</small>
        </div>
        <div class="file-lifecycle-stat">
          <span class="text-xs text-[var(--vt-text-muted)]">{{ t('files.lifecycle.cacheTemp') }}</span>
          <strong class="mt-1 block text-base text-[var(--vt-text)]">{{ lifecycle.summary.cacheFileCount + lifecycle.summary.tempFileCount }}</strong>
          <small class="text-[var(--vt-text-muted)]">{{ formatBytes(lifecycle.summary.cacheBytes + lifecycle.summary.tempBytes) }}</small>
        </div>
      </div>

      <div v-if="visibleLifecycleIssues.length" class="file-lifecycle-issues">
        <div v-for="issue in visibleLifecycleIssues" :key="`${issue.type}-${issue.root}-${issue.relativePath}`" class="file-lifecycle-issue">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <strong class="text-sm text-[var(--vt-text)]">{{ issueLabel(issue) }}</strong>
            <t-tag size="small" :theme="issue.canDelete ? 'warning' : 'danger'" variant="light">{{ issue.canDelete ? t('files.lifecycle.canClean') : t('files.lifecycle.needFix') }}</t-tag>
          </div>
          <p class="mt-1 break-all text-xs text-[var(--vt-text-muted)]">{{ issue.relativePath }}</p>
          <p class="mt-1 text-xs text-[var(--vt-text-muted)]">{{ issue.reason }} · {{ formatBytes(issue.sizeBytes) }}</p>
        </div>
      </div>
    </section>

    <div class="file-management-groups">
      <div v-for="group in groupedDirectories" :key="group.key" class="file-management-group">
        <div class="file-management-group-head">
          <div>
            <strong>{{ t(group.title) }}</strong>
            <p>{{ t(group.description) }}</p>
          </div>
          <t-tag variant="light">{{ t('files.total', { count: group.items.length }) }}</t-tag>
        </div>

        <div class="file-management-grid settings-row-list">
          <div v-for="directory in group.items" :key="directory.key" class="settings-row file-management-card">
            <div class="file-management-card-head settings-row-main">
              <div>
                <span class="settings-row-title">{{ directory.name }}</span>
                <span class="settings-row-note">{{ directory.path }}</span>
              </div>
              <t-tag :theme="directory.exists ? 'success' : 'warning'" variant="light">
                {{ directory.exists ? t('files.exists') : t('files.pending') }}
              </t-tag>
            </div>
            <div class="settings-row-control file-management-card-foot">
              <t-button variant="outline" @click="copyDirectoryPath(directory)">
                <template #icon><CopyIcon /></template>
                {{ t('files.copyPath') }}
              </t-button>
              <t-button theme="primary" variant="outline" :loading="openingKey === directory.key" @click="openDirectory(directory)">
                <template #icon><FolderOpenIcon /></template>
                {{ t('files.open') }}
              </t-button>
            </div>
          </div>
          <t-empty v-if="group.items.length === 0" :description="t('files.empty')" />
        </div>
      </div>
    </div>
  </section>
</template>
