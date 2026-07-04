<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RefreshIcon, RollbackIcon, SaveIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import type { AgentNamespace } from '@shared/types/socket';
import type { MemoryClearType } from '@shared/types/memory';
import type { MemorySettingsConfig, MemoryStatsResult } from '@shared/types/memory-settings';

const { t } = useI18n();
const CLEAR_ALL_CONFIRM_TEXT = '\u6e05\u7a7a\u5168\u90e8\u8bb0\u5fc6';

const NUMBER_FIELD_LABEL_KEYS: Record<Exclude<keyof MemorySettingsConfig, 'modelOnnxFile' | 'modelDtype'>, string> = {
  messagesPerSummary: 'settings.memoryConfig.field.messagesPerSummary',
  shortTermLimit: 'settings.memoryConfig.field.shortTermLimit',
  summaryMaxLength: 'settings.memoryConfig.field.summaryMaxLength',
  summaryLimit: 'settings.memoryConfig.field.summaryLimit',
  ragLimit: 'settings.memoryConfig.field.ragLimit',
  deepRetrieveSummaryLimit: 'settings.memoryConfig.field.deepRetrieveSummaryLimit',
};

const CLEAR_TYPE_OPTIONS: Array<{ value: MemoryClearType; labelKey: string }> = [
  { value: 'all', labelKey: 'settings.memoryConfig.clear.type.all' },
  { value: 'message', labelKey: 'settings.memoryConfig.clear.type.message' },
  { value: 'summary', labelKey: 'settings.memoryConfig.clear.type.summary' },
];

const AGENT_TYPE_OPTIONS: Array<{ value: AgentNamespace; labelKey: string }> = [
  { value: 'scriptAgent', labelKey: 'settings.memoryConfig.agent.scriptAgent' },
  { value: 'productionAgent', labelKey: 'settings.memoryConfig.agent.productionAgent' },
];

const loading = ref(false);
const saving = ref(false);
const restoring = ref(false);
const clearing = ref(false);
const validating = ref(false);
const modelAvailable = ref(false);
const modelRelativePath = ref('');
const stats = ref<MemoryStatsResult>({ total: 0, messages: 0, summaries: 0, isolations: [] });

const form = reactive({
  modelPathText: '',
  modelDtype: 'fp16',
  messagesPerSummary: '10',
  shortTermLimit: '5',
  summaryMaxLength: '500',
  summaryLimit: '10',
  ragLimit: '3',
  deepRetrieveSummaryLimit: '5',
});

const clearForm = reactive({
  scope: 'isolation' as 'isolation' | 'all',
  projectId: '',
  agentType: 'scriptAgent' as AgentNamespace,
  episodesId: '',
  type: 'all' as MemoryClearType,
  confirmText: '',
});

const modelStatusText = computed(() => (modelAvailable.value ? t('settings.memoryConfig.modelStatus.available') : t('settings.memoryConfig.modelStatus.missing')));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function setForm(config: MemorySettingsConfig): void {
  form.modelPathText = config.modelOnnxFile.join('/');
  form.modelDtype = config.modelDtype;
  form.messagesPerSummary = String(config.messagesPerSummary);
  form.shortTermLimit = String(config.shortTermLimit);
  form.summaryMaxLength = String(config.summaryMaxLength);
  form.summaryLimit = String(config.summaryLimit);
  form.ragLimit = String(config.ragLimit);
  form.deepRetrieveSummaryLimit = String(config.deepRetrieveSummaryLimit);
}

function parsePathText(): string[] {
  return form.modelPathText.split('/').map((item) => item.trim()).filter(Boolean);
}

function parseNumber(value: string, labelKey: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(t('settings.memoryConfig.validation.numberRequired', { label: t(labelKey) }));
  }

  return Math.floor(parsed);
}

function buildPayload(): MemorySettingsConfig {
  return {
    modelOnnxFile: parsePathText(),
    modelDtype: form.modelDtype as MemorySettingsConfig['modelDtype'],
    messagesPerSummary: parseNumber(form.messagesPerSummary, NUMBER_FIELD_LABEL_KEYS.messagesPerSummary),
    shortTermLimit: parseNumber(form.shortTermLimit, NUMBER_FIELD_LABEL_KEYS.shortTermLimit),
    summaryMaxLength: parseNumber(form.summaryMaxLength, NUMBER_FIELD_LABEL_KEYS.summaryMaxLength),
    summaryLimit: parseNumber(form.summaryLimit, NUMBER_FIELD_LABEL_KEYS.summaryLimit),
    ragLimit: parseNumber(form.ragLimit, NUMBER_FIELD_LABEL_KEYS.ragLimit),
    deepRetrieveSummaryLimit: parseNumber(form.deepRetrieveSummaryLimit, NUMBER_FIELD_LABEL_KEYS.deepRetrieveSummaryLimit),
  };
}

function getClearAllConfirmPhrase(): string {
  return t('settings.memoryConfig.clear.confirmPhrase');
}

function getClearAllConfirmPayloadText(): string {
  return clearForm.confirmText === getClearAllConfirmPhrase() ? CLEAR_ALL_CONFIRM_TEXT : clearForm.confirmText;
}

function validateClearForm(): boolean {
  if (clearForm.scope === 'all' && clearForm.confirmText !== getClearAllConfirmPhrase()) {
    MessagePlugin.warning(t('settings.memoryConfig.message.confirmPhraseRequired', { phrase: getClearAllConfirmPhrase() }));
    return false;
  }

  if (clearForm.scope === 'isolation' && clearForm.projectId.trim() === '') {
    MessagePlugin.warning(t('settings.memoryConfig.message.projectRequired'));
    return false;
  }

  return true;
}

function getClearDialogTitle(): string {
  return clearForm.scope === 'all' ? t('settings.memoryConfig.clear.allTitle') : t('settings.memoryConfig.clear.isolationTitle');
}

function getClearDialogBody(): string {
  return clearForm.scope === 'all' ? t('settings.memoryConfig.clear.allBody') : t('settings.memoryConfig.clear.isolationBody');
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.memory.get();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    setForm(response.data.config);
    modelAvailable.value = response.data.modelStatus.available;
    modelRelativePath.value = response.data.modelStatus.relativePath;
    stats.value = response.data.stats;
  } finally {
    loading.value = false;
  }
}

async function validateModelPath(): Promise<void> {
  validating.value = true;
  try {
    const response = await window.vtStudio.settings.memory.validateModelPath({ modelOnnxFile: parsePathText() });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    modelAvailable.value = response.data.available;
    modelRelativePath.value = response.data.relativePath;
    MessagePlugin.info(response.data.available ? t('settings.memoryConfig.modelStatus.available') : t('settings.memoryConfig.modelStatus.missing'));
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : t('settings.memoryConfig.message.modelPathValidateFailed'));
  } finally {
    validating.value = false;
  }
}

async function saveConfig(): Promise<void> {
  saving.value = true;
  try {
    const response = await window.vtStudio.settings.memory.save(buildPayload());
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    setForm(response.data.config);
    modelAvailable.value = response.data.modelStatus.available;
    modelRelativePath.value = response.data.modelStatus.relativePath;
    stats.value = response.data.stats;
    MessagePlugin.success(t('settings.memoryConfig.message.saved'));
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : t('settings.memoryConfig.message.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function restoreDefault(): Promise<void> {
  const dialog = DialogPlugin.confirm({
    header: t('settings.memoryConfig.restoreDialog.title'),
    body: t('settings.memoryConfig.restoreDialog.body'),
    confirmBtn: t('settings.memoryConfig.restoreDialog.confirm'),
    cancelBtn: t('settings.memoryConfig.restoreDialog.cancel'),
    theme: 'warning',
    async onConfirm() {
      restoring.value = true;
      try {
        const response = await window.vtStudio.settings.memory.restoreDefault();
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        setForm(response.data.config);
        modelAvailable.value = response.data.modelStatus.available;
        modelRelativePath.value = response.data.modelStatus.relativePath;
        stats.value = response.data.stats;
        MessagePlugin.success(t('settings.memoryConfig.message.restored'));
        dialog.destroy();
      } finally {
        restoring.value = false;
      }
    },
  });
}

async function clearMemory(): Promise<void> {
  if (!validateClearForm()) {
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: getClearDialogTitle(),
    body: getClearDialogBody(),
    confirmBtn: t('settings.memoryConfig.clear.confirm'),
    cancelBtn: t('settings.memoryConfig.clear.cancel'),
    theme: 'danger',
    async onConfirm() {
      clearing.value = true;
      try {
        const response = await window.vtStudio.settings.memory.clear({
          scope: clearForm.scope,
          type: clearForm.type,
          projectId: clearForm.projectId,
          agentType: clearForm.agentType,
          episodesId: clearForm.episodesId,
          confirmText: getClearAllConfirmPayloadText(),
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        stats.value = response.data.stats;
        MessagePlugin.success(t('settings.memoryConfig.message.cleared', { count: response.data.deleted }));
        dialog.destroy();
      } finally {
        clearing.value = false;
      }
    },
  });
}

defineExpose({ loadConfig });
onMounted(loadConfig);
</script>

<template>
  <section class="memory-config-section">
    <div class="memory-config-head">
      <div>
        <strong>{{ t('settings.memoryConfig.title') }}</strong>
        <p>{{ t('settings.memoryConfig.hint') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadConfig">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.memoryConfig.refresh') }}
        </t-button>
        <t-button variant="outline" theme="warning" :loading="restoring" @click="restoreDefault">
          <template #icon><RollbackIcon /></template>
          {{ t('settings.memoryConfig.restoreDefault') }}
        </t-button>
        <t-button theme="primary" :loading="saving" @click="saveConfig">
          <template #icon><SaveIcon /></template>
          {{ t('settings.memoryConfig.save') }}
        </t-button>
      </div>
    </div>

    <div class="memory-status-row">
      <div>
        <span>{{ t('settings.memoryConfig.onnxModel') }}</span>
        <b>{{ modelRelativePath || form.modelPathText }}</b>
      </div>
      <t-tag :theme="modelAvailable ? 'success' : 'warning'" variant="light">{{ modelStatusText }}</t-tag>
    </div>

    <t-form class="memory-config-form" layout="vertical">
      <t-form-item :label="t('settings.memoryConfig.modelPath')">
        <div class="memory-path-row">
          <t-input v-model="form.modelPathText" placeholder="all-MiniLM-L6-v2/onnx/model_fp16.onnx" />
          <t-button variant="outline" :loading="validating" @click="validateModelPath">{{ t('settings.memoryConfig.validate') }}</t-button>
        </div>
      </t-form-item>
      <t-form-item label="dtype">
        <t-select v-model="form.modelDtype">
          <t-option value="fp16" label="fp16" />
          <t-option value="fp32" label="fp32" />
          <t-option value="q8" label="q8" />
        </t-select>
      </t-form-item>
      <div class="memory-number-grid">
        <t-form-item :label="t('settings.memoryConfig.field.messagesPerSummary')">
          <t-input v-model="form.messagesPerSummary" />
        </t-form-item>
        <t-form-item :label="t('settings.memoryConfig.field.shortTermLimit')">
          <t-input v-model="form.shortTermLimit" />
        </t-form-item>
        <t-form-item :label="t('settings.memoryConfig.field.summaryMaxLength')">
          <t-input v-model="form.summaryMaxLength" />
        </t-form-item>
        <t-form-item :label="t('settings.memoryConfig.field.summaryLimit')">
          <t-input v-model="form.summaryLimit" />
        </t-form-item>
        <t-form-item :label="t('settings.memoryConfig.field.ragLimit')">
          <t-input v-model="form.ragLimit" />
        </t-form-item>
        <t-form-item :label="t('settings.memoryConfig.field.deepRetrieveSummaryLimit')">
          <t-input v-model="form.deepRetrieveSummaryLimit" />
        </t-form-item>
      </div>
    </t-form>

    <div class="memory-stats-grid">
      <div>
        <span>{{ t('settings.memoryConfig.stats.total') }}</span>
        <b>{{ stats.total }}</b>
      </div>
      <div>
        <span>{{ t('settings.memoryConfig.stats.messages') }}</span>
        <b>{{ stats.messages }}</b>
      </div>
      <div>
        <span>{{ t('settings.memoryConfig.stats.summaries') }}</span>
        <b>{{ stats.summaries }}</b>
      </div>
      <div>
        <span>{{ t('settings.memoryConfig.stats.isolations') }}</span>
        <b>{{ stats.isolations.length }}</b>
      </div>
    </div>

    <div class="memory-clear-panel">
      <div>
        <strong>{{ t('settings.memoryConfig.clear.title') }}</strong>
        <p>{{ t('settings.memoryConfig.clear.hint') }}</p>
      </div>
      <div class="memory-clear-grid">
        <t-radio-group v-model="clearForm.scope">
          <t-radio-button value="isolation">{{ t('settings.memoryConfig.clear.scope.isolation') }}</t-radio-button>
          <t-radio-button value="all">{{ t('settings.memoryConfig.clear.scope.all') }}</t-radio-button>
        </t-radio-group>
        <t-select v-model="clearForm.type">
          <t-option v-for="option in CLEAR_TYPE_OPTIONS" :key="option.value" :value="option.value" :label="t(option.labelKey)" />
        </t-select>
        <template v-if="clearForm.scope === 'isolation'">
          <t-input v-model="clearForm.projectId" :placeholder="t('settings.memoryConfig.clear.projectPlaceholder')" />
          <t-select v-model="clearForm.agentType">
            <t-option v-for="option in AGENT_TYPE_OPTIONS" :key="option.value" :value="option.value" :label="t(option.labelKey)" />
          </t-select>
          <t-input v-if="clearForm.agentType === 'productionAgent'" v-model="clearForm.episodesId" :placeholder="t('settings.memoryConfig.clear.episodePlaceholder')" />
        </template>
        <t-input v-if="clearForm.scope === 'all'" v-model="clearForm.confirmText" :placeholder="t('settings.memoryConfig.clear.confirmPlaceholder', { phrase: getClearAllConfirmPhrase() })" />
        <t-button theme="danger" variant="outline" :loading="clearing" @click="clearMemory">{{ t('settings.memoryConfig.clear.clear') }}</t-button>
      </div>
    </div>
  </section>
</template>
