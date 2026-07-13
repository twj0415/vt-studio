<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import { PlayCircleIcon, RefreshIcon, SystemCodeIcon } from 'tdesign-icons-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import { useAgentSocket } from '@renderer/composables/useAgentSocket';
import type { ProductionAgentContextResult } from '@shared/types/production';

const props = defineProps<{ visible: boolean; projectId: number; contentId: number | null }>();
const emit = defineEmits<{ 'update:visible': [visible: boolean]; applied: [] }>();
const { t } = useI18n();
const agentSocket = useAgentSocket();

const loading = ref(false);
const connecting = ref(false);
const context = ref<ProductionAgentContextResult | null>(null);
const inputText = ref('');

const contextStats = computed(() => {
  const flowData = context.value?.flowData;
  return [
    { label: t('production.agent.stats.assets'), value: flowData?.assets.length ?? 0 },
    { label: t('production.agent.stats.storyboards'), value: flowData?.storyboards.length ?? 0 },
    { label: t('production.agent.stats.tracks'), value: flowData?.videoTracks.length ?? 0 },
    { label: t('production.agent.stats.videos'), value: flowData?.videoTracks.reduce((total, track) => total + track.videos.length, 0) ?? 0 },
  ];
});
const visibleMessages = computed(() => agentSocket.messages.value.filter((message) => message.content.trim() || message.status === 'pending' || message.status === 'error'));
const isStreaming = computed(() => visibleMessages.value.some((message) => message.status === 'pending' || message.status === 'streaming'));
const canSend = computed(() => Boolean(props.projectId && props.contentId && inputText.value.trim() && agentSocket.isConnected.value && !isStreaming.value));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

async function loadContext(): Promise<void> {
  if (!props.projectId || !props.contentId) {
    context.value = null;
    return;
  }
  loading.value = true;
  try {
    const response = await window.vtStudio.production.agent.getContext({ projectId: props.projectId, contentId: props.contentId });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    context.value = response.data;
  } finally {
    loading.value = false;
  }
}

async function connectAgent(): Promise<void> {
  if (!props.projectId || !props.contentId || connecting.value) {
    return;
  }
  connecting.value = true;
  try {
    await agentSocket.connect({ namespace: 'productionAgent', auth: { projectId: props.projectId, contentId: props.contentId, isolationKey: `${props.projectId}:productionAgent:${props.contentId}` } });
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : String(error));
  } finally {
    connecting.value = false;
  }
}

async function refreshAll(): Promise<void> {
  await loadContext();
  if (!agentSocket.isConnected.value) {
    await connectAgent();
  }
}

function sendMessage(): void {
  const content = inputText.value.trim();
  if (!content || !canSend.value) {
    return;
  }
  agentSocket.sendChat(content);
  inputText.value = '';
}

watch(() => props.visible, (visible) => {
  if (visible) {
    void refreshAll();
  } else {
    agentSocket.disconnect();
  }
});
watch(() => [props.projectId, props.contentId] as const, () => {
  if (!props.visible) return;
  agentSocket.clearMessages();
  agentSocket.disconnect();
  void refreshAll();
});
watch(() => agentSocket.lastWorkspaceUpdate.value, (update) => {
  if (update && update.projectId === props.projectId && update.contentId === props.contentId) {
    void loadContext();
    emit('applied');
  }
});
watch(() => agentSocket.lastError.value, (error) => {
  if (error) MessagePlugin.error(error.msg);
});
onBeforeUnmount(() => agentSocket.disconnect());
</script>

<template>
  <VtDialog :visible="visible" :title="t('production.agent.title')" width="1180px" :footer="false" @update:visible="(value) => emit('update:visible', value)">
    <div class="production-agent-shell">
      <aside class="production-agent-side">
        <div>
          <p class="eyebrow">{{ t('production.agent.eyebrow') }}</p>
          <h4>{{ t('production.agent.contextTitle') }}</h4>
          <span>{{ context?.contentTitle || t('production.emptyText') }}</span>
        </div>
        <div class="production-agent-stat-grid">
          <div v-for="item in contextStats" :key="item.label">
            <b>{{ item.value }}</b>
            <span>{{ item.label }}</span>
          </div>
        </div>
        <div class="production-agent-note">
          <SystemCodeIcon />
          <span>{{ t('production.agent.boundary') }}</span>
        </div>
        <div class="production-agent-actions">
          <VtButton variant="outline" :loading="loading || connecting" @click="refreshAll">
            <template #icon><RefreshIcon /></template>
            {{ t('production.refresh') }}
          </VtButton>
          <VtButton variant="outline" @click="emit('update:visible', false)">
            {{ t('production.cancel') }}
          </VtButton>
        </div>
      </aside>
      <main class="production-agent-main">
        <t-loading :loading="loading">
          <section class="production-agent-section production-agent-chat-section">
            <header>
              <div>
                <h4>{{ t('production.agent.chatTitle') }}</h4>
                <span>{{ agentSocket.isConnected.value ? t('production.agent.connected') : t('production.agent.disconnected') }}</span>
              </div>
              <VtButton v-if="isStreaming" theme="danger" variant="outline" @click="agentSocket.stop()">
                {{ t('production.agent.stop') }}
              </VtButton>
            </header>
            <div class="production-agent-message-list">
              <div v-if="visibleMessages.length === 0" class="production-agent-empty">{{ t('production.agent.emptyChat') }}</div>
              <article v-for="message in visibleMessages" :key="message.id" class="production-agent-message" :class="[`is-${message.type}`, `is-${message.status}`]">
                <pre>{{ message.content || t(`production.agent.status.${message.status}`) }}</pre>
                <div v-if="agentSocket.contentBlocks.value[message.id]?.length" class="production-agent-block-list">
                  <div v-for="block in agentSocket.contentBlocks.value[message.id]" :key="block.id" class="production-agent-block" :class="[`is-${block.type}`, `is-${block.status}`]">
                    <strong>{{ block.type === 'toolcall' ? t('production.agent.toolCall') : t(`production.agent.block.${block.type}`) }}</strong>
                    <pre>{{ block.content }}</pre>
                  </div>
                </div>
              </article>
            </div>
            <div class="production-agent-composer">
              <t-textarea v-model="inputText" :placeholder="t('production.agent.chatPlaceholder')" :autosize="{ minRows: 3, maxRows: 7 }" @keydown.ctrl.enter.prevent="sendMessage" />
              <VtButton theme="primary" variant="base" :disabled="!canSend" :loading="connecting" @click="sendMessage">
                <template #icon><PlayCircleIcon /></template>
                {{ t('production.agent.send') }}
              </VtButton>
            </div>
          </section>
        </t-loading>
      </main>
    </div>
  </VtDialog>
</template>
