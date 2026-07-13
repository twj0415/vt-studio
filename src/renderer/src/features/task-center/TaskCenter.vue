<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { RefreshIcon } from 'tdesign-icons-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import { useVtRequest } from '@renderer/composables/useVtRequest';
import type { TaskListItem, TaskProjectOption, TaskStatus } from '@shared/types/task';

const { t } = useI18n();
const route = useRoute();
const loading = ref(false);
const refreshing = ref(false);
const optionLoading = ref(false);
const tasks = ref<TaskListItem[]>([]);
const total = ref(0);
const projectOptions = ref<TaskProjectOption[]>([]);
const categoryOptions = ref<string[]>([]);
const taskDetailTask = ref<TaskListItem | null>(null);
const taskDetailVisible = ref(false);
const failReasonCopied = ref(false);

const filters = reactive({
  projectId: '',
  category: '',
  status: '' as '' | TaskStatus,
});

const pagination = reactive({
  page: 1,
  limit: 10,
});

const pageSizeOptions = [10, 20, 50, 100];
const MODEL_DIAGNOSTIC_KEYS = ['modelDiagnostics'] as const;
const MODEL_DIAGNOSTIC_STATUS_VALUES = ['running', 'returned', 'parse_failed', 'normalized', 'failed'] as const;
const RELATED_OBJECT_LABEL_KEYS: Record<string, string> = {
  projectId: 'taskCenter.relatedObjects.project',
  contentId: 'taskCenter.relatedObjects.content',
  contentIds: 'taskCenter.relatedObjects.contents',
  assetId: 'taskCenter.relatedObjects.asset',
  assetIds: 'taskCenter.relatedObjects.assets',
  mediaId: 'taskCenter.relatedObjects.resourceImage',
  storyboardId: 'taskCenter.relatedObjects.storyboard',
  storyboardIds: 'taskCenter.relatedObjects.storyboards',
  trackId: 'taskCenter.relatedObjects.videoTrack',
  trackIds: 'taskCenter.relatedObjects.videoTracks',
  videoId: 'taskCenter.relatedObjects.video',
  videoIds: 'taskCenter.relatedObjects.videos',
  draftName: 'taskCenter.relatedObjects.draftName',
  copyAssets: 'taskCenter.relatedObjects.copyAssets',
  manuals: 'taskCenter.relatedObjects.manuals',
  modelCall: 'taskCenter.relatedObjects.modelCall',
  action: 'taskCenter.relatedObjects.action',
  messageId: 'taskCenter.relatedObjects.message',
};
const taskRequest = useVtRequest({ loading });
const refreshRequest = useVtRequest({ loading: refreshing });
const optionRequest = useVtRequest();
const statusOptions: Array<{ value: '' | TaskStatus; labelKey: string }> = [
  { value: '', labelKey: 'taskCenter.filters.allStatuses' },
  { value: 'waiting', labelKey: 'taskCenter.status.waiting' },
  { value: 'running', labelKey: 'taskCenter.status.running' },
  { value: 'succeeded', labelKey: 'taskCenter.status.succeeded' },
  { value: 'failed', labelKey: 'taskCenter.status.failed' },
  { value: 'cancelled', labelKey: 'taskCenter.status.cancelled' },
];
const summaryStatusValues: TaskStatus[] = ['waiting', 'running', 'succeeded', 'failed', 'cancelled'];

interface TaskModelDiagnostics {
  requestId?: string;
  modelKey?: string;
  status?: string;
  rawText?: string;
  toolCalls?: unknown;
  toolResults?: unknown;
  parsed?: unknown;
  error?: string;
  recordedAt?: number;
}

type TaskRelatedObjectMap = Record<string, unknown> & {
  modelDiagnostics?: TaskModelDiagnostics;
};

const rangeText = computed(() => {
  if (total.value === 0) {
    return t('taskCenter.pagination.empty');
  }

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(total.value, pagination.page * pagination.limit);
  return t('taskCenter.pagination.range', { start, end, total: total.value });
});

const taskStatusSummary = computed(() => summaryStatusValues.map((status) => ({
  status,
  label: getStatusLabel(status),
  count: tasks.value.filter((task) => task.status === status).length,
  theme: getStatusTheme(status),
})));

const taskModelDiagnostics = computed(() => (taskDetailTask.value ? getTaskModelDiagnostics(taskDetailTask.value) : null));

function toProjectId(value: string): number | null {
  if (!value) {
    return null;
  }

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function readSingleQuery(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '';
}

function isKnownTaskStatus(value: string): value is TaskStatus {
  return summaryStatusValues.includes(value as TaskStatus);
}

function applyRouteQueryFilters(): boolean {
  const nextProjectId = readSingleQuery(route.query.projectId);
  const nextCategory = readSingleQuery(route.query.category);
  const nextStatusValue = readSingleQuery(route.query.status);
  const nextStatus = isKnownTaskStatus(nextStatusValue) ? nextStatusValue : '';
  const nextPageValue = Number(readSingleQuery(route.query.page));
  const nextPage = Number.isInteger(nextPageValue) && nextPageValue > 0 ? nextPageValue : 1;
  const changed =
    filters.projectId !== nextProjectId ||
    filters.category !== nextCategory ||
    filters.status !== nextStatus ||
    pagination.page !== nextPage;

  filters.projectId = nextProjectId;
  filters.category = nextCategory;
  filters.status = nextStatus;
  pagination.page = nextPage;

  return changed;
}

function buildPayload() {
  return {
    page: pagination.page,
    limit: pagination.limit,
    projectId: toProjectId(filters.projectId),
    category: filters.category || null,
    status: filters.status || null,
  };
}

async function loadTasks(options: { keepDataOnError?: boolean; asRefresh?: boolean } = {}): Promise<void> {
  const data = await (options.asRefresh ? refreshRequest : taskRequest).run(() => window.vtStudio.task.list(buildPayload()));
  if (!data) {
    if (!options.keepDataOnError) {
      tasks.value = [];
      total.value = 0;
    }
    return;
  }

  tasks.value = data.data;
  total.value = data.total;
  pagination.page = data.page;
  pagination.limit = data.limit;
}

async function loadProjectOptions(): Promise<void> {
  const data = await optionRequest.run(() => window.vtStudio.task.projectOptions(), { lock: false });
  if (!data) {
    projectOptions.value = [];
    return;
  }

  projectOptions.value = data.projects;
}

async function loadCategoryOptions(): Promise<void> {
  const data = await optionRequest.run(() => window.vtStudio.task.categoryOptions({
    projectId: toProjectId(filters.projectId),
  }), { lock: false });
  if (!data) {
    categoryOptions.value = [];
    return;
  }

  categoryOptions.value = data.categories;
  if (filters.category && !categoryOptions.value.includes(filters.category)) {
    filters.category = '';
  }
}

async function loadOptions(): Promise<void> {
  optionLoading.value = true;
  try {
    await Promise.all([loadProjectOptions(), loadCategoryOptions()]);
  } finally {
    optionLoading.value = false;
  }
}

async function initialize(): Promise<void> {
  applyRouteQueryFilters();
  await loadOptions();
  await loadTasks();
}

async function refreshTasks(): Promise<void> {
  await loadTasks({ keepDataOnError: true, asRefresh: true });
}

async function handleProjectChange(): Promise<void> {
  pagination.page = 1;
  await loadCategoryOptions();
  await loadTasks();
}

async function handleFilterChange(): Promise<void> {
  pagination.page = 1;
  await loadTasks();
}

async function handlePageChange(page: number): Promise<void> {
  pagination.page = page;
  await loadTasks({ keepDataOnError: true });
}

async function handlePageSizeChange(limit: number): Promise<void> {
  pagination.limit = limit;
  pagination.page = 1;
  await loadTasks({ keepDataOnError: true });
}

function getStatusLabel(status: TaskStatus): string {
  return t(`taskCenter.status.${status}`);
}

function getStatusTheme(status: TaskStatus): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === 'running') {
    return 'primary';
  }

  if (status === 'succeeded') {
    return 'success';
  }

  if (status === 'failed') {
    return 'danger';
  }

  if (status === 'cancelled') {
    return 'warning';
  }

  return 'default';
}

function formatTime(value: number | null): string {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function parseRelatedObjects(value: string | null): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasInternalRelatedKey(value: string): boolean {
  const normalized = value.toLowerCase();
  return (normalized.includes('script') && normalized.includes('id')) || (normalized.includes('source') && normalized.includes('type'));
}

function getRelatedObjectLabel(key: string): string {
  const labelKey = RELATED_OBJECT_LABEL_KEYS[key];
  if (labelKey) {
    return t(labelKey);
  }

  const normalizedKey = key.toLowerCase();
  if (normalizedKey.includes('source') && normalizedKey.includes('type')) {
    return t('taskCenter.relatedObjects.source');
  }

  if (hasInternalRelatedKey(key) || normalizedKey.includes('content')) {
    return t('taskCenter.relatedObjects.content');
  }

  return t('taskCenter.relatedObjects.item');
}

function formatRelatedValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '-';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? t('taskCenter.relatedObjects.yes') : t('taskCenter.relatedObjects.no');
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return t('taskCenter.relatedObjects.empty');
    }

    if (value.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return value.map(String).join('，');
    }

    return t('taskCenter.relatedObjects.count', { count: value.length });
  }

  if (isPlainObject(value)) {
    const requestId = value.requestId;
    if (typeof requestId === 'string' && requestId.trim()) {
      return t('taskCenter.relatedObjects.request', { requestId });
    }

    return t('taskCenter.relatedObjects.count', { count: Object.keys(value).length });
  }

  return String(value);
}

function formatRelatedObjects(value: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = parseRelatedObjects(value);
  if (Array.isArray(parsed)) {
    return parsed.map(formatRelatedValue).join('，');
  }

  if (isPlainObject(parsed)) {
    const entries = Object.entries(parsed).filter(([key]) => !MODEL_DIAGNOSTIC_KEYS.includes(key as (typeof MODEL_DIAGNOSTIC_KEYS)[number]));
    if (entries.length === 0) {
      return '-';
    }

    return entries.map(([key, item]) => `${getRelatedObjectLabel(key)}: ${formatRelatedValue(item)}`).join('，');
  }

  if (typeof parsed === 'string') {
    return hasInternalRelatedKey(parsed) ? t('taskCenter.relatedObjects.rawText') : value;
  }

  return value;
}

function getTaskRelatedObjectMap(task: TaskListItem): TaskRelatedObjectMap | null {
  const parsed = parseRelatedObjects(task.relatedObjects);
  return isPlainObject(parsed) ? (parsed as TaskRelatedObjectMap) : null;
}

function getTaskModelDiagnostics(task: TaskListItem): TaskModelDiagnostics | null {
  const diagnostics = getTaskRelatedObjectMap(task)?.modelDiagnostics;
  return isPlainObject(diagnostics) ? diagnostics : null;
}

function stringifyDiagnosticValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '-';
  }

  if (typeof value === 'string') {
    return value || '-';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getDiagnosticStatusLabel(status: string | undefined): string {
  if (!status) {
    return '-';
  }

  return MODEL_DIAGNOSTIC_STATUS_VALUES.includes(status as (typeof MODEL_DIAGNOSTIC_STATUS_VALUES)[number])
    ? t(`taskCenter.modelDiagnostics.status.${status}`)
    : status;
}

function getTaskDescription(task: TaskListItem): string {
  return task.description?.trim() || '-';
}

function getFailReason(task: TaskListItem): string {
  return task.errorReason?.trim() || t('taskCenter.emptyFailReason');
}

function openTaskDetail(task: TaskListItem): void {
  taskDetailTask.value = task;
  failReasonCopied.value = false;
  taskDetailVisible.value = true;
}

async function copyFailReason(): Promise<void> {
  if (!taskDetailTask.value) {
    return;
  }

  await navigator.clipboard.writeText(getFailReason(taskDetailTask.value));
  failReasonCopied.value = true;
}

onMounted(() => {
  void initialize();
});

watch(
  () => route.query,
  async () => {
    if (!applyRouteQueryFilters()) {
      return;
    }

    await loadCategoryOptions();
    await loadTasks();
  },
);
</script>

<template>
  <div class="task-center-page">
    <section class="task-center-head">
      <div>
        <p class="eyebrow">{{ t('common.global') }}</p>
        <h3>{{ t('taskCenter.title') }}</h3>
        <p>{{ t('taskCenter.summary') }}</p>
      </div>
      <t-button variant="outline" :loading="refreshing" @click="refreshTasks">
        <template #icon><RefreshIcon /></template>
        {{ t('taskCenter.refresh') }}
      </t-button>
    </section>

    <section class="task-filter-bar">
      <label>
        <span>{{ t('taskCenter.filters.project') }}</span>
        <t-select v-model="filters.projectId" :loading="optionLoading" @change="handleProjectChange">
          <t-option value="" :label="t('taskCenter.filters.allProjects')" />
          <t-option v-for="project in projectOptions" :key="project.id" :value="String(project.id)" :label="project.name" />
        </t-select>
      </label>

      <label>
        <span>{{ t('taskCenter.filters.category') }}</span>
        <t-select v-model="filters.category" :loading="optionLoading" @change="handleFilterChange">
          <t-option value="" :label="t('taskCenter.filters.allCategories')" />
          <t-option v-for="category in categoryOptions" :key="category" :value="category" :label="category" />
        </t-select>
      </label>

      <label>
        <span>{{ t('taskCenter.filters.status') }}</span>
        <t-select v-model="filters.status" @change="handleFilterChange">
          <t-option v-for="option in statusOptions" :key="option.value || 'all'" :value="option.value" :label="t(option.labelKey)" />
        </t-select>
      </label>
    </section>

    <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" :aria-label="t('taskCenter.statusSummary.label')">
      <div
        v-for="item in taskStatusSummary"
        :key="item.status"
        class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-3"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-[var(--vt-text-secondary)]">{{ item.label }}</span>
          <t-tag :theme="item.theme" variant="light">{{ item.count }}</t-tag>
        </div>
      </div>
    </section>

    <section class="task-table-section">
      <div class="task-table-head">
        <div>
          <strong>{{ t('taskCenter.table.title') }}</strong>
          <p>{{ rangeText }}</p>
        </div>
      </div>

      <t-loading :loading="loading">
        <div class="task-table-wrap">
          <table class="task-table">
            <thead>
              <tr>
                <th>{{ t('taskCenter.table.category') }}</th>
                <th>{{ t('taskCenter.table.project') }}</th>
                <th>{{ t('taskCenter.table.relatedObjects') }}</th>
                <th>{{ t('taskCenter.table.model') }}</th>
                <th>{{ t('taskCenter.table.status') }}</th>
                <th>{{ t('taskCenter.table.startedAt') }}</th>
                <th>{{ t('taskCenter.table.action') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in tasks" :key="task.id">
                <td class="text-strong">{{ task.category }}</td>
                <td>{{ task.projectName || '-' }}</td>
                <td class="text-ellipsis">{{ formatRelatedObjects(task.relatedObjects) }}</td>
                <td class="text-ellipsis">{{ task.modelName || '-' }}</td>
                <td>
                  <t-tooltip v-if="task.status === 'failed'" :content="getFailReason(task)">
                    <t-tag :theme="getStatusTheme(task.status)" variant="light">{{ getStatusLabel(task.status) }}</t-tag>
                  </t-tooltip>
                  <t-tag v-else :theme="getStatusTheme(task.status)" variant="light">{{ getStatusLabel(task.status) }}</t-tag>
                </td>
                <td>{{ formatTime(task.startedAt) }}</td>
                <td>
                  <VtButton size="small" variant="text" :min-width="0" @click="openTaskDetail(task)">
                    {{ t('taskCenter.detail.open') }}
                  </VtButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <t-empty v-if="!loading && tasks.length === 0" :description="t('taskCenter.empty')" />
      </t-loading>

      <div class="task-pagination">
        <t-pagination
          v-model:current="pagination.page"
          v-model:page-size="pagination.limit"
          :total="total"
          :page-size-options="pageSizeOptions"
          @current-change="handlePageChange"
          @page-size-change="handlePageSizeChange"
        />
      </div>
    </section>

    <t-dialog
      :visible="taskDetailVisible"
      :header="t('taskCenter.detail.title')"
      width="820px"
      :footer="false"
      @update:visible="(value) => (taskDetailVisible = value)"
    >
      <div v-if="taskDetailTask" class="max-h-[72vh] space-y-4 overflow-auto pr-1">
        <section>
          <h4 class="m-0 mb-2 text-sm font-semibold text-[var(--vt-text-primary)]">{{ t('taskCenter.detail.basicTitle') }}</h4>
          <t-descriptions bordered size="small" :column="2">
            <t-descriptions-item :label="t('taskCenter.detail.taskId')">
              <span class="font-mono text-xs">#{{ taskDetailTask.id }}</span>
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.table.status')">
              <t-tag :theme="getStatusTheme(taskDetailTask.status)" variant="light">{{ getStatusLabel(taskDetailTask.status) }}</t-tag>
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.table.category')">
              {{ taskDetailTask.category }}
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.table.project')">
              {{ taskDetailTask.projectName || '-' }}
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.table.model')" :span="2">
              <span class="break-words font-mono text-xs">{{ taskDetailTask.modelName || '-' }}</span>
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.table.relatedObjects')" :span="2">
              <span class="break-words">{{ formatRelatedObjects(taskDetailTask.relatedObjects) }}</span>
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.table.startedAt')">
              {{ formatTime(taskDetailTask.startedAt) }}
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.detail.finishedAt')">
              {{ formatTime(taskDetailTask.finishedAt) }}
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.detail.createdAt')">
              {{ formatTime(taskDetailTask.createdAt) }}
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.detail.updatedAt')">
              {{ formatTime(taskDetailTask.updatedAt) }}
            </t-descriptions-item>
          </t-descriptions>
        </section>

        <section>
          <h4 class="m-0 mb-2 text-sm font-semibold text-[var(--vt-text-primary)]">{{ t('taskCenter.detail.descriptionTitle') }}</h4>
          <pre class="m-0 max-h-[220px] min-h-[44px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-3 text-sm leading-6 text-[var(--vt-text-primary)]">{{ getTaskDescription(taskDetailTask) }}</pre>
        </section>

        <section v-if="taskDetailTask.status === 'failed'">
          <div class="mb-2 flex items-center justify-between gap-3">
            <h4 class="m-0 text-sm font-semibold text-[var(--vt-text-primary)]">{{ t('taskCenter.table.failReason') }}</h4>
            <VtButton size="small" variant="outline" :min-width="0" @click="copyFailReason">{{ t('taskCenter.detail.copyFailReason') }}</VtButton>
          </div>
          <pre class="m-0 max-h-[220px] min-h-[44px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-red-200/80 bg-red-50 p-3 text-sm leading-6 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{{ getFailReason(taskDetailTask) }}</pre>
        </section>

        <section v-if="taskModelDiagnostics">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 class="m-0 text-sm font-semibold text-[var(--vt-text-primary)]">{{ t('taskCenter.modelDiagnostics.title') }}</h4>
              <p class="m-0 mt-1 text-xs text-[var(--vt-text-secondary)]">{{ t('taskCenter.modelDiagnostics.hint') }}</p>
            </div>
            <t-tag variant="light">{{ getDiagnosticStatusLabel(taskModelDiagnostics.status) }}</t-tag>
          </div>
          <t-descriptions bordered size="small" :column="3">
            <t-descriptions-item :label="t('taskCenter.modelDiagnostics.requestId')">
              <span class="font-mono text-xs">{{ taskModelDiagnostics.requestId || '-' }}</span>
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.modelDiagnostics.modelKey')">
              <span class="font-mono text-xs">{{ taskModelDiagnostics.modelKey || '-' }}</span>
            </t-descriptions-item>
            <t-descriptions-item :label="t('taskCenter.modelDiagnostics.recordedAt')">
              {{ formatTime(taskModelDiagnostics.recordedAt || null) }}
            </t-descriptions-item>
          </t-descriptions>
          <div class="mt-3">
            <p class="m-0 text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.modelDiagnostics.rawText') }}</p>
            <pre class="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-3 text-xs leading-5 text-[var(--vt-text-primary)]">{{ stringifyDiagnosticValue(taskModelDiagnostics.rawText) }}</pre>
          </div>
          <details class="mt-3">
            <summary class="cursor-pointer text-sm font-medium text-[var(--vt-text-primary)]">{{ t('taskCenter.modelDiagnostics.more') }}</summary>
            <div class="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p class="m-0 text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.modelDiagnostics.parsed') }}</p>
                <pre class="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-3 text-xs leading-5 text-[var(--vt-text-primary)]">{{ stringifyDiagnosticValue(taskModelDiagnostics.parsed) }}</pre>
              </div>
              <div>
                <p class="m-0 text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.modelDiagnostics.toolCalls') }}</p>
                <pre class="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-3 text-xs leading-5 text-[var(--vt-text-primary)]">{{ stringifyDiagnosticValue(taskModelDiagnostics.toolCalls) }}</pre>
              </div>
              <div>
                <p class="m-0 text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.modelDiagnostics.toolResults') }}</p>
                <pre class="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-3 text-xs leading-5 text-[var(--vt-text-primary)]">{{ stringifyDiagnosticValue(taskModelDiagnostics.toolResults) }}</pre>
              </div>
              <div>
                <p class="m-0 text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.modelDiagnostics.error') }}</p>
                <pre class="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-3 text-xs leading-5 text-[var(--vt-text-primary)]">{{ stringifyDiagnosticValue(taskModelDiagnostics.error) }}</pre>
              </div>
            </div>
          </details>
        </section>

        <p v-if="failReasonCopied" class="m-0 mt-3 rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] px-3 py-2 text-sm text-[var(--vt-text-secondary)]">
          {{ t('taskCenter.detail.copied') }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <VtButton variant="outline" @click="taskDetailVisible = false">{{ t('taskCenter.detail.close') }}</VtButton>
        </div>
      </div>
    </t-dialog>
  </div>
</template>
