import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import {
  DEFAULT_MAIN_SKILLS,
  DEFAULT_MODEL_ONNX_FILE,
  DEFAULT_REFERENCE_SKILLS,
  DEFAULT_SKILL_ATTRIBUTIONS,
} from '../default-assets/registry';
import { getRuntimeDirectories, safeJoin } from '../file-system';
import { logger } from '../logger';
import { insertIfMissing } from './seed-helpers';

function checkOnnxModelExists(): boolean {
  const modelPath = safeJoin(getRuntimeDirectories().models, DEFAULT_MODEL_ONNX_FILE.join('/'));
  return existsSync(modelPath);
}

export function seedSkills(db: Database.Database, now: number): void {
  for (const skill of DEFAULT_MAIN_SKILLS) {
    insertIfMissing(
      db,
      'skill_list',
      'id',
      skill.id,
      `INSERT INTO skill_list
         (id, md5, path, name, description, embedding, type, created_at, updated_at, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [skill.id, skill.md5, skill.path, skill.name, '', '', skill.type, now, now, -1],
    );
  }

  const hasOnnx = checkOnnxModelExists();
  if (!hasOnnx) {
    logger.warn('记忆功能', 'ONNX 模型文件未安装，已跳过 Skill 向量初始化');
    logger.detail('记忆功能', 'ONNX 缺失详情', {
      state: -1,
      reason: '可在设置页重建 Skill 向量',
    });
  }

  for (const skill of DEFAULT_REFERENCE_SKILLS) {
    insertIfMissing(
      db,
      'skill_list',
      'id',
      skill.id,
      `INSERT INTO skill_list
         (id, md5, path, name, description, embedding, type, created_at, updated_at, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [skill.id, skill.md5, skill.path, skill.name, skill.description, '', skill.type, now, now, -1],
    );
  }
}

export function seedSkillAttributions(db: Database.Database): void {
  const checkStmt = db.prepare<[string, string], { n: number }>(
    'SELECT COUNT(*) as n FROM skill_attributions WHERE skill_id = ? AND attribution = ?',
  );
  const insertStmt = db.prepare<[string, string]>('INSERT INTO skill_attributions (skill_id, attribution) VALUES (?, ?)');

  for (const row of DEFAULT_SKILL_ATTRIBUTIONS) {
    const exists = checkStmt.get(row.skillId, row.attribution);
    if (!exists || exists.n === 0) {
      insertStmt.run(row.skillId, row.attribution);
    }
  }
}
