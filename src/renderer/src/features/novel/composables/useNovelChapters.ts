import { computed, onUnmounted, reactive, ref, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import type { SelectOptions, TableRowData } from 'tdesign-vue-next/es/table';
import { PAGE_SIZE_OPTIONS, POLL_INTERVAL } from '../constants';
import type { ChapterEditForm } from '../types';
import { SOURCE_EVENT_STATUS, type SourceChapter, type SourceChapterDraft } from '@shared/types/source';

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

export function useNovelChapters(currentProjectId: ComputedRef<number>) {
  const { t } = useI18n();

  const loading = ref(false);
  const importSaving = ref(false);
  const editSaving = ref(false);
  const retryingChapterId = ref<number | null>(null);
  const chapters = ref<SourceChapter[]>([]);
  const total = ref(0);
  const selectedChapterIds = ref<number[]>([]);
  const pagination = reactive({
    page: 1,
    limit: 10,
  });

  let pollTimer: number | null = null;

  const runningChapterIds = computed(() => chapters.value.filter((chapter) => chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING).map((chapter) => chapter.id));
  const tablePagination = computed(() => ({
    current: pagination.page,
    pageSize: pagination.limit,
    total: total.value,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  }));

  function clearPollTimer(): void {
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function replaceChapter(updated: SourceChapter): void {
    const index = chapters.value.findIndex((chapter) => chapter.id === updated.id);
    if (index >= 0) {
      chapters.value[index] = updated;
    }
  }

  function schedulePoll(): void {
    clearPollTimer();
    if (runningChapterIds.value.length === 0 || !currentProjectId.value) {
      return;
    }

    pollTimer = window.setTimeout(() => {
      void pollEventStatus();
    }, POLL_INTERVAL);
  }

  async function pollEventStatus(): Promise<void> {
    const ids = runningChapterIds.value;
    if (ids.length === 0 || !currentProjectId.value) {
      clearPollTimer();
      return;
    }

    const response = await window.vtStudio.source.pollEventStatus({
      projectId: currentProjectId.value,
      chapterIds: ids,
    });

    if (isOk(response)) {
      response.data.chapters.forEach(replaceChapter);
    }

    schedulePoll();
  }

  async function loadChapters(options: { keepDataOnError?: boolean } = {}): Promise<void> {
    if (!currentProjectId.value) {
      chapters.value = [];
      total.value = 0;
      selectedChapterIds.value = [];
      clearPollTimer();
      return;
    }

    loading.value = true;

    try {
      const response = await window.vtStudio.source.list({
        projectId: currentProjectId.value,
        page: pagination.page,
        limit: pagination.limit,
        chapterKeyword: null,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        if (!options.keepDataOnError) {
          chapters.value = [];
          total.value = 0;
        }
        return;
      }

      chapters.value = response.data.data;
      total.value = response.data.total;
      pagination.page = response.data.page;
      pagination.limit = response.data.limit;
      selectedChapterIds.value = selectedChapterIds.value.filter((id) => chapters.value.some((chapter) => chapter.id === id));
      schedulePoll();
    } finally {
      loading.value = false;
    }
  }

  async function handlePageChange(page: number): Promise<void> {
    pagination.page = page;
    await loadChapters({ keepDataOnError: true });
  }

  async function handlePageSizeChange(limit: number): Promise<void> {
    pagination.limit = limit;
    pagination.page = 1;
    await loadChapters({ keepDataOnError: true });
  }

  function handleChapterSelectChange(keys: Array<string | number>, _options: SelectOptions<TableRowData>): void {
    const selectableIds = new Set(
      chapters.value
        .filter((chapter) => chapter.eventStatus !== SOURCE_EVENT_STATUS.RUNNING)
        .map((chapter) => chapter.id),
    );
    selectedChapterIds.value = keys
      .map((key) => Number(key))
      .filter((id) => Number.isFinite(id) && selectableIds.has(id));
  }

  async function saveImportedChapters(drafts: SourceChapterDraft[]): Promise<boolean> {
    if (!currentProjectId.value) {
      MessagePlugin.warning(t('source.noProject'));
      return false;
    }

    if (drafts.length === 0) {
      MessagePlugin.warning(t('source.import.noSelection'));
      return false;
    }

    importSaving.value = true;
    try {
      const response = await window.vtStudio.source.import({
        projectId: currentProjectId.value,
        chapters: drafts,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return false;
      }

      const chapterIds = response.data.chapters.map((chapter) => chapter.id);
      const eventResponse = await window.vtStudio.source.generateEvents({
        projectId: currentProjectId.value,
        chapterIds,
      });
      if (!isOk(eventResponse)) {
        MessagePlugin.warning(eventResponse.msg);
      } else {
        MessagePlugin.success(t('source.import.savedAndAnalyzing'));
      }

      pagination.page = 1;
      await loadChapters();
      return true;
    } finally {
      importSaving.value = false;
    }
  }

  async function saveChapterEdit(chapter: SourceChapter, form: ChapterEditForm): Promise<boolean> {
    if (!currentProjectId.value) {
      return false;
    }

    editSaving.value = true;
    try {
      const contentChanged = chapter.content.trim() !== form.content.trim();
      const response = await window.vtStudio.source.updateChapter({
        projectId: currentProjectId.value,
        chapterId: chapter.id,
        volumeName: form.volumeName,
        chapterTitle: form.chapterTitle,
        content: form.content,
        eventSummary: form.eventSummary,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return false;
      }

      MessagePlugin.success(contentChanged ? t('source.edit.savedAndStale') : t('source.edit.saved'));
      replaceChapter(response.data.chapter);
      return true;
    } finally {
      editSaving.value = false;
    }
  }

  async function runDeleteChapters(chapterIds: number[]): Promise<void> {
    if (!currentProjectId.value || chapterIds.length === 0) {
      return;
    }

    const response = chapterIds.length === 1
      ? await window.vtStudio.source.deleteChapter({ projectId: currentProjectId.value, chapterId: chapterIds[0]! })
      : await window.vtStudio.source.deleteChapters({ projectId: currentProjectId.value, chapterIds });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('source.delete.deleted'));
    selectedChapterIds.value = selectedChapterIds.value.filter((id) => !chapterIds.includes(id));
    if (chapters.value.length <= response.data.deletedCount && pagination.page > 1) {
      pagination.page -= 1;
    }
    await loadChapters();
  }

  function confirmDeleteChapter(chapter: SourceChapter): void {
    if (chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING) {
      MessagePlugin.warning(t('source.runningLocked'));
      return;
    }

    const dialog = DialogPlugin.confirm({
      header: t('source.delete.singleTitle'),
      body: t('source.delete.singleBody', { title: chapter.chapterTitle }),
      confirmBtn: t('source.delete.confirm'),
      cancelBtn: t('source.cancel'),
      theme: 'danger',
      async onConfirm() {
        await runDeleteChapters([chapter.id]);
        dialog.destroy();
      },
    });
  }

  function confirmBatchDelete(): void {
    if (selectedChapterIds.value.length === 0) {
      MessagePlugin.warning(t('source.delete.noSelection'));
      return;
    }

    const dialog = DialogPlugin.confirm({
      header: t('source.delete.batchTitle'),
      body: t('source.delete.batchBody', { count: selectedChapterIds.value.length }),
      confirmBtn: t('source.delete.confirm'),
      cancelBtn: t('source.cancel'),
      theme: 'danger',
      async onConfirm() {
        await runDeleteChapters([...selectedChapterIds.value]);
        dialog.destroy();
      },
    });
  }

  async function startGenerateEvents(): Promise<void> {
    if (!currentProjectId.value) {
      MessagePlugin.warning(t('source.noProject'));
      return;
    }

    if (selectedChapterIds.value.length === 0) {
      MessagePlugin.warning(t('source.generate.noSelection'));
      return;
    }

    const dialog = DialogPlugin.confirm({
      header: t('source.generate.title'),
      body: t('source.generate.body', { count: selectedChapterIds.value.length }),
      confirmBtn: t('source.generate.confirm'),
      cancelBtn: t('source.cancel'),
      theme: 'warning',
      async onConfirm() {
        const response = await window.vtStudio.source.generateEvents({
          projectId: currentProjectId.value,
          chapterIds: [...selectedChapterIds.value],
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        selectedChapterIds.value = [];
        MessagePlugin.success(t('source.generate.started'));
        dialog.destroy();
        await loadChapters({ keepDataOnError: true });
      },
    });
  }

  async function retryChapterEvent(chapter: SourceChapter): Promise<void> {
    if (!currentProjectId.value) {
      MessagePlugin.warning(t('source.noProject'));
      return;
    }
    if (chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING) {
      MessagePlugin.warning(t('source.runningLocked'));
      return;
    }

    retryingChapterId.value = chapter.id;
    try {
      const response = await window.vtStudio.source.generateEvents({
        projectId: currentProjectId.value,
        chapterIds: [chapter.id],
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }

      MessagePlugin.success(t('source.generate.retryStarted'));
      await loadChapters({ keepDataOnError: true });
    } finally {
      retryingChapterId.value = null;
    }
  }

  onUnmounted(clearPollTimer);

  return {
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
  };
}
