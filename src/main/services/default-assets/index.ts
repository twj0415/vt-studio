import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { getRuntimeDirectories, safeJoin } from '../file-system';
import { logger } from '../logger';
import { DEFAULT_RESOURCE_TARGETS, getDefaultDataRoot } from './registry';

export interface DefaultAssetSyncResult {
  available: boolean;
  sourceRoot: string;
  copied: number;
  skipped: number;
  missingTargets: string[];
}

function copyDirectoryMissingOnly(sourceRoot: string, targetRoot: string): { copied: number; skipped: number } {
  let copied = 0;
  let skipped = 0;

  if (!existsSync(sourceRoot)) {
    return { copied, skipped };
  }

  mkdirSync(targetRoot, { recursive: true });

  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = join(sourceRoot, entry.name);
    const relativePath = relative(sourceRoot, sourcePath);
    const targetPath = safeJoin(targetRoot, relativePath);

    if (entry.isDirectory()) {
      const child = copyDirectoryMissingOnly(sourcePath, targetPath);
      copied += child.copied;
      skipped += child.skipped;
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (existsSync(targetPath) && statSync(targetPath).isFile()) {
      skipped += 1;
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    copied += 1;
  }

  return { copied, skipped };
}

export function syncDefaultAssets(): DefaultAssetSyncResult {
  const sourceRoot = getDefaultDataRoot();
  const directories = getRuntimeDirectories();
  const result: DefaultAssetSyncResult = {
    available: existsSync(sourceRoot),
    sourceRoot,
    copied: 0,
    skipped: 0,
    missingTargets: [],
  };

  if (!result.available) {
    logger.warn('默认资源', '未找到内置默认资源目录，已跳过同步');
    logger.detail('默认资源', '默认资源目录缺失', { sourceRoot });
    return result;
  }

  for (const target of DEFAULT_RESOURCE_TARGETS) {
    const sourcePath = join(sourceRoot, target.sourceRelativePath);
    if (!existsSync(sourcePath)) {
      result.missingTargets.push(target.id);
      continue;
    }

    const current = copyDirectoryMissingOnly(sourcePath, directories[target.runtimeKey]);
    result.copied += current.copied;
    result.skipped += current.skipped;
  }

  logger.info('默认资源', `已同步 ${result.copied} 个文件，跳过 ${result.skipped} 个已存在文件`);
  if (result.missingTargets.length > 0) {
    logger.warn('默认资源', `缺少默认资源分类：${result.missingTargets.join('、')}`);
  }
  logger.detail('默认资源', '默认资源同步详情', result);

  return result;
}
