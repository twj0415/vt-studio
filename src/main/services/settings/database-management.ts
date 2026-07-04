import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import { VT_STATUS } from '@shared/constants/status';
import type {
  DatabaseBackupItem,
  DatabaseBackupListResult,
  DatabaseClearAllPayload,
  DatabaseClearAllResult,
  DatabaseClearTablePayload,
  DatabaseClearTableResult,
  DatabaseExportResult,
  DatabaseImportPayload,
  DatabaseImportResult,
  DatabaseManagementInfo,
  DatabaseManagementInfoResult,
  DatabaseRunningTasksResult,
  DatabaseTableInfo,
  DatabaseTableListResult,
} from '@shared/types/database-management';
import { closeDatabase, getDatabase } from '../database/connection';
import { getDatabaseInfo as getCoreDatabaseInfo } from '../database/info';
import { resolveDatabaseFilePath } from '../database/path';
import { runMigrations } from '../database/migrations';
import { runSeed } from '../database/seed';
import { withTransaction } from '../database/transaction';
import { getRuntimeDirectories } from '../file-system/paths';
import { safeJoin } from '../file-system/safe-path';
import { createError } from '../result';
import { assertNoBusinessLocks, countBusinessLocks, countRunningTaskRecords, listBusinessLocks } from '../task/locks';

const BACKUP_DIRECTORY_NAME = 'database';
const BACKUP_FILE_PREFIX = 'vt-studio-db';
const PROTECTED_TABLES = new Set(['schema_migrations', 'sqlite_sequence']);

const TABLE_MODULES: Record<string, string> = {
  users: '登录/用户',
  prompts: '提示词',
  skill_list: 'Skill',
  skill_attributions: 'Skill',
  model_vendors: '模型供应商',
  agent_model_configs: 'Agent 配置',
  app_settings: '全局设置',
  tasks: '任务队列',
  memories: '记忆',
  model_prompt_templates: '模型专用模板',
  model_prompt_mappings: '模型专用模板',
};

interface TableRow {
  name: string;
}

function getBackupDirectory(): string {
  const directory = join(getRuntimeDirectories().exports, BACKUP_DIRECTORY_NAME);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function createBackupName(): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('.', '-');
  return `${BACKUP_FILE_PREFIX}-${timestamp}-${randomUUID().slice(0, 8)}.sqlite`;
}

function resolveBackupPath(name: string): string {
  const normalized = basename(name.trim());
  if (!normalized || normalized !== name || !normalized.endsWith('.sqlite')) {
    throw createError(VT_STATUS.INVALID_PARAMS, '备份文件名无效');
  }

  return safeJoin(getBackupDirectory(), normalized);
}

function mapBackup(name: string): DatabaseBackupItem {
  const filePath = resolveBackupPath(name);
  const stat = statSync(filePath);

  return {
    name,
    sizeBytes: stat.size,
    createdAt: stat.mtimeMs,
    containsSecrets: true,
  };
}

export function listDatabaseBackups(): DatabaseBackupListResult {
  const directory = getBackupDirectory();
  const backups = readdirSync(directory)
    .filter((name) => name.endsWith('.sqlite'))
    .map(mapBackup)
    .sort((left, right) => right.createdAt - left.createdAt);

  return { backups };
}

function getRunningTaskCount(): number {
  return countRunningTaskRecords();
}

function assertNoRunningTasks(): void {
  assertNoBusinessLocks({ action: '执行数据库危险操作' });
}

export function checkDatabaseRunningTasks(): DatabaseRunningTasksResult {
  const runningLocks = listBusinessLocks();

  return {
    runningTaskCount: getRunningTaskCount(),
    runningLockCount: countBusinessLocks(),
    runningLocks,
  };
}

export function getDatabaseManagementInfo(): DatabaseManagementInfoResult {
  const info = getCoreDatabaseInfo();
  const backups = listDatabaseBackups().backups;

  return {
    info: {
      ...info,
      backupCount: backups.length,
      latestBackupName: backups[0]?.name ?? null,
      runningTaskCount: getRunningTaskCount(),
      runningLockCount: countBusinessLocks(),
      runningLocks: listBusinessLocks(),
    } satisfies DatabaseManagementInfo,
  };
}

export async function exportDatabaseBackup(): Promise<DatabaseExportResult> {
  const backupName = createBackupName();
  const backupPath = resolveBackupPath(backupName);

  await getDatabase().backup(backupPath);

  return { backup: mapBackup(backupName), containsSecrets: true };
}

function validateSqliteBackup(filePath: string): void {
  if (!existsSync(filePath)) {
    throw createError(VT_STATUS.FILE_NOT_FOUND, '备份文件不存在');
  }

  let backup: Database.Database | null = null;
  try {
    backup = new Database(filePath, { readonly: true, fileMustExist: true });
    const integrity = backup.prepare<[], { integrity_check: string }>('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') {
      throw createError(VT_STATUS.DATABASE_ERROR, '备份文件完整性校验失败');
    }
    backup.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  } finally {
    backup?.close();
  }
}

export async function importDatabaseBackup(payload: DatabaseImportPayload): Promise<DatabaseImportResult> {
  if (payload.confirmText !== '导入数据库') {
    throw createError(VT_STATUS.INVALID_PARAMS, '请输入确认短语：导入数据库');
  }

  assertNoRunningTasks();

  const backupPath = resolveBackupPath(payload.backupName);
  validateSqliteBackup(backupPath);
  const autoBackup = await exportDatabaseBackup();
  const databasePath = resolveDatabaseFilePath();

  closeDatabase();
  try {
    for (const sidecarPath of [`${databasePath}-wal`, `${databasePath}-shm`]) {
      if (existsSync(sidecarPath)) {
        unlinkSync(sidecarPath);
      }
    }
    copyFileSync(backupPath, databasePath);
    runMigrations();
  } catch (error) {
    closeDatabase();
    copyFileSync(resolveBackupPath(autoBackup.backup.name), databasePath);
    runMigrations();
    throw createError(VT_STATUS.DATABASE_MIGRATION_ERROR, `导入失败，已恢复自动备份：${autoBackup.backup.name}`, error);
  }

  return {
    importedBackupName: payload.backupName,
    autoBackupName: autoBackup.backup.name,
    info: getDatabaseManagementInfo().info,
  };
}

function listTableNames(): string[] {
  return getDatabase()
    .prepare<[], TableRow>(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name ASC
      `,
    )
    .all()
    .map((row) => row.name);
}

function getTableRowCount(tableName: string): number {
  const row = getDatabase().prepare<[], { count: number }>(`SELECT COUNT(*) as count FROM "${tableName.replace(/"/g, '""')}"`).get();
  return row?.count ?? 0;
}

function mapTable(name: string): DatabaseTableInfo {
  return {
    name,
    rowCount: getTableRowCount(name),
    protected: PROTECTED_TABLES.has(name),
    module: TABLE_MODULES[name] ?? '业务数据',
  };
}

export function listDatabaseTables(): DatabaseTableListResult {
  return {
    tables: listTableNames().map(mapTable),
  };
}

function assertTableCanClear(tableName: string): void {
  if (!listTableNames().includes(tableName)) {
    throw createError(VT_STATUS.NOT_FOUND, '数据表不存在');
  }

  if (PROTECTED_TABLES.has(tableName)) {
    throw createError(VT_STATUS.FORBIDDEN, '受保护表不能清空');
  }
}

export async function clearDatabaseTable(payload: DatabaseClearTablePayload): Promise<DatabaseClearTableResult> {
  assertNoRunningTasks();

  const tableName = payload.tableName.trim();
  assertTableCanClear(tableName);

  if (payload.confirmText !== tableName) {
    throw createError(VT_STATUS.INVALID_PARAMS, `请输入表名确认：${tableName}`);
  }

  const autoBackup = await exportDatabaseBackup();
  const database = getDatabase();
  database.pragma('foreign_keys = OFF');
  let deleted = 0;
  try {
    deleted = withTransaction((transactionDatabase) => transactionDatabase.prepare(`DELETE FROM "${tableName.replace(/"/g, '""')}"`).run().changes);
  } finally {
    database.pragma('foreign_keys = ON');
  }

  return {
    tableName,
    deleted,
    autoBackupName: autoBackup.backup.name,
    tables: listDatabaseTables().tables,
  };
}

export async function clearAllDatabaseData(payload: DatabaseClearAllPayload): Promise<DatabaseClearAllResult> {
  if (payload.confirmText !== '清空全部数据') {
    throw createError(VT_STATUS.INVALID_PARAMS, '请输入确认短语：清空全部数据');
  }

  assertNoRunningTasks();

  const autoBackup = await exportDatabaseBackup();
  const tables = listTableNames().filter((name) => !PROTECTED_TABLES.has(name));

  const database = getDatabase();
  database.pragma('foreign_keys = OFF');
  try {
    withTransaction((transactionDatabase) => {
      for (const table of tables) {
        transactionDatabase.prepare(`DELETE FROM "${table.replace(/"/g, '""')}"`).run();
      }
    });
  } finally {
    database.pragma('foreign_keys = ON');
  }
  runSeed();

  return {
    autoBackupName: autoBackup.backup.name,
    info: getDatabaseManagementInfo().info,
    tables: listDatabaseTables().tables,
  };
}
