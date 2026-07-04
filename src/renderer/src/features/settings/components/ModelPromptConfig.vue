<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AddIcon, DeleteIcon, EditIcon, RefreshIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import type {
  ModelPromptBindingStatus,
  ModelPromptConfigResult,
  ModelPromptConnectionGroup,
  ModelPromptInvalidMapping,
  ModelPromptInvalidReason,
  ModelPromptModelItem,
  ModelPromptModelType,
  ModelPromptTemplate,
  ModelPromptTemplateType,
} from '@shared/types/model-prompt';

const { t } = useI18n();

const TEMPLATE_TYPE_OPTIONS: Array<{ labelKey: string; value: ModelPromptTemplateType; modelType: ModelPromptModelType }> = [
  { labelKey: 'settings.modelPromptConfig.templateType.imagePrompt', value: 'imagePrompt', modelType: 'image' },
  { labelKey: 'settings.modelPromptConfig.templateType.videoPrompt', value: 'videoPrompt', modelType: 'video' },
];

const MODEL_STATUS_KEYS: Record<ModelPromptBindingStatus, string> = {
  bound: 'settings.modelPromptConfig.modelStatus.bound',
  fallback: 'settings.modelPromptConfig.modelStatus.fallback',
  'invalid-template': 'settings.modelPromptConfig.modelStatus.invalidTemplate',
  'type-mismatch': 'settings.modelPromptConfig.modelStatus.typeMismatch',
};

const INVALID_REASON_KEYS: Record<ModelPromptInvalidReason, string> = {
  'model-missing': 'settings.modelPromptConfig.invalidReason.modelMissing',
  'template-missing': 'settings.modelPromptConfig.invalidReason.templateMissing',
  'type-mismatch': 'settings.modelPromptConfig.invalidReason.typeMismatch',
};

const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const binding = ref(false);
const config = ref<ModelPromptConfigResult>({
  templates: [],
  connections: [],
  invalidMappings: [],
});
const templateDialogVisible = ref(false);
const bindingDialogVisible = ref(false);
const editingTemplateId = ref<number | null>(null);
const activeModel = ref<ModelPromptModelItem | null>(null);
const selectedTemplateId = ref<number | null>(null);
const templateForm = reactive({
  name: '',
  type: 'imagePrompt' as ModelPromptTemplateType,
  content: '',
});

const currentEditingTemplate = computed(() => config.value.templates.find((item) => item.id === editingTemplateId.value) ?? null);
const compatibleTemplates = computed(() => {
  if (!activeModel.value) {
    return [];
  }

  const type = templateTypeForModel(activeModel.value.modelType);
  return config.value.templates.filter((template) => template.type === type);
});

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function templateTypeForModel(modelType: ModelPromptModelType): ModelPromptTemplateType {
  return modelType === 'image' ? 'imagePrompt' : 'videoPrompt';
}

function getTemplateTypeLabel(type: ModelPromptTemplateType): string {
  const option = TEMPLATE_TYPE_OPTIONS.find((item) => item.value === type);
  return option ? t(option.labelKey) : type;
}

function getModelTypeLabel(type: ModelPromptModelType): string {
  return type === 'image' ? t('settings.modelPromptConfig.modelType.image') : t('settings.modelPromptConfig.modelType.video');
}

function getStatusTheme(status: ModelPromptModelItem['status']): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'bound') {
    return 'success';
  }

  if (status === 'fallback') {
    return 'warning';
  }

  return status === 'invalid-template' || status === 'type-mismatch' ? 'danger' : 'default';
}

function getTemplateSummary(template: ModelPromptTemplate): string {
  return template.content.replace(/\s+/g, ' ').slice(0, 130);
}

function getTemplateReferenceText(template: ModelPromptTemplate): string {
  return template.referenceCount > 0 ? t('settings.modelPromptConfig.referenceCount', { count: template.referenceCount }) : t('settings.modelPromptConfig.unreferenced');
}

function getConnectionStatusText(connection: ModelPromptConnectionGroup): string {
  if (connection.connectionStatus === 'ready') {
    return t('settings.modelPromptConfig.connectionStatus.ready');
  }

  if (connection.connectionStatus === 'incomplete') {
    return t('settings.modelPromptConfig.connectionStatus.incomplete');
  }

  return connection.connectionStatus;
}

function getModelStatusText(model: ModelPromptModelItem): string {
  if (model.status === 'fallback' && model.modelType === 'video') {
    return t('settings.modelPromptConfig.modelStatus.videoFallback');
  }

  return t(MODEL_STATUS_KEYS[model.status]);
}

function getBindingName(model: ModelPromptModelItem): string {
  return model.binding ? model.binding.templateName : t('settings.modelPromptConfig.unboundTemplate');
}

function getModelModeText(modelMode: string): string {
  return modelMode ? t('settings.modelPromptConfig.modeWithValue', { mode: modelMode }) : t('settings.modelPromptConfig.defaultMode');
}

function getInvalidReasonText(mapping: ModelPromptInvalidMapping): string {
  return t(INVALID_REASON_KEYS[mapping.reason]);
}

function getTemplateOptionLabel(template: ModelPromptTemplate): string {
  return t('settings.modelPromptConfig.templateOption', { name: template.name, type: getTemplateTypeLabel(template.type) });
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.modelPrompt.get();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    config.value = response.data;
  } finally {
    loading.value = false;
  }
}

function resetTemplateForm(type: ModelPromptTemplateType = 'imagePrompt'): void {
  editingTemplateId.value = null;
  templateForm.name = '';
  templateForm.type = type;
  templateForm.content = '';
}

function openCreateTemplate(type: ModelPromptTemplateType = 'imagePrompt'): void {
  resetTemplateForm(type);
  templateDialogVisible.value = true;
}

function openEditTemplate(template: ModelPromptTemplate): void {
  editingTemplateId.value = template.id;
  templateForm.name = template.name;
  templateForm.type = template.type;
  templateForm.content = template.content;
  templateDialogVisible.value = true;
}

async function saveTemplate(): Promise<void> {
  if (!templateForm.name.trim() || !templateForm.content.trim()) {
    MessagePlugin.warning(t('settings.modelPromptConfig.message.templateRequired'));
    return;
  }

  saving.value = true;
  try {
    const response = await window.vtStudio.settings.modelPrompt.saveTemplate({
      id: editingTemplateId.value ?? undefined,
      name: templateForm.name,
      type: templateForm.type,
      content: templateForm.content,
    });

    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(editingTemplateId.value ? t('settings.modelPromptConfig.message.templateSaved') : t('settings.modelPromptConfig.message.templateCreated'));
    templateDialogVisible.value = false;
    await loadConfig();
  } finally {
    saving.value = false;
  }
}

function confirmDeleteTemplate(template: ModelPromptTemplate): void {
  const dialog = DialogPlugin.confirm({
    header: t('settings.modelPromptConfig.deleteDialog.title'),
    body: t('settings.modelPromptConfig.deleteDialog.body', { name: template.name }),
    confirmBtn: t('settings.modelPromptConfig.deleteDialog.confirm'),
    cancelBtn: t('settings.modelPromptConfig.deleteDialog.cancel'),
    theme: 'danger',
    async onConfirm() {
      deleting.value = true;
      try {
        const response = await window.vtStudio.settings.modelPrompt.deleteTemplate({ id: template.id });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        MessagePlugin.success(t('settings.modelPromptConfig.message.templateDeleted'));
        dialog.destroy();
        await loadConfig();
      } finally {
        deleting.value = false;
      }
    },
  });
}

function openBindDialog(model: ModelPromptModelItem): void {
  activeModel.value = model;
  selectedTemplateId.value = model.binding?.templateId ?? null;
  bindingDialogVisible.value = true;
}

async function saveBinding(): Promise<void> {
  if (!activeModel.value || !selectedTemplateId.value) {
    MessagePlugin.warning(t('settings.modelPromptConfig.message.templateSelectRequired'));
    return;
  }

  binding.value = true;
  try {
    const response = await window.vtStudio.settings.modelPrompt.bind({
      connectionId: activeModel.value.connectionId,
      modelName: activeModel.value.modelName,
      modelType: activeModel.value.modelType,
      modelMode: activeModel.value.modelMode,
      templateId: selectedTemplateId.value,
    });

    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('settings.modelPromptConfig.message.bound'));
    bindingDialogVisible.value = false;
    await loadConfig();
  } finally {
    binding.value = false;
  }
}

async function clearBinding(model: ModelPromptModelItem): Promise<void> {
  binding.value = true;
  try {
    const response = await window.vtStudio.settings.modelPrompt.clearBinding({
      connectionId: model.connectionId,
      modelName: model.modelName,
      modelType: model.modelType,
      modelMode: model.binding?.modelMode ?? model.modelMode,
    });

    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('settings.modelPromptConfig.message.bindingCleared'));
    await loadConfig();
  } finally {
    binding.value = false;
  }
}

defineExpose({ loadConfig });
onMounted(loadConfig);
</script>

<template>
  <section class="model-prompt-section">
    <div class="model-prompt-head">
      <div>
        <strong>{{ t('settings.modelPromptConfig.title') }}</strong>
        <p>{{ t('settings.modelPromptConfig.hint') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadConfig">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.modelPromptConfig.refresh') }}
        </t-button>
        <t-button theme="primary" @click="openCreateTemplate()">
          <template #icon><AddIcon /></template>
          {{ t('settings.modelPromptConfig.addTemplate') }}
        </t-button>
      </div>
    </div>

    <div class="model-prompt-block">
      <div class="model-prompt-block-title">
        <strong>{{ t('settings.modelPromptConfig.templateLibrary') }}</strong>
        <span>{{ t('settings.modelPromptConfig.templateCount', { count: config.templates.length }) }}</span>
      </div>
      <div v-if="config.templates.length > 0" class="model-prompt-template-grid">
        <article v-for="template in config.templates" :key="template.id" class="model-prompt-template-card">
          <div class="model-prompt-card-head">
            <div>
              <strong>{{ template.name }}</strong>
              <small>{{ getTemplateTypeLabel(template.type) }}</small>
            </div>
            <t-tag :theme="template.referenceCount > 0 ? 'success' : 'default'" variant="light">
              {{ getTemplateReferenceText(template) }}
            </t-tag>
          </div>
          <p>{{ getTemplateSummary(template) }}</p>
          <div class="model-prompt-card-actions">
            <t-button size="small" variant="outline" @click="openEditTemplate(template)">
              <template #icon><EditIcon /></template>
              {{ t('settings.modelPromptConfig.edit') }}
            </t-button>
            <t-button size="small" variant="outline" theme="danger" :loading="deleting" @click="confirmDeleteTemplate(template)">
              <template #icon><DeleteIcon /></template>
              {{ t('settings.modelPromptConfig.delete') }}
            </t-button>
          </div>
        </article>
      </div>
      <p v-else class="model-empty">{{ loading ? t('settings.modelPromptConfig.loadingTemplates') : t('settings.modelPromptConfig.emptyTemplates') }}</p>
    </div>

    <div class="model-prompt-block">
      <div class="model-prompt-block-title">
        <strong>{{ t('settings.modelPromptConfig.modelBinding') }}</strong>
        <span>{{ t('settings.modelPromptConfig.modelBindingHint') }}</span>
      </div>

      <div v-if="config.connections.length > 0" class="model-prompt-connection-list">
        <section v-for="connection in config.connections" :key="connection.connectionId" class="model-prompt-connection">
          <div class="model-prompt-connection-head">
            <div>
              <strong>{{ connection.connectionName }}</strong>
              <small>{{ connection.connectionId }}</small>
            </div>
            <t-tag :theme="connection.connectionStatus === 'ready' ? 'success' : 'warning'" variant="light">{{ getConnectionStatusText(connection) }}</t-tag>
          </div>

          <div class="model-prompt-model-grid">
            <article v-for="model in connection.models" :key="`${model.connectionId}:${model.modelName}:${model.modelType}:${model.modelMode}`" class="model-prompt-model-card">
              <div class="model-prompt-card-head">
                <div>
                  <strong>{{ model.modelDisplayName }}</strong>
                  <small>{{ model.modelName }}</small>
                </div>
                <t-tag :theme="getStatusTheme(model.status)" variant="light">{{ getModelStatusText(model) }}</t-tag>
              </div>
              <div class="model-prompt-binding-info">
                <span>{{ t('settings.modelPromptConfig.modelTypeSuffix', { type: getModelTypeLabel(model.modelType) }) }}</span>
                <b>{{ getBindingName(model) }}</b>
                <small>{{ getModelModeText(model.modelMode) }}</small>
                <small v-if="model.binding && model.binding.modelMode !== model.modelMode">{{ t('settings.modelPromptConfig.usingDefaultBinding') }}</small>
              </div>
              <div class="model-prompt-card-actions">
                <t-button size="small" variant="outline" @click="openBindDialog(model)">{{ t('settings.modelPromptConfig.bind') }}</t-button>
                <t-button size="small" variant="outline" :disabled="!model.binding" :loading="binding" @click="clearBinding(model)">{{ t('settings.modelPromptConfig.clear') }}</t-button>
              </div>
            </article>
          </div>
        </section>
      </div>
      <p v-else class="model-empty">{{ loading ? t('settings.modelPromptConfig.loadingModels') : t('settings.modelPromptConfig.emptyModels') }}</p>
    </div>

    <div v-if="config.invalidMappings.length > 0" class="model-prompt-warning">
      <strong>{{ t('settings.modelPromptConfig.invalidMappings') }}</strong>
      <p v-for="mapping in config.invalidMappings" :key="mapping.id">
        {{ mapping.connectionId }} / {{ mapping.modelName }} / {{ mapping.templateName }}: {{ getInvalidReasonText(mapping) }}
      </p>
    </div>

    <t-dialog v-model:visible="templateDialogVisible" :header="editingTemplateId ? t('settings.modelPromptConfig.templateDialog.editTitle') : t('settings.modelPromptConfig.templateDialog.addTitle')" width="820px" :confirm-btn="t('settings.modelPromptConfig.save')" :confirm-loading="saving" @confirm="saveTemplate">
      <t-form class="settings-form model-prompt-form" :data="templateForm" layout="vertical">
        <t-form-item :label="t('settings.modelPromptConfig.templateDialog.name')">
          <t-input v-model="templateForm.name" :placeholder="t('settings.modelPromptConfig.templateDialog.namePlaceholder')" />
        </t-form-item>
        <t-form-item :label="t('settings.modelPromptConfig.templateDialog.type')">
          <t-select v-model="templateForm.type" :disabled="Boolean(currentEditingTemplate?.referenceCount)">
            <t-option v-for="item in TEMPLATE_TYPE_OPTIONS" :key="item.value" :value="item.value" :label="t(item.labelKey)" />
          </t-select>
        </t-form-item>
        <t-form-item :label="t('settings.modelPromptConfig.templateDialog.content')">
          <t-textarea v-model="templateForm.content" class="code-editor model-prompt-textarea" :placeholder="t('settings.modelPromptConfig.templateDialog.contentPlaceholder')" :autosize="{ minRows: 16, maxRows: 26 }" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <t-dialog v-model:visible="bindingDialogVisible" :header="activeModel ? t('settings.modelPromptConfig.bindingDialog.titleWithModel', { model: activeModel.modelDisplayName }) : t('settings.modelPromptConfig.bindingDialog.title')" width="560px" :confirm-btn="t('settings.modelPromptConfig.bindingDialog.save')" :confirm-loading="binding" @confirm="saveBinding">
      <div class="model-prompt-bind-panel">
        <div v-if="activeModel" class="model-prompt-binding-info">
          <span>{{ t('settings.modelPromptConfig.bindingDialog.currentModel') }}</span>
          <b>{{ activeModel.connectionName }} / {{ activeModel.modelDisplayName }}</b>
          <small>{{ activeModel.modelName }}</small>
        </div>
        <t-select v-model="selectedTemplateId" :placeholder="t('settings.modelPromptConfig.bindingDialog.templatePlaceholder')">
          <t-option v-for="template in compatibleTemplates" :key="template.id" :value="template.id" :label="getTemplateOptionLabel(template)" />
        </t-select>
        <p v-if="compatibleTemplates.length === 0" class="settings-hint">{{ t('settings.modelPromptConfig.bindingDialog.noCompatibleTemplate') }}</p>
      </div>
    </t-dialog>
  </section>
</template>
