<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AddIcon, CodeIcon, DeleteIcon, EditIcon, PlayCircleIcon, RefreshIcon, SaveIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import {
  COMMON_VIDEO_DURATIONS,
  COMMON_VIDEO_RESOLUTIONS,
  IMAGE_GENERATION_MODE_VALUES,
  MODEL_CAPABILITIES,
  VIDEO_SIMPLE_MODES,
  type ImageGenerationMode,
  type ProjectImageQuality,
  type ProjectVideoRatio,
  type VideoGenerationMode,
} from '@shared/constants/dictionaries';
import {
  MODEL_AUDIO_SUPPORTS,
  parseVideoModeKey,
  serializeVideoMode,
  VIDEO_MODE_PRESETS,
  type ModelAudioSupport,
  type VideoModePresetValue,
} from '@shared/constants/model-capabilities';
import type { ReasoningEffort, TextReasoningCapability } from '@shared/constants/model-capabilities';
import type { ApiConnectionTestResult, ModelCapability } from '@shared/types/model-config';
import type { VendorListItem, VendorModel, VendorModelType } from '@shared/types/vendor';
import ModelTestDialog from './ModelTestDialog.vue';

interface ModelTestDialogModel {
  label: string;
  modelName: string;
  type: ModelCapability;
  think?: boolean;
  reasoning?: TextReasoningCapability;
  imageModes?: ImageGenerationMode[];
  videoModes?: VideoGenerationMode[];
  durationOptions?: number[];
  resolutionOptions?: string[];
  audioSupport?: ModelAudioSupport;
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

const MODEL_TYPE_OPTIONS: Array<{ labelKey: string; value: VendorModelType }> = [
  { labelKey: 'settings.vendorConfig.modelType.text', value: MODEL_CAPABILITIES.TEXT },
  { labelKey: 'settings.vendorConfig.modelType.image', value: MODEL_CAPABILITIES.IMAGE },
  { labelKey: 'settings.vendorConfig.modelType.video', value: MODEL_CAPABILITIES.VIDEO },
  { labelKey: 'settings.vendorConfig.modelType.tts', value: MODEL_CAPABILITIES.TTS },
];

const IMAGE_MODE_VALUES = IMAGE_GENERATION_MODE_VALUES;
type ImageModeValue = (typeof IMAGE_MODE_VALUES)[number];

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

interface ModelForm {
  name: string;
  modelName: string;
  type: VendorModelType;
  think: boolean;
  imageModes: string[];
  videoModeKeys: VideoModePresetValue[];
  audio: 'optional' | 'true' | 'false';
  durationText: string;
  resolutionText: string;
  voicesText: string;
}

const { t } = useI18n();

const vendors = ref<VendorListItem[]>([]);
const selectedVendorId = ref('');
const loading = ref(false);
const savingInputs = ref(false);
const inputDraft = reactive<Record<string, string>>({});
const advancedVisible = ref(false);

const modelDialogVisible = ref(false);
const modelDialogMode = ref<'create' | 'edit'>('create');
const editingModelName = ref('');
const modelForm = reactive<ModelForm>(createEmptyModelForm());

const testDialogVisible = ref(false);
const testing = ref(false);
const testResult = ref<ApiConnectionTestResult | null>(null);
const testModel = ref<VendorModel | null>(null);

const codeDialogVisible = ref(false);
const codeDialogMode = ref<'add' | 'edit'>('add');
const codeDraft = ref('');
const codeVendorId = ref('');
const codeSaving = ref(false);

const selectedVendor = computed(() => vendors.value.find((vendor) => vendor.id === selectedVendorId.value) ?? null);
const selectedVendorReadOnly = computed(() => selectedVendor.value?.readOnly === true);
const videoModeOptions = computed<Array<{ label: string; value: VideoModePresetValue }>>(() =>
  VIDEO_MODE_PRESETS.map((item) => ({
    label: getVideoModeLabel(item.value),
    value: item.value as VideoModePresetValue,
  })),
);
const selectedVendorBaseUrlHint = computed(() => {
  const vendor = selectedVendor.value;
  if (!vendor) {
    return '';
  }

  if (vendor.id === 'openai') {
    return t('settings.vendorConfig.baseUrlHint.openai');
  }

  if (['atlascloud', 'volcengine', 'minimax'].includes(vendor.id)) {
    return t('settings.vendorConfig.baseUrlHint.compatible');
  }

  return '';
});
const modelsByType = computed(() => {
  const groups: Record<VendorModelType, VendorModel[]> = {
    text: [],
    image: [],
    video: [],
    tts: [],
  };

  for (const model of selectedVendor.value?.models ?? []) {
    const group = groups[model.type as VendorModelType];
    if (group) {
      group.push(model);
    }
  }

  return groups;
});
const testDialogModels = computed<ModelTestDialogModel[]>(() => (testModel.value ? [toModelTestDialogModel(testModel.value)] : []));
const testDialogTitle = computed(() => t('settings.modelTestDialog.title'));

watch(
  selectedVendor,
  (vendor) => {
    resetInputDraft(vendor);
    testResult.value = null;
  },
  { immediate: true },
);

function createEmptyModelForm(): ModelForm {
  return {
    name: '',
    modelName: '',
    type: MODEL_CAPABILITIES.TEXT,
    think: false,
    imageModes: [IMAGE_GENERATION_MODE_VALUES[0]],
    videoModeKeys: [VIDEO_SIMPLE_MODES.TEXT],
    audio: 'optional',
    durationText: [COMMON_VIDEO_DURATIONS[2], COMMON_VIDEO_DURATIONS[5]].join(','),
    resolutionText: [COMMON_VIDEO_RESOLUTIONS[0], COMMON_VIDEO_RESOLUTIONS[1]].join(','),
    voicesText: 'Alloy:alloy',
  };
}

function resetModelForm(model?: VendorModel): void {
  Object.assign(modelForm, createEmptyModelForm());

  if (!model) {
    return;
  }

  modelForm.name = model.name;
  modelForm.modelName = model.modelName;
  modelForm.type = model.type;

  if (model.type === 'text') {
    modelForm.think = model.think;
  }

  if (model.type === 'image') {
    modelForm.imageModes = [...model.mode];
  }

  if (model.type === 'video') {
    modelForm.videoModeKeys = (Array.isArray(model.mode) ? model.mode : []).map((mode) => serializeVideoMode(mode) as VideoModePresetValue);
    modelForm.audio = model.audio === 'optional' ? 'optional' : model.audio ? 'true' : 'false';
    const first = Array.isArray(model.durationResolutionMap) ? model.durationResolutionMap[0] : null;
    modelForm.durationText = first?.duration.join(',') ?? [COMMON_VIDEO_DURATIONS[2], COMMON_VIDEO_DURATIONS[5]].join(',');
    modelForm.resolutionText = first?.resolution.join(',') ?? [COMMON_VIDEO_RESOLUTIONS[0], COMMON_VIDEO_RESOLUTIONS[1]].join(',');
  }

  if (model.type === 'tts') {
    modelForm.voicesText = model.voices.map((voice) => `${voice.title}:${voice.voice}`).join('\n');
  }
}

function resetInputDraft(vendor: VendorListItem | null): void {
  for (const key of Object.keys(inputDraft)) {
    delete inputDraft[key];
  }

  if (!vendor) {
    return;
  }

  for (const input of vendor.inputs) {
    inputDraft[input.key] = isSensitiveVendorInput(input) && isInputConfigured(vendor, input.key) ? '' : (vendor.inputValues[input.key] ?? '');
  }
}

function isSensitiveVendorInput(input: { key: string; type?: string }): boolean {
  return input.type === 'password' || /api[_-]?key|authorization|password|secret|token/i.test(input.key);
}

function isInputConfigured(vendor: VendorListItem, key: string): boolean {
  return vendor.inputConfigured?.[key] === true;
}

function isMissingRequiredInput(vendor: VendorListItem, input: { key: string; type?: string; required: boolean }): boolean {
  if (!input.required) {
    return false;
  }

  if (inputDraft[input.key]?.trim()) {
    return false;
  }

  return !(isSensitiveVendorInput(input) && isInputConfigured(vendor, input.key));
}

function getResponseOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function getImageModeLabel(value: string): string {
  const key = IMAGE_MODE_LABEL_KEYS[value];
  return key ? t(key) : value;
}

function getVideoModeLabel(value: string): string {
  const key = VIDEO_MODE_LABEL_KEYS[value];
  return key ? t(key) : value;
}

function toModelTestDialogModel(model: VendorModel): ModelTestDialogModel {
  const videoModeList = model.type === 'video' && Array.isArray(model.mode) ? model.mode : [];
  const durationResolutionMap = model.type === 'video' && Array.isArray(model.durationResolutionMap) ? model.durationResolutionMap : [];

  return {
    label: `${model.name} (${model.modelName})`,
    modelName: model.modelName,
    type: model.type,
    think: model.type === 'text' ? model.think : undefined,
    reasoning: model.type === 'text' ? model.reasoning : undefined,
    imageModes: model.type === 'image' ? [...(Array.isArray(model.mode) ? model.mode : [])] : undefined,
    videoModes: model.type === 'video' ? videoModeList.map((mode) => (Array.isArray(mode) ? [...mode] : mode)) : undefined,
    durationOptions: model.type === 'video' ? durationResolutionMap.flatMap((item) => (Array.isArray(item.duration) ? item.duration : [])) : undefined,
    resolutionOptions: model.type === 'video' ? durationResolutionMap.flatMap((item) => (Array.isArray(item.resolution) ? item.resolution : [])) : undefined,
    audioSupport: model.type === 'video'
      ? model.audio === true
        ? MODEL_AUDIO_SUPPORTS.REQUIRED
        : model.audio === false
          ? MODEL_AUDIO_SUPPORTS.NONE
          : MODEL_AUDIO_SUPPORTS.OPTIONAL
      : undefined,
  };
}

function getReadonlyProjectionMessage(): string {
  return t('settings.vendorConfig.message.readonlyProjection');
}

function getRequiredMessage(label: string): string {
  return t('settings.vendorConfig.validation.required', { label });
}

function getVendorStatusText(vendor: VendorListItem): string {
  if (vendor.managedBy === 'model-service') {
    return t('settings.vendorConfig.status.modelServiceGenerated');
  }

  if (vendor.status === 'ready') {
    return vendor.codeReady ? t('settings.vendorConfig.status.adapterLoaded') : t('settings.vendorConfig.status.builtinAdapter');
  }

  return vendor.statusText || t('settings.vendorConfig.status.pending');
}

function getVendorSourceText(vendor: VendorListItem): string {
  if (vendor.managedBy === 'model-service') {
    return t('settings.vendorConfig.vendorSource.modelService');
  }

  if (vendor.builtin) {
    return t('settings.vendorConfig.vendorSource.builtin');
  }

  return t('settings.vendorConfig.vendorSource.custom');
}

function getVendorListSummary(vendor: VendorListItem): string {
  const enabled = vendor.enabled ? t('settings.vendorConfig.status.enabled') : t('settings.vendorConfig.status.disabled');
  return `${enabled} · ${getVendorSourceText(vendor)}`;
}

function getAdapterKindText(vendor: VendorListItem): string {
  return vendor.codeReady ? t('settings.vendorConfig.status.customAdapter') : t('settings.vendorConfig.status.builtinAdapter');
}

async function loadVendors(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.vendor.list();
    if (!getResponseOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    vendors.value = Array.isArray(response.data.vendors) ? response.data.vendors : [];
    if (!selectedVendorId.value || !vendors.value.some((vendor) => vendor.id === selectedVendorId.value)) {
      selectedVendorId.value = vendors.value[0]?.id ?? '';
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : t('settings.vendorConfig.message.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function saveInputs(): Promise<void> {
  const vendor = selectedVendor.value;
  if (!vendor) {
    return;
  }
  if (vendor.readOnly) {
    MessagePlugin.warning(getReadonlyProjectionMessage());
    return;
  }

  const missing = vendor.inputs.find((input) => isMissingRequiredInput(vendor, input));
  if (missing) {
    MessagePlugin.warning(getRequiredMessage(missing.label));
    return;
  }

  savingInputs.value = true;
  try {
    const response = await window.vtStudio.settings.vendor.updateInputs({
      vendorId: vendor.id,
      inputValues: { ...inputDraft },
    });

    if (!getResponseOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('settings.vendorConfig.message.inputsSaved'));
    await loadVendors();
  } finally {
    savingInputs.value = false;
  }
}

async function saveInputsForTest(vendor: VendorListItem): Promise<boolean> {
  const missing = vendor.inputs.find((input) => isMissingRequiredInput(vendor, input));
  if (missing) {
    const message = getRequiredMessage(missing.label);
    testResult.value = { content: message, durationMs: 0 };
    MessagePlugin.warning(message);
    return false;
  }

  const response = await window.vtStudio.settings.vendor.updateInputs({
    vendorId: vendor.id,
    inputValues: { ...inputDraft },
  });

  if (!getResponseOk(response)) {
    testResult.value = { content: response.msg, durationMs: 0 };
    MessagePlugin.error(response.msg);
    return false;
  }

  return true;
}

async function setEnabled(vendor: VendorListItem, enabled: boolean): Promise<void> {
  if (vendor.readOnly) {
    MessagePlugin.warning(getReadonlyProjectionMessage());
    return;
  }

  const previous = vendor.enabled;
  vendor.enabled = enabled;

  const response = await window.vtStudio.settings.vendor.setEnabled({ vendorId: vendor.id, enabled });
  if (!getResponseOk(response)) {
    vendor.enabled = previous;
    MessagePlugin.error(response.msg);
    return;
  }

  MessagePlugin.success(enabled ? t('settings.vendorConfig.message.enabled') : t('settings.vendorConfig.message.disabled'));
}

function openCreateModelDialog(type: VendorModelType = 'text'): void {
  if (selectedVendor.value?.readOnly) {
    MessagePlugin.warning(getReadonlyProjectionMessage());
    return;
  }

  modelDialogMode.value = 'create';
  editingModelName.value = '';
  resetModelForm();
  modelForm.type = type;
  modelDialogVisible.value = true;
}

function openEditModelDialog(model: VendorModel): void {
  if (selectedVendor.value?.readOnly) {
    MessagePlugin.warning(getReadonlyProjectionMessage());
    return;
  }

  modelDialogMode.value = 'edit';
  editingModelName.value = model.modelName;
  resetModelForm(model);
  modelDialogVisible.value = true;
}

function parseCsv(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseVideoModes(keys: VideoModePresetValue[]): VideoGenerationMode[] {
  return keys.map((key) => parseVideoModeKey(key) as VideoGenerationMode);
}

function isImageMode(value: string): value is ImageModeValue {
  return IMAGE_MODE_VALUES.includes(value as ImageModeValue);
}

function buildModelFromForm(): VendorModel | null {
  const base = {
    name: modelForm.name.trim(),
    modelName: modelForm.modelName.trim(),
  };

  if (!base.name || !base.modelName) {
    MessagePlugin.warning(t('settings.vendorConfig.validation.modelNameAndIdRequired'));
    return null;
  }

  if (modelForm.type === 'text') {
    return { ...base, type: 'text', think: modelForm.think };
  }

  if (modelForm.type === 'image') {
    const mode = modelForm.imageModes.filter(isImageMode);
    if (mode.length === 0) {
      MessagePlugin.warning(t('settings.vendorConfig.validation.imageModeRequired'));
      return null;
    }

    return { ...base, type: 'image', mode };
  }

  if (modelForm.type === 'video') {
    const duration = parseCsv(modelForm.durationText).map(Number).filter((value) => Number.isFinite(value) && value > 0);
    const resolution = parseCsv(modelForm.resolutionText);
    if (modelForm.videoModeKeys.length === 0 || duration.length === 0 || resolution.length === 0) {
      MessagePlugin.warning(t('settings.vendorConfig.validation.videoModeDurationResolutionRequired'));
      return null;
    }

    return {
      ...base,
      type: 'video',
      mode: parseVideoModes(modelForm.videoModeKeys),
      audio: modelForm.audio === 'optional' ? 'optional' : modelForm.audio === 'true',
      durationResolutionMap: [{ duration, resolution }],
    };
  }

  const voices = modelForm.voicesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, voice] = line.split(/:(.+)/);
      return { title: title?.trim() ?? '', voice: voice?.trim() ?? '' };
    })
    .filter((voice) => voice.title && voice.voice);

  if (voices.length === 0) {
    MessagePlugin.warning(t('settings.vendorConfig.validation.ttsVoiceRequired'));
    return null;
  }

  return { ...base, type: 'tts', voices };
}

async function saveModel(): Promise<void> {
  const vendor = selectedVendor.value;
  const model = buildModelFromForm();
  if (!vendor || !model) {
    return;
  }
  if (vendor.readOnly) {
    MessagePlugin.warning(getReadonlyProjectionMessage());
    return;
  }

  const response = await window.vtStudio.settings.vendor.saveModel({
    vendorId: vendor.id,
    model,
    originalModelName: modelDialogMode.value === 'edit' ? editingModelName.value : undefined,
  });

  if (!getResponseOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }

  MessagePlugin.success(modelDialogMode.value === 'edit' ? t('settings.vendorConfig.message.modelSaved') : t('settings.vendorConfig.message.modelAdded'));
  modelDialogVisible.value = false;
  await loadVendors();
}

function confirmDeleteModel(model: VendorModel): void {
  const vendor = selectedVendor.value;
  if (!vendor) {
    return;
  }
  if (vendor.readOnly) {
    MessagePlugin.warning(getReadonlyProjectionMessage());
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('settings.vendorConfig.deleteModelDialog.title'),
    body: t('settings.vendorConfig.deleteModelDialog.body', { name: model.name }),
    confirmBtn: t('settings.vendorConfig.deleteModelDialog.confirm'),
    cancelBtn: t('settings.vendorConfig.deleteModelDialog.cancel'),
    theme: 'warning',
    async onConfirm() {
      const response = await window.vtStudio.settings.vendor.deleteModel({ vendorId: vendor.id, modelName: model.modelName });
      if (!getResponseOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }

      dialog.destroy();
      MessagePlugin.success(t('settings.vendorConfig.message.modelDeleted'));
      await loadVendors();
    },
  });
}

function openTestDialog(model: VendorModel): void {
  testModel.value = model;
  testResult.value = null;
  testDialogVisible.value = true;
}

async function runModelTest(payload: ModelTestSubmitPayload): Promise<void> {
  const vendor = selectedVendor.value;
  const model = testModel.value;
  if (!vendor || !model) {
    return;
  }

  testing.value = true;
  testResult.value = null;
  try {
    const saved = await saveInputsForTest(vendor);
    if (!saved) {
      return;
    }

    if (model.type === 'text') {
      const response = await window.vtStudio.settings.vendor.testText({
        vendorId: vendor.id,
        modelName: payload.modelName,
        prompt: payload.prompt,
        reasoningEnabled: payload.reasoningEnabled,
        reasoningEffort: payload.reasoningEffort,
      });
      if (!getResponseOk(response)) {
        testResult.value = { content: response.msg, durationMs: 0 };
        MessagePlugin.error(response.msg);
        return;
      }

      testResult.value = response.data;
      return;
    }

    if (model.type === 'image') {
      const response = await window.vtStudio.settings.vendor.testImage({
        vendorId: vendor.id,
        modelName: payload.modelName,
        prompt: payload.prompt,
        imageMode: payload.imageMode,
        imageSize: payload.imageSize,
        aspectRatio: payload.aspectRatio,
        referenceImages: payload.referenceImages,
      });
      if (!getResponseOk(response)) {
        testResult.value = { content: response.msg, durationMs: 0 };
        MessagePlugin.error(response.msg);
        return;
      }
      testResult.value = response.data;
      return;
    }

    if (model.type === 'video') {
      const modeKeys = (Array.isArray(model.mode) ? model.mode : []).map(serializeVideoMode);
      const response = await window.vtStudio.settings.vendor.testVideo({
        vendorId: vendor.id,
        modelName: payload.modelName,
        mode: payload.videoMode || (modeKeys.includes('text') ? 'text' : String(modeKeys[0] ?? 'text')),
        prompt: payload.prompt,
        duration: payload.duration,
        resolution: payload.resolution,
        aspectRatio: payload.videoAspectRatio,
        audio: payload.audio,
        referenceImages: payload.referenceImages,
      });
      if (!getResponseOk(response)) {
        testResult.value = { content: response.msg, durationMs: 0 };
        MessagePlugin.error(response.msg);
        return;
      }
      testResult.value = response.data;
      return;
    }

    testResult.value = { content: t('settings.vendorConfig.testResult.ttsPending'), durationMs: 0 };
  } finally {
    testing.value = false;
  }
}

async function openCodeDialog(mode: 'add' | 'edit'): Promise<void> {
  codeDialogMode.value = mode;
  codeDraft.value = '';
  codeVendorId.value = selectedVendor.value?.id ?? '';

  if (mode === 'edit') {
    const vendor = selectedVendor.value;
    if (!vendor) {
      return;
    }
    if (vendor.readOnly) {
      MessagePlugin.warning(t('settings.vendorConfig.message.readonlyAdapterEdit'));
      return;
    }

    const response = await window.vtStudio.settings.vendor.getCode({ vendorId: vendor.id });
    if (!getResponseOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    codeDraft.value = response.data.code;
    codeVendorId.value = response.data.vendorId;
  }

  codeDialogVisible.value = true;
}

async function saveCode(): Promise<void> {
  if (!codeDraft.value.trim()) {
    MessagePlugin.warning(t('settings.vendorConfig.validation.adapterCodeRequired'));
    return;
  }

  codeSaving.value = true;
  try {
    const response =
      codeDialogMode.value === 'add'
        ? await window.vtStudio.settings.vendor.addCode({ code: codeDraft.value })
        : await window.vtStudio.settings.vendor.updateCode({ vendorId: codeVendorId.value, code: codeDraft.value });

    if (!getResponseOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(codeDialogMode.value === 'add' ? t('settings.vendorConfig.message.customVendorAdded') : t('settings.vendorConfig.message.adapterSaved'));
    codeDialogVisible.value = false;
    await loadVendors();
    selectedVendorId.value = response.data.vendorId;
  } finally {
    codeSaving.value = false;
  }
}

function confirmDeleteVendor(): void {
  const vendor = selectedVendor.value;
  if (!vendor) {
    return;
  }
  if (vendor.readOnly) {
    MessagePlugin.warning(t('settings.vendorConfig.message.readonlyDelete'));
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('settings.vendorConfig.deleteVendorDialog.title'),
    body: t('settings.vendorConfig.deleteVendorDialog.body', { name: vendor.name }),
    confirmBtn: t('settings.vendorConfig.deleteVendorDialog.confirm'),
    cancelBtn: t('settings.vendorConfig.deleteVendorDialog.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.settings.vendor.delete({ vendorId: vendor.id });
      if (!getResponseOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }

      dialog.destroy();
      MessagePlugin.success(t('settings.vendorConfig.message.vendorDeleted'));
      selectedVendorId.value = '';
      await loadVendors();
    },
  });
}

function getCapabilityLabel(capability: string): string {
  const key = `settings.vendorConfig.capability.${capability}`;
  const label = t(key);
  return label === key ? capability : label;
}

function formatAdapterUpdatedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return t('settings.vendorConfig.unknown');
  }

  return new Date(timestamp).toLocaleString();
}

function getVendorName(vendor: VendorListItem): string {
  return vendor.name || vendor.id || t('settings.vendorConfig.unknown');
}

function getVendorLogo(vendor: VendorListItem): string {
  return getVendorName(vendor).slice(0, 2).toUpperCase();
}

onMounted(loadVendors);
</script>

<template>
  <section class="settings-section vendor-section">
    <div class="vendor-section-head">
      <div>
        <p class="eyebrow">F-002-003</p>
        <h3>{{ t('settings.vendorConfig.title') }}</h3>
      </div>
      <div class="vendor-head-actions">
        <t-button variant="outline" :loading="loading" @click="loadVendors">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.vendorConfig.refresh') }}
        </t-button>
        <t-button variant="outline" @click="advancedVisible = !advancedVisible">
          <template #icon><CodeIcon /></template>
          {{ t('settings.vendorConfig.advancedAdapter') }}
        </t-button>
      </div>
    </div>

    <div v-if="advancedVisible" class="vendor-warning">
      {{ t('settings.vendorConfig.advancedWarning') }}
    </div>

    <div class="vendor-layout">
      <aside class="vendor-list" :class="{ 'is-loading': loading }">
        <button
          v-for="vendor in vendors"
          :key="vendor.id"
          type="button"
          class="vendor-list-item"
          :class="{ 'is-active': vendor.id === selectedVendorId }"
          @click="selectedVendorId = vendor.id"
        >
          <span class="vendor-logo">{{ getVendorLogo(vendor) }}</span>
          <span class="vendor-list-main">
            <strong>{{ getVendorName(vendor) }}</strong>
            <small>{{ getVendorListSummary(vendor) }}</small>
          </span>
          <t-tag size="small" :theme="vendor.status === 'ready' ? 'success' : 'warning'" variant="light">{{ vendor.status === 'ready' ? t('settings.vendorConfig.status.ready') : t('settings.vendorConfig.status.pending') }}</t-tag>
        </button>
      </aside>

      <main v-if="selectedVendor" class="vendor-detail">
        <div class="vendor-title-row">
          <div>
            <h4>{{ getVendorName(selectedVendor) }}</h4>
            <p>{{ selectedVendor.description || t('settings.vendorConfig.noDescription') }}</p>
          </div>
          <t-switch :model-value="selectedVendor.enabled" size="large" :disabled="selectedVendor.readOnly" @change="(value) => setEnabled(selectedVendor!, Boolean(value))" />
        </div>

        <div class="vendor-meta-row">
          <t-tag v-for="capability in selectedVendor.capabilities" :key="capability" variant="light">{{ getCapabilityLabel(capability) }}</t-tag>
          <t-tag v-if="selectedVendor.managedBy === 'model-service'" theme="primary" variant="light">{{ t('settings.vendorConfig.vendorSource.modelService') }}</t-tag>
          <t-tag :theme="selectedVendor.codeReady ? 'success' : 'default'" variant="light">{{ getAdapterKindText(selectedVendor) }}</t-tag>
          <t-tag v-if="selectedVendor.version" variant="light">{{ t('settings.vendorConfig.version', { version: selectedVendor.version }) }}</t-tag>
          <t-tag v-if="selectedVendor.adapterMd5" variant="light">md5 {{ selectedVendor.adapterMd5.slice(0, 8) }}</t-tag>
          <t-tag variant="light">{{ t('settings.vendorConfig.updatedAt', { time: formatAdapterUpdatedAt(selectedVendor.adapterUpdatedAt) }) }}</t-tag>
          <t-tag v-if="selectedVendor.status !== 'ready'" theme="warning" variant="light">{{ getVendorStatusText(selectedVendor) }}</t-tag>
        </div>

        <section class="vendor-panel">
          <div class="vendor-panel-head">
            <strong>{{ t('settings.vendorConfig.connectionParams') }}</strong>
            <t-button size="small" theme="primary" :loading="savingInputs" :disabled="selectedVendor.readOnly" @click="saveInputs">
              <template #icon><SaveIcon /></template>
              {{ t('settings.vendorConfig.saveParams') }}
            </t-button>
          </div>

          <div v-if="selectedVendor.inputs.length" class="vendor-input-grid">
            <label v-for="input in selectedVendor.inputs" :key="input.key" class="vendor-field">
              <span>{{ input.label }}<b v-if="input.required">*</b></span>
              <t-input v-model="inputDraft[input.key]" :type="input.type === 'password' ? 'password' : 'text'" :placeholder="input.placeholder" :disabled="selectedVendor.readOnly" />
              <small v-if="isSensitiveVendorInput(input) && isInputConfigured(selectedVendor, input.key)" class="settings-hint">
                {{ t('settings.vendorConfig.secretSavedHint') }}
              </small>
            </label>
          </div>
          <p v-if="selectedVendorBaseUrlHint" class="vendor-input-hint">{{ selectedVendorBaseUrlHint }}</p>
          <t-empty v-else size="small" :description="t('settings.vendorConfig.noDynamicInputs')" />
        </section>

        <section class="vendor-panel">
          <div class="vendor-panel-head">
            <strong>{{ t('settings.vendorConfig.modelList') }}</strong>
            <t-button size="small" theme="primary" :disabled="selectedVendor.readOnly" @click="openCreateModelDialog()">
              <template #icon><AddIcon /></template>
              {{ t('settings.vendorConfig.addModel') }}
            </t-button>
          </div>

          <div class="model-groups">
            <div v-for="typeOption in MODEL_TYPE_OPTIONS" :key="typeOption.value" class="model-group">
              <div class="model-group-title">
                <span>{{ t(typeOption.labelKey) }}</span>
                <t-button size="small" variant="text" :disabled="selectedVendor.readOnly" @click="openCreateModelDialog(typeOption.value)">{{ t('settings.vendorConfig.add') }}</t-button>
              </div>
              <div v-if="modelsByType[typeOption.value].length" class="model-card-grid">
                <article v-for="model in modelsByType[typeOption.value]" :key="model.modelName" class="model-card">
                  <div>
                    <strong>{{ model.name }}</strong>
                    <small>{{ model.modelName }}</small>
                  </div>
                  <div class="model-card-actions">
                    <t-tooltip :content="t('settings.vendorConfig.tooltip.testModel')">
                      <t-button shape="square" size="small" variant="text" :aria-label="t('settings.vendorConfig.tooltip.testModel')" :disabled="selectedVendor.readOnly" @click="openTestDialog(model)">
                        <PlayCircleIcon />
                      </t-button>
                    </t-tooltip>
                    <t-tooltip :content="t('settings.vendorConfig.tooltip.editModel')">
                      <t-button shape="square" size="small" variant="text" :aria-label="t('settings.vendorConfig.tooltip.editModel')" :disabled="selectedVendor.readOnly" @click="openEditModelDialog(model)">
                        <EditIcon />
                      </t-button>
                    </t-tooltip>
                    <t-tooltip :content="t('settings.vendorConfig.tooltip.deleteModel')">
                      <t-button shape="square" size="small" variant="text" theme="danger" :aria-label="t('settings.vendorConfig.tooltip.deleteModel')" :disabled="selectedVendor.readOnly" @click="confirmDeleteModel(model)">
                        <DeleteIcon />
                      </t-button>
                    </t-tooltip>
                  </div>
                </article>
              </div>
              <p v-else class="model-empty">{{ t('settings.vendorConfig.emptyModelByType', { type: t(typeOption.labelKey) }) }}</p>
            </div>
          </div>
        </section>

        <section v-if="advancedVisible" class="vendor-panel">
          <div class="vendor-panel-head">
            <strong>{{ t('settings.vendorConfig.advancedAdapter') }}</strong>
            <div class="vendor-head-actions">
              <t-button size="small" variant="outline" @click="openCodeDialog('add')">
                <template #icon><AddIcon /></template>
                {{ t('settings.vendorConfig.addCustomVendor') }}
              </t-button>
              <t-button size="small" variant="outline" :disabled="selectedVendorReadOnly || !selectedVendor.codeEditable" @click="openCodeDialog('edit')">
                <template #icon><CodeIcon /></template>
                {{ t('settings.vendorConfig.editAdapter') }}
              </t-button>
              <t-button size="small" theme="danger" variant="outline" :disabled="selectedVendorReadOnly || selectedVendor.builtin" @click="confirmDeleteVendor">
                <template #icon><DeleteIcon /></template>
                {{ t('settings.vendorConfig.deleteVendor') }}
              </t-button>
            </div>
          </div>
          <div class="vendor-diagnostic">
            <span>{{ t('settings.vendorConfig.adapterStatus', { status: getVendorStatusText(selectedVendor) }) }}</span>
            <span v-if="selectedVendor.lastError">{{ t('settings.vendorConfig.lastError', { error: selectedVendor.lastError }) }}</span>
            <span v-else>{{ t('settings.vendorConfig.lastError', { error: t('settings.vendorConfig.none') }) }}</span>
          </div>
        </section>
      </main>

      <main v-else class="vendor-detail empty-detail">
        <t-empty :description="t('settings.vendorConfig.emptyVendor')" />
      </main>
    </div>
  </section>

  <t-dialog v-model:visible="modelDialogVisible" :header="modelDialogMode === 'edit' ? t('settings.vendorConfig.modelDialog.editTitle') : t('settings.vendorConfig.modelDialog.addTitle')" width="620px" :confirm-btn="t('settings.vendorConfig.save')" @confirm="saveModel">
    <t-form :data="modelForm" layout="vertical">
      <div class="model-form-grid">
        <t-form-item :label="t('settings.vendorConfig.modelDialog.modelName')">
          <t-input v-model="modelForm.name" :placeholder="t('settings.vendorConfig.modelDialog.modelNamePlaceholder')" />
        </t-form-item>
        <t-form-item :label="t('settings.vendorConfig.modelDialog.modelId')">
          <t-input v-model="modelForm.modelName" :placeholder="t('settings.vendorConfig.modelDialog.modelIdPlaceholder')" />
        </t-form-item>
      </div>
      <t-form-item :label="t('settings.vendorConfig.modelDialog.modelType')">
        <t-radio-group v-model="modelForm.type">
          <t-radio-button v-for="item in MODEL_TYPE_OPTIONS" :key="item.value" :value="item.value">{{ t(item.labelKey) }}</t-radio-button>
        </t-radio-group>
      </t-form-item>
      <t-form-item v-if="modelForm.type === 'text'" :label="t('settings.vendorConfig.modelDialog.thinking')">
        <t-switch v-model="modelForm.think" />
      </t-form-item>
      <t-form-item v-if="modelForm.type === 'image'" :label="t('settings.vendorConfig.modelDialog.imageMode')">
        <t-checkbox-group v-model="modelForm.imageModes">
          <t-checkbox value="text">{{ getImageModeLabel('text') }}</t-checkbox>
          <t-checkbox value="singleImage">{{ getImageModeLabel('singleImage') }}</t-checkbox>
          <t-checkbox value="multiReference">{{ getImageModeLabel('multiReference') }}</t-checkbox>
        </t-checkbox-group>
      </t-form-item>
      <template v-if="modelForm.type === 'video'">
        <t-form-item :label="t('settings.vendorConfig.modelDialog.videoMode')">
          <t-select v-model="modelForm.videoModeKeys" multiple :options="videoModeOptions" :placeholder="t('settings.vendorConfig.modelDialog.videoModePlaceholder')" />
        </t-form-item>
        <div class="model-form-grid">
          <t-form-item :label="t('settings.vendorConfig.modelDialog.duration')">
            <t-input v-model="modelForm.durationText" placeholder="5,10" />
          </t-form-item>
          <t-form-item :label="t('settings.vendorConfig.modelDialog.resolution')">
            <t-input v-model="modelForm.resolutionText" placeholder="720p,1080p" />
          </t-form-item>
        </div>
        <t-form-item :label="t('settings.vendorConfig.modelDialog.outputAudio')">
          <t-radio-group v-model="modelForm.audio">
            <t-radio-button value="optional">{{ t('settings.vendorConfig.audio.optional') }}</t-radio-button>
            <t-radio-button value="true">{{ t('settings.vendorConfig.audio.enabled') }}</t-radio-button>
            <t-radio-button value="false">{{ t('settings.vendorConfig.audio.disabled') }}</t-radio-button>
          </t-radio-group>
        </t-form-item>
      </template>
      <t-form-item v-if="modelForm.type === 'tts'" :label="t('settings.vendorConfig.modelDialog.voices')">
        <t-textarea v-model="modelForm.voicesText" placeholder="Alloy:alloy" :autosize="{ minRows: 3, maxRows: 8 }" />
      </t-form-item>
    </t-form>
  </t-dialog>

  <ModelTestDialog
    v-model:visible="testDialogVisible"
    :header="testDialogTitle"
    :models="testDialogModels"
    :initial-model-name="testModel?.modelName"
    :default-prompt="t('settings.vendorConfig.testPrompt.default')"
    :loading="testing"
    :result="testResult"
    @submit="runModelTest"
  />

  <t-dialog v-model:visible="codeDialogVisible" :header="codeDialogMode === 'add' ? t('settings.vendorConfig.codeDialog.addTitle') : t('settings.vendorConfig.codeDialog.editTitle')" width="860px" :confirm-btn="t('settings.vendorConfig.codeDialog.save')" :confirm-loading="codeSaving" @confirm="saveCode">
    <div class="vendor-warning compact">
      {{ t('settings.vendorConfig.codeDialog.warning') }}
    </div>
    <t-textarea v-model="codeDraft" class="code-editor" :placeholder="t('settings.vendorConfig.codeDialog.placeholder')" :autosize="{ minRows: 18, maxRows: 28 }" />
  </t-dialog>
</template>

<style scoped>
.vendor-input-hint {
  margin: 12px 0 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.vendor-diagnostic {
  display: grid;
  gap: 6px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
</style>
