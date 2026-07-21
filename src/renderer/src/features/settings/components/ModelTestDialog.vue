<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import { CloseIcon, DownloadIcon, FolderOpenIcon, FullscreenIcon, ImageIcon } from 'tdesign-icons-vue-next';
import VtFilePicker from '@renderer/components/VtFilePicker.vue';
import PreviewableImage from '@renderer/features/shared/PreviewableImage.vue';
import {
  PROJECT_IMAGE_QUALITY_VALUES,
  type ImageGenerationMode,
  type ProjectImageQuality,
  type ProjectVideoRatio,
} from '@shared/constants/dictionaries';
import {
  getTextReasoningCapability,
  MODEL_AUDIO_SUPPORTS,
  serializeVideoMode,
  REASONING_EFFORTS,
  resolveSupportedReasoningEffort,
  type ReasoningEffort,
  type TextReasoningCapability,
} from '@shared/constants/model-capabilities';
import { resolveModelOperationOptions } from '@shared/model-capability-options';
import type { ModelCapabilityMatrixItem } from '@shared/types/model-capability';
import type { ApiConnectionTestResult, ModelCapability } from '@shared/types/model-config';

interface ModelTestDialogModel {
  label: string;
  modelName: string;
  type: ModelCapability;
  think?: boolean;
  reasoning?: TextReasoningCapability;
  operations?: ModelCapabilityMatrixItem[];
}

interface ModelTestSubmitPayload {
  modelName: string;
  prompt: string;
  reasoningEnabled: boolean;
  reasoningEffort: ReasoningEffort;
  imageMode?: ImageGenerationMode;
  imageSize?: ProjectImageQuality;
  aspectRatio?: string;
  videoMode?: string;
  duration?: number;
  resolution?: string;
  videoAspectRatio?: ProjectVideoRatio;
  audio?: boolean;
  referenceImages?: string[];
}

interface ReferencePreviewItem {
  id: string;
  name: string;
  dataUrl: string;
}

type ReferenceTarget = 'image' | 'video';

const IMAGE_MODE_LABEL_KEYS: Record<string, string> = {
  text: 'settings.vendorConfig.imageMode.text',
  singleImage: 'settings.vendorConfig.imageMode.singleImage',
  multiReference: 'settings.vendorConfig.imageMode.multiReference',
};

const VIDEO_MODE_LABEL_KEYS: Record<string, string> = {
  text: 'settings.vendorConfig.videoMode.text',
  singleImage: 'settings.vendorConfig.videoMode.singleImage',
  startEndRequired: 'settings.vendorConfig.videoMode.startEndRequired',
  endFrameOptional: 'settings.vendorConfig.videoMode.endFrameOptional',
  startFrameOptional: 'settings.vendorConfig.videoMode.startFrameOptional',
  'imageReference:3': 'settings.vendorConfig.videoMode.imageReference3',
  'videoReference:1,imageReference:2': 'settings.vendorConfig.videoMode.videoImageReference',
  'audioReference:1,imageReference:1': 'settings.vendorConfig.videoMode.audioImageReference',
  'textReference:1,imageReference:1': 'settings.vendorConfig.videoMode.textImageReference',
};

const props = withDefaults(
  defineProps<{
    visible: boolean;
    header: string;
    models: ModelTestDialogModel[];
    initialModelName?: string;
    defaultPrompt?: string;
    loading?: boolean;
    result?: ApiConnectionTestResult | null;
  }>(),
  {
    initialModelName: '',
    defaultPrompt: '',
    loading: false,
    result: null,
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  submit: [payload: ModelTestSubmitPayload];
}>();

const { t } = useI18n();
const selectedModelName = ref('');
const prompt = ref('');
const reasoningEnabled = ref(false);
const reasoningEffort = ref<ReasoningEffort>(REASONING_EFFORTS.LOW);
const savingFile = ref(false);
const openingFile = ref(false);
const readingReferences = ref(false);
const imageMode = ref<ImageGenerationMode>('text');
const imageSize = ref<ProjectImageQuality | ''>('');
const imageAspectRatio = ref<string>('16:9');
const imageReferences = ref<ReferencePreviewItem[]>([]);
const videoMode = ref<string>('text');
const videoDuration = ref<number>(0);
const videoResolution = ref<string>('');
const videoAspectRatio = ref<ProjectVideoRatio | ''>('');
const videoAudio = ref(false);
const videoReferences = ref<ReferencePreviewItem[]>([]);
const videoPreviewVisible = ref(false);

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});

const modelOptions = computed(() =>
  props.models.map((model) => ({
    label: model.label,
    value: model.modelName,
  })),
);

const currentModel = computed(() => props.models.find((model) => model.modelName === selectedModelName.value) ?? props.models[0] ?? null);
const currentOperations = computed(() => currentModel.value?.operations ?? []);
const currentImageOperation = computed(() => currentOperations.value.find((operation) => operation.modeKey === imageMode.value) ?? null);
const currentVideoOperation = computed(() => currentOperations.value.find((operation) => operation.modeKey === videoMode.value) ?? null);

const reasoningCapability = computed(() => {
  const model = currentModel.value;
  if (!model || model.type !== 'text') {
    return getTextReasoningCapability({ think: false });
  }

  return getTextReasoningCapability({
    modelName: model.modelName,
    think: model.think,
    reasoning: model.reasoning,
  });
});

const reasoningEffortOptions = computed(() =>
  reasoningCapability.value.efforts
    .filter((effort) => effort !== REASONING_EFFORTS.NONE)
    .map((effort) => ({
      label: t(`settings.modelTestDialog.effort.${effort}`),
      value: effort,
    })),
);

const imageModeOptions = computed(() => currentOperations.value
  .filter((operation) => operation.modelType === 'image')
  .map((operation) => ({ label: getImageModeLabel(operation.modeKey), value: operation.modeKey as ImageGenerationMode })));
const imageSizeValues = computed(() => currentImageOperation.value ? resolveModelOperationOptions(currentImageOperation.value).sizes : []);
const imageAspectRatioValues = computed(() => currentImageOperation.value ? resolveModelOperationOptions(currentImageOperation.value).aspectRatios : []);
const imageSizeOptions = computed(() => imageSizeValues.value
  .filter((size): size is ProjectImageQuality => PROJECT_IMAGE_QUALITY_VALUES.includes(size as ProjectImageQuality))
  .map((size) => ({ label: size, value: size })));
const imageAspectRatioOptions = computed(() => imageAspectRatioValues.value.map((ratio) => ({ label: ratio, value: ratio })));
const videoModeOptions = computed(() => currentOperations.value
  .filter((operation) => operation.modelType === 'video')
  .map((operation) => {
    const value = serializeVideoMode(operation.modeKey);
    return { label: getVideoModeLabel(value), value };
  }));
const videoDurationValues = computed(() => currentVideoOperation.value ? resolveModelOperationOptions(currentVideoOperation.value).durations : []);
const videoResolutionValues = computed(() => currentVideoOperation.value
  ? resolveModelOperationOptions(currentVideoOperation.value, { duration: videoDuration.value }).resolutions
  : []);
const videoAspectRatioValues = computed(() => currentVideoOperation.value ? resolveModelOperationOptions(currentVideoOperation.value).aspectRatios : []);
const videoDurationOptions = computed(() => videoDurationValues.value.map((duration) => ({ label: t('settings.modelTestDialog.duration.seconds', { seconds: duration }), value: duration })));
const videoResolutionOptions = computed(() => videoResolutionValues.value.map((resolution) => ({ label: resolution, value: resolution })));
const videoAspectRatioOptions = computed(() => videoAspectRatioValues.value
  .filter((ratio): ratio is ProjectVideoRatio => ratio === '16:9' || ratio === '9:16')
  .map((ratio) => ({ label: ratio, value: ratio })));
const imageReferenceMinimum = computed(() => currentImageOperation.value?.referenceLimits.image ?? 0);
const imageReferenceLimit = computed(() => currentImageOperation.value?.referenceLimits.maximum.image ?? 0);
const videoReferenceLimits = computed(() => currentVideoOperation.value?.referenceLimits ?? null);
const videoReferenceMinimum = computed(() => videoReferenceLimits.value?.image ?? 0);
const videoReferenceLimit = computed(() => videoReferenceLimits.value?.maximum.image ?? 0);
const videoHasUnsupportedReferences = computed(() => Boolean(videoReferenceLimits.value && (
  videoReferenceLimits.value.maximum.video > 0
  || videoReferenceLimits.value.maximum.audio > 0
  || videoReferenceLimits.value.maximum.text > 0
)));
const audioSupport = computed(() => currentVideoOperation.value?.audioSupport ?? MODEL_AUDIO_SUPPORTS.NONE);
const canToggleVideoAudio = computed(() => audioSupport.value === MODEL_AUDIO_SUPPORTS.OPTIONAL);
const hasSelectedOperation = computed(() => {
  if (currentModel.value?.type === 'image') return Boolean(currentImageOperation.value);
  if (currentModel.value?.type === 'video') return Boolean(currentVideoOperation.value);
  return Boolean(currentModel.value);
});
const canSubmit = computed(() => Boolean(currentModel.value && hasSelectedOperation.value && prompt.value.trim() && !readingReferences.value));
const isImageTest = computed(() => currentModel.value?.type === 'image');
const isVideoTest = computed(() => currentModel.value?.type === 'video');
const dialogHeader = computed(() => props.header || t('settings.modelTestDialog.title'));

const currentModelDisplayName = computed(() => {
  const model = currentModel.value;
  if (!model) {
    return '';
  }

  const suffix = ` (${model.modelName})`;
  return model.label.endsWith(suffix) ? model.label.slice(0, -suffix.length) : model.label;
});

const loadingTitle = computed(() => {
  const type = currentModel.value?.type;
  if (type === 'image') {
    return t('settings.modelTestDialog.loading.imageTitle');
  }
  if (type === 'video') {
    return t('settings.modelTestDialog.loading.videoTitle');
  }
  return t('settings.modelTestDialog.loading.textTitle');
});

const imagePreviewSrc = computed(() => {
  if (!props.result?.content) {
    return '';
  }

  const value = props.result.content.trim();
  if (/^data:image\//i.test(value)) {
    return value;
  }

  if (isImageTest.value && /^[a-z0-9+/]+={0,2}$/i.test(value.replace(/\s/g, ''))) {
    return `data:image/png;base64,${value.replace(/\s/g, '')}`;
  }

  return '';
});

const videoPreviewSrc = computed(() => {
  if (!props.result?.content) {
    return '';
  }

  const value = props.result.content.trim();
  if (/^data:video\//i.test(value)) {
    return value;
  }

  const normalized = value.replace(/\s/g, '');
  if (isVideoTest.value && /^[a-z0-9+/]+={0,2}$/i.test(normalized)) {
    return `data:video/mp4;base64,${normalized}`;
  }

  return '';
});

const mediaPreviewSrc = computed(() => imagePreviewSrc.value || videoPreviewSrc.value);

const resultText = computed(() => {
  const result = props.result;
  if (!result) {
    return '';
  }

  const lines: string[] = [];
  if (result.content && !mediaPreviewSrc.value) {
    lines.push(result.content);
  }
  if (result.filePath && !mediaPreviewSrc.value) {
    lines.push(t('settings.modelTestDialog.result.file', { path: result.filePath }));
  }
  if (result.thinking) {
    lines.push('', t('settings.modelTestDialog.result.thinking'), result.thinking);
  }
  if (!mediaPreviewSrc.value || result.thinking) {
    lines.push('', t('settings.modelTestDialog.result.duration', { duration: formatDuration(result.durationMs) }));
  }
  return lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n');
});

const shouldShowImageResult = computed(() => Boolean(imagePreviewSrc.value));
const shouldShowVideoResult = computed(() => Boolean(videoPreviewSrc.value));
const shouldShowResultPanel = computed(() => Boolean(resultText.value || shouldShowImageResult.value || shouldShowVideoResult.value));
const formattedDuration = computed(() => formatDuration(props.result?.durationMs ?? 0));

function getModelTypeLabel(type: ModelCapability): string {
  return t(`settings.modelTestDialog.type.${type}`);
}

function getImageModeLabel(value: string): string {
  const key = IMAGE_MODE_LABEL_KEYS[value];
  return key ? t(key) : value;
}

function getVideoModeLabel(value: string): string {
  const key = VIDEO_MODE_LABEL_KEYS[value];
  return key ? t(key) : value;
}

function getReferenceLimit(target: ReferenceTarget): number {
  return target === 'image' ? imageReferenceLimit.value : videoReferenceLimit.value;
}

function getReferences(target: ReferenceTarget): ReferencePreviewItem[] {
  return target === 'image' ? imageReferences.value : videoReferences.value;
}

function setReferences(target: ReferenceTarget, references: ReferencePreviewItem[]): void {
  if (target === 'image') {
    imageReferences.value = references;
    return;
  }

  videoReferences.value = references;
}

function trimReferences(target: ReferenceTarget): void {
  const limit = getReferenceLimit(target);
  if (limit <= 0) {
    setReferences(target, []);
    return;
  }

  setReferences(target, getReferences(target).slice(0, limit));
}

function getReferencePayload(target: ReferenceTarget): string[] {
  const limit = getReferenceLimit(target);
  if (limit <= 0) {
    return [];
  }

  return getReferences(target).slice(0, limit).map((item) => item.dataUrl);
}

function isProjectImageQuality(value: string): value is ProjectImageQuality {
  return PROJECT_IMAGE_QUALITY_VALUES.includes(value as ProjectImageQuality);
}

function syncImageSelection(): void {
  if (!currentImageOperation.value) {
    imageMode.value = imageModeOptions.value[0]?.value ?? 'text';
  }
  if (!imageSizeOptions.value.some((option) => option.value === imageSize.value)) {
    imageSize.value = imageSizeOptions.value[0]?.value ?? '';
  }
  if (!imageAspectRatioValues.value.includes(imageAspectRatio.value)) {
    imageAspectRatio.value = imageAspectRatioValues.value[0] ?? '';
  }
  trimReferences('image');
}

function syncVideoSelection(): void {
  if (!currentVideoOperation.value) {
    videoMode.value = videoModeOptions.value[0]?.value ?? '';
  }
  if (!videoDurationValues.value.includes(videoDuration.value)) {
    videoDuration.value = videoDurationValues.value[0] ?? 0;
  }
  if (!videoResolutionValues.value.includes(videoResolution.value)) {
    videoResolution.value = videoResolutionValues.value[0] ?? '';
  }
  if (!videoAspectRatioOptions.value.some((option) => option.value === videoAspectRatio.value)) {
    videoAspectRatio.value = videoAspectRatioOptions.value[0]?.value ?? '';
  }
  if (audioSupport.value === MODEL_AUDIO_SUPPORTS.NONE) {
    videoAudio.value = false;
  } else if (audioSupport.value === MODEL_AUDIO_SUPPORTS.REQUIRED) {
    videoAudio.value = true;
  }
  trimReferences('video');
}

function syncMediaDefaultsByModel(): void {
  const model = currentModel.value;

  if (model?.type === 'image') {
    imageMode.value = imageModeOptions.value[0]?.value ?? 'text';
    imageSize.value = '';
    imageAspectRatio.value = '';
    imageReferences.value = [];
    syncImageSelection();
    return;
  }

  if (model?.type === 'video') {
    videoMode.value = videoModeOptions.value[0]?.value ?? '';
    videoDuration.value = 0;
    videoResolution.value = '';
    videoAspectRatio.value = '';
    videoAudio.value = false;
    videoReferences.value = [];
    syncVideoSelection();
    return;
  }

  imageReferences.value = [];
  videoReferences.value = [];
}

function validateReferenceAdd(target: ReferenceTarget): boolean {
  const limit = getReferenceLimit(target);
  if (limit <= 0) {
    MessagePlugin.warning(t('settings.modelTestDialog.reference.notRequired'));
    return false;
  }

  if (getReferences(target).length >= limit) {
    MessagePlugin.warning(t('settings.modelTestDialog.reference.limit', { count: limit }));
    return false;
  }

  return true;
}

function removeReference(target: ReferenceTarget, id: string): void {
  setReferences(target, getReferences(target).filter((item) => item.id !== id));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('empty file result'))));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('file read failed')));
    reader.readAsDataURL(file);
  });
}

async function handleReferenceFiles(target: ReferenceTarget, rawFiles: File[]): Promise<void> {
  if (!validateReferenceAdd(target)) {
    return;
  }

  const files = rawFiles.filter((file) => file.type.startsWith('image/'));

  if (files.length === 0) {
    MessagePlugin.warning(t('settings.modelTestDialog.reference.invalid'));
    return;
  }

  const limit = getReferenceLimit(target);
  const remaining = Math.max(0, limit - getReferences(target).length);
  if (remaining <= 0) {
    MessagePlugin.warning(t('settings.modelTestDialog.reference.limit', { count: limit }));
    return;
  }

  const selectedFiles = files.slice(0, remaining);
  if (files.length > remaining) {
    MessagePlugin.warning(t('settings.modelTestDialog.reference.limit', { count: limit }));
  }

  readingReferences.value = true;
  try {
    const nextReferences = await Promise.all(
      selectedFiles.map(async (file) => ({
        id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        dataUrl: await readFileAsDataUrl(file),
      })),
    );
    setReferences(target, [...getReferences(target), ...nextReferences]);
  } finally {
    readingReferences.value = false;
  }
}

function validateMediaSettings(model: ModelTestDialogModel): boolean {
  if (model.type === 'image') {
    if (!currentImageOperation.value) {
      MessagePlugin.warning(t('production.workbench.capabilityUnavailable'));
      return false;
    }
    if (imageReferenceMinimum.value > 0 && imageReferences.value.length < imageReferenceMinimum.value) {
      MessagePlugin.warning(t('settings.modelTestDialog.reference.required', { count: imageReferenceMinimum.value }));
      return false;
    }
  }

  if (model.type === 'video') {
    if (!currentVideoOperation.value) {
      MessagePlugin.warning(t('production.workbench.capabilityUnavailable'));
      return false;
    }
    if (videoHasUnsupportedReferences.value) {
      MessagePlugin.warning(t('settings.modelTestDialog.reference.unsupportedMode'));
      return false;
    }

    if (videoReferenceMinimum.value > 0 && videoReferences.value.length < videoReferenceMinimum.value) {
      MessagePlugin.warning(t('settings.modelTestDialog.reference.required', { count: videoReferenceMinimum.value }));
      return false;
    }
  }

  return true;
}

function trimFixedNumber(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0$/, '');
}

function formatDuration(durationMs: number): string {
  const safeDuration = Math.max(0, durationMs);
  if (safeDuration < 60_000) {
    const seconds = safeDuration / 1000;
    return t('settings.modelTestDialog.duration.seconds', {
      seconds: trimFixedNumber(seconds, seconds < 10 ? 1 : 0),
    });
  }

  const totalSeconds = Math.round(safeDuration / 1000);
  return t('settings.modelTestDialog.duration.minutes', {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  });
}

function getDefaultEnabledEffort(): ReasoningEffort {
  const capability = reasoningCapability.value;
  if (!capability.supported) {
    return REASONING_EFFORTS.NONE;
  }

  return capability.defaultEffort !== REASONING_EFFORTS.NONE
    ? capability.defaultEffort
    : capability.efforts.find((effort) => effort !== REASONING_EFFORTS.NONE) ?? REASONING_EFFORTS.LOW;
}

function syncReasoningByModel(): void {
  const capability = reasoningCapability.value;
  if (!capability.supported) {
    reasoningEnabled.value = false;
    reasoningEffort.value = REASONING_EFFORTS.LOW;
    return;
  }

  reasoningEffort.value = resolveSupportedReasoningEffort(capability, reasoningEffort.value);
  if (reasoningEffort.value === REASONING_EFFORTS.NONE) {
    reasoningEffort.value = getDefaultEnabledEffort();
  }
}

function resetForm(): void {
  selectedModelName.value = props.initialModelName || props.models[0]?.modelName || '';
  prompt.value = props.defaultPrompt;
  reasoningEnabled.value = false;
  reasoningEffort.value = getDefaultEnabledEffort();
  syncMediaDefaultsByModel();
}

function handleSubmit(): void {
  const model = currentModel.value;
  if (!model || !prompt.value.trim()) {
    return;
  }

  if (!validateMediaSettings(model)) {
    return;
  }

  const effort = model.type === 'text' && reasoningEnabled.value
    ? resolveSupportedReasoningEffort(reasoningCapability.value, reasoningEffort.value)
    : REASONING_EFFORTS.NONE;

  const basePayload: ModelTestSubmitPayload = {
    modelName: model.modelName,
    prompt: prompt.value.trim(),
    reasoningEnabled: effort !== REASONING_EFFORTS.NONE,
    reasoningEffort: effort,
  };

  if (model.type === 'image') {
    emit('submit', {
      ...basePayload,
      imageMode: imageMode.value,
      imageSize: imageSize.value && isProjectImageQuality(imageSize.value) ? imageSize.value : undefined,
      aspectRatio: imageAspectRatio.value || undefined,
      referenceImages: getReferencePayload('image'),
    });
    return;
  }

  if (model.type === 'video') {
    emit('submit', {
      ...basePayload,
      videoMode: videoMode.value,
      duration: videoDuration.value,
      resolution: videoResolution.value,
      videoAspectRatio: videoAspectRatio.value || undefined,
      audio: videoAudio.value,
      referenceImages: getReferencePayload('video'),
    });
    return;
  }

  emit('submit', basePayload);
}

async function saveResultFile(): Promise<void> {
  const filePath = props.result?.filePath;
  if (!filePath) {
    return;
  }

  savingFile.value = true;
  try {
    const response = await window.vtStudio.settings.modelTest.saveFileAs({ filePath });
    if (response.code !== 200) {
      MessagePlugin.error(response.msg);
      return;
    }

    if (response.data.savedPath) {
      MessagePlugin.success(t('settings.modelTestDialog.file.saved', { path: response.data.savedPath }));
    }
  } finally {
    savingFile.value = false;
  }
}

async function openResultFileLocation(): Promise<void> {
  const filePath = props.result?.filePath;
  if (!filePath) {
    return;
  }

  openingFile.value = true;
  try {
    const response = await window.vtStudio.settings.modelTest.openFileLocation({ filePath });
    if (response.code !== 200) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('settings.modelTestDialog.file.locationOpened'));
  } finally {
    openingFile.value = false;
  }
}

function openVideoPreview(): void {
  if (!videoPreviewSrc.value) {
    return;
  }

  videoPreviewVisible.value = true;
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetForm();
    } else {
      videoPreviewVisible.value = false;
    }
  },
);

watch(currentModel, () => {
  syncReasoningByModel();
  syncMediaDefaultsByModel();
});

watch(imageMode, () => syncImageSelection());

watch(videoMode, () => syncVideoSelection());

watch(videoDuration, () => syncVideoSelection());

watch(audioSupport, (support) => {
  if (support === MODEL_AUDIO_SUPPORTS.NONE) {
    videoAudio.value = false;
  } else if (support === MODEL_AUDIO_SUPPORTS.REQUIRED) {
    videoAudio.value = true;
  }
});
</script>

<template>
  <t-dialog v-model:visible="visibleModel" class="model-test-dialog" :header="dialogHeader" width="780px" :confirm-btn="t('settings.modelTestDialog.start')" :confirm-loading="loading" :confirm-btn-props="{ disabled: !canSubmit || loading }" @confirm="handleSubmit">
    <div class="grid min-w-0 gap-4">
      <section class="grid min-w-0 gap-3 rounded-lg border border-line-soft bg-surface-panel p-3 shadow-panel">
        <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <t-tag v-if="currentModel" size="small" variant="light">{{ getModelTypeLabel(currentModel.type) }}</t-tag>
              <strong class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold leading-snug text-text-primary">{{ currentModelDisplayName }}</strong>
            </div>
            <p v-if="currentModel" class="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs leading-relaxed text-text-muted">{{ currentModel.modelName }}</p>
          </div>
          <t-select v-if="models.length > 1" v-model="selectedModelName" class="w-full sm:w-[280px]" :options="modelOptions" />
        </div>
      </section>

      <section class="grid min-w-0 gap-2">
        <div class="text-sm font-semibold leading-snug text-text-primary">{{ t('settings.modelTestDialog.prompt') }}</div>
        <t-textarea v-model="prompt" :placeholder="t('settings.modelTestDialog.promptPlaceholder')" :autosize="{ minRows: 5, maxRows: 9 }" />
      </section>

      <section v-if="currentModel?.type === 'image'" class="grid min-w-0 gap-3 rounded-lg border border-line-soft bg-surface-panel p-3">
        <div class="grid min-w-0 gap-3 sm:grid-cols-3">
          <label class="grid min-w-0 gap-1">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.mode') }}</span>
            <t-select v-model="imageMode" :options="imageModeOptions" />
          </label>
          <label v-if="imageSizeOptions.length" class="grid min-w-0 gap-1">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.size') }}</span>
            <t-select v-model="imageSize" :options="imageSizeOptions" />
          </label>
          <label v-if="imageAspectRatioOptions.length" class="grid min-w-0 gap-1">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.aspectRatio') }}</span>
            <t-select v-model="imageAspectRatio" :options="imageAspectRatioOptions" />
          </label>
        </div>

        <div v-if="imageReferenceLimit > 0" class="grid min-w-0 gap-2 rounded-md border border-line-soft bg-surface-raised p-2.5">
          <div class="flex min-w-0 items-center justify-between gap-3">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.references') }}</span>
            <span class="text-[11px] leading-snug text-text-muted">{{ t('settings.modelTestDialog.reference.count', { current: imageReferences.length, count: imageReferenceLimit }) }}</span>
          </div>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <VtFilePicker size="small" variant="outline" accept="image/*" multiple :label="t('settings.modelTestDialog.reference.add')" :loading="readingReferences" :disabled="imageReferences.length >= imageReferenceLimit" @change="(files) => handleReferenceFiles('image', files)" />
            <t-button v-if="imageReferences.length" size="small" variant="text" @click="setReferences('image', [])">{{ t('settings.modelTestDialog.reference.clear') }}</t-button>
          </div>
          <div v-if="imageReferences.length" class="grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-5">
            <figure v-for="reference in imageReferences" :key="reference.id" class="relative grid min-w-0 gap-1 overflow-hidden rounded-md border border-line-soft bg-surface-panel p-1">
              <img class="h-16 w-full rounded object-cover" :src="reference.dataUrl" :alt="reference.name" />
              <button type="button" class="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded bg-surface-panel/90 text-text-secondary shadow-panel hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand" :aria-label="t('settings.modelTestDialog.reference.remove')" @click="removeReference('image', reference.id)">
                <CloseIcon class="h-3.5 w-3.5" />
              </button>
              <figcaption class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-snug text-text-muted">{{ reference.name }}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section v-if="currentModel?.type === 'video'" class="grid min-w-0 gap-3 rounded-lg border border-line-soft bg-surface-panel p-3">
        <div class="grid min-w-0 gap-3 sm:grid-cols-4">
          <label class="grid min-w-0 gap-1 sm:col-span-2">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.mode') }}</span>
            <t-select v-model="videoMode" :options="videoModeOptions" />
          </label>
          <label class="grid min-w-0 gap-1">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.duration') }}</span>
            <t-select v-model="videoDuration" :options="videoDurationOptions" />
          </label>
          <label class="grid min-w-0 gap-1">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.resolution') }}</span>
            <t-select v-model="videoResolution" :options="videoResolutionOptions" />
          </label>
          <label v-if="videoAspectRatioOptions.length" class="grid min-w-0 gap-1">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.aspectRatio') }}</span>
            <t-select v-model="videoAspectRatio" :options="videoAspectRatioOptions" />
          </label>
          <div v-if="audioSupport !== MODEL_AUDIO_SUPPORTS.NONE" class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line-soft bg-surface-raised px-3 py-2">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.audio') }}</span>
            <t-switch v-model="videoAudio" :disabled="!canToggleVideoAudio" />
          </div>
        </div>

        <p v-if="videoHasUnsupportedReferences" class="m-0 rounded-md border border-line-soft bg-surface-raised px-3 py-2 text-xs leading-relaxed text-text-muted">{{ t('settings.modelTestDialog.reference.unsupportedMode') }}</p>

        <div v-else-if="videoReferenceLimit > 0" class="grid min-w-0 gap-2 rounded-md border border-line-soft bg-surface-raised p-2.5">
          <div class="flex min-w-0 items-center justify-between gap-3">
            <span class="text-xs font-semibold leading-snug text-text-muted">{{ t('settings.modelTestDialog.form.references') }}</span>
            <span class="text-[11px] leading-snug text-text-muted">{{ t('settings.modelTestDialog.reference.count', { current: videoReferences.length, count: videoReferenceLimit }) }}</span>
          </div>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <VtFilePicker size="small" variant="outline" accept="image/*" multiple :label="t('settings.modelTestDialog.reference.add')" :loading="readingReferences" :disabled="videoReferences.length >= videoReferenceLimit" @change="(files) => handleReferenceFiles('video', files)">
              <template #icon><ImageIcon /></template>
              {{ t('settings.modelTestDialog.reference.add') }}
            </VtFilePicker>
            <t-button v-if="videoReferences.length" size="small" variant="text" @click="setReferences('video', [])">{{ t('settings.modelTestDialog.reference.clear') }}</t-button>
          </div>
          <div v-if="videoReferences.length" class="grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-5">
            <figure v-for="reference in videoReferences" :key="reference.id" class="relative grid min-w-0 gap-1 overflow-hidden rounded-md border border-line-soft bg-surface-panel p-1">
              <img class="h-16 w-full rounded object-cover" :src="reference.dataUrl" :alt="reference.name" />
              <button type="button" class="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded bg-surface-panel/90 text-text-secondary shadow-panel hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand" :aria-label="t('settings.modelTestDialog.reference.remove')" @click="removeReference('video', reference.id)">
                <CloseIcon class="h-3.5 w-3.5" />
              </button>
              <figcaption class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-snug text-text-muted">{{ reference.name }}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section v-if="currentModel?.type === 'text'" class="grid min-w-0 gap-3 rounded-lg border border-line-soft bg-surface-panel p-3">
        <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div class="min-w-0">
            <strong class="block text-sm font-semibold leading-snug text-text-primary">{{ t('settings.modelTestDialog.reasoningSwitch') }}</strong>
            <p class="mt-1 text-xs leading-relaxed text-text-muted">
              {{ reasoningCapability.supported ? t('settings.modelTestDialog.reasoningHint') : t('settings.modelTestDialog.reasoningUnsupported') }}
            </p>
          </div>
          <t-switch v-model="reasoningEnabled" :disabled="!reasoningCapability.supported" />
        </div>
        <t-select v-if="reasoningCapability.supported" v-model="reasoningEffort" :disabled="!reasoningEnabled" :options="reasoningEffortOptions" />
      </section>

      <section v-if="loading" class="relative grid min-h-[180px] place-items-center overflow-hidden rounded-lg border border-line-soft bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vt-surface-raised)_96%,transparent),var(--vt-surface-panel))] p-4" role="status" aria-live="polite">
        <div class="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(var(--vt-line-soft)_1px,transparent_1px),linear-gradient(90deg,var(--vt-line-soft)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div class="pointer-events-none absolute inset-x-0 -top-16 h-20 animate-model-test-scan bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--vt-brand)_14%,transparent),transparent)]" />
        <div class="relative grid place-items-center gap-3 text-center">
          <div class="relative h-16 w-16" aria-hidden="true">
            <span class="absolute inset-0 animate-model-test-drift rounded-lg border border-[color-mix(in_srgb,var(--vt-brand)_26%,transparent)]" />
            <span class="absolute inset-3 animate-model-test-drift rounded-md border border-[color-mix(in_srgb,var(--vt-text-secondary)_24%,transparent)] [animation-delay:-700ms]" />
            <span class="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 animate-model-test-pulse rounded-sm bg-brand shadow-[0_0_16px_color-mix(in_srgb,var(--vt-brand)_52%,transparent)]" />
          </div>
          <div class="grid gap-1">
            <strong class="text-sm font-semibold leading-snug text-text-primary">{{ loadingTitle }}</strong>
            <span class="text-xs leading-relaxed text-text-muted">{{ t('settings.modelTestDialog.loading.hint') }}</span>
          </div>
          <div class="flex items-center justify-center gap-1.5" aria-hidden="true">
            <span class="h-1.5 w-1.5 animate-model-test-dot rounded-full bg-brand [animation-delay:-360ms]" />
            <span class="h-1.5 w-1.5 animate-model-test-dot rounded-full bg-brand [animation-delay:-180ms]" />
            <span class="h-1.5 w-1.5 animate-model-test-dot rounded-full bg-brand" />
          </div>
        </div>
      </section>

      <section v-else-if="shouldShowResultPanel" class="grid min-w-0 gap-2.5 rounded-lg border border-line-soft bg-surface-panel p-3">
        <div class="text-sm font-semibold leading-snug text-text-primary">{{ t('settings.modelTestDialog.result.title') }}</div>

        <PreviewableImage
          v-if="shouldShowImageResult"
          :src="imagePreviewSrc"
          :alt="t('settings.modelTestDialog.image.previewAlt')"
          :heading="t('settings.modelTestDialog.image.previewTitle')"
          image-class="max-h-[300px] animate-model-test-image-reveal"
        >
          <template #toolbar>
            <t-tooltip v-if="result?.filePath" :content="t('settings.modelTestDialog.file.download')">
              <t-button class="pointer-events-auto" shape="square" size="small" variant="outline" :loading="savingFile" :aria-label="t('settings.modelTestDialog.file.download')" @click.stop="saveResultFile">
                <DownloadIcon />
              </t-button>
            </t-tooltip>
            <t-tooltip v-if="result?.filePath" :content="t('settings.modelTestDialog.file.openLocation')">
              <t-button class="pointer-events-auto" shape="square" size="small" variant="outline" :loading="openingFile" :aria-label="t('settings.modelTestDialog.file.openLocation')" @click.stop="openResultFileLocation">
                <FolderOpenIcon />
              </t-button>
            </t-tooltip>
          </template>
          <template #caption>
            <span class="text-[13px] font-semibold leading-snug text-text-primary">{{ t('settings.modelTestDialog.image.ready') }}</span>
            <small class="text-xs leading-snug text-text-muted">{{ t('settings.modelTestDialog.result.duration', { duration: formattedDuration }) }}</small>
            <small v-if="result?.filePath" class="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] leading-snug text-text-muted">{{ result.filePath }}</small>
          </template>
        </PreviewableImage>

        <figure v-if="shouldShowVideoResult" class="grid min-w-0 overflow-hidden rounded-lg border border-line-soft bg-surface-raised">
          <div class="group relative grid min-h-[210px] place-items-center overflow-hidden bg-[#08090a]">
            <video class="block max-h-[320px] w-full object-contain" :src="videoPreviewSrc" :aria-label="t('settings.modelTestDialog.video.previewAlt')" controls playsinline preload="metadata" />
            <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-end gap-2 p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <t-tooltip v-if="result?.filePath" :content="t('settings.modelTestDialog.file.download')">
                <t-button class="pointer-events-auto" shape="square" size="small" variant="outline" :loading="savingFile" :aria-label="t('settings.modelTestDialog.file.download')" @click.stop="saveResultFile">
                  <DownloadIcon />
                </t-button>
              </t-tooltip>
              <t-tooltip v-if="result?.filePath" :content="t('settings.modelTestDialog.file.openLocation')">
                <t-button class="pointer-events-auto" shape="square" size="small" variant="outline" :loading="openingFile" :aria-label="t('settings.modelTestDialog.file.openLocation')" @click.stop="openResultFileLocation">
                  <FolderOpenIcon />
                </t-button>
              </t-tooltip>
              <t-tooltip :content="t('settings.modelTestDialog.video.previewTitle')">
                <t-button class="pointer-events-auto" shape="square" size="small" variant="outline" :aria-label="t('settings.modelTestDialog.video.previewTitle')" @click.stop="openVideoPreview">
                  <FullscreenIcon />
                </t-button>
              </t-tooltip>
            </div>
          </div>

          <figcaption class="grid min-w-0 gap-1 border-t border-line-soft bg-surface-panel px-3 py-2.5">
            <span class="text-[13px] font-semibold leading-snug text-text-primary">{{ t('settings.modelTestDialog.video.ready') }}</span>
            <small class="text-xs leading-snug text-text-muted">{{ t('settings.modelTestDialog.result.duration', { duration: formattedDuration }) }}</small>
            <small v-if="result?.filePath" class="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] leading-snug text-text-muted">{{ result.filePath }}</small>
          </figcaption>
        </figure>

        <pre v-if="resultText" class="m-0 max-h-[280px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">{{ resultText }}</pre>
      </section>
    </div>

    <t-dialog v-model:visible="videoPreviewVisible" :header="t('settings.modelTestDialog.video.previewTitle')" width="min(96vw, 1280px)" :footer="false">
      <div class="grid min-h-[70vh] place-items-center overflow-hidden rounded-lg bg-[#08090a] p-3">
        <video class="block max-h-[82vh] max-w-full object-contain" :src="videoPreviewSrc" :aria-label="t('settings.modelTestDialog.video.previewAlt')" controls playsinline autoplay />
      </div>
    </t-dialog>
  </t-dialog>
</template>
