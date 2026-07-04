import { existsSync, readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { getRuntimeDirectories, safeJoin } from '../file-system';
import { getBuiltinVendorDefinition } from '../model/builtin-vendors';
import { normalizeVendorManifest } from '../model/validation';
import { runVendorCode, validateVendorRuntime } from '../model/vendor-runner';
import { logger } from '../logger';
import { DEFAULT_VENDOR_IDS } from '../default-assets/registry';
import { createMd5, readJsonColumn, tableExists, writeJsonColumn } from './seed-helpers';
import { seedManualRecords } from './seed-manuals';
import { seedModelPromptTemplates } from './seed-model-prompts';

const MODEL_CONNECTIONS_KEY = 'modelConnections.v1';
const MODEL_BINDINGS_KEY = 'modelCapabilityBindings.v1';
const DEMO_MEDIA_CONNECTION_ID = 'vt_demo_media_connection';
const DEMO_IMAGE_MODEL_NAME = 'vt-demo-image';
const DEMO_VIDEO_MODEL_NAME = 'vt-demo-video';

function getVendorManifestFromRuntime(vendorId: string) {
  const codePath = safeJoin(getRuntimeDirectories().vendors, `${vendorId}.ts`);
  if (!existsSync(codePath)) {
    const builtin = getBuiltinVendorDefinition(vendorId);
    return builtin?.manifest ?? null;
  }

  try {
    return validateVendorRuntime(runVendorCode(readFileSync(codePath, 'utf-8'))).vendor ?? null;
  } catch (error) {
    logger.warn('默认供应商', `供应商脚本解析失败：${vendorId}`);
    logger.detail('默认供应商', '供应商脚本解析失败详情', error);
    return getBuiltinVendorDefinition(vendorId)?.manifest ?? null;
  }
}

function seedVendorModels(db: Database.Database, now: number): void {
  if (!tableExists(db, 'model_vendors')) {
    return;
  }

  const rowStmt = db.prepare<[string], { id: string; input_values: string; models: string; enabled: number } | undefined>(
    'SELECT id, input_values, models, enabled FROM model_vendors WHERE id = ? LIMIT 1',
  );
  const insertStmt = db.prepare<[string, string, string, number, number, number]>(
    'INSERT INTO model_vendors (id, input_values, models, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const updateModelsStmt = db.prepare<[string, number, string]>('UPDATE model_vendors SET models = ?, updated_at = ? WHERE id = ?');

  for (const vendorId of DEFAULT_VENDOR_IDS) {
    const manifest = getVendorManifestFromRuntime(vendorId);
    if (!manifest) {
      logger.warn('默认供应商', `跳过未找到供应商：${vendorId}`);
      continue;
    }

    const normalized = normalizeVendorManifest(manifest);
    const models = JSON.stringify(normalized.models);
    const row = rowStmt.get(vendorId);

    if (!row) {
      insertStmt.run(vendorId, JSON.stringify(normalized.inputValues), models, 0, now, now);
      continue;
    }

    if (!row.models || row.models === '[]') {
      updateModelsStmt.run(models, now, vendorId);
    }
  }
}

function isDemoConnection(value: unknown): value is { id?: unknown } {
  return typeof value === 'object' && value !== null && (value as { id?: unknown }).id === DEMO_MEDIA_CONNECTION_ID;
}

function isDemoBinding(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const binding = value as { connectionId?: unknown; modelName?: unknown };
  return (
    binding.connectionId === DEMO_MEDIA_CONNECTION_ID ||
    binding.modelName === DEMO_IMAGE_MODEL_NAME ||
    binding.modelName === DEMO_VIDEO_MODEL_NAME
  );
}

function cleanupDemoModelSettings(db: Database.Database, now: number): void {
  if (!tableExists(db, 'app_settings')) {
    return;
  }

  const connections = readJsonColumn<Array<Record<string, unknown>>>(db, 'app_settings', 'key', MODEL_CONNECTIONS_KEY, 'value', []);
  const nextConnections = connections.filter((connection) => !isDemoConnection(connection));
  if (nextConnections.length !== connections.length) {
    writeJsonColumn(db, 'app_settings', 'key', MODEL_CONNECTIONS_KEY, 'value', nextConnections, now);
  }

  const bindings = readJsonColumn<Record<string, unknown>>(db, 'app_settings', 'key', MODEL_BINDINGS_KEY, 'value', {});
  const nextBindings = Object.fromEntries(Object.entries(bindings).filter(([, binding]) => !isDemoBinding(binding)));
  if (Object.keys(nextBindings).length !== Object.keys(bindings).length) {
    writeJsonColumn(db, 'app_settings', 'key', MODEL_BINDINGS_KEY, 'value', nextBindings, now);
  }
}

function cleanupDemoRecords(db: Database.Database, now: number): void {
  cleanupDemoModelSettings(db, now);

  if (tableExists(db, 'model_vendors')) {
    db.prepare<[string]>('DELETE FROM model_vendors WHERE id = ?').run(DEMO_MEDIA_CONNECTION_ID);
  }

  if (tableExists(db, 'visual_manuals')) {
    db.prepare<[], unknown>("DELETE FROM visual_manuals WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'").run();
  }

  if (tableExists(db, 'director_manuals')) {
    db.prepare<[], unknown>("DELETE FROM director_manuals WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'").run();
  }
}

function syncSkillMd5(db: Database.Database, now: number): void {
  if (!tableExists(db, 'skill_list')) {
    return;
  }

  const root = getRuntimeDirectories().skills;
  const rows = db.prepare<[], { id: string; path: string }>('SELECT id, path FROM skill_list').all();
  const updateStmt = db.prepare<[string, number, string]>('UPDATE skill_list SET md5 = ?, updated_at = ? WHERE id = ?');

  for (const row of rows) {
    const filePath = safeJoin(root, row.path);
    if (!existsSync(filePath)) {
      continue;
    }

    const md5 = createMd5(readFileSync(filePath, 'utf-8'));
    updateStmt.run(md5, now, row.id);
  }
}

export function seedDefaultAssetRecords(db: Database.Database, now: number): void {
  cleanupDemoRecords(db, now);
  seedManualRecords(db, now);
  seedModelPromptTemplates(db, now);
  seedVendorModels(db, now);
  syncSkillMd5(db, now);
}
