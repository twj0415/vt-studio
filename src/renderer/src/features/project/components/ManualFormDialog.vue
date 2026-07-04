<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PROJECT_MANUAL_TABS } from '@shared/constants/manuals';
import type { ProjectManualDetail, ProjectManualKind, ProjectManualSavePayload } from '@shared/types/project';
import { MessagePlugin } from 'tdesign-vue-next';
import VtFilePicker from '@renderer/components/VtFilePicker.vue';

const props = defineProps<{
  visible: boolean;
  saving: boolean;
  kind: ProjectManualKind;
  manual: ProjectManualDetail | null;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  submit: [payload: ProjectManualSavePayload];
}>();

const { t } = useI18n();

const coverPreview = ref<string | null>(null);
const form = reactive({
  id: undefined as number | undefined,
  name: '',
  path: '',
  coverImageDataUrl: null as string | null,
  tabs: [] as ProjectManualDetail['tabs'],
});

const manualKindLabel = computed(() => t(props.kind === 'visual' ? 'project.manual.visual' : 'project.manual.director'));
const title = computed(() => t(form.id ? 'project.manualForm.editTitle' : 'project.manualForm.createTitle', { kind: manualKindLabel.value }));
const pathLabel = computed(() => t(props.kind === 'visual' ? 'project.manualForm.pathVisual' : 'project.manualForm.pathDirector'));

watch(
  () => [props.visible, props.manual, props.kind] as const,
  () => {
    if (!props.visible) {
      return;
    }

    form.id = props.manual?.id;
    form.name = props.manual?.name ?? '';
    form.path = props.manual?.path ?? '';
    form.coverImageDataUrl = null;
    coverPreview.value = props.manual?.coverUrl ?? null;
    form.tabs = props.manual?.tabs.map((tab) => ({ ...tab })) ?? PROJECT_MANUAL_TABS[props.kind].map((tab) => ({ ...tab, content: '' }));
  },
  { immediate: true },
);

function updateCover(files: File[]): void {
  const file = files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : null;
    form.coverImageDataUrl = result;
    coverPreview.value = result;
  };
  reader.readAsDataURL(file);
}

function submit(): void {
  if (!form.name.trim() || !form.path.trim()) {
    MessagePlugin.warning(t('project.manualForm.validation.nameAndPath'));
    return;
  }
  if (!coverPreview.value) {
    MessagePlugin.warning(t('project.manualForm.validation.cover'));
    return;
  }
  if (form.tabs.some((tab) => !tab.content.trim())) {
    MessagePlugin.warning(t('project.manualForm.validation.markdown'));
    return;
  }

  emit('submit', {
    id: form.id,
    kind: props.kind,
    name: form.name,
    path: form.path,
    coverImageDataUrl: form.coverImageDataUrl,
    tabs: form.tabs.map((tab) => ({
      key: tab.key,
      content: tab.content,
    })),
  });
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="title"
    width="980px"
    :confirm-btn="t('project.manualForm.save')"
    :confirm-loading="saving"
    @update:visible="(value) => emit('update:visible', value)"
    @confirm="submit"
  >
    <t-form class="manual-form" layout="vertical">
      <div class="project-form-grid">
        <t-form-item :label="t('project.manualForm.name')">
          <t-input v-model="form.name" :placeholder="t('project.manualForm.namePlaceholder')" />
        </t-form-item>

        <t-form-item :label="pathLabel">
          <t-input v-model="form.path" :disabled="Boolean(form.id)" :placeholder="t('project.manualForm.pathPlaceholder')" />
        </t-form-item>
      </div>

      <t-form-item :label="t('project.manualForm.cover')">
        <div class="manual-cover-row">
          <div class="manual-cover-preview">
            <img v-if="coverPreview" :src="coverPreview" :alt="t('project.manual.coverAlt')" />
            <span v-else>{{ t('project.manualForm.noCover') }}</span>
          </div>
          <VtFilePicker class="manual-cover-upload" accept="image/*" :label="t('project.manualForm.uploadCover')" @change="updateCover" />
        </div>
      </t-form-item>

      <t-tabs>
        <t-tab-panel v-for="tab in form.tabs" :key="tab.key" :value="tab.key" :label="tab.label">
          <t-textarea v-model="tab.content" class="manual-tab-textarea" :autosize="{ minRows: 12, maxRows: 24 }" :placeholder="t('project.manualForm.tabPlaceholder', { label: tab.label })" />
        </t-tab-panel>
      </t-tabs>
    </t-form>
  </t-dialog>
</template>
