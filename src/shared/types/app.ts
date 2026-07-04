export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  isDev: boolean;
  userDataPath: string;
}

export interface MenuModule {
  id: string;
  titleKey: string;
  routeName: string;
  scope: 'global' | 'project';
  descriptionKey: string;
  status: 'ready' | 'planned';
  novelOnly?: boolean;
}
