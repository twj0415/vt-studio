import { copyFileSync, existsSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { dialog, shell } from 'electron';
import { VT_STATUS } from '@shared/constants/status';
import type {
  ModelTestFilePayload,
  ModelTestOpenFileResult,
  ModelTestSaveFileResult,
} from '@shared/types/model-config';
import { assertInsideRoot, getRuntimeDirectories } from '../file-system';
import { createError } from '../result';

function resolveModelTestFile(payload: ModelTestFilePayload): string {
  if (!payload.filePath?.trim()) {
    throw createError(VT_STATUS.INVALID_PARAMS, '模型测试文件路径不能为空');
  }

  const root = getRuntimeDirectories().modelTest;
  let filePath: string;
  try {
    filePath = assertInsideRoot(payload.filePath, root);
  } catch (error) {
    throw createError(VT_STATUS.FILE_PATH_ESCAPE, '模型测试文件路径越界', error);
  }

  if (!existsSync(filePath)) {
    throw createError(VT_STATUS.FILE_NOT_FOUND, '模型测试文件不存在');
  }

  if (!statSync(filePath).isFile()) {
    throw createError(VT_STATUS.FILE_PATH_INVALID, '模型测试路径不是文件');
  }

  return filePath;
}

function getSaveFilters(filePath: string): Electron.FileFilter[] {
  const ext = extname(filePath).replace(/^\./, '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return [{ name: 'Image', extensions: [ext] }];
  }
  if (['mp4', 'webm', 'mov'].includes(ext)) {
    return [{ name: 'Video', extensions: [ext] }];
  }

  return [{ name: 'File', extensions: [ext || '*'] }];
}

export function openModelTestFileLocation(payload: ModelTestFilePayload): ModelTestOpenFileResult {
  const filePath = resolveModelTestFile(payload);
  shell.showItemInFolder(filePath);

  return { filePath };
}

export async function saveModelTestFileAs(payload: ModelTestFilePayload): Promise<ModelTestSaveFileResult> {
  const sourcePath = resolveModelTestFile(payload);
  const result = await dialog.showSaveDialog({
    defaultPath: basename(sourcePath),
    filters: getSaveFilters(sourcePath),
  });

  if (result.canceled || !result.filePath) {
    return {
      sourcePath,
      savedPath: null,
    };
  }

  copyFileSync(sourcePath, result.filePath);

  return {
    sourcePath,
    savedPath: result.filePath,
  };
}
