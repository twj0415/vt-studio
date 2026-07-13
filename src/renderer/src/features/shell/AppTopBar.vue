<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { BrowseIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import WindowControls from './WindowControls.vue';
import { useAppStore } from '@renderer/stores/app';
import type { ExternalLinkKey } from '@shared/types/shell';

const router = useRouter();
const appStore = useAppStore();
const { t } = useI18n();
const { externalLinks } = storeToRefs(appStore);

const isElectron = computed(() => Boolean(window.vtStudio?.window));
const visibleExternalLinks = computed(() => externalLinks.value.filter((item) => item.configured));

function openProjects(): void {
  void router.push({ name: 'projects' });
}

async function openExternalLink(key: ExternalLinkKey): Promise<void> {
  const response = await window.vtStudio.shell.openExternalByKey({ key });
  if (response.code !== 200) {
    MessagePlugin.error(response.msg);
  }
}
</script>

<template>
  <header class="app-topbar">
    <div class="app-topbar-main">
      <button class="app-topbar-brand" type="button" :aria-label="t('layout.brandHome')" @click="openProjects">
        <span class="app-topbar-mark">VT</span>
        <strong>Studio</strong>
      </button>
    </div>

    <div class="app-topbar-drag" aria-hidden="true" />

    <div v-if="visibleExternalLinks.length > 0" class="app-topbar-tools">
      <t-tooltip v-for="link in visibleExternalLinks" :key="link.key" :content="link.label">
        <button class="app-topbar-tool" type="button" :aria-label="link.label" @click="openExternalLink(link.key)">
          <BrowseIcon />
        </button>
      </t-tooltip>
    </div>

    <WindowControls v-if="isElectron" />
  </header>
</template>

<style scoped>
.app-topbar {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 44px;
  border-bottom: 1px solid var(--vt-line-soft);
  background: color-mix(in srgb, var(--vt-surface-panel) 94%, transparent);
  -webkit-app-region: drag;
}

.app-topbar-main,
.app-topbar-tools {
  display: flex;
  align-items: center;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.app-topbar-main {
  flex: 0 1 auto;
  gap: 8px;
  padding-left: 10px;
}

.app-topbar-brand {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 9px 0 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--vt-text-primary);
  background: transparent;
  font-size: 12px;
  font-weight: 800;
}

.app-topbar-brand:hover {
  border-color: var(--vt-line-soft);
  background: var(--vt-surface-raised);
}

.app-topbar-mark {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid var(--vt-line-strong);
  border-radius: 7px;
  color: var(--vt-brand-strong);
  background: var(--vt-surface-raised);
  font-size: 11px;
  line-height: 1;
}

.app-topbar-tool {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--vt-text-secondary);
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.app-topbar-drag {
  flex: 1 1 auto;
  min-width: 24px;
}

.app-topbar-tools {
  flex: 0 0 auto;
  gap: 4px;
  padding: 0 6px;
}

.app-topbar-tool {
  width: 30px;
  padding: 0;
}

.app-topbar-tool svg {
  width: 15px;
  height: 15px;
}

.app-topbar-tool:hover {
  border-color: var(--vt-line-strong);
  color: var(--vt-text-primary);
  background: var(--vt-surface-raised);
}

@media (max-width: 1180px) {
  .app-topbar-brand strong {
    display: none;
  }
}
</style>
