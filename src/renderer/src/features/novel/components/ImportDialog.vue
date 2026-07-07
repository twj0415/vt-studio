<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtFilePicker from '@renderer/components/VtFilePicker.vue';
import { readDocxText } from '@renderer/utils/docx-text';
import { DEFAULT_CHAPTER_REG, MAX_IMPORT_FILE_SIZE } from '../constants';
import type { DraftChapter } from '../types';
import type { SourceChapterDraft } from '@shared/types/source';

const props = defineProps<{
  visible: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  save: [chapters: SourceChapterDraft[]];
}>();

const { t } = useI18n();

const importStep = ref<'input' | 'preview'>('input');
const sourceText = ref('');
const draftChapters = ref<DraftChapter[]>([]);
const selectedDraftIds = ref<string[]>([]);
const parseError = ref('');
const chapterReg = ref(DEFAULT_CHAPTER_REG);

const selectedImportChapters = computed(() => draftChapters.value.filter((chapter) => selectedDraftIds.value.includes(chapter.tempId)));
const selectedImportChars = computed(() => selectedImportChapters.value.reduce((sum, chapter) => sum + chapter.content.length, 0));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

async function loadBusinessSettings(): Promise<void> {
  const response = await window.vtStudio.settings.business.get();
  if (isOk(response)) {
    chapterReg.value = response.data.config.chapterReg || DEFAULT_CHAPTER_REG;
  }
}

function resetImportState(): void {
  importStep.value = 'input';
  sourceText.value = '';
  draftChapters.value = [];
  selectedDraftIds.value = [];
  parseError.value = '';
}

function closeDialog(): void {
  emit('update:visible', false);
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
      sourceText.value = await readDocxText(file, t('source.import.docxParseFailed'));
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

function previewText(value: string | null, limit = 80): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return t('source.emptyText');
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function saveSelectedChapters(): void {
  const selected = selectedImportChapters.value;
  if (selected.length === 0) {
    MessagePlugin.warning(t('source.import.noSelection'));
    return;
  }

  emit('save', selected.map(({ volumeName, chapterTitle, content }) => ({ volumeName, chapterTitle, content })));
}

watch(sourceText, () => {
  if (props.visible && importStep.value === 'input') {
    parseSourceText();
  }
});

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetImportState();
      void loadBusinessSettings();
    }
  },
  { immediate: true },
);
</script>

<template>
  <VtDialog :visible="visible" :title="t('source.import.title')" width="920px" :footer="false" @update:visible="(value) => emit('update:visible', value)">
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
          <VtButton size="small" variant="outline" @click="closeDialog">{{ t('source.cancel') }}</VtButton>
          <VtButton size="small" theme="primary" variant="base" :disabled="draftChapters.length === 0" @click="goImportPreview">{{ t('source.import.next') }}</VtButton>
        </div>
      </div>

      <div v-else class="source-import-preview">
        <div class="source-import-preview-head">
          <div>
            <strong>{{ t('source.import.previewTitle') }}</strong>
            <p>{{ t('source.import.selectedInfo', { count: selectedDraftIds.length, chars: selectedImportChars }) }}</p>
          </div>
          <VtButton size="small" variant="outline" @click="toggleAllDrafts">{{ selectedDraftIds.length === draftChapters.length ? t('source.import.unselectAll') : t('source.import.selectAll') }}</VtButton>
        </div>
        <div class="source-draft-list">
          <div
            v-for="chapter in draftChapters"
            :key="chapter.tempId"
            class="source-draft-item"
            :class="{ selected: selectedDraftIds.includes(chapter.tempId) }"
            role="button"
            tabindex="0"
            @click="toggleDraftSelection(chapter.tempId)"
            @keydown.enter.prevent="toggleDraftSelection(chapter.tempId)"
            @keydown.space.prevent="toggleDraftSelection(chapter.tempId)"
          >
            <t-checkbox :checked="selectedDraftIds.includes(chapter.tempId)" @click.stop @change="toggleDraftSelection(chapter.tempId)" />
            <div>
              <strong>{{ chapter.chapterTitle }}</strong>
              <span>{{ chapter.volumeName }} · {{ chapter.content.length }} {{ t('source.import.charsUnit') }}</span>
              <p>{{ previewText(chapter.content, 120) }}</p>
            </div>
          </div>
        </div>
        <div class="source-dialog-footer">
          <VtButton size="small" variant="outline" @click="importStep = 'input'">{{ t('source.import.back') }}</VtButton>
          <VtButton size="small" theme="primary" variant="base" :loading="saving" :disabled="selectedDraftIds.length === 0" @click="saveSelectedChapters">{{ t('source.import.save') }}</VtButton>
        </div>
      </div>
    </div>
  </VtDialog>
</template>
