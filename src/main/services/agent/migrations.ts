import type { Migration } from '../database/migrations';

export const agentMigrations: Migration[] = [
  {
    id: '0009_create_agent_workspace',
    name: 'create agent work data and scripts tables',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS agent_work_data (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        key        TEXT    NOT NULL,
        data       TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, key)
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_agent_work_data_project_id ON agent_work_data(project_id)',
      `
      CREATE TABLE IF NOT EXISTS scripts (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id     INTEGER NOT NULL,
        episode_key    TEXT    NOT NULL,
        name           TEXT    NOT NULL,
        content        TEXT    NOT NULL,
        extract_status TEXT    NOT NULL DEFAULT 'idle',
        error_reason   TEXT    NULL,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        UNIQUE(project_id, episode_key)
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_scripts_project_id ON scripts(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_scripts_extract_status ON scripts(extract_status)',
      'CREATE INDEX IF NOT EXISTS idx_scripts_updated_at ON scripts(updated_at)',
    ],
  },
];
