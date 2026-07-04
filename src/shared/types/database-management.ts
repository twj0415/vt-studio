import type { BusinessLockSummary } from './business-lock';

export interface DatabaseManagementInfo {
  directory: string;
  filePath: string;
  exists: boolean;
  sizeBytes: number;
  tableCount: number;
  migrationCount: number;
  sqliteVersion: string;
  backupCount: number;
  latestBackupName: string | null;
  runningTaskCount: number;
  runningLockCount: number;
  runningLocks: BusinessLockSummary[];
}

export interface DatabaseBackupItem {
  name: string;
  sizeBytes: number;
  createdAt: number;
  containsSecrets: boolean;
}

export interface DatabaseTableInfo {
  name: string;
  rowCount: number;
  protected: boolean;
  module: string;
}

export interface DatabaseManagementInfoResult {
  info: DatabaseManagementInfo;
}

export interface DatabaseBackupListResult {
  backups: DatabaseBackupItem[];
}

export interface DatabaseExportResult {
  backup: DatabaseBackupItem;
  containsSecrets: boolean;
}

export interface DatabaseImportPayload {
  backupName: string;
  confirmText: string;
}

export interface DatabaseImportResult {
  importedBackupName: string;
  autoBackupName: string;
  info: DatabaseManagementInfo;
}

export interface DatabaseTableListResult {
  tables: DatabaseTableInfo[];
}

export interface DatabaseClearTablePayload {
  tableName: string;
  confirmText: string;
}

export interface DatabaseClearTableResult {
  tableName: string;
  deleted: number;
  autoBackupName: string;
  tables: DatabaseTableInfo[];
}

export interface DatabaseClearAllPayload {
  confirmText: string;
}

export interface DatabaseClearAllResult {
  autoBackupName: string;
  info: DatabaseManagementInfo;
  tables: DatabaseTableInfo[];
}

export interface DatabaseRunningTasksResult {
  runningTaskCount: number;
  runningLockCount: number;
  runningLocks: BusinessLockSummary[];
}
