import type { Migration } from '../database/migrations';

export const assetMigrations: Migration[] = [
  {
    id: '0011_extend_assets_for_asset_center',
    name: 'extend assets for asset center and corner scape',
    statements: [
      'ALTER TABLE assets ADD COLUMN parent_id INTEGER',
      "ALTER TABLE assets ADD COLUMN remark TEXT NOT NULL DEFAULT ''",
      'ALTER TABLE assets ADD COLUMN media_id INTEGER',
      "ALTER TABLE assets ADD COLUMN prompt_status TEXT NOT NULL DEFAULT 'idle'",
      'ALTER TABLE assets ADD COLUMN prompt_error_reason TEXT',
      "ALTER TABLE assets ADD COLUMN image_status TEXT NOT NULL DEFAULT 'idle'",
      'ALTER TABLE assets ADD COLUMN image_error_reason TEXT',
      "ALTER TABLE assets ADD COLUMN audio_bind_status TEXT NOT NULL DEFAULT 'idle'",
      'ALTER TABLE assets ADD COLUMN audio_bind_error_reason TEXT',
      'ALTER TABLE assets ADD COLUMN voice_gender TEXT',
      "ALTER TABLE assets ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'",
      'CREATE INDEX IF NOT EXISTS idx_assets_parent_id ON assets(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_assets_project_type_parent ON assets(project_id, type, parent_id)',
      `
      CREATE TABLE IF NOT EXISTS asset_media (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id    INTEGER NOT NULL,
        asset_id      INTEGER NOT NULL,
        kind          TEXT    NOT NULL,
        relative_path TEXT,
        source        TEXT    NOT NULL DEFAULT 'manual',
        status        TEXT    NOT NULL DEFAULT 'idle',
        error_reason  TEXT,
        model         TEXT,
        resolution    TEXT,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_asset_media_project_id ON asset_media(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_asset_media_asset_id ON asset_media(asset_id)',
      'CREATE INDEX IF NOT EXISTS idx_asset_media_status ON asset_media(status)',
      `
      CREATE TABLE IF NOT EXISTS asset_audio_links (
        asset_id       INTEGER PRIMARY KEY,
        audio_asset_id INTEGER NOT NULL,
        created_at     INTEGER NOT NULL
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_asset_audio_links_audio_asset_id ON asset_audio_links(audio_asset_id)',
    ],
  },
  {
    id: '0014_add_asset_media_task_id',
    name: 'add task id to asset media',
    statements: [
      'ALTER TABLE asset_media ADD COLUMN task_id INTEGER',
      'CREATE INDEX IF NOT EXISTS idx_asset_media_task_id ON asset_media(task_id)',
    ],
  },
  {
    id: '0015_add_asset_media_generation_metadata',
    name: 'add asset media generation metadata',
    statements: [
      "ALTER TABLE asset_media ADD COLUMN usage TEXT NOT NULL DEFAULT 'primary'",
      "ALTER TABLE asset_media ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'standard'",
      'ALTER TABLE asset_media ADD COLUMN prompt TEXT',
      'ALTER TABLE asset_media ADD COLUMN model_mode TEXT',
      "ALTER TABLE asset_media ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'",
      'CREATE INDEX IF NOT EXISTS idx_asset_media_usage ON asset_media(usage)',
      'CREATE INDEX IF NOT EXISTS idx_asset_media_view_mode ON asset_media(view_mode)',
    ],
  },
];
