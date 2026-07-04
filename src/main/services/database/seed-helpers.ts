import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { safeJoin } from '../file-system';

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(value: string): string {
  if (!IDENTIFIER_RE.test(value)) {
    throw new Error(`Invalid database identifier: ${value}`);
  }

  return value;
}

export function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);

  return Boolean(row);
}

export function createMd5(content: Buffer | string): string {
  return createHash('md5').update(content).digest('hex');
}

export function safeReadDefaultText(root: string, relativePath: string): string {
  const targetPath = safeJoin(root, relativePath);
  return existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : '';
}

export function insertIfMissing(
  db: Database.Database,
  tableName: string,
  keyColumn: string,
  keyValue: string | number,
  insertSql: string,
  values: unknown[],
): boolean {
  const table = assertIdentifier(tableName);
  const column = assertIdentifier(keyColumn);
  const row = db.prepare<[string | number], { n: number }>(`SELECT COUNT(*) as n FROM ${table} WHERE ${column} = ?`).get(keyValue);

  if (row && row.n > 0) {
    return false;
  }

  db.prepare(insertSql).run(...values);
  return true;
}

export function upsertByKey(
  db: Database.Database,
  tableName: string,
  keyColumn: string,
  keyValue: string | number,
  insertSql: string,
  insertValues: unknown[],
  updateSql: string,
  updateValues: unknown[],
): 'inserted' | 'updated' {
  const table = assertIdentifier(tableName);
  const column = assertIdentifier(keyColumn);
  const row = db.prepare<[string | number], { n: number }>(`SELECT COUNT(*) as n FROM ${table} WHERE ${column} = ?`).get(keyValue);

  if (!row || row.n === 0) {
    db.prepare(insertSql).run(...insertValues);
    return 'inserted';
  }

  db.prepare(updateSql).run(...updateValues);
  return 'updated';
}

export function readJsonColumn<T>(
  db: Database.Database,
  tableName: string,
  keyColumn: string,
  keyValue: string | number,
  valueColumn: string,
  fallback: T,
): T {
  const table = assertIdentifier(tableName);
  const key = assertIdentifier(keyColumn);
  const value = assertIdentifier(valueColumn);
  const row = db.prepare<[string | number], { value: string } | undefined>(`SELECT ${value} as value FROM ${table} WHERE ${key} = ? LIMIT 1`).get(keyValue);

  if (!row?.value) {
    return fallback;
  }

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonColumn(
  db: Database.Database,
  tableName: string,
  keyColumn: string,
  keyValue: string,
  valueColumn: string,
  value: unknown,
  now: number,
): void {
  const table = assertIdentifier(tableName);
  const key = assertIdentifier(keyColumn);
  const valueKey = assertIdentifier(valueColumn);
  const serialized = JSON.stringify(value);

  upsertByKey(
    db,
    table,
    key,
    keyValue,
    `INSERT INTO ${table} (${key}, ${valueKey}, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [keyValue, serialized, now, now],
    `UPDATE ${table} SET ${valueKey} = ?, updated_at = ? WHERE ${key} = ?`,
    [serialized, now, keyValue],
  );
}
