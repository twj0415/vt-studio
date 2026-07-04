<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { CloseIcon, Fullscreen1Icon, FullscreenExit1Icon, MinusIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';

defineProps<{
  title: string;
}>();

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
  <header class="desktop-titlebar">
    <div class="desktop-titlebar-drag">
      <div class="desktop-titlebar-brand">
        <span class="desktop-titlebar-mark">VT</span>
        <strong>VT Studio</strong>
        <small>{{ title }}</small>
      </div>
    </div>
    <div class="desktop-titlebar-actions">
      <button type="button" class="desktop-titlebar-btn" @click="minimize">
        <MinusIcon />
      </button>
      <button type="button" class="desktop-titlebar-btn" @click="toggleMaximize">
        <FullscreenExit1Icon v-if="isMaximized" />
        <Fullscreen1Icon v-else />
      </button>
      <button type="button" class="desktop-titlebar-btn is-danger" @click="closeWindow">
        <CloseIcon />
      </button>
    </div>
  </header>
</template>
