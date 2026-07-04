import type Database from 'better-sqlite3';
import { DEFAULT_MODEL_PROMPTS } from '../default-assets/registry';
import { getRuntimeDirectories } from '../file-system';
import { logger } from '../logger';
import { safeReadDefaultText, tableExists } from './seed-helpers';

export function seedModelPromptTemplates(db: Database.Database, now: number): void {
  if (!tableExists(db, 'model_prompt_templates')) {
    return;
  }

  const root = getRuntimeDirectories().modelPrompt;
  const existsStmt = db.prepare<[string, string], { id: number } | undefined>(
    'SELECT id FROM model_prompt_templates WHERE type = ? AND lower(name) = lower(?) LIMIT 1',
  );
  const insertStmt = db.prepare<[string, string, string, number, number, number]>(
    'INSERT INTO model_prompt_templates (name, type, content, is_builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );

  for (const prompt of DEFAULT_MODEL_PROMPTS) {
    const content = safeReadDefaultText(root, prompt.relativePath);
    if (!content.trim()) {
      logger.warn('默认提示词', `跳过缺文件模板：${prompt.relativePath}`);
      continue;
    }

    const existing = existsStmt.get(prompt.type, prompt.name);
    if (!existing) {
      insertStmt.run(prompt.name, prompt.type, content, 1, now, now);
    }
  }
}
