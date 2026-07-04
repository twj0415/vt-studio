<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AddIcon, ChatIcon, ChevronDownIcon, ChevronUpIcon, DeleteIcon, EditIcon, RefreshIcon, SaveIcon, SendIcon, StopIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { useAgentSocket } from '@renderer/composables/useAgentSocket';
import WorkflowNextStepHint from '@renderer/features/shared/WorkflowNextStepHint.vue';
import { useAppStore } from '@renderer/stores/app';
import { VT_STATUS } from '@shared/constants/status';
import type { HistoryMessage, MemoryClearType } from '@shared/types/memory';
import type { AgentContentBlock, AgentMessageStatus, AgentThinkConfigPayload } from '@shared/types/socket';
import { SCRIPT_EXTRACT_STATUS } from '@shared/types/script-agent';
import type {
  ScriptAgentModelCapabilityResult,
  ScriptAgentScriptItem,
  ScriptAgentSourceEventCheckResult,
  ScriptAgentWorkspace,
  ScriptAgentWorkspaceField,
  ScriptAgentWorkspaceSocketUpdate,
  ScriptExtractStatus,
} from '@shared/types/script-agent';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  name?: string;
  status: AgentMessageStatus;
  content: string;
  blocks?: AgentContentBlock[];
  createTime: number;
}

interface ScriptEditorState {
  open: boolean;
  id: number | null;
  episodeKey: string;
  name: string;
  content: string;
}

const THINK_LEVELS: Array<{ value: 0 | 1 | 2 | 3; labelKey: string }> = [
  { value: 0, labelKey: 'scriptAgent.think.off' },
  { value: 1, labelKey: 'scriptAgent.think.light' },
  { value: 2, labelKey: 'scriptAgent.think.deep' },
  { value: 3, labelKey: 'scriptAgent.think.extreme' },
];

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const agentSocket = useAgentSocket();
const isAgentConnected = agentSocket.isConnected;
const lastAgentError = agentSocket.lastError;

const loading = ref(false);
const refreshing = ref(false);
const workspaceLoading = ref(false);
const historyMessages = ref<HistoryMessage[]>([]);
const sessionUserMessages = ref<DisplayMessage[]>([]);
const inputText = ref('');
const messageListRef = ref<HTMLElement | null>(null);
const sourceEventCheck = ref<ScriptAgentSourceEventCheckResult | null>(null);
const modelCapability = ref<ScriptAgentModelCapabilityResult | null>(null);
const workspace = ref<ScriptAgentWorkspace | null>(null);
const thinkLevel = ref<0 | 1 | 2 | 3>(0);
const clearingType = ref<MemoryClearType | null>(null);
const savingWorkspaceField = ref<ScriptAgentWorkspaceField | null>(null);
const savingScript = ref(false);
const deletingScriptId = ref<number | null>(null);
const collapsedScriptKeys = ref<Set<string>>(new Set());
const workspaceTabs = reactive({
  active: 'skeleton',
});
const workspaceDraft = reactive({
  storySkeleton: '',
  adaptationStrategy: '',
});
const scriptEditor = reactive<ScriptEditorState>({
  open: false,
  id: null,
  episodeKey: '',
  name: '',
  content: '',
});

const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));
const currentProjectName = computed(() => appStore.currentProject?.name ?? t('common.noProject'));
const isolationKey = computed(() => `${currentProjectId.value}:scriptAgent`);
const canUseAgent = computed(() => currentProjectId.value > 0 && appStore.currentProject?.sourceType === 'novel');

const historyDisplayMessages = computed<DisplayMessage[]>(() =>
  historyMessages.value.map((message) => ({
    id: `history-${message.id}`,
    role: message.role,
    name: message.name,
    status: 'complete',
    content: message.content.map((item) => item.data).join('\n\n'),
    createTime: message.createTime,
  })),
);

const assistantDisplayMessages = computed<DisplayMessage[]>(() => {
  const messageIds = Array.from(new Set(agentSocket.messages.value.map((message) => message.id)));

  return messageIds.map((messageId) => {
    const blocks = agentSocket.contentBlocks.value[messageId] ?? [];
    const updates = agentSocket.messageUpdates.value.filter((update) => update.id === messageId);
    const messages = agentSocket.messages.value.filter((message) => message.id === messageId);
    const latestUpdate = updates[updates.length - 1];
    const latestMessage = messages[messages.length - 1];
    const contentFromBlocks = blocks.map((block) => block.content).filter(Boolean).join('\n\n');
    const contentFromMessages = messages.map((message) => message.content).filter(Boolean).join('');

    return {
      id: `assistant-${messageId}`,
      role: 'assistant',
      name: t('scriptAgent.assistantName'),
      status: latestUpdate?.status ?? latestMessage?.status ?? 'streaming',
      content: contentFromBlocks || contentFromMessages,
      blocks,
      createTime: Date.now(),
    };
  });
});

const welcomeMessage = computed<DisplayMessage>(() => ({
  id: 'script-agent-welcome',
  role: 'assistant',
  name: t('scriptAgent.assistantName'),
  status: 'complete',
  content: t('scriptAgent.welcome'),
  createTime: 0,
}));

const displayMessages = computed<DisplayMessage[]>(() => {
  const messages = [...historyDisplayMessages.value, ...sessionUserMessages.value, ...assistantDisplayMessages.value];
  return messages.length > 0 ? messages : [welcomeMessage.value];
});

const isGenerating = computed(() => assistantDisplayMessages.value.some((message) => message.status === 'pending' || message.status === 'streaming'));
const isSourceReady = computed(() => Boolean(sourceEventCheck.value?.ready));
const scriptCount = computed(() => workspace.value?.scripts.length ?? 0);
const sourceIssueCount = computed(() => {
  const check = sourceEventCheck.value;
  return check ? check.staleCount + check.runningCount + check.failedCount : 0;
});
const sourceWarningText = computed(() => {
  const check = sourceEventCheck.value;
  if (!check) {
    return '';
  }
  if (check.total === 0) {
    return t('scriptAgent.source.noSource');
  }
  if (check.ready) {
    return t('scriptAgent.source.ready', { count: check.succeededCount });
  }
  return t('scriptAgent.source.notReady', {
    stale: check.staleCount,
    running: check.runningCount,
    failed: check.failedCount,
  });
});

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === VT_STATUS.OK;
}

function getStatusTheme(status: AgentMessageStatus): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === 'pending' || status === 'streaming') {
    return 'primary';
  }
  if (status === 'complete') {
    return 'success';
  }
  if (status === 'error') {
    return 'danger';
  }
  if (status === 'stop') {
    return 'warning';
  }
  return 'default';
}

function getStatusLabel(status: AgentMessageStatus): string {
  return t(`scriptAgent.messageStatus.${status}`);
}

function getExtractStatusTheme(status: ScriptExtractStatus): 'primary' | 'success' | 'danger' | 'default' {
  if (status === SCRIPT_EXTRACT_STATUS.RUNNING) {
    return 'primary';
  }
  if (status === SCRIPT_EXTRACT_STATUS.SUCCEEDED) {
    return 'success';
  }
  if (status === SCRIPT_EXTRACT_STATUS.FAILED) {
    return 'danger';
  }
  return 'default';
}

function getExtractStatusLabel(status: ScriptExtractStatus): string {
  return t(`scriptAgent.workspace.extractStatus.${status}`);
}

function formatTime(value: number): string {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function syncWorkspaceDraft(nextWorkspace: ScriptAgentWorkspace | null): void {
  workspace.value = nextWorkspace;
  workspaceDraft.storySkeleton = nextWorkspace?.storySkeleton ?? '';
  workspaceDraft.adaptationStrategy = nextWorkspace?.adaptationStrategy ?? '';
}

function resetScriptEditor(): void {
  scriptEditor.open = false;
  scriptEditor.id = null;
  scriptEditor.episodeKey = '';
  scriptEditor.name = '';
  scriptEditor.content = '';
}

function getScriptCardKey(script: ScriptAgentScriptItem): string {
  return `id:${script.id}`;
}

function isScriptCollapsed(script: ScriptAgentScriptItem): boolean {
  return collapsedScriptKeys.value.has(getScriptCardKey(script));
}

function toggleScriptCollapsed(script: ScriptAgentScriptItem): void {
  const next = new Set(collapsedScriptKeys.value);
  const key = getScriptCardKey(script);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  collapsedScriptKeys.value = next;
}

async function scrollMessagesToBottom(): Promise<void> {
  await nextTick();
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  }
}

async function loadMemoryHistory(): Promise<void> {
  if (!canUseAgent.value) {
    historyMessages.value = [];
    return;
  }

  const response = await window.vtStudio.agent.script.getMemoryHistory({
    projectId: currentProjectId.value,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    historyMessages.value = [];
    return;
  }

  historyMessages.value = response.data.messages;
}

async function checkSourceEvents(): Promise<void> {
  if (!canUseAgent.value) {
    sourceEventCheck.value = null;
    return;
  }

  const response = await window.vtStudio.agent.script.checkSourceEvents({
    projectId: currentProjectId.value,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    sourceEventCheck.value = null;
    return;
  }

  sourceEventCheck.value = response.data;
}

async function loadModelCapability(): Promise<void> {
  const response = await window.vtStudio.agent.script.getModelCapability();
  if (!isOk(response)) {
    modelCapability.value = {
      configured: false,
      supportsThink: false,
      modelName: null,
      error: response.msg,
    };
    return;
  }

  modelCapability.value = response.data;
}

async function loadWorkspace(): Promise<void> {
  if (!canUseAgent.value) {
    syncWorkspaceDraft(null);
    return;
  }

  workspaceLoading.value = true;
  try {
    const response = await window.vtStudio.agent.script.getWorkspace({
      projectId: currentProjectId.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      syncWorkspaceDraft(null);
      return;
    }

    syncWorkspaceDraft(response.data.workspace);
  } finally {
    workspaceLoading.value = false;
  }
}

function handleWorkspaceSocketUpdate(payload: ScriptAgentWorkspaceSocketUpdate | null): void {
  if (!payload || payload.projectId !== currentProjectId.value) {
    return;
  }
  if (payload.result.errors.length > 0) {
    MessagePlugin.error(payload.result.errors.join('；'));
    return;
  }
  if (!payload.result.workspace) {
    return;
  }

  syncWorkspaceDraft(payload.result.workspace);
  MessagePlugin.success(t('scriptAgent.workspace.xmlApplied', { count: payload.result.appliedCount }));
}

function applyThinkConfig(): void {
  const payload: AgentThinkConfigPayload = {
    think: Boolean(modelCapability.value?.supportsThink && thinkLevel.value > 0),
    thinkLevel: modelCapability.value?.supportsThink ? thinkLevel.value : 0,
  };
  agentSocket.updateThinkConfig(payload);
}

async function connectAgent(): Promise<void> {
  if (!canUseAgent.value) {
    agentSocket.disconnect();
    return;
  }

  try {
    await agentSocket.connect({
      namespace: 'scriptAgent',
      auth: {
        projectId: currentProjectId.value,
        isolationKey: isolationKey.value,
      },
    });
    applyThinkConfig();
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : t('scriptAgent.errors.connectFailed'));
  }
}

async function initialize(): Promise<void> {
  if (!canUseAgent.value) {
    return;
  }

  loading.value = true;
  try {
    await Promise.all([loadModelCapability(), loadMemoryHistory(), checkSourceEvents(), loadWorkspace()]);
    await connectAgent();
    await scrollMessagesToBottom();
  } finally {
    loading.value = false;
  }
}

async function refreshPage(): Promise<void> {
  refreshing.value = true;
  try {
    await Promise.all([loadModelCapability(), loadMemoryHistory(), checkSourceEvents(), loadWorkspace()]);
  } finally {
    refreshing.value = false;
  }
}

async function saveWorkspaceField(field: ScriptAgentWorkspaceField): Promise<void> {
  if (!canUseAgent.value) {
    return;
  }

  savingWorkspaceField.value = field;
  try {
    const response = await window.vtStudio.agent.script.updateWorkspaceField({
      projectId: currentProjectId.value,
      field,
      content: workspaceDraft[field],
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    syncWorkspaceDraft(response.data.workspace);
    MessagePlugin.success(t('scriptAgent.workspace.saved'));
  } finally {
    savingWorkspaceField.value = null;
  }
}

function createScript(): void {
  scriptEditor.open = true;
  scriptEditor.id = null;
  scriptEditor.episodeKey = '';
  scriptEditor.name = '';
  scriptEditor.content = '';
}

function editScript(script: ScriptAgentScriptItem): void {
  scriptEditor.open = true;
  scriptEditor.id = script.id;
  scriptEditor.episodeKey = script.episodeKey;
  scriptEditor.name = script.name;
  scriptEditor.content = script.content;
}

async function saveScript(): Promise<void> {
  if (!canUseAgent.value) {
    return;
  }
  if (!scriptEditor.name.trim() || !scriptEditor.content.trim()) {
    MessagePlugin.warning(t('scriptAgent.workspace.scriptRequired'));
    return;
  }

  const wasEditing = Boolean(scriptEditor.id);
  savingScript.value = true;
  try {
    const response = await window.vtStudio.agent.script.upsertScript({
      projectId: currentProjectId.value,
      script: {
        id: scriptEditor.id,
        episodeKey: scriptEditor.episodeKey || null,
        name: scriptEditor.name,
        content: scriptEditor.content,
      },
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    await loadWorkspace();
    resetScriptEditor();
    MessagePlugin.success(t(wasEditing ? 'scriptAgent.workspace.scriptSaved' : 'scriptAgent.workspace.scriptCreated'));
  } finally {
    savingScript.value = false;
  }
}

function confirmDeleteScript(script: ScriptAgentScriptItem): void {
  if (!canUseAgent.value) {
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t('scriptAgent.workspace.deleteTitle'),
    body: t('scriptAgent.workspace.deleteBody', { name: script.name }),
    confirmBtn: t('scriptAgent.workspace.deleteConfirm'),
    cancelBtn: t('scriptAgent.cancel'),
    theme: 'warning',
    async onConfirm() {
      deletingScriptId.value = script.id;
      try {
        const response = await window.vtStudio.agent.script.deleteScript({
          projectId: currentProjectId.value,
          scriptId: script.id,
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        if (scriptEditor.id === script.id) {
          resetScriptEditor();
        }
        await loadWorkspace();
        MessagePlugin.success(t('scriptAgent.workspace.scriptDeleted'));
      } finally {
        deletingScriptId.value = null;
        dialog.destroy();
      }
    },
  });
}

function sendMessage(): void {
  const content = inputText.value.trim();
  if (!content) {
    MessagePlugin.warning(t('scriptAgent.errors.emptyMessage'));
    return;
  }
  if (!agentSocket.isConnected.value) {
    MessagePlugin.warning(t('scriptAgent.errors.notConnected'));
    return;
  }
  if (isGenerating.value) {
    MessagePlugin.warning(t('scriptAgent.errors.generating'));
    return;
  }

  sessionUserMessages.value.push({
    id: `session-user-${Date.now()}`,
    role: 'user',
    status: 'complete',
    content,
    createTime: Date.now(),
  });
  inputText.value = '';
  agentSocket.sendChat(content);
  void scrollMessagesToBottom();
}

function stopGenerate(): void {
  agentSocket.stop();
}

function reconnectAgent(): void {
  if (!canUseAgent.value) {
    return;
  }
  agentSocket.reconnect();
}

function openSourcePage(): void {
  void router.push({ name: 'novel' });
}

function confirmClearMemory(type: MemoryClearType): void {
  if (!canUseAgent.value) {
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t(`scriptAgent.memory.clearTitle.${type}`),
    body: t('scriptAgent.memory.clearBody'),
    confirmBtn: t('scriptAgent.memory.confirmClear'),
    cancelBtn: t('scriptAgent.cancel'),
    theme: 'warning',
    async onConfirm() {
      clearingType.value = type;
      try {
        const response = await window.vtStudio.agent.script.clearMemory({
          projectId: currentProjectId.value,
          type,
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }

        historyMessages.value = [];
        sessionUserMessages.value = [];
        agentSocket.clearMessages();
        MessagePlugin.success(t('scriptAgent.memory.clearSuccess', { count: response.data.deleted + response.data.updated }));
      } finally {
        clearingType.value = null;
        dialog.destroy();
      }
    },
  });
}

watch(thinkLevel, () => {
  applyThinkConfig();
});

watch(
  () => agentSocket.contentBlocks.value,
  () => {
    void scrollMessagesToBottom();
  },
  { deep: true },
);

watch(
  () => agentSocket.lastWorkspaceUpdate.value,
  (payload) => {
    handleWorkspaceSocketUpdate(payload);
  },
);

watch(
  () => currentProjectId.value,
  () => {
    agentSocket.disconnect();
    agentSocket.clearMessages();
    historyMessages.value = [];
    sessionUserMessages.value = [];
    syncWorkspaceDraft(null);
    resetScriptEditor();
    void initialize();
  },
);

onMounted(() => {
  void initialize();
});

onUnmounted(() => {
  agentSocket.disconnect();
});
</script>

<template>
  <div class="script-agent-page">
    <section class="script-agent-head">
      <div>
        <p class="eyebrow">{{ t('common.project') }}</p>
        <h3>{{ t('scriptAgent.title') }}</h3>
        <p>{{ t('scriptAgent.summary') }}</p>
      </div>
      <div class="script-agent-head-actions">
        <t-tag :theme="isAgentConnected ? 'success' : 'warning'" variant="light">
          {{ isAgentConnected ? t('scriptAgent.connection.connected') : t('scriptAgent.connection.disconnected') }}
        </t-tag>
        <t-button variant="outline" :loading="refreshing" @click="refreshPage">
          <template #icon><RefreshIcon /></template>
          {{ t('scriptAgent.refresh') }}
        </t-button>
      </div>
    </section>

    <WorkflowNextStepHint hint-key="scriptAgent" next-route-name="script" />

    <section v-if="sourceEventCheck && !isSourceReady" class="script-agent-source-warning">
      <div>
        <strong>{{ sourceWarningText }}</strong>
        <p>{{ t('scriptAgent.source.warningHint', { count: sourceIssueCount }) }}</p>
      </div>
      <div class="script-agent-source-actions">
        <t-tag v-if="sourceEventCheck.total > 0" theme="warning" variant="light">
          {{ t('scriptAgent.source.issueCount', { count: sourceIssueCount }) }}
        </t-tag>
        <t-button variant="outline" @click="openSourcePage">{{ t('scriptAgent.source.openSource') }}</t-button>
      </div>
    </section>

    <section class="script-agent-layout">
      <section class="script-chat-panel">
        <div class="script-chat-panel-head">
          <div>
            <strong>{{ t('scriptAgent.chat.title') }}</strong>
            <p>{{ currentProjectName }}</p>
          </div>
          <div class="script-chat-panel-actions">
            <t-button size="small" variant="outline" @click="reconnectAgent">
              <template #icon><RefreshIcon /></template>
              {{ t('scriptAgent.connection.reconnect') }}
            </t-button>
          </div>
        </div>

        <div class="script-agent-config-row">
          <label>
            <span>{{ t('scriptAgent.think.label') }}</span>
            <t-select v-model="thinkLevel" :disabled="!modelCapability?.supportsThink" size="small">
              <t-option v-for="option in THINK_LEVELS" :key="option.value" :value="option.value" :label="t(option.labelKey)" />
            </t-select>
          </label>
          <t-tag :theme="modelCapability?.configured ? 'success' : 'danger'" variant="light">
            {{ modelCapability?.configured ? modelCapability.modelName : modelCapability?.error || t('scriptAgent.model.notConfigured') }}
          </t-tag>
        </div>

        <t-loading :loading="loading">
          <div ref="messageListRef" class="script-message-list">
            <article v-for="message in displayMessages" :key="message.id" class="script-message" :class="`is-${message.role}`">
              <div class="script-message-meta">
                <span>{{ message.role === 'user' ? t('scriptAgent.userName') : message.name || t('scriptAgent.assistantName') }}</span>
                <t-tag size="small" :theme="getStatusTheme(message.status)" variant="light">{{ getStatusLabel(message.status) }}</t-tag>
              </div>
              <div v-if="message.blocks?.length" class="script-message-blocks">
                <pre v-for="block in message.blocks" :key="block.id" :class="`is-${block.type}`">{{ block.content || t('scriptAgent.chat.emptyBlock') }}</pre>
              </div>
              <pre v-else>{{ message.content }}</pre>
              <small v-if="message.createTime">{{ formatTime(message.createTime) }}</small>
            </article>
          </div>
        </t-loading>

        <div v-if="lastAgentError" class="script-agent-error">
          {{ lastAgentError.msg }}
        </div>

        <div class="script-chat-input">
          <t-textarea v-model="inputText" :placeholder="t('scriptAgent.chat.placeholder')" :autosize="{ minRows: 3, maxRows: 5 }" @enter.ctrl="sendMessage" />
          <div class="script-chat-input-actions">
            <div class="script-memory-actions">
              <t-button size="small" variant="outline" :loading="clearingType === 'message'" @click="confirmClearMemory('message')">
                <template #icon><DeleteIcon /></template>
                {{ t('scriptAgent.memory.clearMessage') }}
              </t-button>
              <t-button size="small" variant="outline" :loading="clearingType === 'summary'" @click="confirmClearMemory('summary')">
                <template #icon><DeleteIcon /></template>
                {{ t('scriptAgent.memory.clearSummary') }}
              </t-button>
              <t-button size="small" variant="outline" :loading="clearingType === 'all'" @click="confirmClearMemory('all')">
                <template #icon><DeleteIcon /></template>
                {{ t('scriptAgent.memory.clearAll') }}
              </t-button>
            </div>
            <div class="script-send-actions">
              <t-button v-if="isGenerating" variant="outline" theme="warning" @click="stopGenerate">
                <template #icon><StopIcon /></template>
                {{ t('scriptAgent.chat.stop') }}
              </t-button>
              <t-button theme="primary" :disabled="isGenerating || !isAgentConnected" @click="sendMessage">
                <template #icon><SendIcon /></template>
                {{ t('scriptAgent.chat.send') }}
              </t-button>
            </div>
          </div>
        </div>
      </section>

      <section class="script-workspace-panel script-plan-panel">
        <div class="script-workspace-head">
          <div>
            <strong>{{ t('scriptAgent.workspace.title') }}</strong>
            <p>{{ t('scriptAgent.workspace.project', { name: currentProjectName }) }}</p>
          </div>
          <ChatIcon />
        </div>
        <t-loading :loading="workspaceLoading">
          <t-tabs v-model="workspaceTabs.active">
            <t-tab-panel value="skeleton" :label="t('scriptAgent.workspace.skeleton')">
              <div class="script-workspace-editor">
                <div class="script-workspace-editor-head">
                  <strong>{{ t('scriptAgent.workspace.skeleton') }}</strong>
                  <t-button size="small" theme="primary" :loading="savingWorkspaceField === 'storySkeleton'" :disabled="!canUseAgent" @click="saveWorkspaceField('storySkeleton')">
                    <template #icon><SaveIcon /></template>
                    {{ t('scriptAgent.workspace.save') }}
                  </t-button>
                </div>
                <t-textarea v-model="workspaceDraft.storySkeleton" :placeholder="t('scriptAgent.workspace.skeletonPlaceholder')" :autosize="{ minRows: 9, maxRows: 16 }" />
                <pre v-if="workspaceDraft.storySkeleton" class="script-workspace-preview">{{ workspaceDraft.storySkeleton }}</pre>
                <div v-else class="script-workspace-empty">{{ t('scriptAgent.workspace.emptySkeleton') }}</div>
              </div>
            </t-tab-panel>
            <t-tab-panel value="strategy" :label="t('scriptAgent.workspace.strategy')">
              <div class="script-workspace-editor">
                <div class="script-workspace-editor-head">
                  <strong>{{ t('scriptAgent.workspace.strategy') }}</strong>
                  <t-button size="small" theme="primary" :loading="savingWorkspaceField === 'adaptationStrategy'" :disabled="!canUseAgent" @click="saveWorkspaceField('adaptationStrategy')">
                    <template #icon><SaveIcon /></template>
                    {{ t('scriptAgent.workspace.save') }}
                  </t-button>
                </div>
                <t-textarea v-model="workspaceDraft.adaptationStrategy" :placeholder="t('scriptAgent.workspace.strategyPlaceholder')" :autosize="{ minRows: 9, maxRows: 16 }" />
                <pre v-if="workspaceDraft.adaptationStrategy" class="script-workspace-preview">{{ workspaceDraft.adaptationStrategy }}</pre>
                <div v-else class="script-workspace-empty">{{ t('scriptAgent.workspace.emptyStrategy') }}</div>
              </div>
            </t-tab-panel>
          </t-tabs>
        </t-loading>
      </section>

      <section class="script-workspace-panel script-output-panel">
        <div class="script-workspace-head">
          <div>
            <strong>{{ t('scriptAgent.workspace.scripts') }}</strong>
            <p>{{ t('scriptAgent.workspace.scriptCount', { count: scriptCount }) }}</p>
          </div>
          <t-button size="small" theme="primary" :disabled="!canUseAgent" @click="createScript">
            <template #icon><AddIcon /></template>
            {{ t('scriptAgent.workspace.addScript') }}
          </t-button>
        </div>

        <div class="script-list-workspace">
          <div v-if="scriptEditor.open" class="script-editor-panel">
            <label>
              <span>{{ t('scriptAgent.workspace.scriptName') }}</span>
              <t-input v-model="scriptEditor.name" :placeholder="t('scriptAgent.workspace.scriptNamePlaceholder')" />
            </label>
            <label>
              <span>{{ t('scriptAgent.workspace.scriptContent') }}</span>
              <t-textarea v-model="scriptEditor.content" :placeholder="t('scriptAgent.workspace.scriptContentPlaceholder')" :autosize="{ minRows: 8, maxRows: 18 }" />
            </label>
            <div class="script-editor-actions">
              <t-button variant="outline" @click="resetScriptEditor">{{ t('scriptAgent.cancel') }}</t-button>
              <t-button theme="primary" :loading="savingScript" @click="saveScript">
                <template #icon><SaveIcon /></template>
                {{ t('scriptAgent.workspace.saveScript') }}
              </t-button>
            </div>
          </div>

          <div v-if="!scriptCount" class="script-workspace-empty">{{ t('scriptAgent.workspace.emptyScripts') }}</div>
          <article v-for="script in workspace?.scripts ?? []" :key="script.id" class="script-card">
            <div class="script-card-head">
              <button class="script-card-title" type="button" @click="toggleScriptCollapsed(script)">
                <component :is="isScriptCollapsed(script) ? ChevronDownIcon : ChevronUpIcon" />
                <span>{{ script.name }}</span>
              </button>
              <div class="script-card-actions">
                <t-tag size="small" :theme="getExtractStatusTheme(script.extractStatus)" variant="light">
                  {{ getExtractStatusLabel(script.extractStatus) }}
                </t-tag>
                <t-button size="small" variant="outline" @click="editScript(script)">
                  <template #icon><EditIcon /></template>
                  {{ t('scriptAgent.workspace.editScript') }}
                </t-button>
                <t-button size="small" theme="danger" variant="outline" :loading="deletingScriptId === script.id" @click="confirmDeleteScript(script)">
                  <template #icon><DeleteIcon /></template>
                  {{ t('scriptAgent.workspace.deleteScript') }}
                </t-button>
              </div>
            </div>
            <div class="script-card-meta">
              <span>{{ script.episodeKey }}</span>
              <span>{{ formatTime(script.updatedAt) }}</span>
            </div>
            <pre v-if="!isScriptCollapsed(script)" class="script-card-content">{{ script.content }}</pre>
          </article>
        </div>
      </section>
    </section>
  </div>
</template>
