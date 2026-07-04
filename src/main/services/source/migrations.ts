import type { Migration } from '../database/migrations';

export const sourceMigrations: Migration[] = [
  {
    id: '0008_create_source_chapters',
    name: 'create source chapter table',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS source_chapters (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id    INTEGER NOT NULL,
        chapter_index INTEGER NOT NULL,
        volume_name   TEXT    NOT NULL,
        chapter_title TEXT    NOT NULL,
        content       TEXT    NOT NULL,
        event_status  TEXT    NOT NULL,
        event_summary TEXT    NULL,
        event_error   TEXT    NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_source_chapters_project_id ON source_chapters(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_source_chapters_project_index ON source_chapters(project_id, chapter_index)',
      'CREATE INDEX IF NOT EXISTS idx_source_chapters_event_status ON source_chapters(event_status)',
      'CREATE INDEX IF NOT EXISTS idx_source_chapters_chapter_title ON source_chapters(chapter_title)',
    ],
  },
];
