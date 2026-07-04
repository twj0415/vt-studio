import type Database from 'better-sqlite3';
import { DEFAULT_VENDOR_IDS } from '../default-assets/registry';
import { insertIfMissing } from './seed-helpers';

export function seedVendors(db: Database.Database, now: number): void {
  for (const id of DEFAULT_VENDOR_IDS) {
    insertIfMissing(
      db,
      'model_vendors',
      'id',
      id,
      'INSERT INTO model_vendors (id, input_values, models, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, '{}', '[]', 0, now, now],
    );
  }
}
