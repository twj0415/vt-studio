import type {
  SourceDeleteChapterPayload,
  SourceDeleteChaptersPayload,
  SourceGenerateEventsPayload,
  SourceImportPayload,
  SourceListPayload,
  SourcePollEventStatusPayload,
  SourceUpdateChapterPayload,
} from '@shared/types/source';
import {
  deleteSourceChapter,
  deleteSourceChapters,
  generateSourceEvents,
  importSourceChapters,
  listSourceChapters,
  pollSourceEventStatus,
  updateSourceChapter,
} from '../services/source';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerSourceIpc(): void {
  handleIpc('source:list', (_event, payload) => listSourceChapters(readObjectArg<SourceListPayload>(payload)));
  handleIpc('source:import', (_event, payload) => importSourceChapters(readObjectArg<SourceImportPayload>(payload)));
  handleIpc('source:update-chapter', (_event, payload) => updateSourceChapter(readObjectArg<SourceUpdateChapterPayload>(payload)));
  handleIpc('source:delete-chapter', (_event, payload) => deleteSourceChapter(readObjectArg<SourceDeleteChapterPayload>(payload)));
  handleIpc('source:delete-chapters', (_event, payload) => deleteSourceChapters(readObjectArg<SourceDeleteChaptersPayload>(payload)));
  handleIpc('source:generate-events', (_event, payload) => generateSourceEvents(readObjectArg<SourceGenerateEventsPayload>(payload)));
  handleIpc('source:poll-event-status', (_event, payload) => pollSourceEventStatus(readObjectArg<SourcePollEventStatusPayload>(payload)));
}
