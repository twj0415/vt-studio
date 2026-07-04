import type { Migration } from '../database/migrations';

export const exportMigrations: Migration[] = [
  {
    id: '0019_create_export_history',
    name: 'create export history table',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS export_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        script_id INTEGER NOT NULL,
        task_id INTEGER,
        export_type TEXT NOT NULL,
        draft_name TEXT NOT NULL,
        status TEXT NOT NULL,
        output_path TEXT,
        relative_path TEXT,
        clip_count INTEGER NOT NULL DEFAULT 0,
        copied_asset_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        app_version TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        timeline_json TEXT,
        selected_video_ids_json TEXT,
        media_snapshot_json TEXT,
        failures_json TEXT,
        validation_json TEXT,
        stale_confirmations_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_export_history_project ON export_history(project_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_export_history_script ON export_history(script_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_export_history_task ON export_history(task_id)',
    ],
  },
];
