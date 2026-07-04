export type FileManagementDirectoryGroup = 'common' | 'diagnostic' | 'advanced';

export interface FileManagementDirectoryItem {
  key: string;
  name: string;
  description: string;
  path: string;
  exists: boolean;
  group: FileManagementDirectoryGroup;
  autoCreate: boolean;
}

export type FileRuntimeMode = 'development' | 'production';
export type FileRuntimeSource = 'custom-env' | 'dev-temp' | 'electron-user-data';

export interface FileRuntimeInfo {
  userData: string;
  workspaceRoot: string;
  mode: FileRuntimeMode;
  source: FileRuntimeSource;
  insideWorkspace: boolean;
  cleanableKeys: string[];
  recoverableKeys: string[];
  protectedKeys: string[];
}

export interface FileManagementListResult {
  directories: FileManagementDirectoryItem[];
  runtime: FileRuntimeInfo;
}

export interface FileManagementOpenPayload {
  key: string;
}

export interface FileManagementOpenResult {
  directory: FileManagementDirectoryItem;
  created: boolean;
}

export type FileLifecycleIssueType = 'missingReference' | 'orphanProjectFile' | 'cacheFile' | 'tempFile';

export interface FileLifecycleIssue {
  type: FileLifecycleIssueType;
  root: 'project' | 'cache' | 'temp';
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  canDelete: boolean;
  reason: string;
  sourceTable?: string;
  sourceId?: number;
}

export interface FileLifecycleSummary {
  referencedFileCount: number;
  missingReferenceCount: number;
  orphanProjectFileCount: number;
  cacheFileCount: number;
  tempFileCount: number;
  referencedBytes: number;
  orphanBytes: number;
  cacheBytes: number;
  tempBytes: number;
}

export interface FileLifecycleDiagnoseResult {
  summary: FileLifecycleSummary;
  issues: FileLifecycleIssue[];
}

export interface FileLifecycleCleanupPayload {
  includeOrphans?: boolean;
  includeCache?: boolean;
  includeTemp?: boolean;
}

export interface FileLifecycleCleanupResult {
  deletedCount: number;
  freedBytes: number;
  skippedCount: number;
  diagnose: FileLifecycleDiagnoseResult;
}
