import type { MenuModule } from '@shared/types/app';
import type { ProjectRouteName } from '@shared/types/project';

export const globalMenus: MenuModule[] = [
  {
    id: 'M-003',
    titleKey: 'route.projects',
    shortTitleKey: 'routeShort.projects',
    routeName: 'projects',
    scope: 'global',
    descriptionKey: 'routeDescription.projects',
    status: 'planned',
  },
  {
    id: 'M-013',
    titleKey: 'route.resourceLibrary',
    shortTitleKey: 'routeShort.resourceLibrary',
    routeName: 'resource-library',
    scope: 'global',
    descriptionKey: 'routeDescription.resourceLibrary',
    status: 'planned',
  },
  {
    id: 'M-009',
    titleKey: 'route.tasks',
    shortTitleKey: 'routeShort.tasks',
    routeName: 'tasks',
    scope: 'global',
    descriptionKey: 'routeDescription.tasks',
    status: 'planned',
  },
  {
    id: 'M-014',
    titleKey: 'route.aiToolLibrary',
    shortTitleKey: 'routeShort.aiToolLibrary',
    routeName: 'ai-tool-library',
    scope: 'global',
    descriptionKey: 'routeDescription.aiToolLibrary',
    status: 'planned',
  },
  {
    id: 'M-002',
    titleKey: 'route.settings',
    shortTitleKey: 'routeShort.settings',
    routeName: 'settings',
    scope: 'global',
    descriptionKey: 'routeDescription.settings',
    status: 'planned',
  },
];

export const projectWorkspaceRouteNames: readonly ProjectRouteName[] = [
  'project-overview',
  'novel',
  'assets',
  'corner-scape',
  'production',
  'export',
];

export const projectMenus: MenuModule[] = [];
