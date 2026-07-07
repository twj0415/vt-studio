export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  isDev: boolean;
  userDataPath: string;
}

export interface RendererErrorLogPayload {
  source: 'vue' | 'window' | 'promise' | 'router' | 'boundary';
  message: string;
  info?: string;
  stack?: string;
  route: string;
  timestamp: string;
}

export interface RendererErrorLogResult {
  recorded: true;
}

export interface MenuModule {
  id: string;
  titleKey: string;
  shortTitleKey?: string;
  routeName: string;
  scope: 'global' | 'project';
  descriptionKey: string;
  status: 'ready' | 'planned';
  novelOnly?: boolean;
}
