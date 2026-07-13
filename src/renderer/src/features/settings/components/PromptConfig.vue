<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditIcon, RefreshIcon, RollbackIcon, SaveIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import type { BuiltinPromptType, PromptItem, PromptValidationWarning } from '@shared/types/prompt';

const { t, locale } = useI18n();
const RESOURCE_EXTRACTION_PROMPT_TYPE = 'script' + 'AssetExtraction' as BuiltinPromptType;

const PROMPT_NAME_KEYS: Partial<Record<BuiltinPromptType, string>> = {
  eventExtraction: 'settings.promptConfig.promptName.eventExtraction',
  [RESOURCE_EXTRACTION_PROMPT_TYPE]: 'settings.promptConfig.promptName.resourceExtraction',
  videoPromptGeneration: 'settings.promptConfig.promptName.videoPromptGeneration',
  audioBindPrompt: 'settings.promptConfig.promptName.audioBindPrompt',
};

const loading = ref(false);
const saving = ref(false);
const restoring = ref(false);
const prompts = ref<PromptItem[]>([]);
const editorVisible = ref(false);
const activePrompt = ref<PromptItem | null>(null);
const editorText = ref('');

const activeStatusText = computed(() => (activePrompt.value?.isCustomized ? t('settings.promptConfig.status.customized') : t('settings.promptConfig.status.defaultPrompt')));
const activeDataLength = computed(() => editorText.value.trim().length);

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function getPromptSummary(prompt: PromptItem): string {
  return prompt.effectiveData
    .replace(/\s+/g, ' ')
    .slice(0, 150);
}

function getPromptTheme(prompt: PromptItem): 'success' | 'default' {
  return prompt.isCustomized ? 'success' : 'default';
}

function getPromptName(prompt: PromptItem): string {
  return t(PROMPT_NAME_KEYS[prompt.type as BuiltinPromptType] ?? prompt.type);
}

function getPromptCardStatusText(prompt: PromptItem): string {
  return prompt.isCustomized ? t('settings.promptConfig.status.customized') : t('settings.promptConfig.status.default');
}

function formatUpdatedAt(value: number): string {
  if (!value) {
    return t('settings.promptConfig.notRecorded');
  }

  return new Date(value).toLocaleString(locale.value, { hour12: false });
}

function formatWarnings(warnings: PromptValidationWarning[]): string {
  return warnings.map((item) => `- ${item.message}`).join('\n');
}

async function loadPrompts(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.prompt.list();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    prompts.value = response.data.prompts;
  } finally {
    loading.value = false;
  }
}

function openEditor(prompt: PromptItem): void {
  activePrompt.value = prompt;
  editorText.value = prompt.effectiveData;
  editorVisible.value = true;
}

function syncActivePrompt(nextPrompt: PromptItem): void {
  activePrompt.value = nextPrompt;
  editorText.value = nextPrompt.effectiveData;
  prompts.value = prompts.value.map((item) => (item.id === nextPrompt.id ? nextPrompt : item));
}

async function savePrompt(force = false): Promise<void> {
  if (!activePrompt.value) {
    return;
  }

  if (!editorText.value.trim()) {
    MessagePlugin.warning(t('settings.promptConfig.message.contentRequired'));
    return;
  }

  saving.value = true;
  try {
    const response = await window.vtStudio.settings.prompt.update({
      id: activePrompt.value.id,
      useData: editorText.value,
      force,
    });

    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    if (!response.data.saved) {
      const dialog = DialogPlugin.confirm({
        header: t('settings.promptConfig.riskDialog.title'),
        body: t('settings.promptConfig.riskDialog.body', { warnings: formatWarnings(response.data.warnings) }),
        confirmBtn: t('settings.promptConfig.riskDialog.confirm'),
        cancelBtn: t('settings.promptConfig.riskDialog.cancel'),
        theme: 'warning',
        async onConfirm() {
          dialog.destroy();
          await savePrompt(true);
        },
      });
      return;
    }

    if (response.data.prompt) {
      syncActivePrompt(response.data.prompt);
    }
    editorVisible.value = false;
    MessagePlugin.success(t('settings.promptConfig.message.saved'));
    await loadPrompts();
  } finally {
    saving.value = false;
  }
}

async function restoreDefault(): Promise<void> {
  if (!activePrompt.value) {
    return;
  }

  const prompt = activePrompt.value;
  const dialog = DialogPlugin.confirm({
    header: t('settings.promptConfig.restoreDialog.title'),
    body: t('settings.promptConfig.restoreDialog.body', { name: getPromptName(prompt) }),
    confirmBtn: t('settings.promptConfig.restoreDialog.confirm'),
    cancelBtn: t('settings.promptConfig.restoreDialog.cancel'),
    theme: 'warning',
    async onConfirm() {
      restoring.value = true;
      try {
        const response = await window.vtStudio.settings.prompt.restoreDefault({ id: prompt.id });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        syncActivePrompt(response.data.prompt);
        MessagePlugin.success(t('settings.promptConfig.message.restored'));
        await loadPrompts();
        dialog.destroy();
      } finally {
        restoring.value = false;
      }
    },
  });
}

defineExpose({ loadPrompts });
onMounted(loadPrompts);
</script>

<template>
  <section class="settings-section prompt-section">
    <div class="settings-section-head">
      <div>
        <p class="eyebrow">F-002-006</p>
        <h3>{{ t('settings.promptConfig.title') }}</h3>
      </div>
      <t-button variant="outline" :loading="loading" @click="loadPrompts">
        <template #icon><RefreshIcon /></template>
        {{ t('settings.promptConfig.refresh') }}
      </t-button>
    </div>
    <p class="settings-hint">{{ t('settings.promptConfig.hint') }}</p>

    <div v-if="prompts.length > 0" class="prompt-grid">
      <article v-for="prompt in prompts" :key="prompt.id" class="prompt-card">
        <div class="prompt-card-head">
          <div>
            <strong>{{ getPromptName(prompt) }}</strong>
            <small>{{ prompt.type }}</small>
          </div>
          <t-tag :theme="getPromptTheme(prompt)" variant="light">{{ getPromptCardStatusText(prompt) }}</t-tag>
        </div>
        <p>{{ getPromptSummary(prompt) }}</p>
        <div class="prompt-card-foot">
          <span>{{ formatUpdatedAt(prompt.updatedAt) }}</span>
          <t-button size="small" variant="outline" @click="openEditor(prompt)">
            <template #icon><EditIcon /></template>
            {{ t('settings.promptConfig.edit') }}
          </t-button>
        </div>
      </article>
    </div>
    <p v-else class="model-empty">{{ loading ? t('settings.promptConfig.loading') : t('settings.promptConfig.empty') }}</p>

    <t-dialog v-model:visible="editorVisible" :header="activePrompt ? t('settings.promptConfig.editorTitleWithName', { name: getPromptName(activePrompt) }) : t('settings.promptConfig.editorTitle')" width="860px" :confirm-btn="t('settings.promptConfig.save')" :confirm-loading="saving" @confirm="() => savePrompt(false)">
      <div v-if="activePrompt" class="prompt-editor">
        <div class="prompt-editor-meta">
          <div>
            <span>{{ t('settings.promptConfig.meta.type') }}</span>
            <b>{{ activePrompt.type }}</b>
          </div>
          <div>
            <span>{{ t('settings.promptConfig.meta.status') }}</span>
            <b>{{ activeStatusText }}</b>
          </div>
          <div>
            <span>{{ t('settings.promptConfig.meta.chars') }}</span>
            <b>{{ activeDataLength }}</b>
          </div>
        </div>

        <div class="prompt-editor-toolbar">
          <p>{{ t('settings.promptConfig.editorHint') }}</p>
          <t-button variant="outline" theme="warning" :loading="restoring" :disabled="!activePrompt.isCustomized" @click="restoreDefault">
            <template #icon><RollbackIcon /></template>
            {{ t('settings.promptConfig.restoreDefault') }}
          </t-button>
        </div>

        <t-textarea v-model="editorText" class="code-editor prompt-textarea" :placeholder="t('settings.promptConfig.editorPlaceholder')" :autosize="{ minRows: 18, maxRows: 28 }" />
      </div>

      <template #footer>
        <div class="prompt-dialog-footer">
          <t-button variant="outline" @click="editorVisible = false">{{ t('settings.promptConfig.cancel') }}</t-button>
          <t-button theme="primary" :loading="saving" @click="savePrompt(false)">
            <template #icon><SaveIcon /></template>
            {{ t('settings.promptConfig.save') }}
          </t-button>
        </div>
      </template>
    </t-dialog>
  </section>
</template>
