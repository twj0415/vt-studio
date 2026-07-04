<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { BrowseIcon, ChatIcon, EditIcon, FileExportIcon, FileIcon, FolderOpenIcon, GitBranchIcon, ImageIcon, InfoCircleIcon, PlayCircleIcon, SettingIcon, SoundIcon, TaskIcon } from 'tdesign-icons-vue-next';
import DesktopTitleBar from '@renderer/features/shell/DesktopTitleBar.vue';
import WelcomeGuide from '@renderer/features/shell/WelcomeGuide.vue';
import { globalMenus, projectMenus } from '@renderer/router/menu';
import { useAppStore } from '@renderer/stores/app';
import { MessagePlugin } from 'tdesign-vue-next';
import type { MenuModule } from '@shared/types/app';
import type { ExternalLinkKey } from '@shared/types/shell';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const { t } = useI18n();
const { appInfo, currentProject, needUpdate, externalLinks } = storeToRefs(appStore);

const activeRoute = computed(() => String(route.name ?? 'projects'));
const pageTitle = computed(() => t(`route.${activeRoute.value}`));

const allMenus = computed<MenuModule[]>(() => [...globalMenus, ...visibleProjectMenus.value]);
const activeMenu = computed(() => allMenus.value.find((item) => item.routeName === activeRoute.value));
const localizedGlobalMenus = computed(() => globalMenus.map((menu) => ({ ...menu, title: t(menu.titleKey), description: t(menu.descriptionKey) })));
const visibleProjectMenus = computed(() =>
  projectMenus.filter((menu) => {
    if (!currentProject.value) {
      return false;
    }
    if (!menu.novelOnly) {
      return true;
    }
    return currentProject.value.sourceType === 'novel';
  }),
);
const localizedProjectMenus = computed(() => visibleProjectMenus.value.map((menu) => ({ ...menu, title: t(menu.titleKey), description: t(menu.descriptionKey) })));
const currentProjectName = computed(() => currentProject.value?.name ?? t('common.noProject'));
const canShowProjectNav = computed(() => Boolean(currentProject.value?.id));
const isElectron = computed(() => Boolean(window.vtStudio?.window));
const visibleExternalLinks = computed(() => externalLinks.value.filter((item) => item.configured));
const activeMenuDescription = computed(() => (activeMenu.value ? t(activeMenu.value.descriptionKey) : ''));
const activeMenuScopeLabel = computed(() => {
  if (!activeMenu.value) {
    return t('common.appName');
  }
  return activeMenu.value.scope === 'project' ? t('common.project') : t('common.global');
});
const showSettingsShortcut = computed(() => activeRoute.value !== 'settings');
const projectContextTooltip = computed(() => `${t('layout.previewState')}：${currentProjectName.value} · ${t('layout.appVersion', { version: appInfo.value?.version ?? '0.1.0' })}`);

const iconMap = {
  projects: FolderOpenIcon,
  tasks: TaskIcon,
  settings: SettingIcon,
  'project-overview': GitBranchIcon,
  novel: FileIcon,
  'script-agent': ChatIcon,
  script: EditIcon,
  assets: ImageIcon,
  'corner-scape': SoundIcon,
  production: PlayCircleIcon,
  export: FileExportIcon,
  default: BrowseIcon,
};

function resolveIcon(routeName: string) {
  return iconMap[routeName as keyof typeof iconMap] ?? iconMap.default;
}

function openMenu(menu: MenuModule): void {
  router.push({ name: menu.routeName });
}

function openProjects(): void {
  router.push({ name: 'projects' });
}

function openSettings(): void {
  router.push({ name: 'settings' });
}

async function openExternalLink(key: ExternalLinkKey): Promise<void> {
  const response = await window.vtStudio.shell.openExternalByKey({ key });
  if (response.code !== 200) {
    MessagePlugin.error(response.msg);
  }
}

function openAboutSection(): void {
  router.push({
    name: 'settings',
    query: { section: 'about' },
  });
}
</script>

<template>
  <div class="desktop-frame">
    <a
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1000] focus:rounded-md focus:border focus:border-line-strong focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-text-primary focus:shadow-panel"
      href="#vt-main-content"
    >
      {{ t('layout.skipToContent') }}
    </a>
    <DesktopTitleBar v-if="isElectron" :title="pageTitle" />
    <WelcomeGuide />
    <div class="app-shell min-h-screen" :class="{ 'has-titlebar': isElectron }">
    <aside class="sidebar" :aria-label="t('layout.sidebarLabel')">
      <t-tooltip :content="t('layout.brandHome')" placement="right">
        <button class="brand" type="button" :aria-label="t('layout.brandHome')" @click="openProjects">
          <div class="brand-mark">VT</div>
          <div class="brand-copy">
            <h1>VT Studio</h1>
            <p>{{ t('layout.brandTagline') }}</p>
          </div>
        </button>
      </t-tooltip>

      <nav class="nav-section" :aria-label="t('common.global')">
        <div class="nav-caption" aria-hidden="true" />
        <t-tooltip v-for="menu in localizedGlobalMenus" :key="menu.id" :content="menu.title" placement="right">
          <button class="nav-item" :class="{ 'is-active': activeRoute === menu.routeName }" type="button" :aria-label="menu.title" @click="openMenu(menu)">
            <component :is="resolveIcon(menu.routeName)" />
            <span class="nav-item-label">{{ menu.title }}</span>
          </button>
        </t-tooltip>
      </nav>

      <nav v-if="canShowProjectNav" class="nav-section project-nav" :aria-label="t('common.project')">
        <div class="nav-caption" aria-hidden="true" />
        <t-tooltip v-for="menu in localizedProjectMenus" :key="menu.id" :content="menu.title" placement="right">
          <button class="nav-item" :class="{ 'is-active': activeRoute === menu.routeName }" type="button" :aria-label="menu.title" @click="openMenu(menu)">
            <component :is="resolveIcon(menu.routeName)" />
            <span class="nav-item-label">{{ menu.title }}</span>
          </button>
        </t-tooltip>
      </nav>

      <div class="sidebar-footer">
        <t-tooltip :content="t('common.settings')" placement="right">
          <button class="nav-item nav-item-with-dot" :class="{ 'is-active': activeRoute === 'settings' }" type="button" :aria-label="t('common.settings')" @click="router.push({ name: 'settings' })">
            <SettingIcon />
            <span class="nav-item-label">{{ t('common.settings') }}</span>
            <i v-if="needUpdate" class="nav-dot" />
          </button>
        </t-tooltip>
        <t-tooltip :content="t('common.versionInfo')" placement="right">
          <button class="nav-item" type="button" :aria-label="t('common.versionInfo')" @click="openAboutSection">
            <BrowseIcon />
            <span class="nav-item-label">{{ t('common.versionInfo') }}</span>
          </button>
        </t-tooltip>
        <t-tooltip v-for="link in visibleExternalLinks" :key="link.key" :content="link.label" placement="right">
          <button class="nav-item" type="button" :aria-label="link.label" @click="openExternalLink(link.key)">
            <BrowseIcon />
            <span class="nav-item-label">{{ link.label }}</span>
          </button>
        </t-tooltip>
      </div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="topbar-title">
          <t-tag size="small" variant="light">{{ activeMenuScopeLabel }}</t-tag>
          <h2>{{ pageTitle }}</h2>
          <t-tooltip v-if="activeMenuDescription" :content="activeMenuDescription" placement="bottom">
            <span class="topbar-info" :aria-label="activeMenuDescription" tabindex="0">
              <InfoCircleIcon />
            </span>
          </t-tooltip>
        </div>
        <div class="topbar-command">
          <t-tooltip :content="projectContextTooltip" placement="bottom">
          <div class="project-context" role="status">
            <span class="project-state">{{ t('layout.previewState') }}</span>
            <strong>{{ currentProjectName }}</strong>
          </div>
          </t-tooltip>
          <div class="topbar-actions">
            <t-tooltip v-if="canShowProjectNav" :content="t('layout.backToProjects')" placement="bottom">
              <t-button class="topbar-icon-action" shape="square" variant="text" :aria-label="t('layout.backToProjects')" @click="openProjects">
                <FolderOpenIcon />
              </t-button>
            </t-tooltip>
            <t-tooltip v-if="showSettingsShortcut" :content="t('common.settings')" placement="bottom">
              <t-button class="topbar-icon-action" shape="square" variant="text" :aria-label="t('common.settings')" @click="openSettings">
                <SettingIcon />
              </t-button>
            </t-tooltip>
          </div>
        </div>
      </header>

      <section id="vt-main-content" class="content-frame" tabindex="-1">
        <RouterView />
      </section>
    </main>
    </div>
  </div>
</template>
