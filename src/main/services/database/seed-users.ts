import type Database from 'better-sqlite3';
import { insertIfMissing } from './seed-helpers';

export function seedUsers(db: Database.Database, now: number): void {
  insertIfMissing(
    db,
    'users',
    'id',
    1,
    'INSERT INTO users (id, name, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [1, 'admin', 'admin123', now, now],
  );
}
