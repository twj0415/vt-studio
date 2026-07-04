<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { AddIcon, DeleteIcon, EditIcon, PlayCircleIcon, RefreshIcon, SwapIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import type { ApiConnection, ApiConnectionDraft, ApiConnectionTestResult, ApiServiceType, CapabilitySummary, ModelCapability, RegisteredModel } from '@shared/types/model-config';

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

const SERVICE_ORDER: ApiServiceType[] = ['openai-gateway', 'openai-official', 'claude', 'deepseek', 'gemini', 'local-workflow', 'advanced'];

const { t } = useI18n();
const emit = defineEmits<{
  modelServiceUpdated: [];
}>();
const loading = ref(false);
const saving = ref(false);
const testingConnectionId = ref('');
const testingCapability = ref<ModelCapability | ''>('');
const connections = ref<ApiConnection[]>([]);
const capabilities = ref<CapabilitySummary[]>([]);
const templates = ref<ServiceTemplate[]>([]);
const serviceDialogVisible = ref(false);
const bindingDialogVisible = ref(false);
const editingId = ref('');
const activeCapability = ref<ModelCapability>('text');
const testResult = ref('');
const testPrompt = ref('');
const serviceForm = reactive({
  name: '',
  serviceType: 'openai-gateway' as ApiServiceType,
  baseUrl: '',
  apiKey: '',
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
const availableConnections = computed(() => connections.value.filter((connection) => connection.models.some((model) => model.type === activeCapability.value)));
const selectedBindingConnection = computed(() => availableConnections.value.find((connection) => connection.id === bindingForm.connectionId) ?? null);
const availableModels = computed(() => selectedBindingConnection.value?.models.filter((model) => model.type === activeCapability.value) ?? []);

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

function getConnectionTestModel(connection: ApiConnection): RegisteredModel | null {
  return connection.models.find((model) => ['text', 'image', 'video'].includes(model.type)) ?? null;
}

function getConnectionCapabilities(connection: ApiConnection): ModelCapability[] {
  return [...new Set(connection.models.map((model) => model.type))] as ModelCapability[];
}

function hasConfiguredApiKey(connection: ApiConnection | null): boolean {
  return Boolean(connection?.apiKeyConfigured);
}

function isLocalWorkflowService(): boolean {
  return serviceForm.serviceType === 'local-workflow';
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

function formatTestResult(title: string, capability: ModelCapability, result: ApiConnectionTestResult): string {
  const lines = [title];

  if ((capability === 'image' || capability === 'video') && result.filePath) {
    lines.push(t('settings.modelService.testResult.capabilityFile', { capability: getCapabilityLabel(capability), path: result.filePath }));
  } else if (result.content) {
    lines.push(result.content);
  } else if (result.filePath) {
    lines.push(t('settings.modelService.testResult.file', { path: result.filePath }));
  } else {
    lines.push(t('settings.modelService.testResult.noContent'));
  }

  if (result.thinking) {
    lines.push('', t('settings.modelService.testResult.thinking', { thinking: result.thinking }));
  }

  lines.push('', t('settings.modelService.testResult.duration', { duration: result.durationMs }));
  return lines.join('\n');
}

function applyTemplate(template: ServiceTemplate): void {
  serviceForm.name = template.name;
  serviceForm.baseUrl = template.defaultBaseUrl;
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
  testResult.value = '';
  serviceDialogVisible.value = true;
}

function openEditServiceDialog(connection: ApiConnection): void {
  editingId.value = connection.id;
  serviceForm.name = connection.name;
  serviceForm.serviceType = connection.serviceType;
  serviceForm.baseUrl = connection.baseUrl;
  serviceForm.apiKey = '';
  serviceForm.workflowManifest = connection.workflowManifest ?? '';
  serviceForm.selectedModelNames = connection.models.map((model) => model.modelName);
  testResult.value = '';
  serviceDialogVisible.value = true;
}

function openBindingDialog(summary: CapabilitySummary): void {
  activeCapability.value = summary.capability;
  bindingForm.connectionId = summary.binding?.connectionId ?? availableConnections.value[0]?.id ?? '';
  const connection = availableConnections.value.find((item) => item.id === bindingForm.connectionId);
  bindingForm.modelName = summary.binding?.modelName ?? connection?.models.find((model) => model.type === summary.capability)?.modelName ?? '';
  testResult.value = '';
  bindingDialogVisible.value = true;
}

function buildDraft(): ApiConnectionDraft | null {
  if (!serviceForm.name.trim()) {
    MessagePlugin.warning(t('settings.modelService.validation.nameRequired'));
    return null;
  }

  if (!serviceForm.apiKey.trim() && serviceForm.serviceType !== 'local-workflow' && !hasConfiguredApiKey(editingConnection.value)) {
    MessagePlugin.warning(t('settings.modelService.validation.apiKeyRequired'));
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
    workflowManifest: serviceForm.workflowManifest.trim(),
    capabilities: capabilitiesFromModels,
    models: selectedModels.value.map((model) => ({ ...model })),
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

async function testConnection(connection: ApiConnection): Promise<void> {
  const model = getConnectionTestModel(connection);
  if (!model) {
    MessagePlugin.warning(t('settings.modelService.validation.noTestableModel'));
    return;
  }

  testingConnectionId.value = connection.id;
  testResult.value = '';
  try {
    const response = await window.vtStudio.settings.api.test({
      connectionId: connection.id,
      modelName: model.modelName,
      prompt: getCapabilityTestPrompt(model.type),
    });

    if (!isOk(response)) {
      testResult.value = response.msg;
      MessagePlugin.error(response.msg);
      return;
    }

    testResult.value = formatTestResult(`${connection.name} / ${model.displayName}`, model.type, response.data);
    MessagePlugin.success(t('settings.modelService.message.modelTestSuccess', { capability: getCapabilityLabel(model.type) }));
  } finally {
    testingConnectionId.value = '';
  }
}

async function runCapabilityTest(summary: CapabilitySummary): Promise<void> {
  testingCapability.value = summary.capability;
  testResult.value = '';
  try {
    const response = await window.vtStudio.settings.resource.test({
      capability: summary.capability,
      prompt: getCapabilityTestPrompt(summary.capability),
    });

    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      testResult.value = response.msg;
      return;
    }

    const capabilityLabel = getCapabilityLabel(summary.capability);
    testResult.value = formatTestResult(`${capabilityLabel} / ${summary.modelDisplayName}`, summary.capability, response.data);
    MessagePlugin.success(t('settings.modelService.message.capabilityTestSuccess', { capability: capabilityLabel }));
  } finally {
    testingCapability.value = '';
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
    <div class="settings-section-head">
      <div>
        <p class="eyebrow">{{ t('settings.modelService.eyebrow') }}</p>
        <h3>{{ t('settings.modelService.title') }}</h3>
      </div>
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

    <div class="model-service-summary">
      <article v-for="summary in capabilities" :key="summary.capability" class="capability-card">
        <div class="capability-card-head">
          <div>
            <strong>{{ getCapabilityLabel(summary.capability) }}</strong>
            <small>{{ getCapabilityConnectionName(summary) }}</small>
          </div>
          <t-tag :theme="getStatusTheme(summary.status)" variant="light">{{ getCapabilityStatusText(summary) }}</t-tag>
        </div>

        <div class="capability-model">
          <span>{{ t('settings.modelService.defaultModel') }}</span>
          <b>{{ getCapabilityModelDisplayName(summary) }}</b>
          <small v-if="summary.modelName">{{ summary.modelName }}</small>
        </div>

        <div class="capability-actions">
          <t-button variant="outline" @click="openBindingDialog(summary)">
            <template #icon><SwapIcon /></template>
            {{ t('settings.modelService.change') }}
          </t-button>
          <t-button theme="primary" :loading="testingCapability === summary.capability" :disabled="summary.status !== 'configured'" @click="runCapabilityTest(summary)">
            <template #icon><PlayCircleIcon /></template>
            {{ t('settings.modelService.test') }}
          </t-button>
        </div>
      </article>
    </div>

    <div class="model-service-block-head">
      <div>
        <strong>{{ t('settings.modelService.connectedServices') }}</strong>
        <p>{{ t('settings.modelService.connectedHint') }}</p>
      </div>
    </div>

    <div v-if="connections.length" class="connection-grid">
      <article v-for="connection in connections" :key="connection.id" class="connection-card">
        <div class="connection-card-head">
          <div>
            <strong>{{ connection.name }}</strong>
            <small>{{ getServiceName(connection.serviceType) }} · {{ connection.baseUrl || t('settings.modelService.defaultAddress') }}</small>
          </div>
          <t-tag :theme="connection.status === 'ready' ? 'success' : 'warning'" variant="light">{{ getConnectionStatusText(connection) }}</t-tag>
        </div>

        <div class="connection-meta">
          <t-tag v-for="capability in getConnectionCapabilities(connection)" :key="capability" variant="light">{{ getCapabilityLabel(capability) }}</t-tag>
        </div>

        <div class="connection-models">
          <span v-for="model in connection.models" :key="model.modelName">{{ model.displayName }}</span>
        </div>

        <div class="connection-actions">
          <t-tooltip :content="t('settings.modelService.tooltip.testConnection')">
            <t-button shape="square" variant="text" :aria-label="t('settings.modelService.tooltip.testConnection')" :loading="testingConnectionId === connection.id" @click="testConnection(connection)">
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

    <div v-if="testResult" class="resource-test-result">
      <strong>{{ t('settings.modelService.testResult.title') }}</strong>
      <pre>{{ testResult }}</pre>
    </div>
  </section>

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

      <t-form-item :label="isLocalWorkflowService() ? 'ComfyUI Endpoint' : 'Base URL'">
        <t-input v-model="serviceForm.baseUrl" :placeholder="isLocalWorkflowService() ? 'http://127.0.0.1:8188' : t('settings.modelService.form.baseUrlPlaceholder')" />
      </t-form-item>
      <t-form-item v-if="!isLocalWorkflowService()" label="API Key">
        <t-input v-model="serviceForm.apiKey" type="password" :placeholder="t('settings.modelService.form.apiKeyPlaceholder')" />
        <small v-if="hasConfiguredApiKey(editingConnection)" class="settings-hint">{{ t('settings.modelService.form.apiKeySavedHint') }}</small>
      </t-form-item>
      <t-form-item v-else label="Workflow Manifest">
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
