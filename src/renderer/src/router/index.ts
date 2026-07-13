import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import LoginHome from '@renderer/features/auth/LoginHome.vue';
import WorkbenchLayout from '@renderer/layouts/WorkbenchLayout.vue';
import ProductionCanvasLayout from '@renderer/layouts/ProductionCanvasLayout.vue';
import ProjectHome from '@renderer/features/project/ProjectHome.vue';
import AiToolLibraryHome from '@renderer/features/ai-tool-library/index.vue';
import ResourceLibraryHome from '@renderer/features/resource-library/ResourceLibraryHome.vue';
import ProjectOverviewHome from '@renderer/features/project-overview/ProjectOverviewHome.vue';
import TaskCenter from '@renderer/features/task-center/TaskCenter.vue';
import SettingsHome from '@renderer/features/settings/SettingsHome.vue';
import NovelHome from '@renderer/features/novel/index.vue';
import CornerScapeHome from '@renderer/features/corner-scape/CornerScapeHome.vue';
import ProductionHome from '@renderer/features/production/ProductionHome.vue';
import ProductionResourceWorkbench from '@renderer/features/production/ProductionResourceWorkbench.vue';
import AssetsHome from '@renderer/features/assets/AssetsHome.vue';
import ExportHome from '@renderer/features/export/ExportHome.vue';
import { useAppStore } from '@renderer/stores/app';
import { useAuthStore } from '@renderer/stores/auth';
import type { ProjectRouteName } from '@shared/types/project';

const PROJECT_ROUTE_NAMES: ProjectRouteName[] = [
  'project-overview',
  'novel',
  'assets',
  'corner-scape',
  'production',
  'export',
];

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginHome,
    meta: { titleKey: 'route.login', public: true },
  },
  {
    path: '/',
    component: WorkbenchLayout,
    redirect: '/projects',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'projects',
        name: 'projects',
        component: ProjectHome,
        meta: { titleKey: 'route.projects', navMode: 'global' },
      },
      {
        path: 'ai-tool-library',
        name: 'ai-tool-library',
        component: AiToolLibraryHome,
        meta: { titleKey: 'route.aiToolLibrary', navMode: 'global' },
      },
      {
        path: 'resource-library',
        name: 'resource-library',
        component: ResourceLibraryHome,
        meta: { titleKey: 'route.resourceLibrary', navMode: 'global' },
      },
      {
        path: 'tasks',
        name: 'tasks',
        component: TaskCenter,
        meta: { titleKey: 'route.tasks', navMode: 'global' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: SettingsHome,
        meta: { titleKey: 'route.settings', navMode: 'global' },
      },
      {
        path: 'project-overview',
        name: 'project-overview',
        component: ProjectOverviewHome,
        meta: { titleKey: 'route.projectOverview', requiresProject: true, navMode: 'project' },
      },
      {
        path: 'novel',
        name: 'novel',
        component: NovelHome,
        meta: { titleKey: 'route.novel', requiresProject: true, navMode: 'project' },
      },
      {
        path: 'corner-scape',
        name: 'corner-scape',
        component: CornerScapeHome,
        meta: { titleKey: 'route.corner-scape', requiresProject: true, navMode: 'project' },
      },
      {
        path: 'production/resources',
        name: 'production-resources',
        component: ProductionResourceWorkbench,
        meta: { titleKey: 'route.productionResources', requiresProject: true, navMode: 'project' },
      },
      {
        path: 'assets',
        name: 'assets',
        component: AssetsHome,
        meta: { titleKey: 'route.assets', requiresProject: true, navMode: 'project' },
      },
      {
        path: 'export',
        name: 'export',
        component: ExportHome,
        meta: { titleKey: 'route.export', requiresProject: true, navMode: 'project' },
      },
    ],
  },
  {
    path: '/production',
    component: ProductionCanvasLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'production',
        component: ProductionHome,
        meta: { titleKey: 'route.production', requiresProject: true },
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

let didTryInitialProjectRestore = false;

function toProjectRouteName(value: unknown): ProjectRouteName | null {
  return typeof value === 'string' && PROJECT_ROUTE_NAMES.includes(value as ProjectRouteName) ? (value as ProjectRouteName) : null;
}

async function restoreRecentProjectContext(appStore: ReturnType<typeof useAppStore>): Promise<ProjectRouteName | null> {
  const response = await window.vtStudio.project.restoreRecent();
  if (response.code !== 200 || !response.data.project || response.data.targetRoute === 'projects') {
    return null;
  }

  appStore.setCurrentProject(response.data.project);
  return response.data.targetRoute;
}

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  const appStore = useAppStore();

  if (to.meta.public) {
    if (!authStore.restored) {
      await authStore.restoreSession();
    }

    return authStore.isLoggedIn ? { name: 'projects' } : true;
  }

  const ok = await authStore.restoreSession();
  if (!ok) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    };
  }

  if (!didTryInitialProjectRestore && to.name === 'projects' && !appStore.currentProject?.id) {
    didTryInitialProjectRestore = true;
    const restoredRoute = await restoreRecentProjectContext(appStore);
    if (restoredRoute) {
      return { name: restoredRoute };
    }
  }

  if (to.meta.requiresProject && !appStore.currentProject?.id) {
    const restoredRoute = await restoreRecentProjectContext(appStore);
    if (!restoredRoute) {
      return { name: 'projects' };
    }
  }

  return true;
});

router.afterEach((to) => {
  const routeName = toProjectRouteName(to.name);
  if (!routeName) {
    return;
  }

  const appStore = useAppStore();
  const projectId = Number(appStore.currentProject?.id ?? 0);
  if (!projectId) {
    return;
  }

  void window.vtStudio.project.updateRecentRoute({ projectId, routeName });
});
