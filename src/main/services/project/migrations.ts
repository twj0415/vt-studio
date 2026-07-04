import type { Migration } from '../database/migrations';

export const projectMigrations: Migration[] = [
  {
    id: '0007_create_project_tables',
    name: 'create project and manual tables',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS visual_manuals (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        name                TEXT    NOT NULL,
        path                TEXT    NOT NULL UNIQUE,
        cover_relative_path TEXT    NULL,
        tabs_json           TEXT    NOT NULL DEFAULT '[]',
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS director_manuals (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        name                TEXT    NOT NULL,
        path                TEXT    NOT NULL UNIQUE,
        cover_relative_path TEXT    NULL,
        tabs_json           TEXT    NOT NULL DEFAULT '[]',
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS projects (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type        TEXT    NOT NULL,
        name               TEXT    NOT NULL,
        genre              TEXT    NOT NULL,
        description        TEXT    NOT NULL,
        image_model_id     TEXT    NOT NULL,
        image_quality      TEXT    NOT NULL,
        video_model_id     TEXT    NOT NULL,
        video_mode         TEXT    NOT NULL,
        video_ratio        TEXT    NOT NULL,
        visual_manual_id   INTEGER NOT NULL,
        director_manual_id INTEGER NOT NULL,
        workspace_path     TEXT    NOT NULL,
        user_id            INTEGER NOT NULL DEFAULT 1,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_projects_source_type ON projects(source_type)',
      'CREATE INDEX IF NOT EXISTS idx_projects_visual_manual_id ON projects(visual_manual_id)',
      'CREATE INDEX IF NOT EXISTS idx_projects_director_manual_id ON projects(director_manual_id)',
    ],
  },
];
