import { registerAgentIpc } from './agent';
import { registerAppIpc } from './app';
import { registerAssetsIpc } from './assets';
import { registerAuthIpc } from './auth';
import { registerExportIpc } from './export';
import { registerMediaIpc } from './media';
import { registerProductionIpc } from './production';
import { registerProjectIpc } from './project';
import { registerScriptIpc } from './script';
import { registerSettingsIpc } from './settings';
import { registerSourceIpc } from './source';
import { registerTaskIpc } from './task';

export function registerIpc(): void {
  registerAppIpc();
  registerAgentIpc();
  registerAuthIpc();
  registerAssetsIpc();
  registerExportIpc();
  registerMediaIpc();
  registerProductionIpc();
  registerProjectIpc();
  registerScriptIpc();
  registerSourceIpc();
  registerTaskIpc();
  registerSettingsIpc();
}
