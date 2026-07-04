import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { ProjectManualTabDefinition } from '@shared/constants/manuals';
import {
  DEFAULT_DIRECTOR_MANUALS,
  DEFAULT_VISUAL_MANUALS,
  getDefaultManualRoot,
  getDefaultManualTabs,
  type DefaultManualDefinition,
} from '../default-assets/registry';
import { getRuntimeDirectories, safeJoin } from '../file-system';
import { logger } from '../logger';
import { safeReadDefaultText, tableExists } from './seed-helpers';

function getManualTabCandidatePaths(manual: DefaultManualDefinition, tab: ProjectManualTabDefinition): string[] {
  return [tab.relativePath, ...(tab.legacyRelativePaths ?? [])].map((relativePath) => `${manual.path}/${relativePath}`);
}

function hasManualTabFile(root: string, manual: DefaultManualDefinition, tab: ProjectManualTabDefinition): boolean {
  return getManualTabCandidatePaths(manual, tab).some((relativePath) => existsSync(safeJoin(root, relativePath)));
}

function readManualTabText(root: string, manual: DefaultManualDefinition, tab: ProjectManualTabDefinition): string {
  for (const relativePath of getManualTabCandidatePaths(manual, tab)) {
    const content = safeReadDefaultText(root, relativePath);
    if (content.trim()) {
      return content;
    }
  }

  return '';
}

function hasAllFiles(root: string, manual: DefaultManualDefinition, tabs: readonly ProjectManualTabDefinition[]): boolean {
  return tabs.every((tab) => hasManualTabFile(root, manual, tab));
}

function buildTabsJson(root: string, manual: DefaultManualDefinition, tabs: readonly ProjectManualTabDefinition[]): string {
  return JSON.stringify(
    tabs.map((tab) => ({
      key: tab.key,
      content: readManualTabText(root, manual, tab),
    })),
  );
}

function isTabsJsonEffectivelyEmpty(value: string | null | undefined): boolean {
  if (!value || value === '[]') {
    return true;
  }

  try {
    const parsed = JSON.parse(value) as Array<{ content?: unknown }>;
    return Array.isArray(parsed) && parsed.every((tab) => typeof tab.content !== 'string' || !tab.content.trim());
  } catch {
    return false;
  }
}

function seedManualTable(
  db: Database.Database,
  tableName: 'visual_manuals' | 'director_manuals',
  root: string,
  manuals: DefaultManualDefinition[],
  tabs: readonly ProjectManualTabDefinition[],
  now: number,
): void {
  if (!tableExists(db, tableName)) {
    return;
  }

  const existsStmt = db.prepare<[string], { id: number; tabs_json: string; cover_relative_path: string | null } | undefined>(
    `SELECT id, tabs_json, cover_relative_path FROM ${tableName} WHERE path = ? LIMIT 1`,
  );
  const insertStmt = db.prepare<[string, string, string | null, string, number, number]>(
    `INSERT INTO ${tableName} (name, path, cover_relative_path, tabs_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const updateEmptyStmt = db.prepare<[string, string | null, number, number]>(
    `UPDATE ${tableName} SET tabs_json = ?, cover_relative_path = ?, updated_at = ? WHERE id = ?`,
  );

  for (const manual of manuals) {
    if (!hasAllFiles(root, manual, tabs)) {
      logger.warn('默认手册', `跳过缺文件手册：${manual.path}`);
      continue;
    }

    const coverRelativePath =
      manual.coverRelativePath && existsSync(safeJoin(root, `${manual.path}/${manual.coverRelativePath}`))
        ? manual.coverRelativePath
        : null;
    const tabsJson = buildTabsJson(root, manual, tabs);
    const existing = existsStmt.get(manual.path);

    if (!existing) {
      insertStmt.run(manual.name, manual.path, coverRelativePath, tabsJson, now, now);
      continue;
    }

    if (isTabsJsonEffectivelyEmpty(existing.tabs_json)) {
      updateEmptyStmt.run(tabsJson, existing.cover_relative_path ?? coverRelativePath, now, existing.id);
    }
  }
}

export function seedManualRecords(db: Database.Database, now: number): void {
  const directories = getRuntimeDirectories();

  seedManualTable(
    db,
    'visual_manuals',
    join(directories.skills, getDefaultManualRoot('visual')),
    DEFAULT_VISUAL_MANUALS,
    getDefaultManualTabs('visual'),
    now,
  );
  seedManualTable(
    db,
    'director_manuals',
    join(directories.skills, getDefaultManualRoot('director')),
    DEFAULT_DIRECTOR_MANUALS,
    getDefaultManualTabs('director'),
    now,
  );
}
