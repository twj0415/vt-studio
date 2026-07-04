import type { MenuModule } from '@shared/types/app';

export const globalMenus: MenuModule[] = [
  {
    id: 'M-003',
    titleKey: 'route.projects',
    routeName: 'projects',
    scope: 'global',
    descriptionKey: 'routeDescription.projects',
    status: 'planned',
  },
  {
    id: 'M-009',
    titleKey: 'route.tasks',
    routeName: 'tasks',
    scope: 'global',
    descriptionKey: 'routeDescription.tasks',
    status: 'planned',
  },
];

const projectMenuItems: MenuModule[] = [
  {
    id: 'M-012',
    titleKey: 'route.projectOverview',
    routeName: 'project-overview',
    scope: 'project',
    descriptionKey: 'routeDescription.projectOverview',
    status: 'planned',
  },
  {
    id: 'M-004',
    titleKey: 'route.novel',
    routeName: 'novel',
    scope: 'project',
    descriptionKey: 'routeDescription.novel',
    status: 'planned',
    novelOnly: true,
  },
  {
    id: 'M-011',
    titleKey: 'route.script-agent',
    routeName: 'script-agent',
    scope: 'project',
    descriptionKey: 'routeDescription.script-agent',
    status: 'planned',
    novelOnly: true,
  },
  {
    id: 'M-005',
    titleKey: 'route.script',
    routeName: 'script',
    scope: 'project',
    descriptionKey: 'routeDescription.script',
    status: 'planned',
  },
  {
    id: 'M-006',
    titleKey: 'route.assets',
    routeName: 'assets',
    scope: 'project',
    descriptionKey: 'routeDescription.assets',
    status: 'planned',
  },
  {
    id: 'M-007',
    titleKey: 'route.corner-scape',
    routeName: 'corner-scape',
    scope: 'project',
    descriptionKey: 'routeDescription.corner-scape',
    status: 'planned',
  },
  {
    id: 'M-008',
    titleKey: 'route.production',
    routeName: 'production',
    scope: 'project',
    descriptionKey: 'routeDescription.production',
    status: 'planned',
  },
  {
    id: 'M-010',
    titleKey: 'route.export',
    routeName: 'export',
    scope: 'project',
    descriptionKey: 'routeDescription.export',
    status: 'planned',
  },
];

export const projectMenus: MenuModule[] = projectMenuItems;
