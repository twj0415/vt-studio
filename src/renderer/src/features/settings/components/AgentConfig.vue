<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDownIcon, ChevronUpIcon, RefreshIcon, SaveIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import type { AgentConfigGroup, AgentConfigItem, AgentConfigResult, AgentTextModelOption, TextAgentKey } from '@shared/types/agent-config';

type CreativityPreset = 'stable' | 'balanced' | 'creative';
type OutputLengthPreset = 'auto' | 'short' | 'medium' | 'long';

interface AgentDraft {
  overrideEnabled: boolean;
  modelId: string;
  inheritParams: boolean;
  temperatureText: string;
  maxOutputTokensText: string;
}

const { t } = useI18n();

const CREATIVITY_OPTIONS: Array<{ labelKey: string; value: CreativityPreset; temperature: number }> = [
  { labelKey: 'settings.agentConfig.creativity.stable', value: 'stable', temperature: 0.4 },
  { labelKey: 'settings.agentConfig.creativity.balanced', value: 'balanced', temperature: 0.7 },
  { labelKey: 'settings.agentConfig.creativity.creative', value: 'creative', temperature: 1 },
];

const OUTPUT_LENGTH_OPTIONS: Array<{ labelKey: string; value: OutputLengthPreset; maxOutputTokens: number }> = [
  { labelKey: 'settings.agentConfig.outputLength.auto', value: 'auto', maxOutputTokens: 0 },
  { labelKey: 'settings.agentConfig.outputLength.short', value: 'short', maxOutputTokens: 1024 },
  { labelKey: 'settings.agentConfig.outputLength.medium', value: 'medium', maxOutputTokens: 4096 },
  { labelKey: 'settings.agentConfig.outputLength.long', value: 'long', maxOutputTokens: 8192 },
];

const GROUP_LABEL_KEYS: Record<AgentConfigGroup, string> = {
  main: 'settings.agentConfig.group.main',
  script: 'settings.agentConfig.group.script',
  production: 'settings.agentConfig.group.production',
};

const AGENT_NAME_KEYS: Record<TextAgentKey, string> = {
  scriptAgent: 'settings.agentConfig.agentName.scriptAgent',
  productionAgent: 'settings.agentConfig.agentName.productionAgent',
  universalAi: 'settings.agentConfig.agentName.universalAi',
  'scriptAgent:decisionAgent': 'settings.agentConfig.agentName.scriptDecisionAgent',
  'scriptAgent:supervisionAgent': 'settings.agentConfig.agentName.scriptSupervisionAgent',
  'scriptAgent:storySkeletonAgent': 'settings.agentConfig.agentName.storySkeletonAgent',
  'scriptAgent:adaptationStrategyAgent': 'settings.agentConfig.agentName.adaptationStrategyAgent',
  'scriptAgent:scriptAgent': 'settings.agentConfig.agentName.scriptWritingAgent',
  'productionAgent:decisionAgent': 'settings.agentConfig.agentName.productionDecisionAgent',
  'productionAgent:supervisionAgent': 'settings.agentConfig.agentName.productionSupervisionAgent',
  'productionAgent:deriveAssetsAgent': 'settings.agentConfig.agentName.deriveAssetsAgent',
  'productionAgent:generateAssetsAgent': 'settings.agentConfig.agentName.generateAssetsAgent',
  'productionAgent:directorPlanAgent': 'settings.agentConfig.agentName.directorPlanAgent',
  'productionAgent:storyboardGenAgent': 'settings.agentConfig.agentName.storyboardGenAgent',
  'productionAgent:storyboardPanelAgent': 'settings.agentConfig.agentName.storyboardPanelAgent',
  'productionAgent:storyboardTableAgent': 'settings.agentConfig.agentName.storyboardTableAgent',
};

const AGENT_STATUS_KEYS: Record<AgentConfigItem['status'], string> = {
  inherited: 'settings.agentConfig.status.inherited',
  overridden: 'settings.agentConfig.status.overridden',
  'missing-default': 'settings.agentConfig.status.missingDefault',
  'invalid-default': 'settings.agentConfig.status.invalidDefault',
  'invalid-override': 'settings.agentConfig.status.invalidOverride',
  disabled: 'settings.agentConfig.status.disabled',
};

const loading = ref(false);
const saving = ref(false);
const advancedVisible = ref(false);
const agents = ref<AgentConfigItem[]>([]);
const availableTextModels = ref<AgentTextModelOption[]>([]);
const defaultTextStatus = ref<AgentConfigResult['defaultTextStatus']>('missing');
const defaultTextModel = ref<AgentConfigResult['defaultTextModel']>(null);
const globalForm = reactive({
  creativity: 'balanced' as CreativityPreset,
  outputLength: 'auto' as OutputLengthPreset,
});
const drafts = reactive<Record<string, AgentDraft>>({});

const groupedAgents = computed(() => {
  const groups: Record<AgentConfigGroup, AgentConfigItem[]> = {
    main: [],
    script: [],
    production: [],
  };

  for (const agent of agents.value) {
    groups[agent.group].push(agent);
  }

  return groups;
});

const modelOptions = computed(() =>
  availableTextModels.value.map((model) => ({
    value: model.modelId,
    label: `${model.connectionName} / ${model.modelDisplayName} (${model.modelName})`,
  })),
);

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function getStatusTheme(status: AgentConfigItem['status']): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'inherited' || status === 'overridden') {
    return 'success';
  }

  if (status === 'disabled') {
    return 'default';
  }

  return status === 'missing-default' ? 'warning' : 'danger';
}

function getGroupLabel(group: AgentConfigGroup | string | number): string {
  return t(GROUP_LABEL_KEYS[group as AgentConfigGroup] ?? String(group));
}

function getAgentName(agent: AgentConfigItem): string {
  return t(AGENT_NAME_KEYS[agent.key]);
}

function getAgentStatusText(status: AgentConfigItem['status']): string {
  return t(AGENT_STATUS_KEYS[status]);
}

function getDefaultTextStatusText(): string {
  if (defaultTextStatus.value === 'configured') {
    return t('settings.agentConfig.defaultStatus.configured');
  }

  if (defaultTextStatus.value === 'missing') {
    return t('settings.agentConfig.defaultStatus.missing');
  }

  return t('settings.agentConfig.defaultStatus.unsupported');
}

function inferCreativity(temperature: number): CreativityPreset {
  const sorted = [...CREATIVITY_OPTIONS].sort((left, right) => Math.abs(left.temperature - temperature) - Math.abs(right.temperature - temperature));
  return sorted[0]?.value ?? 'balanced';
}

function inferOutputLength(maxOutputTokens: number): OutputLengthPreset {
  return OUTPUT_LENGTH_OPTIONS.find((item) => item.maxOutputTokens === maxOutputTokens)?.value ?? 'auto';
}

function getCreativityTemperature(): number {
  return CREATIVITY_OPTIONS.find((item) => item.value === globalForm.creativity)?.temperature ?? 0.7;
}

function getOutputLengthTokens(): number {
  return OUTPUT_LENGTH_OPTIONS.find((item) => item.value === globalForm.outputLength)?.maxOutputTokens ?? 0;
}

function resetDrafts(nextAgents: AgentConfigItem[]): void {
  for (const key of Object.keys(drafts)) {
    delete drafts[key];
  }

  for (const agent of nextAgents) {
    drafts[agent.key] = {
      overrideEnabled: agent.overrideEnabled,
      modelId: agent.modelId ?? '',
      inheritParams: agent.temperature === null && agent.maxOutputTokens === null,
      temperatureText: String(agent.temperature ?? getCreativityTemperature()),
      maxOutputTokensText: String(agent.maxOutputTokens ?? getOutputLengthTokens()),
    };
  }
}

function getDraft(key: TextAgentKey): AgentDraft {
  return drafts[key] ?? {
    overrideEnabled: false,
    modelId: '',
    inheritParams: true,
    temperatureText: String(getCreativityTemperature()),
    maxOutputTokensText: String(getOutputLengthTokens()),
  };
}

function parseTemperature(text: string): number | null {
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    return null;
  }

  return value;
}

function parseMaxOutputTokens(text: string): number | null {
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.agentConfig.get();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    agents.value = response.data.agents;
    availableTextModels.value = response.data.availableTextModels;
    defaultTextModel.value = response.data.defaultTextModel;
    defaultTextStatus.value = response.data.defaultTextStatus;
    globalForm.creativity = inferCreativity(response.data.globalSettings.temperature);
    globalForm.outputLength = inferOutputLength(response.data.globalSettings.maxOutputTokens);
    resetDrafts(response.data.agents);
  } finally {
    loading.value = false;
  }
}

async function saveConfig(): Promise<void> {
  const payloadAgents = agents.value.map((agent) => {
    const draft = getDraft(agent.key);
    const agentName = getAgentName(agent);
    if (draft.overrideEnabled && !modelOptions.value.some((item) => item.value === draft.modelId)) {
      throw new Error(t('settings.agentConfig.validation.invalidOverrideModel', { agent: agentName }));
    }

    if (draft.inheritParams) {
      return {
        key: agent.key,
        modelId: draft.overrideEnabled ? draft.modelId : null,
        temperature: null,
        maxOutputTokens: null,
      };
    }

    const temperature = parseTemperature(draft.temperatureText);
    const maxOutputTokens = parseMaxOutputTokens(draft.maxOutputTokensText);
    if (temperature === null) {
      throw new Error(t('settings.agentConfig.validation.temperatureRange', { agent: agentName }));
    }

    if (maxOutputTokens === null) {
      throw new Error(t('settings.agentConfig.validation.maxOutputTokensRange', { agent: agentName }));
    }

    return {
      key: agent.key,
      modelId: draft.overrideEnabled ? draft.modelId : null,
      temperature,
      maxOutputTokens,
    };
  });

  saving.value = true;
  try {
    const response = await window.vtStudio.settings.agentConfig.save({
      globalSettings: {
        temperature: getCreativityTemperature(),
        maxOutputTokens: getOutputLengthTokens(),
      },
      agents: payloadAgents,
    });

    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('settings.agentConfig.message.saved'));
    await loadConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : t('settings.agentConfig.message.saveFailed');
    MessagePlugin.error(message);
  } finally {
    saving.value = false;
  }
}

defineExpose({ loadConfig });
onMounted(loadConfig);
</script>

<template>
  <section class="agent-config-panel">
    <div class="agent-config-head">
      <div>
        <strong>{{ t('settings.agentConfig.title') }}</strong>
        <p>{{ t('settings.agentConfig.hint') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadConfig">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.agentConfig.refresh') }}
        </t-button>
        <t-button theme="primary" :loading="saving" @click="saveConfig">
          <template #icon><SaveIcon /></template>
          {{ t('settings.agentConfig.save') }}
        </t-button>
      </div>
    </div>

    <div class="agent-default-row">
      <div class="agent-default-model">
        <span>{{ t('settings.agentConfig.defaultModel') }}</span>
        <b>{{ defaultTextModel ? `${defaultTextModel.connectionName} / ${defaultTextModel.modelDisplayName}` : t('settings.agentConfig.notConfigured') }}</b>
        <small v-if="defaultTextModel">{{ defaultTextModel.modelName }}</small>
      </div>
      <t-tag :theme="defaultTextStatus === 'configured' ? 'success' : 'warning'" variant="light">{{ getDefaultTextStatusText() }}</t-tag>
    </div>

    <div class="agent-simple-controls">
      <t-form layout="inline">
        <t-form-item :label="t('settings.agentConfig.creativityLabel')">
          <t-radio-group v-model="globalForm.creativity" variant="default-filled">
            <t-radio-button v-for="item in CREATIVITY_OPTIONS" :key="item.value" :value="item.value">{{ t(item.labelKey) }}</t-radio-button>
          </t-radio-group>
        </t-form-item>
        <t-form-item :label="t('settings.agentConfig.outputLengthLabel')">
          <t-radio-group v-model="globalForm.outputLength" variant="default-filled">
            <t-radio-button v-for="item in OUTPUT_LENGTH_OPTIONS" :key="item.value" :value="item.value">{{ t(item.labelKey) }}</t-radio-button>
          </t-radio-group>
        </t-form-item>
      </t-form>
    </div>

    <t-button class="agent-advanced-toggle" variant="outline" @click="advancedVisible = !advancedVisible">
      <span>{{ t('settings.agentConfig.advancedOverride') }}</span>
      <ChevronUpIcon v-if="advancedVisible" />
      <ChevronDownIcon v-else />
    </t-button>

    <div v-if="advancedVisible" class="agent-group-list">
      <section v-for="(items, group) in groupedAgents" :key="group" class="agent-group">
        <div class="agent-group-title">{{ getGroupLabel(group) }}</div>
        <div class="agent-card-grid">
          <article v-for="agent in items" :key="agent.key" class="agent-card">
            <div class="agent-card-head">
              <div>
                <strong>{{ getAgentName(agent) }}</strong>
                <small>{{ agent.key }}</small>
              </div>
              <t-tag :theme="getStatusTheme(agent.status)" variant="light">{{ getAgentStatusText(agent.status) }}</t-tag>
            </div>

            <div class="agent-effective-model">
              <span>{{ t('settings.agentConfig.currentEffective') }}</span>
              <b>{{ agent.effectiveModel ? `${agent.effectiveModel.connectionName} / ${agent.effectiveModel.modelDisplayName}` : t('settings.agentConfig.notConfigured') }}</b>
              <small v-if="agent.effectiveModel">{{ agent.effectiveModel.modelName }}</small>
            </div>

            <div class="agent-field-row">
              <span>{{ t('settings.agentConfig.overrideModel') }}</span>
              <t-switch v-model="getDraft(agent.key).overrideEnabled" />
            </div>
            <t-select v-if="getDraft(agent.key).overrideEnabled" v-model="getDraft(agent.key).modelId" :placeholder="t('settings.agentConfig.modelPlaceholder')">
              <t-option v-for="option in modelOptions" :key="option.value" :value="option.value" :label="option.label" />
            </t-select>

            <div class="agent-field-row">
              <span>{{ t('settings.agentConfig.inheritGlobalParams') }}</span>
              <t-switch v-model="getDraft(agent.key).inheritParams" />
            </div>
            <div v-if="!getDraft(agent.key).inheritParams" class="agent-param-grid">
              <label>
                <span>{{ t('settings.agentConfig.form.temperature') }}</span>
                <t-input v-model="getDraft(agent.key).temperatureText" placeholder="0-2" />
              </label>
              <label>
                <span>{{ t('settings.agentConfig.form.maxOutputTokens') }}</span>
                <t-input v-model="getDraft(agent.key).maxOutputTokensText" :placeholder="t('settings.agentConfig.autoTokensPlaceholder')" />
              </label>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>
