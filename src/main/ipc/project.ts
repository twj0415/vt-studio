import type {
  ProjectClearRecentPayload,
  ProjectDeleteImpactPayload,
  ProjectDeletePayload,
  ProjectExportPackagePayload,
  ProjectFlowStatsPayload,
  ProjectImportPackagePayload,
  ProjectManualDeletePayload,
  ProjectManualGetPayload,
  ProjectManualSavePayload,
  ProjectOpenPackagePayload,
  ProjectOpenPayload,
  ProjectSavePayload,
  ProjectUpdateRecentRoutePayload,
} from '@shared/types/project';
import {
  clearRecentProject,
  createProject,
  deleteProject,
  deleteProjectManual,
  exportProjectPackage,
  getProjectFlowStats,
  getProjectDeleteImpact,
  getProjectManualDetail,
  getProjectPageState,
  importProjectPackage,
  openProject,
  openProjectPackageDirectory,
  restoreRecentProject,
  saveProjectManual,
  updateProject,
  updateRecentProjectRoute,
} from '../services/project';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerProjectIpc(): void {
  handleIpc('project:get-page-state', () => getProjectPageState());
  handleIpc('project:create', (_event, payload) => createProject(readObjectArg<ProjectSavePayload>(payload)));
  handleIpc('project:update', (_event, payload) => updateProject(readObjectArg<ProjectSavePayload>(payload)));
  handleIpc('project:delete-impact', (_event, payload) => getProjectDeleteImpact(readObjectArg<ProjectDeleteImpactPayload>(payload)));
  handleIpc('project:delete', (_event, payload) => deleteProject(readObjectArg<ProjectDeletePayload>(payload)));
  handleIpc('project:open', (_event, payload) => openProject(readObjectArg<ProjectOpenPayload>(payload)));
  handleIpc('project:recent:restore', () => restoreRecentProject());
  handleIpc('project:recent:update-route', (_event, payload) => updateRecentProjectRoute(readObjectArg<ProjectUpdateRecentRoutePayload>(payload)));
  handleIpc('project:recent:clear', (_event, payload) => clearRecentProject(readObjectArg<ProjectClearRecentPayload>(payload)));
  handleIpc('project:get-flow-stats', (_event, payload) => getProjectFlowStats(readObjectArg<ProjectFlowStatsPayload>(payload)));
  handleIpc('project:package:export', (_event, payload) => exportProjectPackage(readObjectArg<ProjectExportPackagePayload>(payload)));
  handleIpc('project:package:import', (_event, payload) => importProjectPackage(readObjectArg<ProjectImportPackagePayload>(payload)));
  handleIpc('project:package:open-directory', (_event, payload) => openProjectPackageDirectory(readObjectArg<ProjectOpenPackagePayload>(payload)));
  handleIpc('project:manual:get', (_event, payload) => getProjectManualDetail(readObjectArg<ProjectManualGetPayload>(payload)));
  handleIpc('project:manual:save', (_event, payload) => saveProjectManual(readObjectArg<ProjectManualSavePayload>(payload)));
  handleIpc('project:manual:delete', (_event, payload) => deleteProjectManual(readObjectArg<ProjectManualDeletePayload>(payload)));
}
