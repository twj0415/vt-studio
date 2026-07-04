<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RefreshIcon, RollbackIcon, SaveIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import type { BusinessSettingsConfig } from '@shared/types/business-settings';

const { t } = useI18n();

const loading = ref(false);
const saving = ref(false);
const restoring = ref(false);

const form = reactive({
  chapterReg: '',
  requestTimeoutSeconds: '600',
  canvasWheelMode: 'zoom',
  showInteractionState: true,
  assetsBatchGenerateSize: '5',
  scriptEpisodeLength: '5000',
});

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function setForm(config: BusinessSettingsConfig): void {
  form.chapterReg = config.chapterReg;
  form.requestTimeoutSeconds = String(Math.floor(config.requestTimeoutMs / 1000));
  form.canvasWheelMode = config.canvasWheelMode;
  form.showInteractionState = config.showInteractionState;
  form.assetsBatchGenerateSize = String(config.assetsBatchGenerateSize);
  form.scriptEpisodeLength = String(config.scriptEpisodeLength);
}

function parseInteger(value: string, labelKey: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(t('settings.businessConfig.validation.numberRequired', { label: t(labelKey) }));
  }

  return Math.floor(parsed);
}

function buildPayload(): BusinessSettingsConfig {
  return {
    chapterReg: form.chapterReg.trim(),
    requestTimeoutMs: parseInteger(form.requestTimeoutSeconds, 'settings.businessConfig.field.requestTimeoutSeconds') * 1000,
    canvasWheelMode: form.canvasWheelMode as BusinessSettingsConfig['canvasWheelMode'],
    showInteractionState: form.showInteractionState,
    assetsBatchGenerateSize: parseInteger(form.assetsBatchGenerateSize, 'settings.businessConfig.field.assetsBatchGenerateSize'),
    scriptEpisodeLength: parseInteger(form.scriptEpisodeLength, 'settings.businessConfig.field.scriptEpisodeLength'),
  };
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.business.get();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    setForm(response.data.config);
  } finally {
    loading.value = false;
  }
}

async function saveConfig(): Promise<void> {
  saving.value = true;
  try {
    const response = await window.vtStudio.settings.business.save(buildPayload());
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    setForm(response.data.config);
    MessagePlugin.success(t('settings.businessConfig.message.saved'));
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : t('settings.businessConfig.message.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function restoreDefaultChapterReg(): Promise<void> {
  const dialog = DialogPlugin.confirm({
    header: t('settings.businessConfig.restoreDialog.title'),
    body: t('settings.businessConfig.restoreDialog.body'),
    confirmBtn: t('settings.businessConfig.restoreDialog.confirm'),
    cancelBtn: t('settings.businessConfig.restoreDialog.cancel'),
    theme: 'warning',
    async onConfirm() {
      restoring.value = true;
      try {
        const response = await window.vtStudio.settings.business.restoreDefaultChapterReg();
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        setForm(response.data.config);
        MessagePlugin.success(t('settings.businessConfig.message.restored'));
        dialog.destroy();
      } finally {
        restoring.value = false;
      }
    },
  });
}

defineExpose({ loadConfig });
onMounted(loadConfig);
</script>

<template>
  <section class="business-config-section">
    <div class="business-config-head">
      <div>
        <strong>{{ t('settings.businessConfig.title') }}</strong>
        <p>{{ t('settings.businessConfig.hint') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadConfig">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.businessConfig.refresh') }}
        </t-button>
        <t-button variant="outline" theme="warning" :loading="restoring" @click="restoreDefaultChapterReg">
          <template #icon><RollbackIcon /></template>
          {{ t('settings.businessConfig.restoreDefaultRegex') }}
        </t-button>
        <t-button theme="primary" :loading="saving" @click="saveConfig">
          <template #icon><SaveIcon /></template>
          {{ t('settings.businessConfig.save') }}
        </t-button>
      </div>
    </div>

    <t-form class="business-config-form" layout="vertical">
      <t-form-item :label="t('settings.businessConfig.field.chapterReg')">
        <t-textarea v-model="form.chapterReg" :autosize="{ minRows: 2, maxRows: 4 }" :placeholder="t('settings.businessConfig.field.chapterRegPlaceholder')" />
      </t-form-item>

      <div class="business-config-grid">
        <t-form-item :label="t('settings.businessConfig.field.requestTimeoutSeconds')">
          <t-input v-model="form.requestTimeoutSeconds" />
        </t-form-item>

        <t-form-item :label="t('settings.businessConfig.field.canvasWheelMode')">
          <t-radio-group v-model="form.canvasWheelMode" variant="default-filled">
            <t-radio-button value="zoom">{{ t('settings.businessConfig.wheelMode.zoom') }}</t-radio-button>
            <t-radio-button value="scroll">{{ t('settings.businessConfig.wheelMode.scroll') }}</t-radio-button>
          </t-radio-group>
        </t-form-item>

        <t-form-item :label="t('settings.businessConfig.field.showInteractionState')">
          <t-switch v-model="form.showInteractionState" />
        </t-form-item>

        <t-form-item :label="t('settings.businessConfig.field.assetsBatchGenerateSize')">
          <t-input v-model="form.assetsBatchGenerateSize" />
        </t-form-item>

        <t-form-item :label="t('settings.businessConfig.field.scriptEpisodeLength')">
          <t-input v-model="form.scriptEpisodeLength" />
        </t-form-item>
      </div>
    </t-form>
  </section>
</template>
