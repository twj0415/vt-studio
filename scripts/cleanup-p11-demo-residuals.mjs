import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';

const DEMO_CONNECTION_ID = 'vt_demo_media_connection';
const DEMO_MODEL_NAMES = new Set(['vt-demo-image', 'vt-demo-video']);
const CONNECTIONS_KEY = 'modelConnections.v1';
const BINDINGS_KEY = 'modelCapabilityBindings.v1';

function candidateUserDataRoots() {
  return [
    process.env.VT_STUDIO_USER_DATA,
    join(tmpdir(), 'VT Studio Dev', 'user-data'),
    join(process.env.LOCALAPPDATA ?? tmpdir(), 'VT Studio', 'user-data'),
  ].filter(Boolean);
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName));
}

function readSettingJson(db, key, fallback) {
  if (!tableExists(db, 'app_settings')) {
    return fallback;
  }

  const row = db.prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(key);
  if (!row?.value) {
    return fallback;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function writeSettingJson(db, key, value) {
  const now = Date.now();
  const serialized = JSON.stringify(value);
  const existing = db.prepare('SELECT key FROM app_settings WHERE key = ? LIMIT 1').get(key);

  if (existing) {
    db.prepare('UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?').run(serialized, now, key);
    return;
  }

  db.prepare('INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(key, serialized, now, now);
}

function isDemoBinding(binding) {
  return Boolean(
    binding &&
      typeof binding === 'object' &&
      (binding.connectionId === DEMO_CONNECTION_ID || DEMO_MODEL_NAMES.has(binding.modelName)),
  );
}

function countRows(db, tableName, where = '') {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} ${where}`).get().count;
}

function findDatabase() {
  for (const root of candidateUserDataRoots()) {
    const databasePath = join(root, 'database', 'vt-studio.sqlite');
    if (existsSync(databasePath)) {
      return { userDataRoot: root, databasePath };
    }
  }

  throw new Error('未找到 VT Studio SQLite 数据库');
}

function makeBackup(databasePath, userDataRoot) {
  const backupDirectory = join(userDataRoot, 'database', 'backups');
  mkdirSync(backupDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDirectory, `${basename(databasePath)}.before-p11-demo-cleanup.${timestamp}.bak`);
  copyFileSync(databasePath, backupPath);
  return backupPath;
}

function cleanupDatabase(databasePath) {
  const db = new Database(databasePath);
  try {
    const summary = {
      before: {
        demoConnections: 0,
        demoBindings: 0,
        modelVendors: 0,
        visualManuals: 0,
        directorManuals: 0,
      },
      after: {},
      changed: {
        connectionsRemoved: 0,
        bindingsRemoved: 0,
        modelVendorsRemoved: 0,
        visualManualsRemoved: 0,
        directorManualsRemoved: 0,
      },
    };

    const transaction = db.transaction(() => {
      const connections = readSettingJson(db, CONNECTIONS_KEY, []);
      const bindings = readSettingJson(db, BINDINGS_KEY, {});
      const nextConnections = Array.isArray(connections)
        ? connections.filter((connection) => connection?.id !== DEMO_CONNECTION_ID)
        : [];
      const bindingEntries = bindings && typeof bindings === 'object' ? Object.entries(bindings) : [];
      const nextBindings = Object.fromEntries(bindingEntries.filter(([, binding]) => !isDemoBinding(binding)));

      summary.before.demoConnections = Array.isArray(connections)
        ? connections.filter((connection) => connection?.id === DEMO_CONNECTION_ID).length
        : 0;
      summary.before.demoBindings = bindingEntries.length - Object.keys(nextBindings).length;
      summary.before.modelVendors = countRows(db, 'model_vendors', `WHERE id = '${DEMO_CONNECTION_ID}'`);
      summary.before.visualManuals = countRows(db, 'visual_manuals', "WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'");
      summary.before.directorManuals = countRows(db, 'director_manuals', "WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'");

      if (Array.isArray(connections) && nextConnections.length !== connections.length) {
        writeSettingJson(db, CONNECTIONS_KEY, nextConnections);
        summary.changed.connectionsRemoved = connections.length - nextConnections.length;
      }

      if (Object.keys(nextBindings).length !== bindingEntries.length) {
        writeSettingJson(db, BINDINGS_KEY, nextBindings);
        summary.changed.bindingsRemoved = bindingEntries.length - Object.keys(nextBindings).length;
      }

      if (tableExists(db, 'model_vendors')) {
        summary.changed.modelVendorsRemoved = db.prepare('DELETE FROM model_vendors WHERE id = ?').run(DEMO_CONNECTION_ID).changes;
      }

      if (tableExists(db, 'visual_manuals')) {
        summary.changed.visualManualsRemoved = db
          .prepare("DELETE FROM visual_manuals WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'")
          .run().changes;
      }

      if (tableExists(db, 'director_manuals')) {
        summary.changed.directorManualsRemoved = db
          .prepare("DELETE FROM director_manuals WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'")
          .run().changes;
      }
    });

    transaction();

    const connections = readSettingJson(db, CONNECTIONS_KEY, []);
    const bindings = readSettingJson(db, BINDINGS_KEY, {});
    const bindingEntries = bindings && typeof bindings === 'object' ? Object.entries(bindings) : [];
    summary.after = {
      demoConnections: Array.isArray(connections)
        ? connections.filter((connection) => connection?.id === DEMO_CONNECTION_ID).length
        : 0,
      demoBindings: bindingEntries.filter(([, binding]) => isDemoBinding(binding)).length,
      modelVendors: countRows(db, 'model_vendors', `WHERE id = '${DEMO_CONNECTION_ID}'`),
      visualManuals: countRows(db, 'visual_manuals', "WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'"),
      directorManuals: countRows(db, 'director_manuals', "WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'"),
    };

    return summary;
  } finally {
    db.close();
  }
}

const target = findDatabase();
const backupPath = makeBackup(target.databasePath, target.userDataRoot);
const summary = cleanupDatabase(target.databasePath);

console.log(JSON.stringify({
  cleanedAt: new Date().toISOString(),
  userDataRoot: target.userDataRoot,
  databasePath: target.databasePath,
  backupPath,
  summary,
}, null, 2));
