<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AddIcon, DeleteIcon, EditIcon, PlayCircleIcon, RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import VtFilePicker from '@renderer/components/VtFilePicker.vue';
import WorkflowNextStepHint from '@renderer/features/shared/WorkflowNextStepHint.vue';
import { useAppStore } from '@renderer/stores/app';
import { SOURCE_EVENT_STATUS, type SourceChapter, type SourceChapterDraft, type SourceEventStatus } from '@shared/types/source';

interface DraftChapter extends SourceChapterDraft {
  tempId: string;
}

const DEFAULT_CHAPTER_REG = '/第\\s*([0-9０-９零一二三四五六七八九十百千万]+)\\s*[章回节]\\s*([^\\n\\r]*)/g';
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const POLL_INTERVAL = 3000;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

const { t } = useI18n();
const appStore = useAppStore();
const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));

const loading = ref(false);
const refreshing = ref(false);
const retryingChapterId = ref<number | null>(null);
const chapters = ref<SourceChapter[]>([]);
const total = ref(0);
const selectedChapterIds = ref<number[]>([]);
const pageSizeOptions = [10, 20, 50, 100];
const filters = reactive({
  keyword: '',
});
const pagination = reactive({
  page: 1,
  limit: 10,
});

const importVisible = ref(false);
const importStep = ref<'input' | 'preview'>('input');
const importSaving = ref(false);
const sourceText = ref('');
const draftChapters = ref<DraftChapter[]>([]);
const selectedDraftIds = ref<string[]>([]);
const parseError = ref('');
const chapterReg = ref(DEFAULT_CHAPTER_REG);

const editVisible = ref(false);
const editSaving = ref(false);
const editingChapter = ref<SourceChapter | null>(null);
const editForm = reactive({
  volumeName: t('source.import.defaultVolumeName'),
  chapterTitle: '',
  content: '',
  eventSummary: '',
});

const detailVisible = ref(false);
const detailTitle = ref('');
const detailContent = ref('');

let pollTimer: number | null = null;

const rangeText = computed(() => {
  if (total.value === 0) {
    return t('source.pagination.empty');
  }

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(total.value, pagination.page * pagination.limit);
  return t('source.pagination.range', { start, end, total: total.value });
});

const selectedImportChapters = computed(() => draftChapters.value.filter((chapter) => selectedDraftIds.value.includes(chapter.tempId)));
const selectedImportChars = computed(() => selectedImportChapters.value.reduce((sum, chapter) => sum + chapter.content.length, 0));
const runningChapterIds = computed(() => chapters.value.filter((chapter) => chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING).map((chapter) => chapter.id));
const selectableChapters = computed(() => chapters.value.filter((chapter) => chapter.eventStatus !== SOURCE_EVENT_STATUS.RUNNING));
const isCurrentPageAllSelected = computed(() => selectableChapters.value.length > 0 && selectableChapters.value.every((chapter) => selectedChapterIds.value.includes(chapter.id)));
const selectedCountText = computed(() => t('source.selection.count', { count: selectedChapterIds.value.length }));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function clearPollTimer(): void {
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
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

function replaceChapter(updated: SourceChapter): void {
  const index = chapters.value.findIndex((chapter) => chapter.id === updated.id);
  if (index >= 0) {
    chapters.value[index] = updated;
  }
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

function buildListPayload() {
  return {
    projectId: currentProjectId.value,
    page: pagination.page,
    limit: pagination.limit,
    chapterKeyword: filters.keyword || null,
  };
}

async function loadBusinessSettings(): Promise<void> {
  const response = await window.vtStudio.settings.business.get();
  if (isOk(response)) {
    chapterReg.value = response.data.config.chapterReg || DEFAULT_CHAPTER_REG;
  }
}

async function loadChapters(options: { keepDataOnError?: boolean; asRefresh?: boolean } = {}): Promise<void> {
  if (!currentProjectId.value) {
    chapters.value = [];
    total.value = 0;
    selectedChapterIds.value = [];
    clearPollTimer();
    return;
  }

  if (options.asRefresh) {
    refreshing.value = true;
  } else {
    loading.value = true;
  }

  try {
    const response = await window.vtStudio.source.list(buildListPayload());
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
    refreshing.value = false;
  }
}

async function refreshChapters(): Promise<void> {
  await loadChapters({ keepDataOnError: true, asRefresh: true });
}

async function searchChapters(): Promise<void> {
  pagination.page = 1;
  await loadChapters();
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

function createChapterRegex(value: string): RegExp {
  const normalized = value.trim() || DEFAULT_CHAPTER_REG;
  const slashPattern = normalized.match(/^\/([\s\S]*)\/([a-z]*)$/i);
  if (slashPattern) {
    const [, pattern, flags] = slashPattern;
    return new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  }

  return new RegExp(normalized, 'g');
}

function getDefaultVolumeName(): string {
  return t('source.import.defaultVolumeName');
}

function resolveVolumeName(content: string, index: number): string {
  const volumeRegex = /^(第[\d一二三四五六七八九十百千]+卷)\s*([^\n第]*)/gm;
  let volume = getDefaultVolumeName();
  let match: RegExpExecArray | null;
  while ((match = volumeRegex.exec(content)) !== null) {
    if (match.index > index) {
      break;
    }

    volume = `${match[1]}${match[2]?.trim() ? ` ${match[2].trim()}` : ''}`;
  }

  return volume;
}

function parseSourceText(): void {
  parseError.value = '';
  const content = sourceText.value.replace(/\r\n/g, '\n').trim();
  if (!content) {
    draftChapters.value = [];
    selectedDraftIds.value = [];
    return;
  }

  try {
    const regex = createChapterRegex(chapterReg.value);
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      matches.push(match);
      if (match.index === regex.lastIndex) {
        regex.lastIndex += 1;
      }
    }

    const parsed = matches.map((item, index) => {
      const next = matches[index + 1];
      const start = item.index + item[0].length;
      const end = next ? next.index : content.length;
      const chapterContent = content.slice(start, end).trim();
      const chapterTitle = item[0].replace(/\s+/g, ' ').trim() || t('source.import.untitledChapter');
      return {
        tempId: `draft-${index + 1}-${item.index}`,
        volumeName: resolveVolumeName(content, item.index),
        chapterTitle,
        content: chapterContent,
      };
    }).filter((chapter) => chapter.content);

    draftChapters.value = parsed.length > 0
      ? parsed
      : [
          {
            tempId: 'draft-fulltext',
            volumeName: getDefaultVolumeName(),
            chapterTitle: t('source.import.fullTextChapter'),
            content,
          },
        ];
    selectedDraftIds.value = draftChapters.value.map((chapter) => chapter.tempId);
  } catch (error) {
    draftChapters.value = [];
    selectedDraftIds.value = [];
    parseError.value = error instanceof Error ? error.message : t('source.import.parseFailed');
  }
}

function openImportDialog(): void {
  importVisible.value = true;
  importStep.value = 'input';
  sourceText.value = '';
  draftChapters.value = [];
  selectedDraftIds.value = [];
  parseError.value = '';
}

function closeImportDialog(): void {
  importVisible.value = false;
}

function findZipEndOfCentralDirectory(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }

  throw new Error(t('source.import.docxParseFailed'));
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(t('source.import.docxParseFailed'));
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function extractZipEntry(buffer: ArrayBuffer, entryName: string): Promise<string> {
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');
  const eocdOffset = findZipEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error(t('source.import.docxParseFailed'));
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileNameBytes = new Uint8Array(buffer, offset + 46, fileNameLength);
    const fileName = decoder.decode(fileNameBytes);

    if (fileName === entryName) {
      if (view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_FILE_HEADER) {
        throw new Error(t('source.import.docxParseFailed'));
      }

      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataStart, compressedSize);
      const content = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
      if (!content) {
        throw new Error(t('source.import.docxParseFailed'));
      }

      return decoder.decode(content);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(t('source.import.docxParseFailed'));
}

function docxXmlToText(xml: string): string {
  const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = Array.from(documentXml.getElementsByTagName('w:p'));
  const lines = paragraphs.map((paragraph) => Array.from(paragraph.getElementsByTagName('w:t')).map((node) => node.textContent ?? '').join('')).filter((line) => line.trim());
  return lines.join('\n');
}

async function readDocxFile(file: File): Promise<string> {
  const xml = await extractZipEntry(await file.arrayBuffer(), 'word/document.xml');
  const text = docxXmlToText(xml);
  if (!text.trim()) {
    throw new Error(t('source.import.docxParseFailed'));
  }

  return text;
}

async function handleImportFile(files: File[]): Promise<void> {
  const file = files[0];
  if (!file) {
    return;
  }

  const lowerName = file.name.toLowerCase();
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    MessagePlugin.error(t('source.import.fileTooLarge'));
    return;
  }

  if (lowerName.endsWith('.doc')) {
    MessagePlugin.error(t('source.import.docUnsupported'));
    return;
  }

  if (lowerName.endsWith('.docx')) {
    try {
      sourceText.value = await readDocxFile(file);
      parseSourceText();
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : t('source.import.docxParseFailed'));
    }
    return;
  }

  if (file.type !== 'text/plain' && !lowerName.endsWith('.txt')) {
    MessagePlugin.error(t('source.import.unsupportedFile'));
    return;
  }

  sourceText.value = await file.text();
  parseSourceText();
}

function goImportPreview(): void {
  parseSourceText();
  if (parseError.value) {
    MessagePlugin.error(parseError.value);
    return;
  }

  if (draftChapters.value.length === 0) {
    MessagePlugin.warning(t('source.import.emptyParsed'));
    return;
  }

  importStep.value = 'preview';
}

function toggleDraftSelection(tempId: string): void {
  selectedDraftIds.value = selectedDraftIds.value.includes(tempId)
    ? selectedDraftIds.value.filter((id) => id !== tempId)
    : [...selectedDraftIds.value, tempId];
}

function toggleAllDrafts(): void {
  selectedDraftIds.value = selectedDraftIds.value.length === draftChapters.value.length ? [] : draftChapters.value.map((chapter) => chapter.tempId);
}

async function saveImportedChapters(): Promise<void> {
  if (!currentProjectId.value) {
    MessagePlugin.warning(t('source.noProject'));
    return;
  }

  const selected = selectedImportChapters.value;
  if (selected.length === 0) {
    MessagePlugin.warning(t('source.import.noSelection'));
    return;
  }

  importSaving.value = true;
  try {
    const response = await window.vtStudio.source.import({
      projectId: currentProjectId.value,
      chapters: selected.map(({ volumeName, chapterTitle, content }) => ({ volumeName, chapterTitle, content })),
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
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

    importVisible.value = false;
    pagination.page = 1;
    await loadChapters();
  } finally {
    importSaving.value = false;
  }
}

function isSelected(id: number): boolean {
  return selectedChapterIds.value.includes(id);
}

function toggleChapterSelection(chapter: SourceChapter): void {
  if (chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING) {
    return;
  }

  selectedChapterIds.value = isSelected(chapter.id)
    ? selectedChapterIds.value.filter((id) => id !== chapter.id)
    : [...selectedChapterIds.value, chapter.id];
}

function toggleCurrentPageSelection(): void {
  if (isCurrentPageAllSelected.value) {
    const currentIds = new Set(selectableChapters.value.map((chapter) => chapter.id));
    selectedChapterIds.value = selectedChapterIds.value.filter((id) => !currentIds.has(id));
    return;
  }

  selectedChapterIds.value = Array.from(new Set([...selectedChapterIds.value, ...selectableChapters.value.map((chapter) => chapter.id)]));
}

function clearChapterSelection(): void {
  selectedChapterIds.value = [];
}

function openDetail(title: string, content: string | null): void {
  detailTitle.value = title;
  detailContent.value = content?.trim() || t('source.emptyText');
  detailVisible.value = true;
}

function openEditDialog(chapter: SourceChapter): void {
  if (chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING) {
    MessagePlugin.warning(t('source.runningLocked'));
    return;
  }

  editingChapter.value = chapter;
  editForm.volumeName = chapter.volumeName;
  editForm.chapterTitle = chapter.chapterTitle;
  editForm.content = chapter.content;
  editForm.eventSummary = chapter.eventSummary ?? '';
  editVisible.value = true;
}

async function saveChapterEdit(): Promise<void> {
  if (!currentProjectId.value || !editingChapter.value) {
    return;
  }

  editSaving.value = true;
  try {
    const contentChanged = editingChapter.value.content.trim() !== editForm.content.trim();
    const response = await window.vtStudio.source.updateChapter({
      projectId: currentProjectId.value,
      chapterId: editingChapter.value.id,
      volumeName: editForm.volumeName,
      chapterTitle: editForm.chapterTitle,
      content: editForm.content,
      eventSummary: editForm.eventSummary,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(contentChanged ? t('source.edit.savedAndStale') : t('source.edit.saved'));
    editVisible.value = false;
    replaceChapter(response.data.chapter);
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

watch(sourceText, () => {
  if (importVisible.value && importStep.value === 'input') {
    parseSourceText();
  }
});

onMounted(() => {
  void loadBusinessSettings();
  void loadChapters();
});

onUnmounted(() => {
  clearPollTimer();
});
</script>

<template>
  <div class="source-page">
    <section class="source-page-head">
      <div>
        <p class="eyebrow">{{ t('common.project') }}</p>
        <h3>{{ t('source.title') }}</h3>
        <p>{{ t('source.summary') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" :loading="refreshing" @click="refreshChapters">
          <template #icon><RefreshIcon /></template>
          {{ t('source.refresh') }}
        </t-button>
        <t-button theme="primary" @click="openImportDialog">
          <template #icon><AddIcon /></template>
          {{ t('source.import.open') }}
        </t-button>
      </div>
    </section>

    <WorkflowNextStepHint hint-key="source" next-route-name="script-agent" />

    <section class="source-toolbar">
      <label>
        <span>{{ t('source.filters.chapter') }}</span>
        <t-input v-model="filters.keyword" :placeholder="t('source.filters.chapterPlaceholder')" clearable @enter="searchChapters" />
      </label>
      <div class="source-toolbar-actions">
        <t-button variant="outline" @click="searchChapters">
          <template #icon><SearchIcon /></template>
          {{ t('source.search') }}
        </t-button>
        <t-button variant="outline" :disabled="selectedChapterIds.length === 0" @click="confirmBatchDelete">
          <template #icon><DeleteIcon /></template>
          {{ t('source.delete.batch') }}
        </t-button>
        <t-button theme="primary" :disabled="selectedChapterIds.length === 0" @click="startGenerateEvents">
          <template #icon><PlayCircleIcon /></template>
          {{ t('source.generate.action') }}
        </t-button>
      </div>
    </section>

    <section v-if="selectedChapterIds.length > 0" class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-3">
      <div>
        <strong class="text-sm text-[var(--vt-text-primary)]">{{ selectedCountText }}</strong>
        <p class="mt-1 text-xs text-[var(--vt-text-secondary)]">{{ t('source.selection.hint') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <t-button size="small" variant="outline" @click="clearChapterSelection">{{ t('source.selection.clear') }}</t-button>
        <t-button size="small" variant="outline" theme="danger" @click="confirmBatchDelete">
          <template #icon><DeleteIcon /></template>
          {{ t('source.delete.batch') }}
        </t-button>
        <t-button size="small" theme="primary" @click="startGenerateEvents">
          <template #icon><PlayCircleIcon /></template>
          {{ t('source.generate.action') }}
        </t-button>
      </div>
    </section>

    <section class="source-table-section">
      <div class="source-table-head">
        <div>
          <strong>{{ t('source.table.title') }}</strong>
          <p>{{ rangeText }}</p>
        </div>
        <t-tag v-if="runningChapterIds.length > 0" theme="primary" variant="light">{{ t('source.runningCount', { count: runningChapterIds.length }) }}</t-tag>
      </div>

      <t-loading :loading="loading">
        <div class="source-table-wrap">
          <table class="source-table">
            <thead>
              <tr>
                <th>
                  <t-checkbox :checked="isCurrentPageAllSelected" :disabled="selectableChapters.length === 0" @change="toggleCurrentPageSelection" />
                </th>
                <th>{{ t('source.table.index') }}</th>
                <th>{{ t('source.table.volume') }}</th>
                <th>{{ t('source.table.chapter') }}</th>
                <th>{{ t('source.table.content') }}</th>
                <th>{{ t('source.table.event') }}</th>
                <th>{{ t('source.table.status') }}</th>
                <th>{{ t('source.table.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="chapter in chapters" :key="chapter.id">
                <td>
                  <t-checkbox :checked="isSelected(chapter.id)" :disabled="chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING" @change="toggleChapterSelection(chapter)" />
                </td>
                <td class="text-strong">{{ chapter.chapterIndex }}</td>
                <td class="text-ellipsis">{{ chapter.volumeName }}</td>
                <td class="text-ellipsis">{{ chapter.chapterTitle }}</td>
                <td>
                  <button class="source-link-button" type="button" @click="openDetail(chapter.chapterTitle, chapter.content)">
                    {{ previewText(chapter.content) }}
                  </button>
                </td>
                <td>
                  <button v-if="chapter.eventStatus === SOURCE_EVENT_STATUS.FAILED" class="source-link-button is-danger" type="button" @click="openDetail(t('source.detail.errorTitle'), chapter.eventError)">
                    {{ previewText(chapter.eventError) }}
                  </button>
                  <button v-else class="source-link-button" type="button" @click="openDetail(t('source.detail.eventTitle'), chapter.eventSummary)">
                    {{ previewText(chapter.eventSummary) }}
                  </button>
                </td>
                <td>
                  <t-tag :theme="getStatusTheme(chapter.eventStatus)" variant="light">{{ getStatusLabel(chapter.eventStatus) }}</t-tag>
                </td>
                <td>
                  <div class="source-row-actions">
                    <t-button size="small" variant="outline" :disabled="chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING" @click="openEditDialog(chapter)">
                      <template #icon><EditIcon /></template>
                      {{ t('source.edit.action') }}
                    </t-button>
                    <t-button
                      v-if="chapter.eventStatus === SOURCE_EVENT_STATUS.FAILED"
                      size="small"
                      theme="warning"
                      variant="outline"
                      :loading="retryingChapterId === chapter.id"
                      @click="retryChapterEvent(chapter)"
                    >
                      <template #icon><PlayCircleIcon /></template>
                      {{ t('source.generate.retry') }}
                    </t-button>
                    <t-button size="small" variant="outline" :disabled="chapter.eventStatus === SOURCE_EVENT_STATUS.RUNNING" @click="confirmDeleteChapter(chapter)">
                      <template #icon><DeleteIcon /></template>
                      {{ t('source.delete.action') }}
                    </t-button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <t-empty v-if="!loading && chapters.length === 0" :description="t('source.empty')" />
      </t-loading>

      <div class="source-pagination">
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

    <t-dialog :visible="importVisible" :header="t('source.import.title')" width="920px" :footer="false" @update:visible="(value) => (importVisible = value)">
      <div class="source-import-dialog">
        <div class="source-step-row">
          <t-tag :theme="importStep === 'input' ? 'primary' : 'default'" variant="light">1. {{ t('source.import.stepInput') }}</t-tag>
          <t-tag :theme="importStep === 'preview' ? 'primary' : 'default'" variant="light">2. {{ t('source.import.stepPreview') }}</t-tag>
        </div>

        <div v-if="importStep === 'input'" class="source-import-input">
          <div class="source-upload-panel">
            <div>
              <strong>{{ t('source.import.fileTitle') }}</strong>
            <p>{{ t('source.import.fileHint') }}</p>
          </div>
            <VtFilePicker
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              :label="t('source.import.pickFile')"
              @change="handleImportFile"
            />
          </div>
          <t-textarea v-model="sourceText" class="source-import-textarea" :placeholder="t('source.import.placeholder')" :autosize="{ minRows: 12, maxRows: 18 }" />
          <div class="source-import-meta">
            <span>{{ t('source.import.charCount', { count: sourceText.length }) }}</span>
            <span>{{ t('source.import.parsedCount', { count: draftChapters.length }) }}</span>
            <span v-if="parseError" class="is-danger">{{ parseError }}</span>
          </div>
          <div class="source-dialog-footer">
            <t-button variant="outline" @click="closeImportDialog">{{ t('source.cancel') }}</t-button>
            <t-button theme="primary" :disabled="draftChapters.length === 0" @click="goImportPreview">{{ t('source.import.next') }}</t-button>
          </div>
        </div>

        <div v-else class="source-import-preview">
          <div class="source-import-preview-head">
            <div>
              <strong>{{ t('source.import.previewTitle') }}</strong>
              <p>{{ t('source.import.selectedInfo', { count: selectedDraftIds.length, chars: selectedImportChars }) }}</p>
            </div>
            <t-button variant="outline" @click="toggleAllDrafts">{{ selectedDraftIds.length === draftChapters.length ? t('source.import.unselectAll') : t('source.import.selectAll') }}</t-button>
          </div>
          <div class="source-draft-list">
            <button v-for="chapter in draftChapters" :key="chapter.tempId" class="source-draft-item" :class="{ selected: selectedDraftIds.includes(chapter.tempId) }" type="button" @click="toggleDraftSelection(chapter.tempId)">
              <t-checkbox :checked="selectedDraftIds.includes(chapter.tempId)" @click.stop @change="toggleDraftSelection(chapter.tempId)" />
              <div>
                <strong>{{ chapter.chapterTitle }}</strong>
                <span>{{ chapter.volumeName }} · {{ chapter.content.length }} {{ t('source.import.charsUnit') }}</span>
                <p>{{ previewText(chapter.content, 120) }}</p>
              </div>
            </button>
          </div>
          <div class="source-dialog-footer">
            <t-button variant="outline" @click="importStep = 'input'">{{ t('source.import.back') }}</t-button>
            <t-button theme="primary" :loading="importSaving" :disabled="selectedDraftIds.length === 0" @click="saveImportedChapters">{{ t('source.import.save') }}</t-button>
          </div>
        </div>
      </div>
    </t-dialog>

    <t-dialog :visible="editVisible" :header="t('source.edit.title')" width="820px" :confirm-btn="t('source.save')" :cancel-btn="t('source.cancel')" :confirm-loading="editSaving" @update:visible="(value) => (editVisible = value)" @confirm="saveChapterEdit">
      <div class="source-edit-form">
        <label>
          <span>{{ t('source.edit.volume') }}</span>
          <t-input v-model="editForm.volumeName" />
        </label>
        <label>
          <span>{{ t('source.edit.chapter') }}</span>
          <t-input v-model="editForm.chapterTitle" />
        </label>
        <label>
          <span>{{ t('source.edit.content') }}</span>
          <t-textarea v-model="editForm.content" :autosize="{ minRows: 8, maxRows: 14 }" />
        </label>
        <label>
          <span>{{ t('source.edit.event') }}</span>
          <t-textarea v-model="editForm.eventSummary" :autosize="{ minRows: 5, maxRows: 10 }" />
        </label>
      </div>
    </t-dialog>

    <t-dialog :visible="detailVisible" :header="detailTitle" width="760px" :footer="false" @update:visible="(value) => (detailVisible = value)">
      <pre class="source-detail-content">{{ detailContent }}</pre>
    </t-dialog>
  </div>
</template>
