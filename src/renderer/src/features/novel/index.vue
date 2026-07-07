<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AddIcon, DeleteIcon, EditIcon, PlayCircleIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import type { TableCol, TableRowData } from 'tdesign-vue-next/es/table';
import VtButton from '@renderer/components/VtButton.vue';
import VtTable from '@renderer/components/VtTable.vue';
import { useAppStore } from '@renderer/stores/app';
import Detail from './components/Detail.vue';
import EditDialog from './components/EditDialog.vue';
import ImportDialog from './components/ImportDialog.vue';
import { useNovelChapters } from './composables/useNovelChapters';
import { DEFAULT_VOLUME_NAME_LABELS } from './constants';
import type { ChapterEditForm, DetailState } from './types';
import { SOURCE_EVENT_STATUS, type SourceChapter, type SourceChapterDraft, type SourceEventStatus } from '@shared/types/source';

const { t } = useI18n();
const appStore = useAppStore();
const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));

const {
  loading,
  importSaving,
  editSaving,
  retryingChapterId,
  chapters,
  selectedChapterIds,
  tablePagination,
  loadChapters,
  handlePageChange,
  handlePageSizeChange,
  handleChapterSelectChange,
  saveImportedChapters,
  saveChapterEdit,
  confirmDeleteChapter,
  confirmBatchDelete,
  startGenerateEvents,
  retryChapterEvent,
} = useNovelChapters(currentProjectId);

const importVisible = ref(false);
const editVisible = ref(false);
const editingChapter = ref<SourceChapter | null>(null);
const detail = ref<DetailState>({
  visible: false,
  title: '',
  content: '',
});

const sourceTableRows = computed<TableRowData[]>(() => chapters.value.map((chapter) => ({ ...chapter })));
const sourceTableColumns = computed<TableCol<TableRowData>[]>(() => [
  {
    colKey: 'row-select',
    type: 'multiple',
    width: 44,
    disabled: ({ row }) => row.eventStatus === SOURCE_EVENT_STATUS.RUNNING,
  },
  { colKey: 'chapter', title: t('source.table.chapter'), width: 220 ,},
  { colKey: 'content', title: t('source.table.content'), width: 330 },
  { colKey: 'event', title: t('source.table.event'), width: 390 },
  { colKey: 'status', title: t('source.table.status'), width: 96 },
  { colKey: 'actions', title: t('source.table.actions'), width: 190 },
]);

function getStatusLabel(status: SourceEventStatus): string {
  return t(`source.status.${status}`);
}

function getStatusTheme(status: SourceEventStatus): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === SOURCE_EVENT_STATUS.RUNNING) {
    return 'primary';
  }

  if (status === SOURCE_EVENT_STATUS.SUCCEEDED) {
    return 'success';
  }

  if (status === SOURCE_EVENT_STATUS.FAILED) {
    return 'danger';
  }

  if (status === SOURCE_EVENT_STATUS.STALE) {
    return 'warning';
  }

  return 'default';
}

function previewText(value: string | null, limit = 80): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return t('source.emptyText');
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function isDefaultVolumeName(volumeName: string): boolean {
  const normalized = volumeName.trim();
  return normalized === '' || normalized === t('source.import.defaultVolumeName') || DEFAULT_VOLUME_NAME_LABELS.includes(normalized as (typeof DEFAULT_VOLUME_NAME_LABELS)[number]);
}

function getChapterDisplayTitle(chapter: SourceChapter): string {
  const title = chapter.chapterTitle.trim() || t('source.import.untitledChapter');
  return t('source.table.chapterTitleFormat', { index: chapter.chapterIndex, title });
}

function getChapterDisplayMeta(chapter: SourceChapter): string {
  const volumeName = chapter.volumeName.trim();
  return isDefaultVolumeName(volumeName) ? '' : volumeName;
}

function openDetail(title: string, content: string | null): void {
  detail.value = {
    visible: true,
    title,
    content: content?.trim() || t('source.emptyText'),
  };
}

function openEditDialog(chapter: SourceChapter): void {
  if (chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING) {
    MessagePlugin.warning(t('source.runningLocked'));
    return;
  }

  editingChapter.value = chapter;
  editVisible.value = true;
}

async function submitImportedChapters(drafts: SourceChapterDraft[]): Promise<void> {
  const saved = await saveImportedChapters(drafts);
  if (saved) {
    importVisible.value = false;
  }
}

async function submitChapterEdit(form: ChapterEditForm): Promise<void> {
  if (!editingChapter.value) {
    return;
  }

  const saved = await saveChapterEdit(editingChapter.value, form);
  if (saved) {
    editVisible.value = false;
    editingChapter.value = null;
  }
}

onMounted(() => {
  void loadChapters();
});
</script>

<template>
  <div class="source-page">
    <VtTable
      class="source-chapter-table"
      :title="t('source.table.title')"
      :columns="sourceTableColumns"
      :data="sourceTableRows"
      :loading="loading"
      :empty-text="t('source.empty')"
      :selected-row-keys="selectedChapterIds"
      :pagination="tablePagination"
      :min-width="1270"
      row-key="id"
      @select-change="handleChapterSelectChange"
      @page-change="handlePageChange"
      @page-size-change="handlePageSizeChange"
    >
      <template #toolbar>
        <div class="source-table-toolbar">
          <VtButton size="small" variant="outline" theme="danger" :disabled="selectedChapterIds.length === 0" @click="confirmBatchDelete">
            <template #icon><DeleteIcon /></template>
            {{ t('source.delete.batch') }}
          </VtButton>
          <VtButton size="small" theme="primary" variant="base" :disabled="selectedChapterIds.length === 0" @click="startGenerateEvents">
            <template #icon><PlayCircleIcon /></template>
            {{ t('source.generate.action') }}
          </VtButton>
          <VtButton size="small" theme="primary" variant="base" @click="importVisible = true">
            <template #icon><AddIcon /></template>
            {{ t('source.import.open') }}
          </VtButton>
        </div>
      </template>

      <template #chapter="{ row }">
        <div class="source-chapter-cell">
          <strong>{{ getChapterDisplayTitle(row) }}</strong>
          <span v-if="getChapterDisplayMeta(row)">{{ getChapterDisplayMeta(row) }}</span>
        </div>
      </template>

      <template #content="{ row }">
        <button class="source-link-button" type="button" @click="openDetail(getChapterDisplayTitle(row), row.content)">
          {{ previewText(row.content) }}
        </button>
      </template>

      <template #event="{ row }">
        <button v-if="row.eventStatus === SOURCE_EVENT_STATUS.FAILED" class="source-link-button is-danger" type="button" @click="openDetail(t('source.detail.errorTitle'), row.eventError)">
          {{ previewText(row.eventError) }}
        </button>
        <button v-else class="source-link-button" type="button" @click="openDetail(t('source.detail.eventTitle'), row.eventSummary)">
          {{ previewText(row.eventSummary) }}
        </button>
      </template>

      <template #status="{ row }">
        <t-tag :theme="getStatusTheme(row.eventStatus)" variant="light">{{ getStatusLabel(row.eventStatus) }}</t-tag>
      </template>

      <template #actions="{ row }">
        <div class="source-row-actions">
          <VtButton size="small" variant="outline" :disabled="row.eventStatus === SOURCE_EVENT_STATUS.RUNNING" @click="openEditDialog(row)">
            <template #icon><EditIcon /></template>
            {{ t('source.edit.action') }}
          </VtButton>
          <VtButton
            v-if="row.eventStatus === SOURCE_EVENT_STATUS.FAILED"
            size="small"
            theme="warning"
            variant="outline"
            :loading="retryingChapterId === row.id"
            @click="retryChapterEvent(row)"
          >
            <template #icon><PlayCircleIcon /></template>
            {{ t('source.generate.retry') }}
          </VtButton>
          <VtButton size="small" variant="outline" :disabled="row.eventStatus === SOURCE_EVENT_STATUS.RUNNING" @click="confirmDeleteChapter(row)">
            <template #icon><DeleteIcon /></template>
            {{ t('source.delete.action') }}
          </VtButton>
        </div>
      </template>
    </VtTable>

    <ImportDialog v-model:visible="importVisible" :saving="importSaving" @save="submitImportedChapters" />

    <EditDialog v-model:visible="editVisible" :chapter="editingChapter" :saving="editSaving" @save="submitChapterEdit" />

    <Detail v-model:visible="detail.visible" :title="detail.title" :content="detail.content" />
  </div>
</template>
