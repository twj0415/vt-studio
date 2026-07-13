import { defineStore } from 'pinia';
import { VT_STATUS } from '@shared/constants/status';
import type { AppInfo } from '@shared/types/app';
import type { ProjectTemplateType } from '@shared/types/project';
import type { ExternalLinkInfo } from '@shared/types/shell';
import { rtFallback } from '@renderer/utils/i18n-text';

interface CurrentProject {
  id: string;
  name: string;
  templateType: ProjectTemplateType;
}

interface AppState {
  appInfo: AppInfo | null;
  initialized: boolean;
  initializing: boolean;
  initError: string | null;
  needUpdate: boolean;
  externalLinks: ExternalLinkInfo[];
  currentProject: CurrentProject | null;
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    appInfo: null,
    initialized: false,
    initializing: false,
    initError: null,
    needUpdate: false,
    externalLinks: [],
    currentProject: null,
  }),
  actions: {
    async bootstrap(): Promise<void> {
      if (this.initialized || this.initializing) {
        return;
      }

      this.initializing = true;
      this.initError = null;

      try {
        const [appResponse, linksResponse] = await Promise.all([window.vtStudio.app.getInfo(), window.vtStudio.shell.listExternalLinks()]);
        this.appInfo = appResponse.code === VT_STATUS.OK ? appResponse.data : null;
        this.externalLinks = linksResponse.code === VT_STATUS.OK ? linksResponse.data.links : [];

        if (this.appInfo) {
          document.body.classList.add('is-electron');
        }

        if (appResponse.code !== VT_STATUS.OK) {
          this.initError = appResponse.msg;
        } else if (linksResponse.code !== VT_STATUS.OK) {
          this.initError = linksResponse.msg;
        }
      } catch (error) {
        this.appInfo = null;
        this.externalLinks = [];
        this.initError = rtFallback(error, 'app.bootstrapError');
      } finally {
        this.initializing = false;
        this.initialized = true;
      }
    },
    clearCurrentProject(): void {
      this.currentProject = null;
    },
    setCurrentProject(project: CurrentProject | null): void {
      this.currentProject = project;
    },
    setNeedUpdate(value: boolean): void {
      this.needUpdate = value;
    },
  },
});
