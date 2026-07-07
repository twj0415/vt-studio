<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { BrowseIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import WindowControls from './WindowControls.vue';
import { globalMenus, projectWorkspaceRouteNames } from '@renderer/router/menu';
import { useAppStore } from '@renderer/stores/app';
import type { MenuModule } from '@shared/types/app';
import type { ExternalLinkKey } from '@shared/types/shell';

interface LocalizedMenu extends MenuModule {
  title: string;
  shortTitle: string;
}

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const { t } = useI18n();
const { needUpdate, externalLinks } = storeToRefs(appStore);

const activeRoute = computed(() => String(route.name ?? 'projects'));
const isElectron = computed(() => Boolean(window.vtStudio?.window));
const visibleExternalLinks = computed(() => externalLinks.value.filter((item) => item.configured));
const aiToolRouteNames = new Set(['script-agent', 'script']);

function localizeMenu(menu: MenuModule): LocalizedMenu {
  return {
    ...menu,
    title: t(menu.titleKey),
    shortTitle: t(menu.shortTitleKey ?? menu.titleKey),
  };
}

const localizedGlobalMenus = computed(() => globalMenus.map(localizeMenu));
const isAiToolRoute = computed(() => aiToolRouteNames.has(activeRoute.value));
const isProjectRoute = computed(() => projectWorkspaceRouteNames.some((projectRouteName) => projectRouteName === activeRoute.value) && !isAiToolRoute.value);

function isGlobalMenuActive(menu: MenuModule): boolean {
  if (menu.routeName === 'ai-tool-library') {
    return activeRoute.value === menu.routeName || isAiToolRoute.value;
  }
  return activeRoute.value === menu.routeName || (menu.routeName === 'projects' && isProjectRoute.value);
}

function openMenu(menu: MenuModule): void {
  void router.push({ name: menu.routeName });
}

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

      <nav class="app-topbar-nav" :aria-label="t('common.global')">
        <button
          v-for="menu in localizedGlobalMenus"
          :key="menu.id"
          class="app-topbar-nav-item"
          :class="{ 'is-active': isGlobalMenuActive(menu), 'has-dot': menu.routeName === 'settings' && needUpdate }"
          type="button"
          :title="menu.title"
          :aria-label="menu.title"
          :aria-current="isGlobalMenuActive(menu) ? 'page' : undefined"
          @click="openMenu(menu)"
        >
          {{ menu.shortTitle }}
          <i v-if="menu.routeName === 'settings' && needUpdate" class="app-topbar-dot" />
        </button>
      </nav>
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
.app-topbar-nav,
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

.app-topbar-nav {
  gap: 4px;
}

.app-topbar-nav-item,
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

.app-topbar-nav-item {
  min-width: 42px;
  padding: 0 10px;
}

.app-topbar-nav-item:hover,
.app-topbar-nav-item.is-active {
  border-color: var(--vt-line-strong);
  color: var(--vt-text-primary);
  background: var(--vt-surface-raised);
}

.app-topbar-nav-item.is-active {
  color: var(--vt-brand-strong);
  background: color-mix(in srgb, var(--vt-brand) 10%, var(--vt-surface-raised));
}

.app-topbar-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--vt-danger);
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

  .app-topbar-nav-item {
    padding: 0 8px;
  }
}
</style>
