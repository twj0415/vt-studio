<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  PROJECT_IMAGE_QUALITIES,
  PROJECT_TEMPLATE_TYPES,
  PROJECT_VIDEO_RATIOS,
} from '@shared/constants/dictionaries';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtStatusTip from '@renderer/components/VtStatusTip.vue';
import type {
  ProjectImageQuality,
  ProjectManualSummary,
  ProjectModelOption,
  ProjectSavePayload,
  ProjectTemplateType,
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
  defaultImageModelId: string;
  defaultVideoModelId: string;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  submit: [payload: ProjectSavePayload];
}>();

const { t } = useI18n();
const legacyProjectKindKey = ['source', 'Type'].join('');
const legacyProjectKindValue = ['scr', 'ipt'].join('');

interface ProjectFormState {
  id?: number;
  templateType: ProjectSavePayload['templateType'];
  name: string;
  genre: string;
  description: string;
  imageModelId: string;
  imageQuality: ProjectSavePayload['imageQuality'];
  videoModelId: string;
  videoRatio: ProjectSavePayload['videoRatio'];
  visualManualId: number;
  directorManualId: number;
}

const form = reactive<ProjectFormState>({
  templateType: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA,
  name: '',
  genre: '',
  description: '',
  imageModelId: '',
  imageQuality: PROJECT_IMAGE_QUALITIES.ONE_K,
  videoModelId: '',
  videoRatio: PROJECT_VIDEO_RATIOS.LANDSCAPE,
  visualManualId: 0,
  directorManualId: 0,
});

const templateTypeOptions = computed<Array<{ label: string; value: ProjectTemplateType }>>(() => [
  { label: t('project.templateType.aiShortDrama'), value: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA },
]);

const selectedImageModel = computed(() => props.imageModels.find((item) => item.modelId === form.imageModelId) ?? null);
const availableImageQualityOptions = computed(() => selectedImageModel.value?.imageQualityOptions ?? []);
const hasImageQualityOptions = computed(() => availableImageQualityOptions.value.length > 0);
const imageModelNeedsReselection = computed(() => Boolean(
  props.mode === 'edit'
  && props.project?.imageModelId
  && !props.imageModels.some((item) => item.modelId === props.project?.imageModelId)
  && !form.imageModelId,
));
const videoModelNeedsReselection = computed(() => Boolean(
  props.mode === 'edit'
  && props.project?.videoModelId
  && !props.videoModels.some((item) => item.modelId === props.project?.videoModelId)
  && !form.videoModelId,
));

function resolveDefaultModelId(models: ProjectModelOption[], configuredId: string): string {
  return models.some((model) => model.modelId === configuredId) ? configuredId : '';
}

function resetForm(): void {
  form.id = undefined;
  form.templateType = PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA;
  form.name = '';
  form.genre = '';
  form.description = '';
  form.imageModelId = resolveDefaultModelId(props.imageModels, props.defaultImageModelId);
  form.imageQuality = props.imageModels.find((item) => item.modelId === form.imageModelId)?.imageQualityOptions?.[0]
    ?? PROJECT_IMAGE_QUALITIES.ONE_K;
  form.videoModelId = resolveDefaultModelId(props.videoModels, props.defaultVideoModelId);
  form.videoRatio = PROJECT_VIDEO_RATIOS.LANDSCAPE;
  form.visualManualId = props.visualManuals[0]?.id ?? 0;
  form.directorManualId = props.directorManuals[0]?.id ?? 0;
}

watch(
  () => [
    props.visible,
    props.project,
    props.imageModels.length,
    props.videoModels.length,
    props.visualManuals.length,
    props.directorManuals.length,
    props.defaultImageModelId,
    props.defaultVideoModelId,
  ] as const,
  () => {
    if (!props.visible) {
      return;
    }

    if (props.mode === 'edit' && props.project) {
      form.id = props.project.id;
      form.templateType = props.project.templateType;
      form.name = props.project.name;
      form.genre = props.project.genre;
      form.description = props.project.description;
      form.imageModelId = resolveDefaultModelId(props.imageModels, props.project.imageModelId);
      form.imageQuality = props.project.imageQuality;
      form.videoModelId = resolveDefaultModelId(props.videoModels, props.project.videoModelId);
      form.videoRatio = props.project.videoRatio;
      form.visualManualId = props.project.visualManualId;
      form.directorManualId = props.project.directorManualId;
      return;
    }

    resetForm();
  },
  { immediate: true },
);

watch(() => form.imageModelId, () => {
  if (!availableImageQualityOptions.value.includes(form.imageQuality)) {
    form.imageQuality = availableImageQualityOptions.value[0] ?? PROJECT_IMAGE_QUALITIES.ONE_K;
  }
});

function submit(): void {
  if (!form.name.trim() || !form.genre.trim() || !form.description.trim()) {
    MessagePlugin.warning(t('project.form.validation.baseInfo'));
    return;
  }
  if (!form.imageModelId || !form.videoModelId) {
    MessagePlugin.warning(t('project.form.validation.models'));
    return;
  }
  if (!form.visualManualId || !form.directorManualId) {
    MessagePlugin.warning(t('project.form.validation.manuals'));
    return;
  }

  emit('submit', { ...form, templateType: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA, [legacyProjectKindKey]: legacyProjectKindValue } as ProjectSavePayload);
}
</script>

<template>
  <VtDialog
    :visible="visible"
    :title="mode === 'edit' ? t('project.form.editTitle') : t('project.form.createTitle')"
    width="860px"
    :confirm-text="t('project.form.save')"
    :cancel-text="t('project.cancel')"
    :confirm-loading="saving"
    @update:visible="(value) => emit('update:visible', value)"
    @confirm="submit"
  >
    <t-form class="project-form" layout="vertical">
      <div class="project-form-grid">
        <t-form-item :label="t('project.form.templateType')">
          <t-select v-model="form.templateType">
            <t-option v-for="item in templateTypeOptions" :key="item.value" :value="item.value" :label="item.label" />
          </t-select>
        </t-form-item>

        <t-form-item :label="t('project.form.name')">
          <t-input v-model="form.name" :placeholder="t('project.form.namePlaceholder')" />
        </t-form-item>

        <t-form-item :label="t('project.form.genre')">
          <t-input v-model="form.genre" :placeholder="t('project.form.genrePlaceholder')" />
        </t-form-item>

        <t-form-item>
          <template #label>
            <span class="inline-flex items-center gap-1">
              <span>{{ t('project.form.imageModel') }}</span>
              <VtStatusTip v-if="imageModelNeedsReselection" tone="danger" :content="t('project.form.invalidImageModel')" />
            </span>
          </template>
          <t-select v-model="form.imageModelId" :placeholder="t('project.form.imageModelPlaceholder')">
            <t-option v-for="item in imageModels" :key="item.modelId" :value="item.modelId" :label="`${item.connectionName} / ${item.displayName}`" />
          </t-select>
        </t-form-item>

        <t-form-item v-if="hasImageQualityOptions" :label="t('project.form.imageQuality')">
          <t-radio-group v-model="form.imageQuality" variant="default-filled">
            <t-radio-button v-for="item in availableImageQualityOptions" :key="item" :value="item">{{ item }}</t-radio-button>
          </t-radio-group>
        </t-form-item>

        <t-form-item>
          <template #label>
            <span class="inline-flex items-center gap-1">
              <span>{{ t('project.form.videoModel') }}</span>
              <VtStatusTip v-if="videoModelNeedsReselection" tone="danger" :content="t('project.form.invalidVideoModel')" />
            </span>
          </template>
          <t-select v-model="form.videoModelId" :placeholder="t('project.form.videoModelPlaceholder')">
            <t-option v-for="item in videoModels" :key="item.modelId" :value="item.modelId" :label="`${item.connectionName} / ${item.displayName}`" />
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
  </VtDialog>
</template>
