import { statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { app, shell } from 'electron';
import { VT_STATUS } from '@shared/constants/status';
import type {
  FileLifecycleCleanupPayload,
  FileLifecycleCleanupResult,
  FileLifecycleDiagnoseResult,
  FileManagementDirectoryGroup,
  FileManagementDirectoryItem,
  FileManagementListResult,
  FileManagementOpenPayload,
  FileManagementOpenResult,
  FileRuntimeInfo,
} from '@shared/types/file-management';
import { ensureDirectory, pathExists } from '../file-system/operations';
import { getRuntimeDirectories } from '../file-system/paths';
import { cleanupFileLifecycle, diagnoseFileLifecycle } from '../media/lifecycle';
import { createError } from '../result';

interface DirectoryDefinition {
  key: string;
  name: string;
  description: string;
  group: FileManagementDirectoryGroup;
  autoCreate: boolean;
  resolvePath: () => string;
}

const DIRECTORY_DEFINITIONS: DirectoryDefinition[] = [
  {
    key: 'projects',
    name: '项目目录',
    description: '项目业务文件和后续素材产出会从这里分项目落位。',
    group: 'common',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().projects,
  },
  {
    key: 'exports',
    name: '导出目录',
    description: '数据库备份、导出结果和后续交付文件统一放这里。',
    group: 'common',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().exports,
  },
  {
    key: 'logs',
    name: '日志目录',
    description: 'main 日志和排错信息在这里查看。',
    group: 'diagnostic',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().logs,
  },
  {
    key: 'cache',
    name: '缓存目录',
    description: '缩略图、模型测试和其它受控缓存文件放这里。',
    group: 'diagnostic',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().cache,
  },
  {
    key: 'temp',
    name: '临时目录',
    description: '运行过程中的临时文件和中间产物放这里。',
    group: 'diagnostic',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().temp,
  },
  {
    key: 'models',
    name: '本地模型目录',
    description: '本地 ONNX 模型和后续离线模型文件在这里维护。',
    group: 'advanced',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().models,
  },
  {
    key: 'modelPrompt',
    name: '模型提示词目录',
    description: '参考项目的视频模型专用提示词模板会同步到这里。',
    group: 'advanced',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().modelPrompt,
  },
  {
    key: 'skills',
    name: 'Skill 目录',
    description: 'Skill 文件和运行时技能资源目录。',
    group: 'advanced',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().skills,
  },
  {
    key: 'assets',
    name: '默认素材目录',
    description: '内置片尾等全局默认素材会同步到这里。',
    group: 'advanced',
    autoCreate: true,
    resolvePath: () => getRuntimeDirectories().assets,
  },
];

function isInsideDirectory(targetPath: string, rootPath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(targetPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function getRuntimeSource(): FileRuntimeInfo['source'] {
  if (process.env.VT_STUDIO_USER_DATA) {
    return 'custom-env';
  }

  return app.isPackaged ? 'electron-user-data' : 'dev-temp';
}

function getRuntimeInfo(): FileRuntimeInfo {
  const directories = getRuntimeDirectories();
  const workspaceRoot = process.cwd();

  return {
    userData: directories.userData,
    workspaceRoot,
    mode: app.isPackaged ? 'production' : 'development',
    source: getRuntimeSource(),
    insideWorkspace: isInsideDirectory(directories.userData, workspaceRoot),
    cleanableKeys: ['cache', 'temp'],
    recoverableKeys: ['modelPrompt', 'skills', 'assets'],
    protectedKeys: ['projects', 'exports', 'models', 'logs'],
  };
}

function toDirectoryItem(definition: DirectoryDefinition): FileManagementDirectoryItem {
  const directoryPath = definition.resolvePath();

  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    path: directoryPath,
    exists: pathExists(directoryPath),
    group: definition.group,
    autoCreate: definition.autoCreate,
  };
}

function getDirectoryDefinition(key: string): DirectoryDefinition {
  const normalizedKey = key.trim();
  const definition = DIRECTORY_DEFINITIONS.find((item) => item.key === normalizedKey);
  if (!definition) {
    throw createError(VT_STATUS.INVALID_PARAMS, '目录 key 无效');
  }

  return definition;
}

function ensureDirectoryReady(definition: DirectoryDefinition): { path: string; created: boolean } {
  const directoryPath = definition.resolvePath();
  const exists = pathExists(directoryPath);

  if (!exists && !definition.autoCreate) {
    throw createError(VT_STATUS.FILE_NOT_FOUND, '目录不存在');
  }

  if (!exists) {
    ensureDirectory(directoryPath);
  }

  if (!statSync(directoryPath).isDirectory()) {
    throw createError(VT_STATUS.FILE_ERROR, '目标路径不是目录');
  }

  return {
    path: directoryPath,
    created: !exists,
  };
}

export function listOpenableDirectories(): FileManagementListResult {
  return {
    directories: DIRECTORY_DEFINITIONS.map(toDirectoryItem),
    runtime: getRuntimeInfo(),
  };
}

export async function openDirectory(payload: FileManagementOpenPayload): Promise<FileManagementOpenResult> {
  const definition = getDirectoryDefinition(payload.key);
  const { created } = ensureDirectoryReady(definition);
  const directory = toDirectoryItem(definition);
  const openResult = await shell.openPath(directory.path);

  if (openResult) {
    throw createError(VT_STATUS.FILE_ERROR, `打开目录失败：${openResult}`);
  }

  return {
    directory,
    created,
  };
}

export function diagnoseManagedFiles(): FileLifecycleDiagnoseResult {
  return diagnoseFileLifecycle();
}

export function cleanupManagedFiles(payload: FileLifecycleCleanupPayload): FileLifecycleCleanupResult {
  return cleanupFileLifecycle(payload);
}
