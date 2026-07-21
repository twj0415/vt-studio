<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { AddIcon, DeleteIcon, EditIcon, PlayCircleIcon, RefreshIcon, SwapIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import type { ReasoningEffort, TextReasoningCapability } from '@shared/constants/model-capabilities';
import type { ImageGenerationMode, ProjectImageQuality, ProjectVideoRatio } from '@shared/constants/dictionaries';
import { isReadyModelOperation } from '@shared/model-capability-options';
import type { ModelCapabilityMatrixItem } from '@shared/types/model-capability';
import type { ApiConnection, ApiConnectionDraft, ApiConnectionTestResult, ApiServiceType, CapabilitySummary, ModelCapability, RegisteredModel } from '@shared/types/model-config';
import ModelTestDialog from './ModelTestDialog.vue';

interface ModelTestDialogModel {
  label: string;
  modelName: string;
  type: ModelCapability;
  think?: boolean;
  reasoning?: TextReasoningCapability;
  operations: ModelCapabilityMatrixItem[];
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

interface ServiceTemplate {
  serviceType: ApiServiceType;
  name: string;
  defaultBaseUrl: string;
  capabilities: ModelCapability[];
  models: RegisteredModel[];
}

const CAPABILITY_OPTIONS: Array<{ labelKey: string; value: ModelCapability }> = [
  { labelKey: 'settings.modelService.capability.text', value: 'text' },
  { labelKey: 'settings.modelService.capability.image', value: 'image' },
  { labelKey: 'settings.modelService.capability.video', value: 'video' },
  { labelKey: 'settings.modelService.capability.tts', value: 'tts' },
];

const SERVICE_ORDER: ApiServiceType[] = ['openai-gateway', 'openai-official', 'claude', 'deepseek', 'gemini', 'minimax', 'klingai', 'local-workflow', 'advanced'];

const { t } = useI18n();
const emit = defineEmits<{
  modelServiceUpdated: [];
}>();
const loading = ref(false);
const saving = ref(false);
const connections = ref<ApiConnection[]>([]);
const capabilities = ref<CapabilitySummary[]>([]);
const capabilityMatrix = ref<ModelCapabilityMatrixItem[]>([]);
const templates = ref<ServiceTemplate[]>([]);
const serviceDialogVisible = ref(false);
const bindingDialogVisible = ref(false);
const modelTestDialogVisible = ref(false);
const modelTestLoading = ref(false);
const editingId = ref('');
const activeCapability = ref<ModelCapability>('text');
const testPrompt = ref('');
const modelTestTitle = ref('');
const modelTestInitialModelName = ref('');
const modelTestDefaultPrompt = ref('');
const modelTestModels = ref<ModelTestDialogModel[]>([]);
const modelTestResult = ref<ApiConnectionTestResult | null>(null);
const modelTestContext = ref<
  | {
      type: 'connection';
      connection: ApiConnection;
    }
  | {
      type: 'capability';
      summary: CapabilitySummary;
    }
  | null
>(null);
const serviceForm = reactive({
  name: '',
  serviceType: 'openai-gateway' as ApiServiceType,
  baseUrl: '',
  apiKey: '',
  secretKey: '',
  workflowManifest: '',
  selectedModelNames: [] as string[],
});
const bindingForm = reactive({
  connectionId: '',
  modelName: '',
});

const orderedTemplates = computed(() =>
  [...templates.value].sort((left, right) => SERVICE_ORDER.indexOf(left.serviceType) - SERVICE_ORDER.indexOf(right.serviceType)),
);
const serviceOptions = computed(() => orderedTemplates.value.map((item) => ({ label: item.name, value: item.serviceType })));
const selectedTemplate = computed(() => templates.value.find((item) => item.serviceType === serviceForm.serviceType) ?? null);
const editingConnection = computed(() => connections.value.find((connection) => connection.id === editingId.value) ?? null);
const selectableModels = computed(() => {
  const models = new Map<string, RegisteredModel>();
  selectedTemplate.value?.models.forEach((model) => models.set(model.modelName, model));
  editingConnection.value?.models.forEach((model) => models.set(model.modelName, model));
  return [...models.values()];
});
const selectedModels = computed(() => selectableModels.value.filter((model) => serviceForm.selectedModelNames.includes(model.modelName)));
const activeSummary = computed(() => capabilities.value.find((item) => item.capability === activeCapability.value) ?? null);
const availableConnections = computed(() => connections.value.filter((connection) => getReadyModelsForConnection(connection, activeCapability.value).length > 0));
const selectedBindingConnection = computed(() => availableConnections.value.find((connection) => connection.id === bindingForm.connectionId) ?? null);
const availableModels = computed(() => selectedBindingConnection.value ? getReadyModelsForConnection(selectedBindingConnection.value, activeCapability.value) : []);

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function getCapabilityLabel(capability: ModelCapability): string {
  const option = CAPABILITY_OPTIONS.find((item) => item.value === capability);
  return option ? t(option.labelKey) : capability;
}

function getCapabilityStatusText(summary: CapabilitySummary): string {
  if (summary.status === 'configured') {
    return t('settings.modelService.status.configured');
  }

  if (!summary.binding || summary.status === 'missing') {
    return t('settings.modelService.status.missing');
  }

  return t('settings.modelService.status.unsupported');
}

function getConnectionStatusText(connection: ApiConnection): string {
  if (connection.status === 'ready') {
    return t('settings.modelService.connectionStatus.ready');
  }

  if (connection.serviceType === 'klingai' && !connection.apiKeyConfigured) {
    return t('settings.modelService.connectionStatus.missingAccessKey');
  }

  if (connection.serviceType === 'klingai' && !connection.secretKeyConfigured) {
    return t('settings.modelService.connectionStatus.missingSecretKey');
  }

  if (connection.serviceType !== 'local-workflow' && !connection.apiKeyConfigured) {
    return t('settings.modelService.connectionStatus.missingApiKey');
  }

  if (connection.serviceType === 'local-workflow' && !connection.baseUrl) {
    return t('settings.modelService.connectionStatus.missingEndpoint');
  }

  if (connection.serviceType === 'local-workflow' && !connection.workflowManifest) {
    return t('settings.modelService.connectionStatus.invalidWorkflow');
  }

  if (connection.serviceType === 'openai-gateway' && !connection.baseUrl) {
    return t('settings.modelService.connectionStatus.missingBaseUrl');
  }

  if (connection.models.length === 0) {
    return t('settings.modelService.connectionStatus.missingModels');
  }

  return t('settings.modelService.connectionStatus.incomplete');
}

function getCapabilityConnectionName(summary: CapabilitySummary): string {
  return summary.binding ? summary.connectionName : t('settings.modelService.unselected');
}

function getCapabilityModelDisplayName(summary: CapabilitySummary): string {
  return summary.binding ? summary.modelDisplayName : t('settings.modelService.unselected');
}

function getServiceName(serviceType: ApiServiceType): string {
  return templates.value.find((item) => item.serviceType === serviceType)?.name ?? serviceType;
}

function getModelsByType(type: ModelCapability): RegisteredModel[] {
  return selectableModels.value.filter((model) => model.type === type);
}

function getReadyOperationsForModel(connectionId: string, modelName: string, type?: ModelCapability): ModelCapabilityMatrixItem[] {
  return capabilityMatrix.value.filter((item) => (
    item.connectionId === connectionId
    && item.modelName === modelName
    && (!type || item.modelType === type)
    && isReadyModelOperation(item)
  ));
}

function getReadyModelsForConnection(connection: ApiConnection, type: ModelCapability): RegisteredModel[] {
  return connection.models.filter((model) => (
    model.type === type
    && getReadyOperationsForModel(connection.id, model.modelName, type).length > 0
  ));
}

function getConnectionTestModels(connection: ApiConnection): ModelTestDialogModel[] {
  return connection.models
    .filter((model) => ['text', 'image', 'video'].includes(model.type))
    .map((model) => toModelTestDialogModel(model, getReadyOperationsForModel(connection.id, model.modelName, model.type)))
    .filter((model) => model.operations.length > 0);
}

function toModelTestDialogModel(model: RegisteredModel, operations: ModelCapabilityMatrixItem[]): ModelTestDialogModel {
  return {
    label: `${model.displayName} (${model.modelName})`,
    modelName: model.modelName,
    type: model.type,
    think: model.think,
    reasoning: model.reasoning,
    operations,
  };
}

function cloneReasoning(reasoning: TextReasoningCapability | undefined): TextReasoningCapability | undefined {
  if (!reasoning) {
    return undefined;
  }

  return {
    supported: Boolean(reasoning.supported),
    defaultEffort: reasoning.defaultEffort,
    efforts: [...reasoning.efforts],
  };
}

function cloneVideoModes(modes: RegisteredModel['videoModes']): RegisteredModel['videoModes'] {
  return modes?.map((mode) => (Array.isArray(mode) ? [...mode] : mode));
}

function toSerializableRegisteredModel(model: RegisteredModel): RegisteredModel {
  const base: RegisteredModel = {
    id: model.id,
    displayName: model.displayName,
    modelName: model.modelName,
    type: model.type,
  };

  if (model.type === 'text') {
    return {
      ...base,
      think: Boolean(model.think),
      reasoning: cloneReasoning(model.reasoning),
    };
  }

  if (model.type === 'image') {
    return {
      ...base,
      imageModes: model.imageModes ? [...model.imageModes] : undefined,
      aspectRatioOptions: model.aspectRatioOptions ? [...model.aspectRatioOptions] : undefined,
    };
  }

  if (model.type === 'video') {
    return {
      ...base,
      videoModes: cloneVideoModes(model.videoModes),
      durationOptions: model.durationOptions ? [...model.durationOptions] : undefined,
      resolutionOptions: model.resolutionOptions ? [...model.resolutionOptions] : undefined,
      aspectRatioOptions: model.aspectRatioOptions ? [...model.aspectRatioOptions] : undefined,
      audioSupport: model.audioSupport,
    };
  }

  return {
    ...base,
    voices: model.voices?.map((voice) => ({
      title: voice.title,
      voice: voice.voice,
    })),
  };
}

function hasConfiguredApiKey(connection: ApiConnection | null): boolean {
  return Boolean(connection?.apiKeyConfigured);
}

function hasConfiguredSecretKey(connection: ApiConnection | null): boolean {
  return Boolean(connection?.secretKeyConfigured);
}

function isLocalWorkflowService(): boolean {
  return serviceForm.serviceType === 'local-workflow';
}

function isKlingAiService(): boolean {
  return serviceForm.serviceType === 'klingai';
}

function isMiniMaxService(): boolean {
  return serviceForm.serviceType === 'minimax';
}

function getBaseUrlLabel(): string {
  if (isLocalWorkflowService()) {
    return t('settings.modelService.form.comfyEndpoint');
  }

  return t('settings.modelService.form.baseUrl');
}

function getBaseUrlPlaceholder(): string {
  if (isLocalWorkflowService()) {
    return 'http://127.0.0.1:8188';
  }

  if (isKlingAiService()) {
    return 'https://api-beijing.klingai.com';
  }

  if (isMiniMaxService()) {
    return 'https://api.minimaxi.com';
  }

  return t('settings.modelService.form.baseUrlPlaceholder');
}

function getApiKeyLabel(): string {
  return isKlingAiService() ? t('settings.modelService.form.accessKey') : t('settings.modelService.form.apiKey');
}

function getApiKeyPlaceholder(): string {
  return isKlingAiService() ? t('settings.modelService.form.accessKeyPlaceholder') : t('settings.modelService.form.apiKeyPlaceholder');
}

function getApiKeySavedHint(): string {
  return isKlingAiService() ? t('settings.modelService.form.accessKeySavedHint') : t('settings.modelService.form.apiKeySavedHint');
}

function getStatusTheme(status: CapabilitySummary['status']): 'success' | 'warning' | 'danger' {
  if (status === 'configured') {
    return 'success';
  }

  return status === 'missing' ? 'warning' : 'danger';
}

function getModelOptionLabel(connection: ApiConnection, modelDisplayName: string, modelName: string): string {
  return `${connection.name} / ${modelDisplayName} (${modelName})`;
}

function getCapabilityTestPrompt(capability: ModelCapability): string {
  if (capability === 'image') {
    return t('settings.modelService.testPrompt.image');
  }

  if (capability === 'video') {
    return t('settings.modelService.testPrompt.video');
  }

  return testPrompt.value.trim() || t('settings.modelService.testPrompt.text');
}

function applyTemplate(template: ServiceTemplate): void {
  serviceForm.name = template.name;
  serviceForm.baseUrl = template.defaultBaseUrl;
  serviceForm.secretKey = '';
  serviceForm.workflowManifest = '';
  serviceForm.selectedModelNames = template.models.map((model) => model.modelName);
}

async function loadModelService(): Promise<void> {
  loading.value = true;
  try {
    const [templateResponse, listResponse, resourceResponse] = await Promise.all([
      window.vtStudio.settings.api.templates(),
      window.vtStudio.settings.api.list(),
      window.vtStudio.settings.resource.get(),
    ]);

    if (!isOk(templateResponse)) {
      MessagePlugin.error(templateResponse.msg);
      return;
    }

    if (!isOk(listResponse)) {
      MessagePlugin.error(listResponse.msg);
      return;
    }

    if (!isOk(resourceResponse)) {
      MessagePlugin.error(resourceResponse.msg);
      return;
    }

    templates.value = templateResponse.data.services as ServiceTemplate[];
    connections.value = listResponse.data.connections;
    capabilities.value = resourceResponse.data.capabilities;
    capabilityMatrix.value = resourceResponse.data.capabilityMatrix;
  } finally {
    loading.value = false;
  }
}

function openCreateServiceDialog(): void {
  editingId.value = '';
  const template = templates.value.find((item) => item.serviceType === 'openai-gateway') ?? orderedTemplates.value[0];
  if (template) {
    serviceForm.serviceType = template.serviceType;
    applyTemplate(template);
  }
  serviceForm.apiKey = '';
  serviceForm.secretKey = '';
  serviceDialogVisible.value = true;
}

function openEditServiceDialog(connection: ApiConnection): void {
  editingId.value = connection.id;
  serviceForm.name = connection.name;
  serviceForm.serviceType = connection.serviceType;
  serviceForm.baseUrl = connection.baseUrl;
  serviceForm.apiKey = '';
  serviceForm.secretKey = '';
  serviceForm.workflowManifest = connection.workflowManifest ?? '';
  serviceForm.selectedModelNames = connection.models.map((model) => model.modelName);
  serviceDialogVisible.value = true;
}

function openBindingDialog(summary: CapabilitySummary): void {
  activeCapability.value = summary.capability;
  bindingForm.connectionId = summary.binding && availableConnections.value.some((connection) => connection.id === summary.binding?.connectionId)
    ? summary.binding.connectionId
    : availableConnections.value[0]?.id ?? '';
  const connection = availableConnections.value.find((item) => item.id === bindingForm.connectionId);
  const models = connection ? getReadyModelsForConnection(connection, summary.capability) : [];
  bindingForm.modelName = summary.binding && models.some((model) => model.modelName === summary.binding?.modelName)
    ? summary.binding.modelName
    : models[0]?.modelName ?? '';
  bindingDialogVisible.value = true;
}

function buildDraft(): ApiConnectionDraft | null {
  if (!serviceForm.name.trim()) {
    MessagePlugin.warning(t('settings.modelService.validation.nameRequired'));
    return null;
  }

  if (!serviceForm.apiKey.trim() && serviceForm.serviceType !== 'local-workflow' && !hasConfiguredApiKey(editingConnection.value)) {
    MessagePlugin.warning(isKlingAiService() ? t('settings.modelService.validation.accessKeyRequired') : t('settings.modelService.validation.apiKeyRequired'));
    return null;
  }

  if (isKlingAiService() && !serviceForm.secretKey.trim() && !hasConfiguredSecretKey(editingConnection.value)) {
    MessagePlugin.warning(t('settings.modelService.validation.secretKeyRequired'));
    return null;
  }

  if (serviceForm.serviceType === 'local-workflow') {
    if (!serviceForm.baseUrl.trim()) {
      MessagePlugin.warning(t('settings.modelService.validation.endpointRequired'));
      return null;
    }

    if (!serviceForm.workflowManifest.trim() && !editingConnection.value?.workflowManifest) {
      MessagePlugin.warning(t('settings.modelService.validation.workflowRequired'));
      return null;
    }
  }

  if (selectedModels.value.length === 0) {
    MessagePlugin.warning(t('settings.modelService.validation.modelRequired'));
    return null;
  }

  const capabilitiesFromModels = [...new Set(selectedModels.value.map((model) => model.type))] as ModelCapability[];
  return {
    id: editingId.value || undefined,
    name: serviceForm.name.trim(),
    serviceType: serviceForm.serviceType,
    baseUrl: serviceForm.baseUrl.trim(),
    apiKey: serviceForm.apiKey.trim(),
    secretKey: serviceForm.secretKey.trim(),
    workflowManifest: serviceForm.workflowManifest.trim(),
    capabilities: capabilitiesFromModels,
    models: selectedModels.value.map(toSerializableRegisteredModel),
  };
}

async function saveService(): Promise<void> {
  const draft = buildDraft();
  if (!draft) {
    return;
  }

  saving.value = true;
  try {
    const response = await window.vtStudio.settings.api.save({ connection: draft });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(editingId.value ? t('settings.modelService.message.saved') : t('settings.modelService.message.created'));
    serviceDialogVisible.value = false;
    await loadModelService();
    emit('modelServiceUpdated');
  } catch (error) {
    const message = error instanceof Error ? error.message : t('settings.modelService.message.saveFailed');
    MessagePlugin.error(message);
  } finally {
    saving.value = false;
  }
}

async function saveBinding(): Promise<void> {
  if (!bindingForm.connectionId || !bindingForm.modelName) {
    MessagePlugin.warning(t('settings.modelService.validation.bindingRequired'));
    return;
  }
  if (!availableModels.value.some((model) => model.modelName === bindingForm.modelName)) {
    MessagePlugin.warning(t('settings.modelService.validation.noTestableModel'));
    return;
  }

  const response = await window.vtStudio.settings.resource.saveBinding({
    capability: activeCapability.value,
    binding: {
      connectionId: bindingForm.connectionId,
      modelName: bindingForm.modelName,
    },
  });

  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }

  MessagePlugin.success(t('settings.modelService.message.bindingUpdated'));
  bindingDialogVisible.value = false;
  await loadModelService();
  emit('modelServiceUpdated');
}

function openConnectionTestDialog(connection: ApiConnection): void {
  const models = getConnectionTestModels(connection);
  if (models.length === 0) {
    MessagePlugin.warning(t('settings.modelService.validation.noTestableModel'));
    return;
  }

  const model = models[0];
  modelTestContext.value = { type: 'connection', connection };
  modelTestModels.value = models;
  modelTestInitialModelName.value = model.modelName;
  modelTestTitle.value = t('settings.modelTestDialog.title');
  modelTestDefaultPrompt.value = getCapabilityTestPrompt(model.type);
  modelTestResult.value = null;
  modelTestDialogVisible.value = true;
}

function openCapabilityTestDialog(summary: CapabilitySummary): void {
  if (summary.status !== 'configured' || !summary.binding) {
    return;
  }

  const connection = connections.value.find((item) => item.id === summary.binding?.connectionId);
  const model = connection?.models.find((item) => item.modelName === summary.binding?.modelName);
  const operations = model && connection
    ? getReadyOperationsForModel(connection.id, model.modelName, summary.capability)
    : [];
  if (!model || operations.length === 0) {
    MessagePlugin.warning(t('settings.modelService.validation.noTestableModel'));
    return;
  }

  modelTestContext.value = { type: 'capability', summary };
  modelTestModels.value = [toModelTestDialogModel(model, operations)];
  modelTestInitialModelName.value = model.modelName;
  modelTestTitle.value = t('settings.modelTestDialog.title');
  modelTestDefaultPrompt.value = getCapabilityTestPrompt(summary.capability);
  modelTestResult.value = null;
  modelTestDialogVisible.value = true;
}

async function runModelTest(payload: ModelTestSubmitPayload): Promise<void> {
  const context = modelTestContext.value;
  if (!context) {
    return;
  }

  modelTestLoading.value = true;
  modelTestResult.value = null;
  try {
    const response =
      context.type === 'connection'
        ? await window.vtStudio.settings.api.test({
            connectionId: context.connection.id,
            modelName: payload.modelName,
            prompt: payload.prompt,
            reasoningEnabled: payload.reasoningEnabled,
            reasoningEffort: payload.reasoningEffort,
            imageMode: payload.imageMode,
            imageSize: payload.imageSize,
            aspectRatio: payload.aspectRatio,
            videoMode: payload.videoMode,
            duration: payload.duration,
            resolution: payload.resolution,
            videoAspectRatio: payload.videoAspectRatio,
            audio: payload.audio,
            referenceImages: payload.referenceImages,
          })
        : await window.vtStudio.settings.resource.test({
            capability: context.summary.capability,
            prompt: payload.prompt,
            reasoningEnabled: payload.reasoningEnabled,
            reasoningEffort: payload.reasoningEffort,
            imageMode: payload.imageMode,
            imageSize: payload.imageSize,
            aspectRatio: payload.aspectRatio,
            videoMode: payload.videoMode,
            duration: payload.duration,
            resolution: payload.resolution,
            videoAspectRatio: payload.videoAspectRatio,
            audio: payload.audio,
            referenceImages: payload.referenceImages,
          });

    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    modelTestResult.value = response.data;
    const testedModel = modelTestModels.value.find((model) => model.modelName === payload.modelName);
    const capability = context.type === 'capability' ? context.summary.capability : testedModel?.type ?? 'text';
    MessagePlugin.success(t('settings.modelService.message.modelTestSuccess', { capability: getCapabilityLabel(capability) }));
  } finally {
    modelTestLoading.value = false;
  }
}

function confirmDeleteConnection(connection: ApiConnection): void {
  const dialog = DialogPlugin.confirm({
    header: t('settings.modelService.deleteDialog.title'),
    body: t('settings.modelService.deleteDialog.body', { name: connection.name }),
    confirmBtn: t('settings.modelService.deleteDialog.confirm'),
    cancelBtn: t('settings.modelService.deleteDialog.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.settings.api.delete({ connectionId: connection.id });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }

      dialog.destroy();
      MessagePlugin.success(t('settings.modelService.message.deleted'));
      await loadModelService();
      emit('modelServiceUpdated');
    },
  });
}

watch(
  () => serviceForm.serviceType,
  (serviceType, oldServiceType) => {
    if (editingId.value || serviceType === oldServiceType) {
      return;
    }

    const template = selectedTemplate.value;
    if (template) {
      applyTemplate(template);
    }
  },
);

watch(
  () => bindingForm.connectionId,
  () => {
    if (!availableModels.value.some((model) => model.modelName === bindingForm.modelName)) {
      bindingForm.modelName = availableModels.value[0]?.modelName ?? '';
    }
  },
);

onMounted(loadModelService);
</script>

<template>
  <section class="settings-section model-service-section">
    <div class="settings-inline-toolbar">
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadModelService">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.modelService.refresh') }}
        </t-button>
        <t-button theme="primary" @click="openCreateServiceDialog">
          <template #icon><AddIcon /></template>
          {{ t('settings.modelService.addService') }}
        </t-button>
      </div>
    </div>

    <div class="model-service-summary settings-row-list">
      <article v-for="summary in capabilities" :key="summary.capability" class="settings-row capability-card" :class="{ 'is-muted': summary.status !== 'configured' }">
        <div class="capability-card-head settings-row-main">
          <div>
            <span class="settings-row-title">{{ getCapabilityLabel(summary.capability) }}</span>
            <span class="settings-row-note">{{ getCapabilityConnectionName(summary) }} / {{ getCapabilityModelDisplayName(summary) }}</span>
          </div>
          <t-tag :theme="getStatusTheme(summary.status)" variant="light">{{ getCapabilityStatusText(summary) }}</t-tag>
        </div>
        <div class="settings-row-control capability-actions">
          <t-button variant="outline" @click="openBindingDialog(summary)">
            <template #icon><SwapIcon /></template>
            {{ t('settings.modelService.change') }}
          </t-button>
          <t-button theme="primary" :disabled="summary.status !== 'configured'" @click="openCapabilityTestDialog(summary)">
            <template #icon><PlayCircleIcon /></template>
            {{ t('settings.modelService.test') }}
          </t-button>
        </div>
      </article>
    </div>

    <div class="settings-list-title">{{ t('settings.modelService.connectedServices') }}</div>

    <div v-if="connections.length" class="connection-grid settings-row-list">
      <article v-for="connection in connections" :key="connection.id" class="settings-row connection-card">
        <div class="connection-card-head settings-row-main">
          <div>
            <span class="settings-row-title">{{ connection.name }}</span>
            <span class="settings-row-note">{{ getServiceName(connection.serviceType) }} / {{ connection.baseUrl || t('settings.modelService.defaultAddress') }}</span>
          </div>
          <t-tag :theme="connection.status === 'ready' ? 'success' : 'warning'" variant="light">{{ getConnectionStatusText(connection) }}</t-tag>
        </div>
        <div class="settings-row-control connection-actions">
          <t-tooltip :content="t('settings.modelService.tooltip.testConnection')">
            <t-button shape="square" variant="text" :aria-label="t('settings.modelService.tooltip.testConnection')" @click="openConnectionTestDialog(connection)">
              <PlayCircleIcon />
            </t-button>
          </t-tooltip>
          <t-tooltip :content="t('settings.modelService.tooltip.editConnection')">
            <t-button shape="square" variant="text" :aria-label="t('settings.modelService.tooltip.editConnection')" @click="openEditServiceDialog(connection)">
              <EditIcon />
            </t-button>
          </t-tooltip>
          <t-tooltip :content="t('settings.modelService.tooltip.deleteConnection')">
            <t-button shape="square" variant="text" theme="danger" :aria-label="t('settings.modelService.tooltip.deleteConnection')" @click="confirmDeleteConnection(connection)">
              <DeleteIcon />
            </t-button>
          </t-tooltip>
        </div>
      </article>
    </div>

    <t-empty v-else :description="t('settings.modelService.empty')" />

  </section>

  <ModelTestDialog
    v-model:visible="modelTestDialogVisible"
    :header="modelTestTitle"
    :models="modelTestModels"
    :initial-model-name="modelTestInitialModelName"
    :default-prompt="modelTestDefaultPrompt"
    :loading="modelTestLoading"
    :result="modelTestResult"
    @submit="runModelTest"
  />

  <t-dialog v-model:visible="serviceDialogVisible" :header="editingId ? t('settings.modelService.dialog.editTitle') : t('settings.modelService.dialog.createTitle')" width="720px" :confirm-btn="t('settings.modelService.dialog.save')" :confirm-loading="saving" @confirm="saveService">
    <t-form layout="vertical">
      <div class="model-form-grid">
        <t-form-item :label="t('settings.modelService.form.serviceType')">
          <t-select v-model="serviceForm.serviceType" :disabled="Boolean(editingId)">
            <t-option v-for="option in serviceOptions" :key="option.value" :value="option.value" :label="option.label" />
          </t-select>
        </t-form-item>
        <t-form-item :label="t('settings.modelService.form.serviceName')">
          <t-input v-model="serviceForm.name" :placeholder="t('settings.modelService.form.serviceNamePlaceholder')" />
        </t-form-item>
      </div>

      <t-form-item :label="getBaseUrlLabel()">
        <t-input v-model="serviceForm.baseUrl" :placeholder="getBaseUrlPlaceholder()" />
      </t-form-item>
      <t-form-item v-if="!isLocalWorkflowService()" :label="getApiKeyLabel()">
        <t-input v-model="serviceForm.apiKey" type="password" :placeholder="getApiKeyPlaceholder()" />
        <small v-if="hasConfiguredApiKey(editingConnection)" class="settings-hint">{{ getApiKeySavedHint() }}</small>
      </t-form-item>
      <t-form-item v-if="isKlingAiService()" :label="t('settings.modelService.form.secretKey')">
        <t-input v-model="serviceForm.secretKey" type="password" :placeholder="t('settings.modelService.form.secretKeyPlaceholder')" />
        <small v-if="hasConfiguredSecretKey(editingConnection)" class="settings-hint">{{ t('settings.modelService.form.secretKeySavedHint') }}</small>
      </t-form-item>
      <t-form-item v-else-if="isLocalWorkflowService()" :label="t('settings.modelService.form.workflowManifest')">
        <t-textarea v-model="serviceForm.workflowManifest" class="workflow-manifest-textarea" :placeholder="t('settings.modelService.form.workflowPlaceholder')" :autosize="{ minRows: 7, maxRows: 14 }" />
        <small v-if="editingConnection?.workflowManifest" class="settings-hint">{{ t('settings.modelService.form.workflowSavedHint') }}</small>
      </t-form-item>

      <div class="model-enable-panel">
        <div class="model-enable-head">
          <span>{{ t('settings.modelService.enableModels') }}</span>
          <small>{{ t('settings.modelService.enableModelsHint') }}</small>
        </div>
        <t-checkbox-group v-model="serviceForm.selectedModelNames" class="model-check-list">
          <div v-for="item in CAPABILITY_OPTIONS" :key="item.value" class="model-check-group">
            <strong v-if="getModelsByType(item.value).length">{{ getCapabilityLabel(item.value) }}</strong>
            <t-checkbox v-for="model in getModelsByType(item.value)" :key="model.modelName" :value="model.modelName">
              <span>{{ model.displayName }}</span>
              <small>{{ model.modelName }}</small>
            </t-checkbox>
          </div>
        </t-checkbox-group>
      </div>

      <p class="settings-hint">{{ t('settings.modelService.protocolHint') }}</p>
    </t-form>
  </t-dialog>

  <t-dialog v-model:visible="bindingDialogVisible" :header="activeSummary ? t('settings.modelService.bindingDialog.titleWithCapability', { capability: getCapabilityLabel(activeSummary.capability) }) : t('settings.modelService.bindingDialog.title')" width="560px" :confirm-btn="t('settings.modelService.dialog.save')" @confirm="saveBinding">
    <t-form layout="vertical">
      <t-form-item :label="t('settings.modelService.bindingDialog.service')">
        <t-select v-model="bindingForm.connectionId" :placeholder="t('settings.modelService.bindingDialog.servicePlaceholder')">
          <t-option v-for="connection in availableConnections" :key="connection.id" :value="connection.id" :label="connection.name" />
        </t-select>
      </t-form-item>
      <t-form-item :label="t('settings.modelService.bindingDialog.model')">
        <t-select v-model="bindingForm.modelName" :placeholder="t('settings.modelService.bindingDialog.modelPlaceholder')">
          <t-option
            v-for="model in availableModels"
            :key="model.modelName"
            :value="model.modelName"
            :label="selectedBindingConnection ? getModelOptionLabel(selectedBindingConnection, model.displayName, model.modelName) : model.displayName"
          />
        </t-select>
      </t-form-item>
      <t-form-item v-if="activeCapability === 'text'" :label="t('settings.modelService.bindingDialog.testPrompt')">
        <t-textarea v-model="testPrompt" :placeholder="t('settings.modelService.testPrompt.text')" :autosize="{ minRows: 3, maxRows: 6 }" />
      </t-form-item>
      <p v-if="availableConnections.length === 0" class="settings-hint">{{ t('settings.modelService.bindingDialog.noAvailableConnection') }}</p>
    </t-form>
  </t-dialog>
</template>
