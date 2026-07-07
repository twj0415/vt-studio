import type { SourceChapterDraft } from '@shared/types/source';

export interface DraftChapter extends SourceChapterDraft {
  tempId: string;
}

export interface ChapterEditForm {
  volumeName: string;
  chapterTitle: string;
  content: string;
  eventSummary: string;
}

export interface DetailState {
  visible: boolean;
  title: string;
  content: string;
}
