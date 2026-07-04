export type BusinessLockSource =
  | 'tasks'
  | 'source_chapters'
  | 'scripts'
  | 'assets'
  | 'asset_media'
  | 'production_storyboards'
  | 'production_video_tracks'
  | 'production_videos';

export type BusinessLockScope = 'global' | 'project';

export interface BusinessLockSummary {
  source: BusinessLockSource;
  scope: BusinessLockScope;
  projectId: number | null;
  label: string;
  count: number;
  taskIds: number[];
}
