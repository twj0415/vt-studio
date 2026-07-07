<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CloseIcon, Fullscreen1Icon, FullscreenExit1Icon, MinusIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';

const { t } = useI18n();
const isMaximized = ref(false);

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

async function refreshState(): Promise<void> {
  const response = await window.vtStudio.window.getState();
  if (!isOk(response)) {
    return;
  }

  isMaximized.value = response.data.state.isMaximized;
}

async function minimize(): Promise<void> {
  const response = await window.vtStudio.window.minimize();
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }

  isMaximized.value = response.data.state.isMaximized;
}

async function toggleMaximize(): Promise<void> {
  const response = await window.vtStudio.window.toggleMaximize();
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }

  isMaximized.value = response.data.state.isMaximized;
}

async function closeWindow(): Promise<void> {
  const response = await window.vtStudio.window.close();
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
  }
}

onMounted(refreshState);
</script>

<template>
  <div class="window-controls" :aria-label="t('layout.windowControls')">
    <button type="button" class="window-control-btn" :aria-label="t('layout.windowMinimize')" @click="minimize">
      <MinusIcon />
    </button>
    <button type="button" class="window-control-btn" :aria-label="t(isMaximized ? 'layout.windowRestore' : 'layout.windowMaximize')" @click="toggleMaximize">
      <FullscreenExit1Icon v-if="isMaximized" />
      <Fullscreen1Icon v-else />
    </button>
    <button type="button" class="window-control-btn is-danger" :aria-label="t('layout.windowClose')" @click="closeWindow">
      <CloseIcon />
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  align-self: stretch;
  -webkit-app-region: no-drag;
}

.window-control-btn {
  display: grid;
  width: 42px;
  place-items: center;
  border: 0;
  color: var(--vt-text-secondary);
  background: transparent;
}

.window-control-btn svg {
  width: 16px;
  height: 16px;
}

.window-control-btn:hover {
  color: var(--vt-text-primary);
  background: color-mix(in srgb, var(--vt-brand) 10%, transparent);
}

.window-control-btn.is-danger:hover {
  color: #fff;
  background: var(--vt-danger);
}
</style>
