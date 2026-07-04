import {
  SOURCE_EVENT_STATUSES,
  SOURCE_EVENT_STATUS_VALUES as SHARED_SOURCE_EVENT_STATUS_VALUES,
} from '../constants/dictionaries';

export const SOURCE_EVENT_STATUS = SOURCE_EVENT_STATUSES;

export const SOURCE_EVENT_STATUS_VALUES = SHARED_SOURCE_EVENT_STATUS_VALUES;
export type SourceEventStatus = (typeof SOURCE_EVENT_STATUS_VALUES)[number];

export interface SourceChapter {
  id: number;
  projectId: number;
  chapterIndex: number;
  volumeName: string;
  chapterTitle: string;
  content: string;
  eventStatus: SourceEventStatus;
  eventSummary: string | null;
  eventError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SourceChapterDraft {
  volumeName: string;
  chapterTitle: string;
  content: string;
}

export interface SourceListPayload {
  projectId: number;
  page?: number;
  limit?: number;
  chapterKeyword?: string | null;
}

export interface SourceListResult {
  data: SourceChapter[];
  total: number;
  page: number;
  limit: number;
}

export interface SourceImportPayload {
  projectId: number;
  chapters: SourceChapterDraft[];
}

export interface SourceImportResult {
  chapters: SourceChapter[];
}

export interface SourceUpdateChapterPayload {
  projectId: number;
  chapterId: number;
  volumeName: string;
  chapterTitle: string;
  content: string;
  eventSummary?: string | null;
}

export interface SourceUpdateChapterResult {
  chapter: SourceChapter;
}

export interface SourceDeleteChapterPayload {
  projectId: number;
  chapterId: number;
}

export interface SourceDeleteChaptersPayload {
  projectId: number;
  chapterIds: number[];
}

export interface SourceDeleteResult {
  deletedCount: number;
}

export interface SourceGenerateEventsPayload {
  projectId: number;
  chapterIds: number[];
}

export interface SourceGenerateEventsResult {
  accepted: boolean;
  taskId: number;
  chapterIds: number[];
}

export interface SourcePollEventStatusPayload {
  projectId: number;
  chapterIds: number[];
}

export interface SourcePollEventStatusResult {
  chapters: SourceChapter[];
}
