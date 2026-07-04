<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  PROJECT_IMAGE_QUALITIES,
  PROJECT_SOURCE_TYPES,
  PROJECT_VIDEO_RATIOS,
} from '@shared/constants/dictionaries';
import type {
  ProjectImageQuality,
  ProjectManualSummary,
  ProjectModelOption,
  ProjectSavePayload,
  ProjectSourceType,
  ProjectSummary,
  ProjectVideoRatio,
} from '@shared/types/project';
import { MessagePlugin } from 'tdesign-vue-next';

const props = defineProps<{
  visible: boolean;
  saving: boolean;
  mode: 'create' | 'edit';
  project: ProjectSummary | null;
  imageModels: ProjectModelOption[];
  videoModels: ProjectModelOption[];
  visualManuals: ProjectManualSummary[];
  directorManuals: ProjectManualSummary[];
  imageQualityOptions: ProjectImageQuality[];
  videoRatioOptions: ProjectVideoRatio[];
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  submit: [payload: ProjectSavePayload];
}>();

const { t } = useI18n();

const form = reactive<ProjectSavePayload>({
  sourceType: PROJECT_SOURCE_TYPES.NOVEL,
  name: '',
  genre: '',
  description: '',
  imageModelId: '',
  imageQuality: PROJECT_IMAGE_QUALITIES.ONE_K,
  videoModelId: '',
  videoMode: '',
  videoRatio: PROJECT_VIDEO_RATIOS.LANDSCAPE,
  visualManualId: 0,
  directorManualId: 0,
});

const sourceTypeOptions = computed<Array<{ label: string; value: ProjectSourceType }>>(() => [
  { label: t('project.sourceType.novel'), value: PROJECT_SOURCE_TYPES.NOVEL },
  { label: t('project.sourceType.script'), value: PROJECT_SOURCE_TYPES.SCRIPT },
]);

const selectedVideoModel = computed(() => props.videoModels.find((item) => item.modelId === form.videoModelId) ?? null);
const videoModeOptions = computed(() => selectedVideoModel.value?.modes ?? []);

function resetForm(): void {
  form.id = undefined;
  form.sourceType = PROJECT_SOURCE_TYPES.NOVEL;
  form.name = '';
  form.genre = '';
  form.description = '';
  form.imageModelId = props.imageModels[0]?.modelId ?? '';
  form.imageQuality = PROJECT_IMAGE_QUALITIES.ONE_K;
  form.videoModelId = props.videoModels[0]?.modelId ?? '';
  form.videoMode = props.videoModels[0]?.modes?.[0]?.value ?? '';
  form.videoRatio = PROJECT_VIDEO_RATIOS.LANDSCAPE;
  form.visualManualId = props.visualManuals[0]?.id ?? 0;
  form.directorManualId = props.directorManuals[0]?.id ?? 0;
}

watch(
  () => [props.visible, props.project, props.imageModels.length, props.videoModels.length, props.visualManuals.length, props.directorManuals.length] as const,
  () => {
    if (!props.visible) {
      return;
    }

    if (props.mode === 'edit' && props.project) {
      form.id = props.project.id;
      form.sourceType = props.project.sourceType;
      form.name = props.project.name;
      form.genre = props.project.genre;
      form.description = props.project.description;
      form.imageModelId = props.project.imageModelId;
      form.imageQuality = props.project.imageQuality;
      form.videoModelId = props.project.videoModelId;
      form.videoMode = props.project.videoMode;
      form.videoRatio = props.project.videoRatio;
      form.visualManualId = props.project.visualManualId;
      form.directorManualId = props.project.directorManualId;
      return;
    }

    resetForm();
  },
  { immediate: true },
);

watch(
  () => form.videoModelId,
  (nextValue, previousValue) => {
    if (!nextValue || nextValue === previousValue) {
      return;
    }

    const nextModel = props.videoModels.find((item) => item.modelId === nextValue);
    const nextMode = nextModel?.modes?.[0]?.value ?? '';
    if (!videoModeOptions.value.some((item) => item.value === form.videoMode)) {
      form.videoMode = nextMode;
    }
  },
);

function submit(): void {
  if (!form.name.trim() || !form.genre.trim() || !form.description.trim()) {
    MessagePlugin.warning(t('project.form.validation.baseInfo'));
    return;
  }
  if (!form.imageModelId || !form.videoModelId || !form.videoMode) {
    MessagePlugin.warning(t('project.form.validation.models'));
    return;
  }
  if (!form.visualManualId || !form.directorManualId) {
    MessagePlugin.warning(t('project.form.validation.manuals'));
    return;
  }

  emit('submit', { ...form });
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="mode === 'edit' ? t('project.form.editTitle') : t('project.form.createTitle')"
    width="860px"
    :confirm-btn="t('project.form.save')"
    :confirm-loading="saving"
    @update:visible="(value) => emit('update:visible', value)"
    @confirm="submit"
  >
    <t-form class="project-form" layout="vertical">
      <div class="project-form-grid">
        <t-form-item :label="t('project.form.sourceType')">
          <t-select v-model="form.sourceType">
            <t-option v-for="item in sourceTypeOptions" :key="item.value" :value="item.value" :label="item.label" />
          </t-select>
        </t-form-item>

        <t-form-item :label="t('project.form.name')">
          <t-input v-model="form.name" :placeholder="t('project.form.namePlaceholder')" />
        </t-form-item>

        <t-form-item :label="t('project.form.genre')">
          <t-input v-model="form.genre" :placeholder="t('project.form.genrePlaceholder')" />
        </t-form-item>

        <t-form-item :label="t('project.form.imageQuality')">
          <t-radio-group v-model="form.imageQuality" variant="default-filled">
            <t-radio-button v-for="item in imageQualityOptions" :key="item" :value="item">{{ item }}</t-radio-button>
          </t-radio-group>
        </t-form-item>

        <t-form-item :label="t('project.form.imageModel')">
          <t-select v-model="form.imageModelId" :placeholder="t('project.form.imageModelPlaceholder')">
            <t-option v-for="item in imageModels" :key="item.modelId" :value="item.modelId" :label="`${item.connectionName} / ${item.displayName}`" />
          </t-select>
        </t-form-item>

        <t-form-item :label="t('project.form.videoModel')">
          <t-select v-model="form.videoModelId" :placeholder="t('project.form.videoModelPlaceholder')">
            <t-option v-for="item in videoModels" :key="item.modelId" :value="item.modelId" :label="`${item.connectionName} / ${item.displayName}`" />
          </t-select>
        </t-form-item>

        <t-form-item :label="t('project.form.videoMode')">
          <t-select v-model="form.videoMode" :placeholder="t('project.form.videoModePlaceholder')">
            <t-option v-for="item in videoModeOptions" :key="item.value" :value="item.value" :label="item.label" />
          </t-select>
        </t-form-item>

        <t-form-item :label="t('project.form.videoRatio')">
          <t-radio-group v-model="form.videoRatio" variant="default-filled">
            <t-radio-button v-for="item in videoRatioOptions" :key="item" :value="item">{{ item }}</t-radio-button>
          </t-radio-group>
        </t-form-item>

        <t-form-item :label="t('project.form.visualManual')">
          <t-select v-model="form.visualManualId" :placeholder="t('project.form.visualManualPlaceholder')">
            <t-option v-for="item in visualManuals" :key="item.id" :value="item.id" :label="item.name" />
          </t-select>
        </t-form-item>

        <t-form-item :label="t('project.form.directorManual')">
          <t-select v-model="form.directorManualId" :placeholder="t('project.form.directorManualPlaceholder')">
            <t-option v-for="item in directorManuals" :key="item.id" :value="item.id" :label="item.name" />
          </t-select>
        </t-form-item>
      </div>

      <t-form-item :label="t('project.form.description')">
        <t-textarea v-model="form.description" :autosize="{ minRows: 4, maxRows: 8 }" :placeholder="t('project.form.descriptionPlaceholder')" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>
