<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { RefreshIcon } from 'tdesign-icons-vue-next';
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
const failDetailTask = ref<TaskListItem | null>(null);
const failDetailVisible = ref(false);
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

function formatRelatedObjects(value: string | null): string {
  if (!value) {
    return '-';
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('，');
    }

    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([key, item]) => `${key}: ${typeof item === 'string' || typeof item === 'number' ? item : JSON.stringify(item)}`)
        .join('，');
    }
  } catch {
    return value;
  }

  return value;
}

function getFailReason(task: TaskListItem): string {
  return task.errorReason?.trim() || t('taskCenter.emptyFailReason');
}

function openFailDetail(task: TaskListItem): void {
  failDetailTask.value = task;
  failReasonCopied.value = false;
  failDetailVisible.value = true;
}

async function copyFailReason(): Promise<void> {
  if (!failDetailTask.value) {
    return;
  }

  await navigator.clipboard.writeText(getFailReason(failDetailTask.value));
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
                <th>{{ t('taskCenter.table.description') }}</th>
                <th>{{ t('taskCenter.table.failReason') }}</th>
                <th>{{ t('taskCenter.table.status') }}</th>
                <th>{{ t('taskCenter.table.startedAt') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in tasks" :key="task.id">
                <td class="text-strong">{{ task.category }}</td>
                <td>{{ task.projectName || '-' }}</td>
                <td class="text-ellipsis">{{ formatRelatedObjects(task.relatedObjects) }}</td>
                <td class="text-ellipsis">{{ task.modelName || '-' }}</td>
                <td class="text-ellipsis">{{ task.description || '-' }}</td>
                <td>
                  <t-button v-if="task.status === 'failed'" size="small" variant="text" theme="danger" @click="openFailDetail(task)">
                    {{ t('taskCenter.failDetail.open') }}
                  </t-button>
                  <span v-else>-</span>
                </td>
                <td>
                  <t-tooltip v-if="task.status === 'failed'" :content="getFailReason(task)">
                    <t-tag :theme="getStatusTheme(task.status)" variant="light">{{ getStatusLabel(task.status) }}</t-tag>
                  </t-tooltip>
                  <t-tag v-else :theme="getStatusTheme(task.status)" variant="light">{{ getStatusLabel(task.status) }}</t-tag>
                </td>
                <td>{{ formatTime(task.startedAt) }}</td>
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
      :visible="failDetailVisible"
      :header="t('taskCenter.failDetail.title')"
      width="720px"
      :confirm-btn="t('taskCenter.failDetail.copy')"
      :cancel-btn="t('taskCenter.failDetail.close')"
      @update:visible="(value) => (failDetailVisible = value)"
      @confirm="copyFailReason"
    >
      <div v-if="failDetailTask" class="space-y-4">
        <dl class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3">
            <dt class="text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.table.category') }}</dt>
            <dd class="mt-1 text-sm font-medium">{{ failDetailTask.category }}</dd>
          </div>
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3">
            <dt class="text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.table.project') }}</dt>
            <dd class="mt-1 text-sm font-medium">{{ failDetailTask.projectName || '-' }}</dd>
          </div>
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3">
            <dt class="text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.table.model') }}</dt>
            <dd class="mt-1 text-sm font-medium">{{ failDetailTask.modelName || '-' }}</dd>
          </div>
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3">
            <dt class="text-xs font-medium text-[var(--vt-text-secondary)]">{{ t('taskCenter.table.startedAt') }}</dt>
            <dd class="mt-1 text-sm font-medium">{{ formatTime(failDetailTask.startedAt) }}</dd>
          </div>
        </dl>
        <div class="rounded-md border border-red-200/80 bg-red-50 p-3 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <p class="text-xs font-medium opacity-80">{{ t('taskCenter.table.failReason') }}</p>
          <pre class="mt-2 whitespace-pre-wrap break-words text-sm">{{ getFailReason(failDetailTask) }}</pre>
        </div>
        <p v-if="failReasonCopied" class="m-0 rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] px-3 py-2 text-sm text-[var(--vt-text-secondary)]">
          {{ t('taskCenter.failDetail.copied') }}
        </p>
      </div>
    </t-dialog>
  </div>
</template>
