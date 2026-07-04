import type {
  ExportBuildTimelinePayload,
  ExportCreateJianyingDraftPayload,
  ExportHistoryDetailPayload,
  ExportHistoryListPayload,
  ExportOpenDirectoryPayload,
  ExportStoryboardImagesPayload,
  ExportValidateAssetsPayload,
} from '@shared/types/export';
import {
  buildExportTimeline,
  createJianyingDraft,
  exportStoryboardImages,
  getExportHistoryDetail,
  listExportHistory,
  openExportDirectory,
  validateExportAssets,
} from '../services/export';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerExportIpc(): void {
  handleIpc('export:timeline:build', (_event, payload) => buildExportTimeline(readObjectArg<ExportBuildTimelinePayload>(payload)));
  handleIpc('export:assets:validate', (_event, payload) => validateExportAssets(readObjectArg<ExportValidateAssetsPayload>(payload)));
  handleIpc('export:storyboard-images', (_event, payload) => exportStoryboardImages(readObjectArg<ExportStoryboardImagesPayload>(payload)));
  handleIpc('export:jianying:create-draft', (_event, payload) => createJianyingDraft(readObjectArg<ExportCreateJianyingDraftPayload>(payload)));
  handleIpc('export:history:list', (_event, payload) => listExportHistory(readObjectArg<ExportHistoryListPayload>(payload)));
  handleIpc('export:history:detail', (_event, payload) => getExportHistoryDetail(readObjectArg<ExportHistoryDetailPayload>(payload)));
  handleIpc('export:directory:open', (_event, payload) => openExportDirectory(readObjectArg<ExportOpenDirectoryPayload>(payload)));
}
