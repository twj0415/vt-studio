<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import VtDialog from '@renderer/components/VtDialog.vue';
import type { ChapterEditForm } from '../types';
import type { SourceChapter } from '@shared/types/source';

const props = defineProps<{
  visible: boolean;
  chapter: SourceChapter | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  save: [form: ChapterEditForm];
}>();

const { t } = useI18n();

const form = reactive<ChapterEditForm>({
  volumeName: t('source.import.defaultVolumeName'),
  chapterTitle: '',
  content: '',
  eventSummary: '',
});

function setForm(chapter: SourceChapter | null): void {
  form.volumeName = chapter?.volumeName ?? t('source.import.defaultVolumeName');
  form.chapterTitle = chapter?.chapterTitle ?? '';
  form.content = chapter?.content ?? '';
  form.eventSummary = chapter?.eventSummary ?? '';
}

function submitEdit(): void {
  emit('save', {
    volumeName: form.volumeName,
    chapterTitle: form.chapterTitle,
    content: form.content,
    eventSummary: form.eventSummary,
  });
}

watch(
  () => [props.visible, props.chapter] as const,
  ([visible, chapter]) => {
    if (visible) {
      setForm(chapter);
    }
  },
  { immediate: true },
);
</script>

<template>
  <VtDialog
    :visible="visible"
    :title="t('source.edit.title')"
    width="820px"
    :confirm-text="t('source.save')"
    :cancel-text="t('source.cancel')"
    :confirm-loading="saving"
    @update:visible="(value) => emit('update:visible', value)"
    @confirm="submitEdit"
  >
    <div class="source-edit-form">
      <label>
        <span>{{ t('source.edit.volume') }}</span>
        <t-input v-model="form.volumeName" />
      </label>
      <label>
        <span>{{ t('source.edit.chapter') }}</span>
        <t-input v-model="form.chapterTitle" />
      </label>
      <label>
        <span>{{ t('source.edit.content') }}</span>
        <t-textarea v-model="form.content" :autosize="{ minRows: 8, maxRows: 14 }" />
      </label>
      <label>
        <span>{{ t('source.edit.event') }}</span>
        <t-textarea v-model="form.eventSummary" :autosize="{ minRows: 5, maxRows: 10 }" />
      </label>
    </div>
  </VtDialog>
</template>
