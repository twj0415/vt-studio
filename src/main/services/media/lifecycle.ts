import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type {
  FileLifecycleCleanupPayload,
  FileLifecycleCleanupResult,
  FileLifecycleDiagnoseResult,
  FileLifecycleIssue,
  FileLifecycleSummary,
} from '@shared/types/file-management';
import { getDatabase } from '../database';
import { getRuntimeDirectories, safeJoin } from '../file-system';

interface ReferencedMediaRow {
  tableName: string;
  id: number;
  relativePath: string;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizeRelativePath(root: string, filePath: string): string {
  return toPosixPath(relative(root, filePath));
}

function isManagedProjectMedia(relativePath: string): boolean {
  return /^\d+\/(?:assets|production|generated)\//.test(relativePath);
}

function tableExists(tableName: string): boolean {
  const row = getDatabase()
    .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);
  return Boolean(row);
}

function readReferencedMedia(): ReferencedMediaRow[] {
  const database = getDatabase();
  const rows: ReferencedMediaRow[] = [];

  if (tableExists('asset_media')) {
    rows.push(
      ...database
        .prepare<[], { id: number; relative_path: string }>("SELECT id, relative_path FROM asset_media WHERE relative_path IS NOT NULL AND TRIM(relative_path) <> ''")
        .all()
        .map((row) => ({ tableName: 'asset_media', id: row.id, relativePath: toPosixPath(row.relative_path) }))
    );
  }

  if (tableExists('production_storyboards')) {
    rows.push(
      ...database
        .prepare<[], { id: number; relative_path: string }>("SELECT id, relative_path FROM production_storyboards WHERE relative_path IS NOT NULL AND TRIM(relative_path) <> ''")
        .all()
        .map((row) => ({ tableName: 'production_storyboards', id: row.id, relativePath: toPosixPath(row.relative_path) }))
    );
  }

  if (tableExists('production_videos')) {
    rows.push(
      ...database
        .prepare<[], { id: number; relative_path: string }>("SELECT id, relative_path FROM production_videos WHERE relative_path IS NOT NULL AND TRIM(relative_path) <> ''")
        .all()
        .map((row) => ({ tableName: 'production_videos', id: row.id, relativePath: toPosixPath(row.relative_path) }))
    );
  }

  return rows;
}

function walkFiles(root: string): Array<{ absolutePath: string; relativePath: string; sizeBytes: number }> {
  if (!existsSync(root)) {
    return [];
  }

  const result: Array<{ absolutePath: string; relativePath: string; sizeBytes: number }> = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = safeJoin(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const stat = statSync(absolutePath);
      result.push({
        absolutePath,
        relativePath: normalizeRelativePath(root, absolutePath),
        sizeBytes: stat.size,
      });
    }
  }

  return result;
}

function createSummary(): FileLifecycleSummary {
  return {
    referencedFileCount: 0,
    missingReferenceCount: 0,
    orphanProjectFileCount: 0,
    cacheFileCount: 0,
    tempFileCount: 0,
    referencedBytes: 0,
    orphanBytes: 0,
    cacheBytes: 0,
    tempBytes: 0,
  };
}

export function diagnoseFileLifecycle(): FileLifecycleDiagnoseResult {
  const directories = getRuntimeDirectories();
  const summary = createSummary();
  const issues: FileLifecycleIssue[] = [];
  const referenced = readReferencedMedia();
  const referencedPaths = new Set(referenced.map((row) => row.relativePath));

  for (const row of referenced) {
    const absolutePath = safeJoin(directories.projects, row.relativePath);
    if (!existsSync(absolutePath)) {
      summary.missingReferenceCount += 1;
      issues.push({
        type: 'missingReference',
        root: 'project',
        relativePath: row.relativePath,
        absolutePath,
        sizeBytes: 0,
        canDelete: false,
        reason: '数据库记录指向的项目素材文件不存在',
        sourceTable: row.tableName,
        sourceId: row.id,
      });
      continue;
    }

    const stat = statSync(absolutePath);
    if (stat.isFile()) {
      summary.referencedFileCount += 1;
      summary.referencedBytes += stat.size;
    }
  }

  for (const file of walkFiles(directories.projects)) {
    const relativePath = toPosixPath(file.relativePath);
    if (!isManagedProjectMedia(relativePath) || referencedPaths.has(relativePath)) {
      continue;
    }

    summary.orphanProjectFileCount += 1;
    summary.orphanBytes += file.sizeBytes;
    issues.push({
      type: 'orphanProjectFile',
      root: 'project',
      relativePath,
      absolutePath: file.absolutePath,
      sizeBytes: file.sizeBytes,
      canDelete: true,
      reason: '项目素材目录里存在文件，但数据库没有任何业务对象引用它',
    });
  }

  for (const file of walkFiles(directories.cache)) {
    summary.cacheFileCount += 1;
    summary.cacheBytes += file.sizeBytes;
    issues.push({
      type: 'cacheFile',
      root: 'cache',
      relativePath: toPosixPath(file.relativePath),
      absolutePath: file.absolutePath,
      sizeBytes: file.sizeBytes,
      canDelete: true,
      reason: '缓存文件，可按需清理；缩略图后续会重新生成',
    });
  }

  for (const file of walkFiles(directories.temp)) {
    summary.tempFileCount += 1;
    summary.tempBytes += file.sizeBytes;
    issues.push({
      type: 'tempFile',
      root: 'temp',
      relativePath: toPosixPath(file.relativePath),
      absolutePath: file.absolutePath,
      sizeBytes: file.sizeBytes,
      canDelete: true,
      reason: '临时文件，可清理',
    });
  }

  return {
    summary,
    issues,
  };
}

function shouldDeleteIssue(issue: FileLifecycleIssue, payload: FileLifecycleCleanupPayload): boolean {
  if (!issue.canDelete) {
    return false;
  }
  if (issue.type === 'orphanProjectFile') {
    return payload.includeOrphans === true;
  }
  if (issue.type === 'cacheFile') {
    return payload.includeCache === true;
  }
  if (issue.type === 'tempFile') {
    return payload.includeTemp === true;
  }
  return false;
}

export function cleanupFileLifecycle(payload: FileLifecycleCleanupPayload): FileLifecycleCleanupResult {
  const before = diagnoseFileLifecycle();
  let deletedCount = 0;
  let freedBytes = 0;
  let skippedCount = 0;

  for (const issue of before.issues) {
    if (!shouldDeleteIssue(issue, payload)) {
      skippedCount += 1;
      continue;
    }

    try {
      const targetPath = resolve(issue.absolutePath);
      unlinkSync(targetPath);
      deletedCount += 1;
      freedBytes += issue.sizeBytes;
    } catch {
      skippedCount += 1;
    }
  }

  return {
    deletedCount,
    freedBytes,
    skippedCount,
    diagnose: diagnoseFileLifecycle(),
  };
}
