import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { app, shell } from 'electron';
import {
  ASSET_TYPES,
  GENERATION_TASK_STATUSES,
  PROJECT_IMAGE_QUALITY_VALUES,
  PROJECT_SOURCE_TYPE_VALUES,
  PROJECT_TEMPLATE_TYPES,
  PROJECT_TEMPLATE_TYPE_VALUES,
  PROJECT_VIDEO_RATIO_VALUES,
  SCRIPT_EXTRACT_STATUSES,
  SOURCE_EVENT_STATUSES,
  TASK_STATUSES,
  VIDEO_GENERATION_MODE_LABELS_ZH,
} from '@shared/constants/dictionaries';
import { serializeVideoMode } from '@shared/constants/model-capabilities';
import { getProjectManualRootName, getProjectManualTabs, type ProjectManualTabDefinition } from '@shared/constants/manuals';
import { VT_STATUS } from '@shared/constants/status';
import { sanitizeSensitiveText } from '@shared/security/secrets';
import type {
  ProjectCurrentContext,
  ProjectClearRecentPayload,
  ProjectClearRecentResult,
  ProjectDeleteImpactPayload,
  ProjectDeleteImpactResult,
  ProjectDeletePayload,
  ProjectDeleteResult,
  ProjectFlowStatsPayload,
  ProjectFlowStatsResult,
  ProjectImageQuality,
  ProjectManualDeletePayload,
  ProjectManualDeleteResult,
  ProjectManualDetail,
  ProjectManualGetPayload,
  ProjectManualKind,
  ProjectManualSavePayload,
  ProjectManualSaveResult,
  ProjectManualSummary,
  ProjectExportPackagePayload,
  ProjectExportPackageResult,
  ProjectFlowFailedTaskSummary,
  ProjectModelOption,
  ProjectImportPackagePayload,
  ProjectImportPackageResult,
  ProjectOpenPackagePayload,
  ProjectOpenPackageResult,
  ProjectPackageFileSummary,
  ProjectPackageSummary,
  ProjectPackageTableSummary,
  ProjectOpenPayload,
  ProjectOpenResult,
  ProjectPageStateResult,
  ProjectRecentContext,
  ProjectRestoreRecentResult,
  ProjectRouteName,
  ProjectSavePayload,
  ProjectSaveResult,
  ProjectSourceType,
  ProjectTemplateType,
  ProjectUpdateRecentRoutePayload,
  ProjectUpdateRecentRouteResult,
  ProjectSummary,
  ProjectVideoModeOption,
  ProjectVideoRatio,
} from '@shared/types/project';
import type { VendorVideoModel } from '@shared/types/vendor';
import { createMediaUrl } from './media/url';
import { ensureDefaultProductionContent } from './production';
import { getApiConnectionList } from './settings/model-config';
import { getDatabase, withTransaction } from './database';
import {
  deleteManagedDirectory,
  ensureDirectory,
  fileExists,
  getRuntimeDirectories,
  pathExists,
  resolveProjectRoot,
  safeJoin,
  writeManagedFile,
} from './file-system';
import { getVendorRow, parseModelList } from './model/storage';
import { createError } from './result';
import { assertNoBusinessLocks, countRunningTaskRecords, listBusinessLocks } from './task/locks';

const IMAGE_QUALITY_OPTIONS: ProjectImageQuality[] = [...PROJECT_IMAGE_QUALITY_VALUES];
const VIDEO_RATIO_OPTIONS: ProjectVideoRatio[] = [...PROJECT_VIDEO_RATIO_VALUES];
const PROJECT_PACKAGE_VERSION = 1;
const PROJECT_PACKAGE_APP_ID = 'vt-studio';
const PROJECT_PACKAGE_DIRECTORY = 'project-packages';
const PROJECT_PACKAGE_EXTENSION = '.vtproject';
const PROJECT_PACKAGE_TABLE_ORDER = [
  'projects',
  'visual_manuals',
  'director_manuals',
  'source_chapters',
  'agent_work_data',
  'scripts',
  'assets',
  'asset_media',
  'asset_audio_links',
  'script_asset_links',
  'production_contents',
  'production_resource_links',
  'production_workspaces',
  'production_video_tracks',
  'production_storyboards',
  'production_storyboard_asset_links',
  'production_image_flows',
  'production_videos',
  'memories',
] as const;
const PROJECT_PACKAGE_FILE_FOLDERS = ['source', 'assets', 'generated', 'production'] as const;
const PROJECT_PACKAGE_EXCLUDED = [
  '全局供应商 API Key',
  '登录态和本地用户会话',
  '任务运行记录',
  '数据库完整备份',
  '缓存、缩略图和临时文件',
] as const;

type ManualRow = {
  id: number;
  name: string;
  path: string;
  cover_relative_path: string | null;
  tabs_json: string;
  created_at: number;
  updated_at: number;
};

type ProjectRow = {
  id: number;
  source_type: ProjectSourceType;
  name: string;
  genre: string;
  description: string;
  image_model_id: string;
  image_quality: ProjectImageQuality;
  video_model_id: string;
  video_mode: string;
  video_ratio: ProjectVideoRatio;
  visual_manual_id: number;
  director_manual_id: number;
  workspace_path: string;
  created_at: number;
  updated_at: number;
  visual_manual_name: string | null;
  director_manual_name: string | null;
};

type ManualTabConfig = ProjectManualTabDefinition;
type CountParam = string | number;
type JsonRow = Record<string, unknown>;

interface ProjectFailedTaskSummaryRow {
  id: number;
  category: string;
  related_objects: string | null;
  model_name: string | null;
  description: string | null;
  error_reason: string | null;
  updated_at: number;
}

interface ProjectPackageManifest {
  app: typeof PROJECT_PACKAGE_APP_ID;
  packageVersion: number;
  packageType: 'directory';
  exportedAt: number;
  appVersion: string;
  sourceProjectId: number;
  projectName: string;
  tableRows: ProjectPackageTableSummary[];
  files: ProjectPackageFileSummary[];
  excluded: string[];
}

interface ProjectPackageDatabase {
  tableOrder: string[];
  tables: Record<string, JsonRow[]>;
}

const RECENT_PROJECT_SETTING_KEY = 'recentProject.v1';
const PROJECT_ROUTE_NAMES: ProjectRouteName[] = [
  'project-overview',
  'novel',
  'assets',
  'corner-scape',
  'production',
  'export',
];
const DEFAULT_PROJECT_TEMPLATE_TYPE = PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA;

interface StoredRecentProject {
  projectId: number;
  projectName: string;
  templateType: ProjectTemplateType;
  sourceType: ProjectSourceType;
  lastRoute: ProjectRouteName;
  openedAt: number;
  updatedAt: number;
}

function getVisualManualRoot(): string {
  return ensureDirectory(join(getRuntimeDirectories().skills, getProjectManualRootName('visual')));
}

function getDirectorManualRoot(): string {
  return ensureDirectory(join(getRuntimeDirectories().skills, getProjectManualRootName('director')));
}

function getManualRoot(kind: ProjectManualKind): string {
  return kind === 'visual' ? getVisualManualRoot() : getDirectorManualRoot();
}

function getManualTableName(kind: ProjectManualKind): 'visual_manuals' | 'director_manuals' {
  return kind === 'visual' ? 'visual_manuals' : 'director_manuals';
}

function getManualTabs(kind: ProjectManualKind): readonly ManualTabConfig[] {
  return getProjectManualTabs(kind);
}

function assertProjectTemplateType(value: unknown): ProjectTemplateType {
  if (PROJECT_TEMPLATE_TYPE_VALUES.includes(value as ProjectTemplateType)) {
    return value as ProjectTemplateType;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '作品类型无效');
}

function assertImageQuality(value: string): ProjectImageQuality {
  if (IMAGE_QUALITY_OPTIONS.includes(value as ProjectImageQuality)) {
    return value as ProjectImageQuality;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '图片质量无效');
}

function assertVideoRatio(value: string): ProjectVideoRatio {
  if (VIDEO_RATIO_OPTIONS.includes(value as ProjectVideoRatio)) {
    return value as ProjectVideoRatio;
  }

  throw createError(VT_STATUS.INVALID_PARAMS, '视频比例无效');
}

function assertSafeDirectoryName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || basename(normalized) !== normalized || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}只能包含字母、数字、下划线和中划线`);
  }

  return normalized;
}

function assertNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, `${label}不能为空`);
  }

  return normalized;
}

function tableExists(tableName: string): boolean {
  const row = getDatabase()
    .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);

  return Boolean(row);
}

function countRows(tableName: string, whereSql: string, params: CountParam[] = []): number {
  if (!tableExists(tableName)) {
    return 0;
  }

  const row = getDatabase()
    .prepare<CountParam[], { count: number }>(`SELECT COUNT(*) as count FROM ${tableName} WHERE ${whereSql}`)
    .get(...params);

  return row?.count ?? 0;
}

function listProjectFailedTaskSummaries(projectId: number, limit = 3): ProjectFlowFailedTaskSummary[] {
  if (!tableExists('tasks')) {
    return [];
  }

  const rows = getDatabase()
    .prepare<[number, string, number], ProjectFailedTaskSummaryRow>(
      `
      SELECT id, category, related_objects, model_name, description, error_reason, updated_at
      FROM tasks
      WHERE project_id = ? AND status = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
      `,
    )
    .all(projectId, TASK_STATUSES.FAILED, limit);

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    relatedObjects: row.related_objects,
    modelName: row.model_name,
    description: row.description,
    errorReason: row.error_reason ? sanitizeSensitiveText(row.error_reason) : null,
    updatedAt: row.updated_at,
  }));
}

function readTableRows(tableName: string, whereSql: string, params: Array<string | number> = []): JsonRow[] {
  if (!tableExists(tableName)) {
    return [];
  }

  return getDatabase().prepare<Array<string | number>, JsonRow>(`SELECT * FROM ${tableName} WHERE ${whereSql}`).all(...params);
}

function readProjectTableRows(tableName: string, projectId: number): JsonRow[] {
  return readTableRows(tableName, 'project_id = ?', [projectId]);
}

function idsFromRows(rows: JsonRow[]): number[] {
  return rows
    .map((row) => Number(row.id))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function readRowsByIds(tableName: string, columnName: string, ids: number[]): JsonRow[] {
  if (!tableExists(tableName) || ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => '?').join(', ');
  return getDatabase()
    .prepare<number[], JsonRow>(`SELECT * FROM ${tableName} WHERE ${columnName} IN (${placeholders})`)
    .all(...ids);
}

function readPackageProjectRows(projectId: number): ProjectPackageDatabase {
  const project = getProjectRowById(projectId);
  const tables: Record<string, JsonRow[]> = {};

  tables.projects = readTableRows('projects', 'id = ?', [projectId]);
  tables.visual_manuals = readTableRows('visual_manuals', 'id = ?', [project.visual_manual_id]);
  tables.director_manuals = readTableRows('director_manuals', 'id = ?', [project.director_manual_id]);
  tables.source_chapters = readProjectTableRows('source_chapters', projectId);
  tables.agent_work_data = readProjectTableRows('agent_work_data', projectId);
  tables.scripts = readProjectTableRows('scripts', projectId);
  tables.assets = readProjectTableRows('assets', projectId);
  tables.asset_media = readProjectTableRows('asset_media', projectId);
  tables.production_contents = readProjectTableRows('production_contents', projectId);
  tables.production_workspaces = readProjectTableRows('production_workspaces', projectId);
  tables.production_video_tracks = readProjectTableRows('production_video_tracks', projectId);
  tables.production_storyboards = readProjectTableRows('production_storyboards', projectId);
  tables.production_image_flows = readProjectTableRows('production_image_flows', projectId);
  tables.production_videos = readProjectTableRows('production_videos', projectId);
  tables.memories = readTableRows('memories', 'isolation_key LIKE ?', [`${projectId}:%`]);

  const scriptIds = idsFromRows(tables.scripts);
  const assetIds = idsFromRows(tables.assets);
  const contentIds = idsFromRows(tables.production_contents);
  const storyboardIds = idsFromRows(tables.production_storyboards);

  tables.asset_audio_links = assetIds.length
    ? readRowsByIds('asset_audio_links', 'asset_id', assetIds).filter((row) => assetIds.includes(Number(row.audio_asset_id)))
    : [];
  tables.script_asset_links = scriptIds.length
    ? readRowsByIds('script_asset_links', 'script_id', scriptIds).filter((row) => assetIds.includes(Number(row.asset_id)))
    : [];
  tables.production_resource_links = contentIds.length
    ? readRowsByIds('production_resource_links', 'content_id', contentIds).filter((row) => assetIds.includes(Number(row.asset_id)))
    : [];
  tables.production_storyboard_asset_links = storyboardIds.length
    ? readRowsByIds('production_storyboard_asset_links', 'storyboard_id', storyboardIds).filter((row) => assetIds.includes(Number(row.asset_id)))
    : [];

  return {
    tableOrder: [...PROJECT_PACKAGE_TABLE_ORDER],
    tables,
  };
}

function summarizePackageTables(database: ProjectPackageDatabase): ProjectPackageTableSummary[] {
  return PROJECT_PACKAGE_TABLE_ORDER.map((tableName) => ({
    tableName,
    rowCount: database.tables[tableName]?.length ?? 0,
  }));
}

function sanitizePackageName(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-');
  return (normalized || 'project').slice(0, 80);
}

function formatTimestampForFileName(value: number): string {
  return new Date(value).toISOString().replace(/[:.]/g, '-');
}

function writeJsonFile(root: string, relativePath: string, value: unknown): void {
  writeManagedFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonFile<T>(root: string, relativePath: string): T {
  const filePath = safeJoin(root, relativePath);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function copyDirectoryContents(sourceRoot: string, targetRoot: string): ProjectPackageFileSummary {
  const folder = basename(targetRoot);
  const summary: ProjectPackageFileSummary = {
    folder,
    fileCount: 0,
    sizeBytes: 0,
  };

  if (!existsSync(sourceRoot)) {
    return summary;
  }

  const sourceStat = statSync(sourceRoot);
  if (!sourceStat.isDirectory()) {
    return summary;
  }

  const stack = [''];
  mkdirSync(targetRoot, { recursive: true });

  while (stack.length > 0) {
    const currentRelative = stack.pop()!;
    const currentSource = currentRelative ? join(sourceRoot, currentRelative) : sourceRoot;

    for (const entry of readdirSync(currentSource, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const entryRelative = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;
      const sourcePath = join(sourceRoot, entryRelative);
      const targetPath = safeJoin(targetRoot, entryRelative);

      if (entry.isDirectory()) {
        mkdirSync(targetPath, { recursive: true });
        stack.push(entryRelative);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
      const stat = statSync(sourcePath);
      summary.fileCount += 1;
      summary.sizeBytes += stat.size;
    }
  }

  return summary;
}

function copyProjectFilesToPackage(projectId: number, packagePath: string): ProjectPackageFileSummary[] {
  const projectRoot = resolveProjectRoot(String(projectId));
  const result: ProjectPackageFileSummary[] = [];

  for (const folder of PROJECT_PACKAGE_FILE_FOLDERS) {
    result.push(copyDirectoryContents(join(projectRoot, folder), safeJoin(packagePath, folder)));
  }

  return result;
}

function validateProjectPackageFiles(projectId: number): void {
  const referencedRows = [
    ...readProjectTableRows('asset_media', projectId).map((row) => ({ tableName: 'asset_media', id: row.id, relativePath: row.relative_path })),
    ...readProjectTableRows('production_storyboards', projectId).map((row) => ({ tableName: 'production_storyboards', id: row.id, relativePath: row.relative_path })),
    ...readProjectTableRows('production_videos', projectId).map((row) => ({ tableName: 'production_videos', id: row.id, relativePath: row.relative_path })),
  ];
  const missing = referencedRows.filter((row) => {
    if (typeof row.relativePath !== 'string' || !row.relativePath.trim()) {
      return false;
    }

    return !fileExists(safeJoin(getRuntimeDirectories().projects, row.relativePath));
  });

  if (missing.length > 0) {
    const first = missing[0];
    throw createError(VT_STATUS.FILE_NOT_FOUND, `项目素材缺失，无法导出项目包：${first.tableName}#${String(first.id)} ${String(first.relativePath)}`);
  }
}

function copyPackageFilesToProject(packagePath: string, projectId: number): ProjectPackageFileSummary[] {
  const projectRoot = ensureProjectDirectory(projectId);
  const result: ProjectPackageFileSummary[] = [];

  for (const folder of PROJECT_PACKAGE_FILE_FOLDERS) {
    result.push(copyDirectoryContents(safeJoin(packagePath, folder), safeJoin(projectRoot, folder)));
  }

  return result;
}

function copyManualSnapshotToPackage(kind: ProjectManualKind, manualPath: string, packagePath: string): ProjectPackageFileSummary {
  const sourceRoot = safeJoin(getManualRoot(kind), manualPath);
  const targetRoot = safeJoin(packagePath, `manual_snapshots/${kind}/${manualPath}`);
  return copyDirectoryContents(sourceRoot, targetRoot);
}

function copyManualSnapshotFromPackage(sourcePath: string, targetPath: string): ProjectPackageFileSummary {
  return copyDirectoryContents(sourcePath, targetPath);
}

function createProjectPackageSummary(projectName: string, packageVersion: number, tableRows: ProjectPackageTableSummary[], files: ProjectPackageFileSummary[]): ProjectPackageSummary {
  return {
    projectName,
    packageVersion,
    tableRows,
    files,
    excluded: [...PROJECT_PACKAGE_EXCLUDED],
  };
}

function getPackageRoot(): string {
  return ensureDirectory(join(getRuntimeDirectories().exports, PROJECT_PACKAGE_DIRECTORY));
}

function assertProjectPackagePath(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目包路径不能为空');
  }

  const packagePath = resolve(normalized);
  if (!existsSync(packagePath) || !statSync(packagePath).isDirectory()) {
    throw createError(VT_STATUS.FILE_NOT_FOUND, '项目包目录不存在');
  }

  if (!basename(packagePath).endsWith(PROJECT_PACKAGE_EXTENSION)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `项目包目录必须以 ${PROJECT_PACKAGE_EXTENSION} 结尾`);
  }

  if (!fileExists(safeJoin(packagePath, 'manifest.json')) || !fileExists(safeJoin(packagePath, 'database.json'))) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目包缺少 manifest.json 或 database.json');
  }

  return packagePath;
}

function assertProjectPackageManifest(manifest: ProjectPackageManifest): void {
  if (manifest.app !== PROJECT_PACKAGE_APP_ID || manifest.packageVersion !== PROJECT_PACKAGE_VERSION) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目包版本不兼容');
  }
}

function tableRows(packageDatabase: ProjectPackageDatabase, tableName: string): JsonRow[] {
  return packageDatabase.tables[tableName] ?? [];
}

function firstTableRow(packageDatabase: ProjectPackageDatabase, tableName: string): JsonRow {
  const row = tableRows(packageDatabase, tableName)[0];
  if (!row) {
    throw createError(VT_STATUS.INVALID_PARAMS, `项目包缺少 ${tableName} 数据`);
  }

  return row;
}

function tableColumns(tableName: string): string[] {
  if (!tableExists(tableName)) {
    throw createError(VT_STATUS.INVALID_PARAMS, `数据表不存在：${tableName}`);
  }

  return getDatabase()
    .prepare<[], { name: string }>(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row.name);
}

function insertJsonRow(tableName: string, row: JsonRow, excludedColumns: string[] = ['id']): number | null {
  const allowedColumns = new Set(tableColumns(tableName));
  const columns = Object.keys(row).filter((key) => allowedColumns.has(key) && !excludedColumns.includes(key) && row[key] !== undefined);
  if (columns.length === 0) {
    return null;
  }

  const placeholders = columns.map(() => '?').join(', ');
  const columnSql = columns.map((column) => `"${column}"`).join(', ');
  const result = getDatabase()
    .prepare(`INSERT INTO ${tableName} (${columnSql}) VALUES (${placeholders})`)
    .run(...columns.map((column) => row[column] as string | number | null));

  return Number(result.lastInsertRowid);
}

function updateRowById(tableName: string, id: number, values: JsonRow): void {
  const columns = Object.keys(values);
  if (columns.length === 0) {
    return;
  }

  const assignments = columns.map((column) => `"${column}" = ?`).join(', ');
  getDatabase()
    .prepare(`UPDATE ${tableName} SET ${assignments} WHERE id = ?`)
    .run(...columns.map((column) => values[column] as string | number | null), id);
}

function mapId(idMap: Map<number, number>, oldId: unknown): number | null {
  const numeric = Number(oldId);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return idMap.get(numeric) ?? null;
}

function remapProjectRelativePath(value: unknown, oldProjectId: number, newProjectId: number): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replaceAll(`${oldProjectId}/`, `${newProjectId}/`);
}

function createUniqueProjectName(baseName: string): string {
  const normalized = baseName.trim() || 'Imported Project';
  let candidate = normalized;
  let index = 1;

  while (getDatabase().prepare<[string], { id: number }>('SELECT id FROM projects WHERE name = ? LIMIT 1').get(candidate)) {
    candidate = `${normalized} 导入${index === 1 ? '' : index}`;
    index += 1;
  }

  return candidate;
}

function createUniqueManualPath(kind: ProjectManualKind, basePath: string): string {
  const normalized = assertSafeDirectoryName(basePath || `${kind}_manual`, kind === 'visual' ? '视觉手册目录名' : '导演手册目录名');
  const tableName = getManualTableName(kind);
  let candidate = normalized;
  let index = 1;

  while (
    getDatabase().prepare<[string], { id: number }>(`SELECT id FROM ${tableName} WHERE path = ? LIMIT 1`).get(candidate) ||
    pathExists(safeJoin(getManualRoot(kind), candidate))
  ) {
    candidate = `${normalized}_import_${index}`;
    index += 1;
  }

  return candidate;
}

function resolveImportedProjectModels(projectRow: JsonRow, warnings: string[]): { imageModelId: string; videoModelId: string; videoMode: string } {
  const imageModels = getDetailedModels('image');
  const videoModels = getDetailedModels('video');
  const originalImageModelId = String(projectRow.image_model_id ?? '');
  const originalVideoModelId = String(projectRow.video_model_id ?? '');
  const originalVideoMode = normalizeStoredVideoMode(String(projectRow.video_mode ?? ''));
  const imageModel = imageModels.find((item) => item.modelId === originalImageModelId) ?? imageModels[0];
  const videoModel = videoModels.find((item) => item.modelId === originalVideoModelId) ?? videoModels[0];

  if (!imageModel) {
    throw createError(VT_STATUS.MODEL_NOT_FOUND, '导入项目包前请先配置可用图片模型');
  }
  if (!videoModel) {
    throw createError(VT_STATUS.MODEL_NOT_FOUND, '导入项目包前请先配置可用视频模型');
  }

  if (imageModel.modelId !== originalImageModelId) {
    warnings.push('原项目图片模型在当前环境不可用，已映射到当前默认图片模型');
  }
  if (videoModel.modelId !== originalVideoModelId) {
    warnings.push('原项目视频模型在当前环境不可用，已映射到当前默认视频模型');
  }

  const videoMode = videoModel.modes?.some((item) => item.value === originalVideoMode)
    ? originalVideoMode
    : videoModel.modes?.[0]?.value ?? '';
  if (!videoMode) {
    throw createError(VT_STATUS.INVALID_PARAMS, '当前视频模型没有可用视频模式');
  }
  if (videoMode !== originalVideoMode) {
    warnings.push('原项目视频模式在当前环境不可用，已映射到当前模型的默认视频模式');
  }

  return {
    imageModelId: imageModel.modelId,
    videoModelId: videoModel.modelId,
    videoMode,
  };
}

function importManualSnapshot(input: {
  packagePath: string;
  packageDatabase: ProjectPackageDatabase;
  kind: ProjectManualKind;
  oldManualId: number;
  now: number;
}): number {
  const tableName = getManualTableName(input.kind);
  const oldManual = tableRows(input.packageDatabase, tableName).find((row) => Number(row.id) === input.oldManualId);
  if (!oldManual) {
    const fallback = getManualRows(input.kind)[0];
    if (!fallback) {
      throw createError(VT_STATUS.INVALID_PARAMS, input.kind === 'visual' ? '项目包缺少视觉手册快照' : '项目包缺少导演手册快照');
    }
    return fallback.id;
  }

  const oldPath = String(oldManual.path ?? '');
  const nextPath = createUniqueManualPath(input.kind, oldPath);
  const manualRow: JsonRow = {
    ...oldManual,
    path: nextPath,
    created_at: input.now,
    updated_at: input.now,
  };
  const newManualId = insertJsonRow(tableName, manualRow);
  if (!newManualId) {
    throw createError(VT_STATUS.FILE_ERROR, '导入手册失败');
  }

  const snapshotPath = safeJoin(input.packagePath, `manual_snapshots/${input.kind}/${oldPath}`);
  const targetPath = safeJoin(getManualRoot(input.kind), nextPath);
  copyManualSnapshotFromPackage(snapshotPath, targetPath);

  return newManualId;
}

function insertProjectScopedRows(tableName: string, rows: JsonRow[], projectId: number, transform?: (row: JsonRow) => JsonRow): void {
  for (const row of rows) {
    insertJsonRow(tableName, {
      ...(transform ? transform(row) : row),
      project_id: projectId,
    });
  }
}

function importProjectPackageRows(input: {
  packageDatabase: ProjectPackageDatabase;
  oldProjectId: number;
  newProjectId: number;
  now: number;
}): void {
  const scriptIdMap = new Map<number, number>();
  const assetIdMap = new Map<number, number>();
  const storyboardIdMap = new Map<number, number>();
  const trackIdMap = new Map<number, number>();
  const videoIdMap = new Map<number, number>();
  const flowIdMap = new Map<string, string>();
  const oldTrackSelectedVideo = new Map<number, number | null>();

  insertProjectScopedRows('source_chapters', tableRows(input.packageDatabase, 'source_chapters'), input.newProjectId);
  insertProjectScopedRows('agent_work_data', tableRows(input.packageDatabase, 'agent_work_data'), input.newProjectId);

  for (const row of tableRows(input.packageDatabase, 'scripts')) {
    const newId = insertJsonRow('scripts', {
      ...row,
      project_id: input.newProjectId,
    });
    if (newId) {
      scriptIdMap.set(Number(row.id), newId);
    }
  }

  for (const row of tableRows(input.packageDatabase, 'assets')) {
    const newId = insertJsonRow('assets', {
      ...row,
      project_id: input.newProjectId,
      parent_id: null,
      media_id: null,
      metadata: remapProjectRelativePath(row.metadata, input.oldProjectId, input.newProjectId),
    });
    if (newId) {
      assetIdMap.set(Number(row.id), newId);
    }
  }

  for (const row of tableRows(input.packageDatabase, 'assets')) {
    const newId = mapId(assetIdMap, row.id);
    const newParentId = mapId(assetIdMap, row.parent_id);
    if (newId && newParentId) {
      updateRowById('assets', newId, { parent_id: newParentId });
    }
  }

  for (const row of tableRows(input.packageDatabase, 'asset_media')) {
    const assetId = mapId(assetIdMap, row.asset_id);
    if (!assetId) {
      continue;
    }

    const newId = insertJsonRow('asset_media', {
      ...row,
      project_id: input.newProjectId,
      asset_id: assetId,
      relative_path: remapProjectRelativePath(row.relative_path, input.oldProjectId, input.newProjectId),
      metadata: remapProjectRelativePath(row.metadata, input.oldProjectId, input.newProjectId),
    });
    const selectedAssetId = mapId(assetIdMap, row.asset_id);
    if (newId && selectedAssetId) {
      const oldMediaId = Number(row.id);
      const assetRow = tableRows(input.packageDatabase, 'assets').find((item) => Number(item.media_id) === oldMediaId);
      const mappedAssetId = assetRow ? mapId(assetIdMap, assetRow.id) : null;
      if (mappedAssetId) {
        updateRowById('assets', mappedAssetId, { media_id: newId });
      }
    }
  }

  for (const row of tableRows(input.packageDatabase, 'asset_audio_links')) {
    const assetId = mapId(assetIdMap, row.asset_id);
    const audioAssetId = mapId(assetIdMap, row.audio_asset_id);
    if (!assetId || !audioAssetId) {
      continue;
    }

    insertJsonRow('asset_audio_links', {
      ...row,
      asset_id: assetId,
      audio_asset_id: audioAssetId,
    }, []);
  }

  for (const row of tableRows(input.packageDatabase, 'script_asset_links')) {
    const scriptId = mapId(scriptIdMap, row.script_id);
    const assetId = mapId(assetIdMap, row.asset_id);
    if (!scriptId || !assetId) {
      continue;
    }

    insertJsonRow('script_asset_links', {
      ...row,
      script_id: scriptId,
      asset_id: assetId,
    }, []);
  }

  for (const row of tableRows(input.packageDatabase, 'production_contents')) {
    const contentId = mapId(scriptIdMap, row.id);
    if (!contentId) {
      continue;
    }

    insertJsonRow('production_contents', {
      ...row,
      id: contentId,
      project_id: input.newProjectId,
    }, []);
  }

  for (const row of tableRows(input.packageDatabase, 'production_resource_links')) {
    const contentId = mapId(scriptIdMap, row.content_id);
    const assetId = mapId(assetIdMap, row.asset_id);
    if (!contentId || !assetId) {
      continue;
    }

    insertJsonRow('production_resource_links', {
      ...row,
      content_id: contentId,
      asset_id: assetId,
    }, []);
  }

  for (const row of tableRows(input.packageDatabase, 'production_workspaces')) {
    const scriptId = mapId(scriptIdMap, row.script_id);
    if (!scriptId) {
      continue;
    }

    insertJsonRow('production_workspaces', {
      ...row,
      project_id: input.newProjectId,
      script_id: scriptId,
      positions_json: remapProjectRelativePath(row.positions_json, input.oldProjectId, input.newProjectId),
    });
  }

  for (const row of tableRows(input.packageDatabase, 'production_video_tracks')) {
    const scriptId = mapId(scriptIdMap, row.script_id);
    if (!scriptId) {
      continue;
    }

    const newId = insertJsonRow('production_video_tracks', {
      ...row,
      project_id: input.newProjectId,
      script_id: scriptId,
      selected_video_id: null,
      generation_metadata: remapProjectRelativePath(row.generation_metadata, input.oldProjectId, input.newProjectId),
    });
    if (newId) {
      trackIdMap.set(Number(row.id), newId);
      oldTrackSelectedVideo.set(Number(row.id), Number.isInteger(Number(row.selected_video_id)) ? Number(row.selected_video_id) : null);
    }
  }

  for (const row of tableRows(input.packageDatabase, 'production_image_flows')) {
    const oldFlowId = String(row.id ?? '');
    const newFlowId = `${oldFlowId}-p${input.newProjectId}`;
    flowIdMap.set(oldFlowId, newFlowId);
  }

  for (const row of tableRows(input.packageDatabase, 'production_storyboards')) {
    const scriptId = mapId(scriptIdMap, row.script_id);
    if (!scriptId) {
      continue;
    }

    const newId = insertJsonRow('production_storyboards', {
      ...row,
      project_id: input.newProjectId,
      script_id: scriptId,
      track_id: mapId(trackIdMap, row.track_id),
      flow_id: row.flow_id ? flowIdMap.get(String(row.flow_id)) ?? row.flow_id : row.flow_id,
      relative_path: remapProjectRelativePath(row.relative_path, input.oldProjectId, input.newProjectId),
      generation_metadata: remapProjectRelativePath(row.generation_metadata, input.oldProjectId, input.newProjectId),
    });
    if (newId) {
      storyboardIdMap.set(Number(row.id), newId);
    }
  }

  for (const row of tableRows(input.packageDatabase, 'production_storyboard_asset_links')) {
    const storyboardId = mapId(storyboardIdMap, row.storyboard_id);
    const assetId = mapId(assetIdMap, row.asset_id);
    if (!storyboardId || !assetId) {
      continue;
    }

    insertJsonRow('production_storyboard_asset_links', {
      ...row,
      storyboard_id: storyboardId,
      asset_id: assetId,
    }, []);
  }

  for (const row of tableRows(input.packageDatabase, 'production_image_flows')) {
    const scriptId = mapId(scriptIdMap, row.script_id);
    if (!scriptId) {
      continue;
    }

    const oldFlowId = String(row.id ?? '');
    insertJsonRow('production_image_flows', {
      ...row,
      id: flowIdMap.get(oldFlowId) ?? `${oldFlowId}-p${input.newProjectId}`,
      project_id: input.newProjectId,
      script_id: scriptId,
      owner_id: row.owner_type === 'storyboard' ? mapId(storyboardIdMap, row.owner_id) : row.owner_type === 'asset' ? mapId(assetIdMap, row.owner_id) : row.owner_id,
      flow_data: remapProjectRelativePath(row.flow_data, input.oldProjectId, input.newProjectId),
    }, []);
  }

  for (const row of tableRows(input.packageDatabase, 'production_videos')) {
    const scriptId = mapId(scriptIdMap, row.script_id);
    const trackId = mapId(trackIdMap, row.track_id);
    if (!scriptId || !trackId) {
      continue;
    }

    const newId = insertJsonRow('production_videos', {
      ...row,
      project_id: input.newProjectId,
      script_id: scriptId,
      track_id: trackId,
      relative_path: remapProjectRelativePath(row.relative_path, input.oldProjectId, input.newProjectId),
      cover_relative_path: remapProjectRelativePath(row.cover_relative_path, input.oldProjectId, input.newProjectId),
      reference_json: remapProjectRelativePath(row.reference_json, input.oldProjectId, input.newProjectId),
      generation_metadata: remapProjectRelativePath(row.generation_metadata, input.oldProjectId, input.newProjectId),
    });
    if (newId) {
      videoIdMap.set(Number(row.id), newId);
    }
  }

  for (const [oldTrackId, oldSelectedVideoId] of oldTrackSelectedVideo.entries()) {
    const newTrackId = trackIdMap.get(oldTrackId);
    const newSelectedVideoId = oldSelectedVideoId ? videoIdMap.get(oldSelectedVideoId) : null;
    if (newTrackId && newSelectedVideoId) {
      updateRowById('production_video_tracks', newTrackId, { selected_video_id: newSelectedVideoId });
    }
  }

  for (const row of tableRows(input.packageDatabase, 'memories')) {
    const isolationKey = String(row.isolation_key ?? '').replace(`${input.oldProjectId}:`, `${input.newProjectId}:`);
    insertJsonRow('memories', {
      ...row,
      id: `${String(row.id ?? 'memory')}-p${input.newProjectId}`,
      isolation_key: isolationKey,
      content: remapProjectRelativePath(row.content, input.oldProjectId, input.newProjectId),
      metadata: remapProjectRelativePath(row.metadata, input.oldProjectId, input.newProjectId),
    }, []);
  }
}

function createProjectPackageManifest(input: {
  project: ProjectRow;
  exportedAt: number;
  tableRows: ProjectPackageTableSummary[];
  files: ProjectPackageFileSummary[];
}): ProjectPackageManifest {
  return {
    app: PROJECT_PACKAGE_APP_ID,
    packageVersion: PROJECT_PACKAGE_VERSION,
    packageType: 'directory',
    exportedAt: input.exportedAt,
    appVersion: app.getVersion(),
    sourceProjectId: input.project.id,
    projectName: input.project.name,
    tableRows: input.tableRows,
    files: input.files,
    excluded: [...PROJECT_PACKAGE_EXCLUDED],
  };
}

function countAudioLinks(projectId: number): number {
  if (!tableExists('asset_audio_links') || !tableExists('assets')) {
    return 0;
  }

  const row = getDatabase()
    .prepare<[number], { count: number }>(
      `
      SELECT COUNT(*) as count
      FROM asset_audio_links l
      INNER JOIN assets a ON a.id = l.asset_id
      WHERE a.project_id = ?
      `,
    )
    .get(projectId);

  return row?.count ?? 0;
}

function assertProjectId(projectId: number): number {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }

  return projectId;
}

function readAppSetting(key: string): string | null {
  const row = getDatabase().prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(key);
  return row?.value ?? null;
}

function writeAppSetting(key: string, value: string): void {
  const now = Date.now();
  withTransaction(() => {
    getDatabase()
      .prepare<[string, string, number, number, number]>(
        `
        INSERT INTO app_settings (key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ?
        `,
      )
      .run(key, value, now, now, now);
  });
}

function deleteAppSetting(key: string): boolean {
  const result = getDatabase().prepare<[string]>('DELETE FROM app_settings WHERE key = ?').run(key);
  return result.changes > 0;
}

function isProjectRouteName(value: unknown): value is ProjectRouteName {
  return typeof value === 'string' && PROJECT_ROUTE_NAMES.includes(value as ProjectRouteName);
}

function getProjectEntryRoute(): ProjectRouteName {
  return 'production';
}

function normalizeProjectRouteName(value: unknown, _sourceType: ProjectSourceType = 'novel'): ProjectRouteName {
  if (value === 'project-overview' || value === 'script-agent' || value === 'script') {
    return getProjectEntryRoute();
  }

  return isProjectRouteName(value) ? value : getProjectEntryRoute();
}

function readRecentProjectSetting(): StoredRecentProject | null {
  const raw = readAppSetting(RECENT_PROJECT_SETTING_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredRecentProject>;
    if (!parsed.projectId || !Number.isInteger(parsed.projectId) || parsed.projectId <= 0) {
      return null;
    }

    const sourceType = PROJECT_SOURCE_TYPE_VALUES.includes(parsed.sourceType as ProjectSourceType) ? (parsed.sourceType as ProjectSourceType) : 'script';
    const templateType = PROJECT_TEMPLATE_TYPE_VALUES.includes(parsed.templateType as ProjectTemplateType) ? (parsed.templateType as ProjectTemplateType) : DEFAULT_PROJECT_TEMPLATE_TYPE;

    return {
      projectId: parsed.projectId,
      projectName: typeof parsed.projectName === 'string' ? parsed.projectName : '',
      templateType,
      sourceType,
      lastRoute: normalizeProjectRouteName(parsed.lastRoute, sourceType),
      openedAt: typeof parsed.openedAt === 'number' ? parsed.openedAt : Date.now(),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function ensureProjectWorkspaceReady(project: ProjectRow): void {
  if (project.workspace_path && pathExists(project.workspace_path)) {
    return;
  }

  const workspacePath = ensureProjectDirectory(project.id);
  getDatabase().prepare<[string, number]>('UPDATE projects SET workspace_path = ? WHERE id = ?').run(workspacePath, project.id);
}

function assertProjectRestorable(projectId: number): ProjectRow {
  const project = getProjectRowById(projectId);
  resolveProjectModelOption(project.image_model_id, 'image');
  const videoOption = resolveProjectModelOption(project.video_model_id, 'video');
  if (!videoOption.modes?.some((mode) => mode.value === normalizeStoredVideoMode(project.video_mode))) {
    throw createError(VT_STATUS.CONFLICT, '当前项目的视频模式已失效，请重新编辑项目');
  }

  getManualById('visual', project.visual_manual_id);
  getManualById('director', project.director_manual_id);
  ensureProjectWorkspaceReady(project);

  return project;
}

function toCurrentProjectContext(project: ProjectRow): ProjectCurrentContext {
  return {
    id: String(project.id),
    name: project.name,
    templateType: DEFAULT_PROJECT_TEMPLATE_TYPE,
  };
}

function toProjectRecentContext(stored: StoredRecentProject): ProjectRecentContext {
  return {
    project: {
      id: String(stored.projectId),
      name: stored.projectName,
      templateType: stored.templateType,
    },
    lastRoute: stored.lastRoute,
    openedAt: stored.openedAt,
    updatedAt: stored.updatedAt,
  };
}

function writeRecentProjectContext(project: ProjectRow, routeName: ProjectRouteName, openedAt = Date.now()): ProjectRecentContext {
  const recent: StoredRecentProject = {
    projectId: project.id,
    projectName: project.name,
    templateType: DEFAULT_PROJECT_TEMPLATE_TYPE,
    sourceType: project.source_type,
    lastRoute: normalizeProjectRouteName(routeName, project.source_type),
    openedAt,
    updatedAt: Date.now(),
  };

  writeAppSetting(RECENT_PROJECT_SETTING_KEY, JSON.stringify(recent));
  return toProjectRecentContext(recent);
}

function parseTabsJson(value: string, kind: ProjectManualKind): ProjectManualDetail['tabs'] {
  const configs = getManualTabs(kind);
  const parsed = value ? (JSON.parse(value) as Array<{ key: string; content: string }>) : [];
  const map = new Map(parsed.map((item) => [item.key, item.content]));

  return configs.map((config) => ({
    key: config.key,
    label: config.label,
    relativePath: config.relativePath,
    content: map.get(config.key) ?? '',
  }));
}

function toCoverUrl(kind: ProjectManualKind, manualPath: string, coverRelativePath: string | null): string | null {
  if (!coverRelativePath) {
    return null;
  }

  const rootDirectory = getProjectManualRootName(kind);
  const relativePath = `${rootDirectory}/${manualPath}/${coverRelativePath}`.replace(/\\/g, '/');
  try {
    return createMediaUrl({
      root: 'skills',
      relativePath,
    }).url;
  } catch {
    return null;
  }
}

function countManualReferences(kind: ProjectManualKind, manualId: number): number {
  const field = kind === 'visual' ? 'visual_manual_id' : 'director_manual_id';
  if (!tableExists('projects')) {
    return 0;
  }

  const row = getDatabase().prepare<[number], { count: number }>(`SELECT COUNT(*) as count FROM projects WHERE ${field} = ?`).get(manualId);
  return row?.count ?? 0;
}

function mapManualSummary(kind: ProjectManualKind, row: ManualRow): ProjectManualSummary {
  return {
    id: row.id,
    kind,
    name: row.name,
    path: row.path,
    coverRelativePath: row.cover_relative_path,
    coverUrl: toCoverUrl(kind, row.path, row.cover_relative_path),
    referenceCount: countManualReferences(kind, row.id),
    updatedAt: row.updated_at,
  };
}

function getManualRows(kind: ProjectManualKind): ManualRow[] {
  const tableName = getManualTableName(kind);
  if (!tableExists(tableName)) {
    return [];
  }

  return getDatabase().prepare<[], ManualRow>(`SELECT * FROM ${tableName} ORDER BY updated_at DESC, id DESC`).all();
}

function getManualById(kind: ProjectManualKind, id: number): ManualRow {
  const tableName = getManualTableName(kind);
  const row = getDatabase().prepare<[number], ManualRow>(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`).get(id);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, kind === 'visual' ? '视觉手册不存在' : '导演手册不存在');
  }

  return row;
}

function parseDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match?.[2]) {
    throw createError(VT_STATUS.INVALID_PARAMS, '封面图片数据无效');
  }

  return Buffer.from(match[2], 'base64');
}

function getProjectConnections() {
  return getApiConnectionList().connections.filter((connection) => connection.status === 'ready');
}

function getDetailedModels(type: 'image' | 'video'): ProjectModelOption[] {
  const options: ProjectModelOption[] = [];

  for (const connection of getProjectConnections()) {
    const row = getVendorRow(connection.id);
    const models = parseModelList(row.models);
    for (const model of models) {
      if (model.type !== type) {
        continue;
      }

      options.push({
        modelId: `${connection.id}:${model.modelName}`,
        connectionId: connection.id,
        connectionName: connection.name,
        modelName: model.modelName,
        displayName: model.name,
        type,
        modes: model.type === 'video' ? toVideoModeOptions(model) : undefined,
      });
    }
  }

  return options;
}

function formatModeLabel(mode: string | string[]): string {
  if (Array.isArray(mode)) {
    return mode.join(' + ');
  }

  const labels: Record<string, string> = {
    ...VIDEO_GENERATION_MODE_LABELS_ZH,
  };

  return labels[mode] ?? mode;
}

function normalizeStoredVideoMode(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return serializeVideoMode(parsed);
    }
  } catch {
    return serializeVideoMode(raw);
  }

  return serializeVideoMode(raw);
}

function toVideoModeOptions(model: VendorVideoModel): ProjectVideoModeOption[] {
  return model.mode.map((mode) => {
    const value = serializeVideoMode(mode);
    return {
      value,
      label: formatModeLabel(mode),
    };
  });
}

function resolveProjectModelOption(modelId: string, type: 'image' | 'video'): ProjectModelOption {
  const option = getDetailedModels(type).find((item) => item.modelId === modelId);
  if (!option) {
    throw createError(VT_STATUS.MODEL_NOT_FOUND, type === 'image' ? '图片模型不存在或未启用' : '视频模型不存在或未启用');
  }

  return option;
}

function validateProjectPayload(payload: ProjectSavePayload): Omit<ProjectSavePayload, 'id'> {
  const templateType = assertProjectTemplateType(payload.templateType ?? DEFAULT_PROJECT_TEMPLATE_TYPE);
  const sourceType: ProjectSourceType = 'script';
  const name = assertNonEmpty(payload.name, '项目名称');
  const genre = assertNonEmpty(payload.genre, '题材/类型');
  const description = assertNonEmpty(payload.description, '项目简介');
  const imageQuality = assertImageQuality(payload.imageQuality);
  const videoRatio = assertVideoRatio(payload.videoRatio);
  const imageModel = resolveProjectModelOption(payload.imageModelId, 'image');
  const videoModel = resolveProjectModelOption(payload.videoModelId, 'video');
  const videoMode = normalizeStoredVideoMode(payload.videoMode);
  const validVideoMode = videoModel.modes?.find((item) => item.value === videoMode);
  if (!validVideoMode) {
    throw createError(VT_STATUS.INVALID_PARAMS, '视频模式无效');
  }

  getManualById('visual', payload.visualManualId);
  getManualById('director', payload.directorManualId);

  return {
    templateType,
    sourceType,
    name,
    genre,
    description,
    imageModelId: imageModel.modelId,
    imageQuality,
    videoModelId: videoModel.modelId,
    videoMode: validVideoMode.value,
    videoRatio,
    visualManualId: payload.visualManualId,
    directorManualId: payload.directorManualId,
  };
}

function getProjectRowById(id: number): ProjectRow {
  const row = getDatabase()
    .prepare<[number], ProjectRow>(
      `
      SELECT
        p.*,
        vm.name AS visual_manual_name,
        dm.name AS director_manual_name
      FROM projects p
      LEFT JOIN visual_manuals vm ON vm.id = p.visual_manual_id
      LEFT JOIN director_manuals dm ON dm.id = p.director_manual_id
      WHERE p.id = ?
      LIMIT 1
      `,
    )
    .get(id);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '项目不存在');
  }

  return row;
}

function mapProjectSummary(row: ProjectRow): ProjectSummary {
  const imageModel = getDetailedModels('image').find((item) => item.modelId === row.image_model_id);
  const videoModel = getDetailedModels('video').find((item) => item.modelId === row.video_model_id);
  const videoMode = normalizeStoredVideoMode(row.video_mode);
  const videoModeLabel = videoModel?.modes?.find((item) => item.value === videoMode)?.label ?? videoMode;

  return {
    id: row.id,
    templateType: DEFAULT_PROJECT_TEMPLATE_TYPE,
    sourceType: row.source_type,
    name: row.name,
    genre: row.genre,
    description: row.description,
    imageModelId: row.image_model_id,
    imageModelLabel: imageModel ? `${imageModel.connectionName} / ${imageModel.displayName}` : '模型已失效',
    imageQuality: row.image_quality,
    videoModelId: row.video_model_id,
    videoModelLabel: videoModel ? `${videoModel.connectionName} / ${videoModel.displayName}` : '模型已失效',
    videoMode,
    videoModeLabel,
    videoRatio: row.video_ratio,
    visualManualId: row.visual_manual_id,
    visualManualName: row.visual_manual_name ?? '手册已失效',
    directorManualId: row.director_manual_id,
    directorManualName: row.director_manual_name ?? '手册已失效',
    workspacePath: row.workspace_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listProjects(): ProjectSummary[] {
  if (!tableExists('projects')) {
    return [];
  }

  const rows = getDatabase()
    .prepare<[], ProjectRow>(
      `
      SELECT
        p.*,
        vm.name AS visual_manual_name,
        dm.name AS director_manual_name
      FROM projects p
      LEFT JOIN visual_manuals vm ON vm.id = p.visual_manual_id
      LEFT JOIN director_manuals dm ON dm.id = p.director_manual_id
      ORDER BY p.updated_at DESC, p.id DESC
      `,
    )
    .all();

  return rows.map(mapProjectSummary);
}

function ensureProjectDirectory(projectId: number): string {
  const root = resolveProjectRoot(String(projectId));
  return ensureDirectory(root);
}

function saveManualFiles(kind: ProjectManualKind, manualPath: string, tabs: ProjectManualDetail['tabs'], coverImageDataUrl: string | null): string | null {
  const root = getManualRoot(kind);

  for (const tab of tabs) {
    writeManagedFile(root, `${manualPath}/${tab.relativePath}`, tab.content);
  }

  if (!coverImageDataUrl) {
    return null;
  }

  const coverRelativePath = 'images/cover.png';
  writeManagedFile(root, `${manualPath}/${coverRelativePath}`, parseDataUrl(coverImageDataUrl));
  return coverRelativePath;
}

function assertManualTabs(kind: ProjectManualKind, tabs: ProjectManualSavePayload['tabs']): ProjectManualDetail['tabs'] {
  const configs = getManualTabs(kind);
  const contentMap = new Map(tabs.map((item) => [item.key, item.content]));

  return configs.map((config) => {
    const content = assertNonEmpty(contentMap.get(config.key) ?? '', `${config.label} 内容`);
    return {
      key: config.key,
      label: config.label,
      relativePath: config.relativePath,
      content,
    };
  });
}

function toManualDetail(kind: ProjectManualKind, row: ManualRow): ProjectManualDetail {
  return {
    ...mapManualSummary(kind, row),
    tabs: parseTabsJson(row.tabs_json, kind),
  };
}

export function exportProjectPackage(payload: ProjectExportPackagePayload): ProjectExportPackageResult {
  const projectId = assertProjectId(payload.projectId);
  const project = getProjectRowById(projectId);
  assertNoBusinessLocks({ projectId, action: '导出项目包' });
  ensureProjectWorkspaceReady(project);
  validateProjectPackageFiles(projectId);

  const exportedAt = Date.now();
  const packageName = `${sanitizePackageName(project.name)}-${formatTimestampForFileName(exportedAt)}${PROJECT_PACKAGE_EXTENSION}`;
  const packageRoot = getPackageRoot();
  const packagePath = safeJoin(packageRoot, packageName);
  mkdirSync(packagePath, { recursive: true });

  const packageDatabase = readPackageProjectRows(projectId);
  const tableRows = summarizePackageTables(packageDatabase);
  const fileSummaries = copyProjectFilesToPackage(projectId, packagePath);
  const visualManual = getManualById('visual', project.visual_manual_id);
  const directorManual = getManualById('director', project.director_manual_id);
  fileSummaries.push(copyManualSnapshotToPackage('visual', visualManual.path, packagePath));
  fileSummaries.push(copyManualSnapshotToPackage('director', directorManual.path, packagePath));

  writeJsonFile(packagePath, 'database.json', packageDatabase);
  writeJsonFile(packagePath, 'project.json', {
    sourceProjectId: project.id,
    projectName: project.name,
    exportedAt,
    format: 'vt-studio-project-directory-v1',
    packageFolders: [...PROJECT_PACKAGE_FILE_FOLDERS, 'manual_snapshots', 'prompt_snapshots'],
  });
  writeJsonFile(packagePath, 'prompt_snapshots/manifest.json', {
    note: '生成链路里的提示词和手册快照保存在 database.json 的 generation_metadata/metadata 字段中；这里不导出全局提示词配置和 API Key。',
    exportedAt,
  });
  writeJsonFile(packagePath, 'manifest.json', createProjectPackageManifest({
    project,
    exportedAt,
    tableRows,
    files: fileSummaries,
  }));

  return {
    packageName,
    packagePath,
    exportedAt,
    summary: createProjectPackageSummary(project.name, PROJECT_PACKAGE_VERSION, tableRows, fileSummaries),
  };
}

export function importProjectPackage(payload: ProjectImportPackagePayload): ProjectImportPackageResult {
  assertNoBusinessLocks({ action: '导入项目包' });
  const packagePath = assertProjectPackagePath(payload.packagePath);
  const manifest = readJsonFile<ProjectPackageManifest>(packagePath, 'manifest.json');
  assertProjectPackageManifest(manifest);
  const packageDatabase = readJsonFile<ProjectPackageDatabase>(packagePath, 'database.json');
  const projectRow = firstTableRow(packageDatabase, 'projects');
  const oldProjectId = Number(projectRow.id);
  if (!Number.isInteger(oldProjectId) || oldProjectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目包项目 ID 无效');
  }

  const warnings: string[] = [];
  const now = Date.now();
  let newProjectId = 0;

  try {
    withTransaction(() => {
      const modelConfig = resolveImportedProjectModels(projectRow, warnings);
      const visualManualId = importManualSnapshot({
        packagePath,
        packageDatabase,
        kind: 'visual',
        oldManualId: Number(projectRow.visual_manual_id),
        now,
      });
      const directorManualId = importManualSnapshot({
        packagePath,
        packageDatabase,
        kind: 'director',
        oldManualId: Number(projectRow.director_manual_id),
        now,
      });
      const projectName = createUniqueProjectName(String(projectRow.name ?? manifest.projectName));
      const projectInsertRow: JsonRow = {
        ...projectRow,
        name: projectName,
        image_model_id: modelConfig.imageModelId,
        video_model_id: modelConfig.videoModelId,
        video_mode: modelConfig.videoMode,
        visual_manual_id: visualManualId,
        director_manual_id: directorManualId,
        workspace_path: '',
        user_id: 1,
        created_at: now,
        updated_at: now,
      };

      const insertedId = insertJsonRow('projects', projectInsertRow);
      if (!insertedId) {
        throw createError(VT_STATUS.FILE_ERROR, '导入项目失败');
      }
      newProjectId = insertedId;
      const workspacePath = ensureProjectDirectory(newProjectId);
      getDatabase().prepare<[string, number]>('UPDATE projects SET workspace_path = ? WHERE id = ?').run(workspacePath, newProjectId);

      copyPackageFilesToProject(packagePath, newProjectId);
      importProjectPackageRows({
        packageDatabase,
        oldProjectId,
        newProjectId,
        now,
      });
    });
  } catch (error) {
    if (newProjectId > 0) {
      try {
        deleteManagedDirectory(getRuntimeDirectories().projects, String(newProjectId));
      } catch {
        // 数据库事务已经回滚；目录清理失败时保留给文件管理诊断处理。
      }
    }
    throw error;
  }

  const project = mapProjectSummary(getProjectRowById(newProjectId));
  return {
    project,
    packagePath,
    importedAt: now,
    summary: createProjectPackageSummary(project.name, PROJECT_PACKAGE_VERSION, manifest.tableRows, manifest.files),
    warnings,
  };
}

export async function openProjectPackageDirectory(payload: ProjectOpenPackagePayload): Promise<ProjectOpenPackageResult> {
  const packagePath = assertProjectPackagePath(payload.packagePath);
  const openResult = await shell.openPath(packagePath);

  if (openResult) {
    throw createError(VT_STATUS.FILE_ERROR, `打开项目包失败：${openResult}`);
  }

  return {
    packagePath,
  };
}

export function getProjectPageState(): ProjectPageStateResult {
  return {
    projects: listProjects(),
    imageModels: getDetailedModels('image'),
    videoModels: getDetailedModels('video'),
    visualManuals: getManualRows('visual').map((row) => mapManualSummary('visual', row)),
    directorManuals: getManualRows('director').map((row) => mapManualSummary('director', row)),
    imageQualityOptions: IMAGE_QUALITY_OPTIONS,
    videoRatioOptions: VIDEO_RATIO_OPTIONS,
  };
}

export function createProject(payload: ProjectSavePayload): ProjectSaveResult {
  const validated = validateProjectPayload(payload);
  const now = Date.now();

  const inserted = withTransaction((database) => {
    const insert = database
      .prepare<[ProjectSourceType, string, string, string, string, ProjectImageQuality, string, string, ProjectVideoRatio, number, number, string, number, number, number]>(
        `
        INSERT INTO projects (
          source_type, name, genre, description, image_model_id, image_quality,
          video_model_id, video_mode, video_ratio, visual_manual_id, director_manual_id,
          workspace_path, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        validated.sourceType,
        validated.name,
        validated.genre,
        validated.description,
        validated.imageModelId,
        validated.imageQuality,
        validated.videoModelId,
        validated.videoMode,
        validated.videoRatio,
        validated.visualManualId,
        validated.directorManualId,
        '',
        1,
        now,
        now,
      );

    const projectId = Number(insert.lastInsertRowid);
    const workspacePath = ensureProjectDirectory(projectId);
    database.prepare<[string, number]>('UPDATE projects SET workspace_path = ? WHERE id = ?').run(workspacePath, projectId);
    ensureDefaultProductionContent(projectId, database);
    return projectId;
  });

  return {
    project: mapProjectSummary(getProjectRowById(inserted)),
  };
}

export function updateProject(payload: ProjectSavePayload): ProjectSaveResult {
  if (!payload.id || !Number.isInteger(payload.id) || payload.id <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }
  const projectId = payload.id;

  const validated = validateProjectPayload(payload);
  const existing = getProjectRowById(projectId);
  const now = Date.now();

  withTransaction((database) => {
    database
      .prepare<[ProjectSourceType, string, string, string, string, ProjectImageQuality, string, string, ProjectVideoRatio, number, number, number, number]>(
        `
        UPDATE projects
        SET source_type = ?, name = ?, genre = ?, description = ?, image_model_id = ?, image_quality = ?,
            video_model_id = ?, video_mode = ?, video_ratio = ?, visual_manual_id = ?, director_manual_id = ?,
            updated_at = ?
        WHERE id = ?
        `,
      )
      .run(
        validated.sourceType,
        validated.name,
        validated.genre,
        validated.description,
        validated.imageModelId,
        validated.imageQuality,
        validated.videoModelId,
        validated.videoMode,
        validated.videoRatio,
        validated.visualManualId,
        validated.directorManualId,
        now,
        projectId,
      );
  });

  const updated = getProjectRowById(projectId);
  if (!updated.workspace_path) {
    const workspacePath = ensureProjectDirectory(projectId);
    getDatabase().prepare<[string, number]>('UPDATE projects SET workspace_path = ? WHERE id = ?').run(workspacePath, projectId);
  } else if (!pathExists(existing.workspace_path)) {
    ensureProjectDirectory(projectId);
  }

  const recent = readRecentProjectSetting();
  if (recent?.projectId === projectId) {
    writeRecentProjectContext(getProjectRowById(projectId), recent.lastRoute, recent.openedAt);
  }

  return {
    project: mapProjectSummary(getProjectRowById(projectId)),
  };
}

export function getProjectDeleteImpact(payload: ProjectDeleteImpactPayload): ProjectDeleteImpactResult {
  const project = getProjectRowById(payload.projectId);
  const runningLocks = listBusinessLocks({ projectId: payload.projectId });
  const runningTaskCount = countRunningTaskRecords({ projectId: payload.projectId });
  const taskCount = tableExists('tasks')
    ? getDatabase().prepare<[number], { count: number }>('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?').get(payload.projectId)?.count ?? 0
    : 0;
  const memoryCount = tableExists('memories')
    ? getDatabase().prepare<[string], { count: number }>("SELECT COUNT(*) as count FROM memories WHERE isolation_key LIKE ?").get(`${payload.projectId}:%`)?.count ?? 0
    : 0;

  return {
    impact: {
      projectId: project.id,
      projectName: project.name,
      runningTaskCount,
      runningLockCount: runningLocks.reduce((total, lock) => total + lock.count, 0),
      runningLocks,
      taskCount,
      memoryCount,
      projectDirectory: project.workspace_path || resolveProjectRoot(String(project.id)),
    },
  };
}

export function deleteProject(payload: ProjectDeletePayload): ProjectDeleteResult {
  if (!payload.projectId || !Number.isInteger(payload.projectId) || payload.projectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }

  const impact = getProjectDeleteImpact({ projectId: payload.projectId }).impact;
  assertNoBusinessLocks({ projectId: payload.projectId, action: '删除项目' });

  withTransaction((database) => {
    if (tableExists('tasks')) {
      database.prepare<[number]>('DELETE FROM tasks WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('memories')) {
      database.prepare<[string]>('DELETE FROM memories WHERE isolation_key LIKE ?').run(`${payload.projectId}:%`);
    }
    if (tableExists('source_chapters')) {
      database.prepare<[number]>('DELETE FROM source_chapters WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('agent_work_data')) {
      database.prepare<[number]>('DELETE FROM agent_work_data WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('export_history')) {
      database.prepare<[number]>('DELETE FROM export_history WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('production_storyboard_asset_links') && tableExists('production_storyboards')) {
      database.prepare<[number]>('DELETE FROM production_storyboard_asset_links WHERE storyboard_id IN (SELECT id FROM production_storyboards WHERE project_id = ?)').run(payload.projectId);
    }
    if (tableExists('production_image_flows')) {
      database.prepare<[number]>('DELETE FROM production_image_flows WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('production_videos')) {
      database.prepare<[number]>('DELETE FROM production_videos WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('production_video_tracks')) {
      database.prepare<[number]>('DELETE FROM production_video_tracks WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('production_storyboards')) {
      database.prepare<[number]>('DELETE FROM production_storyboards WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('production_workspaces')) {
      database.prepare<[number]>('DELETE FROM production_workspaces WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('script_asset_links') && tableExists('scripts')) {
      database.prepare<[number]>('DELETE FROM script_asset_links WHERE script_id IN (SELECT id FROM scripts WHERE project_id = ?)').run(payload.projectId);
    }
    if (tableExists('production_resource_links') && tableExists('production_contents')) {
      database.prepare<[number]>('DELETE FROM production_resource_links WHERE content_id IN (SELECT id FROM production_contents WHERE project_id = ?)').run(payload.projectId);
    }
    if (tableExists('production_agent_audits')) {
      database.prepare<[number]>('DELETE FROM production_agent_audits WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('production_contents')) {
      database.prepare<[number]>('DELETE FROM production_contents WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('asset_audio_links') && tableExists('assets')) {
      database.prepare<[number, number]>('DELETE FROM asset_audio_links WHERE asset_id IN (SELECT id FROM assets WHERE project_id = ?) OR audio_asset_id IN (SELECT id FROM assets WHERE project_id = ?)').run(payload.projectId, payload.projectId);
    }
    if (tableExists('asset_media')) {
      database.prepare<[number]>('DELETE FROM asset_media WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('scripts')) {
      database.prepare<[number]>('DELETE FROM scripts WHERE project_id = ?').run(payload.projectId);
    }
    if (tableExists('assets')) {
      database.prepare<[number]>('DELETE FROM assets WHERE project_id = ?').run(payload.projectId);
    }
    database.prepare<[number]>('DELETE FROM projects WHERE id = ?').run(payload.projectId);
  });
  clearRecentProject({ projectId: payload.projectId });

  let deletedFiles = false;
  if (payload.deleteFiles) {
    const projectsRoot = getRuntimeDirectories().projects;
    const relativePath = impact.projectDirectory.replace(`${projectsRoot}\\`, '').replace(`${projectsRoot}/`, '');
    if (relativePath && pathExists(impact.projectDirectory)) {
      deleteManagedDirectory(projectsRoot, relativePath);
      deletedFiles = true;
    }
  }

  return {
    projectId: payload.projectId,
    deletedFiles,
    filePath: payload.deleteFiles ? impact.projectDirectory : null,
  };
}

export function openProject(payload: ProjectOpenPayload): ProjectOpenResult {
  const project = assertProjectRestorable(assertProjectId(payload.projectId));
  const targetRoute = getProjectEntryRoute();
  const context = toCurrentProjectContext(project);
  writeRecentProjectContext(project, targetRoute);

  return {
    project: context,
    targetRoute,
  };
}

export function restoreRecentProject(): ProjectRestoreRecentResult {
  const recent = readRecentProjectSetting();
  if (!recent) {
    deleteAppSetting(RECENT_PROJECT_SETTING_KEY);
    return {
      project: null,
      targetRoute: 'projects',
      reason: 'empty',
    };
  }

  try {
    const project = assertProjectRestorable(recent.projectId);
    const restored = writeRecentProjectContext(project, getProjectEntryRoute(), recent.openedAt);
    return {
      project: restored.project,
      targetRoute: restored.lastRoute,
      reason: 'restored',
    };
  } catch {
    deleteAppSetting(RECENT_PROJECT_SETTING_KEY);
    return {
      project: null,
      targetRoute: 'projects',
      reason: 'invalid',
    };
  }
}

export function updateRecentProjectRoute(payload: ProjectUpdateRecentRoutePayload): ProjectUpdateRecentRouteResult {
  const projectId = assertProjectId(payload.projectId);
  const recent = readRecentProjectSetting();
  if (!recent || recent.projectId !== projectId) {
    return {
      saved: false,
      recent: null,
    };
  }

  const routeName = normalizeProjectRouteName(payload.routeName, recent.sourceType);
  const next: StoredRecentProject = {
    ...recent,
    lastRoute: routeName,
    updatedAt: Date.now(),
  };
  writeAppSetting(RECENT_PROJECT_SETTING_KEY, JSON.stringify(next));

  return {
    saved: true,
    recent: toProjectRecentContext(next),
  };
}

export function clearRecentProject(payload: ProjectClearRecentPayload = {}): ProjectClearRecentResult {
  const recent = readRecentProjectSetting();
  if (payload.projectId !== undefined) {
    const projectId = assertProjectId(payload.projectId);
    if (!recent || recent.projectId !== projectId) {
      return { cleared: false };
    }
  }

  return {
    cleared: deleteAppSetting(RECENT_PROJECT_SETTING_KEY),
  };
}

export function getProjectFlowStats(payload: ProjectFlowStatsPayload): ProjectFlowStatsResult {
  const projectId = assertProjectId(payload.projectId);
  getProjectRowById(projectId);
  const visualAssetTypes = [ASSET_TYPES.ROLE, ASSET_TYPES.SCENE, ASSET_TYPES.TOOL];
  const visualAssetTypePlaceholders = visualAssetTypes.map(() => '?').join(', ');

  return {
    projectId,
    templateType: DEFAULT_PROJECT_TEMPLATE_TYPE,
    sourceChapterCount: countRows('source_chapters', 'project_id = ?', [projectId]),
    sourceEventSucceededCount: countRows('source_chapters', 'project_id = ? AND event_status = ?', [projectId, SOURCE_EVENT_STATUSES.SUCCEEDED]),
    sourceEventFailedCount: countRows('source_chapters', 'project_id = ? AND event_status = ?', [projectId, SOURCE_EVENT_STATUSES.FAILED]),
    sourceEventRunningCount: countRows('source_chapters', 'project_id = ? AND event_status = ?', [projectId, SOURCE_EVENT_STATUSES.RUNNING]),
    sourceEventStaleCount: countRows('source_chapters', 'project_id = ? AND event_status = ?', [projectId, SOURCE_EVENT_STATUSES.STALE]),
    agentWorkspaceCount: countRows('agent_work_data', 'project_id = ?', [projectId]),
    contentCount: countRows('production_contents', 'project_id = ?', [projectId]) || countRows('scripts', 'project_id = ?', [projectId]),
    resourceExtractSucceededCount: countRows('production_contents', 'project_id = ? AND resource_status = ?', [projectId, GENERATION_TASK_STATUSES.SUCCEEDED]) || countRows('scripts', 'project_id = ? AND extract_status = ?', [projectId, SCRIPT_EXTRACT_STATUSES.SUCCEEDED]),
    resourceExtractFailedCount: countRows('production_contents', 'project_id = ? AND resource_status = ?', [projectId, GENERATION_TASK_STATUSES.FAILED]) || countRows('scripts', 'project_id = ? AND extract_status = ?', [projectId, SCRIPT_EXTRACT_STATUSES.FAILED]),
    resourceExtractRunningCount: countRows('production_contents', 'project_id = ? AND resource_status = ?', [projectId, GENERATION_TASK_STATUSES.RUNNING]) || countRows('scripts', 'project_id = ? AND extract_status IN (?, ?)', [
      projectId,
      SCRIPT_EXTRACT_STATUSES.WAITING,
      SCRIPT_EXTRACT_STATUSES.RUNNING,
    ]),
    assetCount: countRows('assets', 'project_id = ?', [projectId]),
    visualAssetCount: countRows('assets', `project_id = ? AND type IN (${visualAssetTypePlaceholders})`, [projectId, ...visualAssetTypes]),
    assetImageReadyCount: countRows('assets', `project_id = ? AND type IN (${visualAssetTypePlaceholders}) AND image_status = ? AND media_id IS NOT NULL`, [
      projectId,
      ...visualAssetTypes,
      GENERATION_TASK_STATUSES.SUCCEEDED,
    ]),
    assetImageFailedCount: countRows('assets', `project_id = ? AND type IN (${visualAssetTypePlaceholders}) AND image_status = ?`, [
      projectId,
      ...visualAssetTypes,
      GENERATION_TASK_STATUSES.FAILED,
    ]),
    assetImageRunningCount: countRows('assets', `project_id = ? AND type IN (${visualAssetTypePlaceholders}) AND image_status = ?`, [
      projectId,
      ...visualAssetTypes,
      GENERATION_TASK_STATUSES.RUNNING,
    ]),
    audioAssetCount: countRows('assets', 'project_id = ? AND type = ?', [projectId, ASSET_TYPES.AUDIO]),
    audioBindingReadyCount: countAudioLinks(projectId),
    audioBindingFailedCount: countRows('assets', 'project_id = ? AND audio_bind_status = ?', [projectId, GENERATION_TASK_STATUSES.FAILED]),
    audioBindingRunningCount: countRows('assets', 'project_id = ? AND audio_bind_status = ?', [projectId, GENERATION_TASK_STATUSES.RUNNING]),
    storyboardCount: countRows('production_storyboards', 'project_id = ?', [projectId]),
    storyboardImageReadyCount: countRows('production_storyboards', 'project_id = ? AND image_status = ? AND relative_path IS NOT NULL', [
      projectId,
      GENERATION_TASK_STATUSES.SUCCEEDED,
    ]),
    storyboardImageFailedCount: countRows('production_storyboards', 'project_id = ? AND image_status = ?', [projectId, GENERATION_TASK_STATUSES.FAILED]),
    storyboardImageRunningCount: countRows('production_storyboards', 'project_id = ? AND image_status = ?', [projectId, GENERATION_TASK_STATUSES.RUNNING]),
    videoTrackCount: countRows('production_video_tracks', 'project_id = ?', [projectId]),
    selectedVideoTrackCount: countRows('production_video_tracks', 'project_id = ? AND selected_video_id IS NOT NULL', [projectId]),
    videoCandidateCount: countRows('production_videos', 'project_id = ?', [projectId]),
    videoReadyCount: countRows('production_videos', 'project_id = ? AND status = ? AND relative_path IS NOT NULL', [projectId, GENERATION_TASK_STATUSES.SUCCEEDED]),
    videoFailedCount: countRows('production_videos', 'project_id = ? AND status = ?', [projectId, GENERATION_TASK_STATUSES.FAILED]),
    videoRunningCount: countRows('production_videos', 'project_id = ? AND status = ?', [projectId, GENERATION_TASK_STATUSES.RUNNING]),
    failedTaskCount: countRows('tasks', 'project_id = ? AND status = ?', [projectId, TASK_STATUSES.FAILED]),
    runningTaskCount: countRows('tasks', 'project_id = ? AND status = ?', [projectId, TASK_STATUSES.RUNNING]),
    failedTaskSummaries: listProjectFailedTaskSummaries(projectId),
  };
}

export function getProjectManualDetail(payload: ProjectManualGetPayload): ProjectManualSaveResult {
  if (!payload.id || !Number.isInteger(payload.id) || payload.id <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '手册 ID 无效');
  }

  return {
    manual: toManualDetail(payload.kind, getManualById(payload.kind, payload.id)),
  };
}

export function saveProjectManual(payload: ProjectManualSavePayload): ProjectManualSaveResult {
  const name = assertNonEmpty(payload.name, payload.kind === 'visual' ? '视觉手册名称' : '导演手册名称');
  const manualPath = assertSafeDirectoryName(payload.path, payload.kind === 'visual' ? '视觉手册目录名' : '导演手册目录名');
  const tabs = assertManualTabs(payload.kind, payload.tabs);
  const tableName = getManualTableName(payload.kind);
  const root = getManualRoot(payload.kind);
  const now = Date.now();

  if (!payload.id && !payload.coverImageDataUrl) {
    throw createError(VT_STATUS.INVALID_PARAMS, '封面图不能为空');
  }

  const existing = payload.id ? getManualById(payload.kind, payload.id) : null;
  if (existing && existing.path !== manualPath) {
    throw createError(VT_STATUS.INVALID_PARAMS, '编辑时不允许修改目录名');
  }
  if (!existing && fileExists(safeJoin(root, `${manualPath}/README.md`))) {
    throw createError(VT_STATUS.CONFLICT, '目录已存在');
  }

  const coverRelativePath = saveManualFiles(payload.kind, manualPath, tabs, payload.coverImageDataUrl) ?? existing?.cover_relative_path ?? null;
  const tabsJson = JSON.stringify(tabs.map((tab) => ({ key: tab.key, content: tab.content })));

  const manualId = withTransaction((database) => {
    if (existing) {
      database
        .prepare<[string, string, string | null, string, number, number]>(
          `UPDATE ${tableName} SET name = ?, path = ?, cover_relative_path = ?, tabs_json = ?, updated_at = ? WHERE id = ?`,
        )
        .run(name, manualPath, coverRelativePath, tabsJson, now, existing.id);
      return existing.id;
    }

    const insert = database
      .prepare<[string, string, string | null, string, number, number]>(
        `INSERT INTO ${tableName} (name, path, cover_relative_path, tabs_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(name, manualPath, coverRelativePath, tabsJson, now, now);
    return Number(insert.lastInsertRowid);
  });

  return {
    manual: toManualDetail(payload.kind, getManualById(payload.kind, manualId)),
  };
}

export function deleteProjectManual(payload: ProjectManualDeletePayload): ProjectManualDeleteResult {
  if (!payload.id || !Number.isInteger(payload.id) || payload.id <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '手册 ID 无效');
  }

  const existing = getManualById(payload.kind, payload.id);
  const referenceCount = countManualReferences(payload.kind, payload.id);
  if (referenceCount > 0) {
    throw createError(VT_STATUS.CONFLICT, `当前手册仍被 ${referenceCount} 个项目引用，请先解除引用`);
  }

  const tableName = getManualTableName(payload.kind);
  withTransaction((database) => {
    database.prepare<[number]>(`DELETE FROM ${tableName} WHERE id = ?`).run(payload.id);
  });

  deleteManagedDirectory(getManualRoot(payload.kind), existing.path);

  return {
    id: payload.id,
    kind: payload.kind,
  };
}
