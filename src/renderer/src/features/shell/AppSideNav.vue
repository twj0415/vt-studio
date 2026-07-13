<script setup lang="ts">
import { computed, type Component } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  AppIcon,
  AssignmentIcon,
  BookOpenIcon,
  DashboardIcon,
  DataBaseIcon,
  DownloadIcon,
  GitBranchIcon,
  ImageIcon,
  MediaLibraryIcon,
  SettingIcon,
} from 'tdesign-icons-vue-next';
import { globalMenus, projectMenus, projectWorkspaceRouteNames } from '@renderer/router/menu';
import { useAppStore } from '@renderer/stores/app';
import type { MenuModule } from '@shared/types/app';

type SideNavMode = 'global' | 'project';

interface LocalizedMenu extends MenuModule {
  title: string;
  shortTitle: string;
}

const props = defineProps<{
  mode: SideNavMode;
}>();

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const { t } = useI18n();
const { currentProject, needUpdate } = storeToRefs(appStore);

const activeRoute = computed(() => String(route.name ?? 'projects'));
const isProjectRoute = computed(() => projectWorkspaceRouteNames.some((projectRouteName) => projectRouteName === activeRoute.value));
const projectInitial = computed(() => currentProject.value?.name.trim().slice(0, 1).toUpperCase() || 'P');

const menuIconMap: Record<string, Component> = {
  projects: AppIcon,
  'ai-tool-library': GitBranchIcon,
  'resource-library': DataBaseIcon,
  tasks: AssignmentIcon,
  settings: SettingIcon,
  'project-overview': DashboardIcon,
  novel: BookOpenIcon,
  assets: ImageIcon,
  'corner-scape': MediaLibraryIcon,
  production: GitBranchIcon,
  export: DownloadIcon,
};

function localizeMenu(menu: MenuModule): LocalizedMenu {
  return {
    ...menu,
    title: t(menu.titleKey),
    shortTitle: t(menu.shortTitleKey ?? menu.titleKey),
  };
}

function isMenuAllowed(menu: MenuModule): boolean {
  if (!menu.novelOnly) {
    return true;
  }

  return Boolean(currentProject.value);
}

const localizedMenus = computed(() => {
  const menus = props.mode === 'project' ? projectMenus.filter(isMenuAllowed) : globalMenus;
  return menus.map(localizeMenu);
});

const navLabel = computed(() => (props.mode === 'project' ? t('common.project') : t('layout.sidebarLabel')));

function resolveMenuIcon(routeName: string): Component {
  return menuIconMap[routeName] ?? AppIcon;
}

function isMenuActive(menu: MenuModule): boolean {
  if (props.mode === 'global') {
    return activeRoute.value === menu.routeName || (menu.routeName === 'projects' && isProjectRoute.value);
  }

  return activeRoute.value === menu.routeName;
}

function openBrand(): void {
  if (props.mode === 'project' && currentProject.value?.id) {
    void router.push({ name: 'project-overview' });
    return;
  }

  void router.push({ name: 'projects' });
}

function openMenu(menu: MenuModule): void {
  void router.push({ name: menu.routeName });
}
</script>

<template>
  <aside class="sidebar" :class="`is-${mode}`">
    <nav class="nav-section" :aria-label="navLabel">
      <t-tooltip v-for="menu in localizedMenus" :key="menu.id" :content="menu.title" placement="right">
        <button
          class="nav-item"
          :class="{ 'is-active': isMenuActive(menu), 'nav-item-with-dot': menu.routeName === 'settings' && needUpdate }"
          type="button"
          :title="menu.title"
          :aria-label="menu.title"
          :aria-current="isMenuActive(menu) ? 'page' : undefined"
          @click="openMenu(menu)"
        >
          <component :is="resolveMenuIcon(menu.routeName)" />
          <span class="nav-item-label">{{ menu.shortTitle }}</span>
          <i v-if="menu.routeName === 'settings' && needUpdate" class="nav-dot" />
        </button>
      </t-tooltip>
    </nav>

    <div v-if="mode === 'project' && currentProject" class="sidebar-footer">
      <t-tooltip :content="currentProject.name" placement="right">
        <button class="side-nav-project" type="button" :aria-label="currentProject.name" @click="openBrand">
          <span class="side-nav-project-initial">{{ projectInitial }}</span>
        </button>
      </t-tooltip>
    </div>
  </aside>
</template>
