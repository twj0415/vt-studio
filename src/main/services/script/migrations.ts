import type { Migration } from '../database/migrations';

export const scriptMigrations: Migration[] = [
  {
    id: '0010_create_script_assets',
    name: 'create script asset tables',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS assets (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  INTEGER NOT NULL,
        type        TEXT    NOT NULL,
        name        TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        prompt      TEXT    NOT NULL DEFAULT '',
        source      TEXT    NOT NULL DEFAULT 'manual',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        UNIQUE(project_id, type, name)
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type)',
      `
      CREATE TABLE IF NOT EXISTS script_asset_links (
        script_id  INTEGER NOT NULL,
        asset_id   INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(script_id, asset_id)
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_script_asset_links_script_id ON script_asset_links(script_id)',
      'CREATE INDEX IF NOT EXISTS idx_script_asset_links_asset_id ON script_asset_links(asset_id)',
    ],
  },
];
