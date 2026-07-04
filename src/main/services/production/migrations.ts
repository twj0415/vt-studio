import type { Migration } from '../database/migrations';

export const productionMigrations: Migration[] = [
  {
    id: '0012_create_production_workspace',
    name: 'create production workspace tables',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS production_workspaces (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id       INTEGER NOT NULL,
        script_id        INTEGER NOT NULL,
        script_plan      TEXT    NOT NULL DEFAULT '',
        storyboard_table TEXT    NOT NULL DEFAULT '',
        positions_json   TEXT    NOT NULL DEFAULT '{}',
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL,
        UNIQUE(project_id, script_id)
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_production_workspaces_project_script ON production_workspaces(project_id, script_id)',
      `
      CREATE TABLE IF NOT EXISTS production_storyboards (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id            INTEGER NOT NULL,
        script_id             INTEGER NOT NULL,
        sort_index            INTEGER NOT NULL DEFAULT 0,
        prompt                TEXT    NOT NULL DEFAULT '',
        video_desc            TEXT    NOT NULL DEFAULT '',
        duration              REAL    NOT NULL DEFAULT 4,
        relative_path         TEXT,
        image_status          TEXT    NOT NULL DEFAULT 'idle',
        image_error_reason    TEXT,
        flow_id               TEXT,
        should_generate_image INTEGER NOT NULL DEFAULT 1,
        track_id              INTEGER,
        created_at            INTEGER NOT NULL,
        updated_at            INTEGER NOT NULL
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_production_storyboards_project_script ON production_storyboards(project_id, script_id)',
      'CREATE INDEX IF NOT EXISTS idx_production_storyboards_track_id ON production_storyboards(track_id)',
      'CREATE INDEX IF NOT EXISTS idx_production_storyboards_image_status ON production_storyboards(image_status)',
      `
      CREATE TABLE IF NOT EXISTS production_storyboard_asset_links (
        storyboard_id INTEGER NOT NULL,
        asset_id      INTEGER NOT NULL,
        sort_index    INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        PRIMARY KEY(storyboard_id, asset_id)
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_production_storyboard_asset_links_storyboard ON production_storyboard_asset_links(storyboard_id)',
      'CREATE INDEX IF NOT EXISTS idx_production_storyboard_asset_links_asset ON production_storyboard_asset_links(asset_id)',
      `
      CREATE TABLE IF NOT EXISTS production_video_tracks (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id        INTEGER NOT NULL,
        script_id         INTEGER NOT NULL,
        prompt            TEXT    NOT NULL DEFAULT '',
        duration          REAL    NOT NULL DEFAULT 4,
        status            TEXT    NOT NULL DEFAULT 'idle',
        error_reason      TEXT,
        selected_video_id INTEGER,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_production_video_tracks_project_script ON production_video_tracks(project_id, script_id)',
      'CREATE INDEX IF NOT EXISTS idx_production_video_tracks_status ON production_video_tracks(status)',
      `
      CREATE TABLE IF NOT EXISTS production_videos (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id     INTEGER NOT NULL,
        script_id      INTEGER NOT NULL,
        track_id       INTEGER NOT NULL,
        relative_path  TEXT,
        prompt         TEXT    NOT NULL DEFAULT '',
        duration       REAL    NOT NULL DEFAULT 4,
        status         TEXT    NOT NULL DEFAULT 'idle',
        error_reason   TEXT,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_production_videos_track_id ON production_videos(track_id)',
      'CREATE INDEX IF NOT EXISTS idx_production_videos_status ON production_videos(status)',
      `
      CREATE TABLE IF NOT EXISTS production_image_flows (
        id         TEXT PRIMARY KEY,
        project_id INTEGER NOT NULL,
        script_id  INTEGER NOT NULL,
        flow_data  TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
      `,
    ],
  },
  {
    id: '0013_extend_production_core',
    name: 'extend production facts for workbench and image flows',
    statements: [
      "ALTER TABLE production_storyboards ADD COLUMN task_id INTEGER",
      "ALTER TABLE production_video_tracks ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE production_video_tracks ADD COLUMN mode_json TEXT",
      "ALTER TABLE production_video_tracks ADD COLUMN task_id INTEGER",
      "ALTER TABLE production_videos ADD COLUMN mode_json TEXT",
      "ALTER TABLE production_videos ADD COLUMN reference_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE production_videos ADD COLUMN resolution TEXT",
      "ALTER TABLE production_videos ADD COLUMN audio_enabled INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE production_videos ADD COLUMN cover_relative_path TEXT",
      "ALTER TABLE production_videos ADD COLUMN task_id INTEGER",
      "ALTER TABLE production_image_flows ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'free'",
      "ALTER TABLE production_image_flows ADD COLUMN owner_id INTEGER",
      'CREATE INDEX IF NOT EXISTS idx_production_video_tracks_sort ON production_video_tracks(project_id, script_id, sort_index)',
      'CREATE INDEX IF NOT EXISTS idx_production_videos_task_id ON production_videos(task_id)',
      'CREATE INDEX IF NOT EXISTS idx_production_image_flows_owner ON production_image_flows(owner_type, owner_id)',
    ],
  },
  {
    id: '0016_add_production_generation_metadata',
    name: 'add production generation metadata',
    statements: [
      "ALTER TABLE production_storyboards ADD COLUMN generation_metadata TEXT NOT NULL DEFAULT '{}'",
      "ALTER TABLE production_video_tracks ADD COLUMN generation_metadata TEXT NOT NULL DEFAULT '{}'",
      "ALTER TABLE production_videos ADD COLUMN generation_metadata TEXT NOT NULL DEFAULT '{}'",
    ],
  },
  {
    id: '0017_add_dependency_status_fields',
    name: 'add upstream dependency status fields',
    statements: [
      "ALTER TABLE scripts ADD COLUMN dependency_status TEXT NOT NULL DEFAULT 'valid'",
      'ALTER TABLE scripts ADD COLUMN dependency_reason TEXT',
      'CREATE INDEX IF NOT EXISTS idx_scripts_dependency_status ON scripts(dependency_status)',
      "ALTER TABLE assets ADD COLUMN dependency_status TEXT NOT NULL DEFAULT 'valid'",
      'ALTER TABLE assets ADD COLUMN dependency_reason TEXT',
      'CREATE INDEX IF NOT EXISTS idx_assets_dependency_status ON assets(dependency_status)',
      "ALTER TABLE production_storyboards ADD COLUMN dependency_status TEXT NOT NULL DEFAULT 'valid'",
      'ALTER TABLE production_storyboards ADD COLUMN dependency_reason TEXT',
      'CREATE INDEX IF NOT EXISTS idx_production_storyboards_dependency_status ON production_storyboards(dependency_status)',
      "ALTER TABLE production_video_tracks ADD COLUMN dependency_status TEXT NOT NULL DEFAULT 'valid'",
      'ALTER TABLE production_video_tracks ADD COLUMN dependency_reason TEXT',
      'CREATE INDEX IF NOT EXISTS idx_production_video_tracks_dependency_status ON production_video_tracks(dependency_status)',
      "ALTER TABLE production_videos ADD COLUMN dependency_status TEXT NOT NULL DEFAULT 'valid'",
      'ALTER TABLE production_videos ADD COLUMN dependency_reason TEXT',
      'CREATE INDEX IF NOT EXISTS idx_production_videos_dependency_status ON production_videos(dependency_status)',
    ],
  },
];
