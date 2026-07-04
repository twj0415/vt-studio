import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { ProjectManualKind } from '@shared/constants/dictionaries';
import { getDatabase, runSeed } from '../database';
import { getRuntimeDirectories, safeJoin } from '../file-system';
import { syncDefaultAssets } from './index';
import {
  DEFAULT_DIRECTOR_MANUALS,
  DEFAULT_MAIN_SKILLS,
  DEFAULT_MODEL_PROMPTS,
  DEFAULT_REFERENCE_SKILLS,
  DEFAULT_RESOURCE_TARGETS,
  DEFAULT_SKILL_ATTRIBUTIONS,
  DEFAULT_VENDOR_IDS,
  DEFAULT_VISUAL_MANUALS,
  buildDefaultResourceRegistry,
  getDefaultDataRoot,
  getDefaultManualTabs,
  type DefaultManualDefinition,
  type DefaultResourceRegistryItem,
} from './registry';

export type DefaultAssetDiagnosticStatus = 'ok' | 'warning' | 'error';

export interface DefaultAssetDiagnosticItem {
  id: string;
  label: string;
  kind: DefaultResourceRegistryItem['kind'] | 'database';
  status: DefaultAssetDiagnosticStatus;
  message: string;
  sourcePath: string | null;
  runtimePath: string | null;
  seedTargetTable: string | null;
  pageVisible: boolean;
  chainUsed: boolean;
  autoFixable: boolean;
}

export interface DefaultAssetDiagnosticsResult {
  sourceRoot: string;
  repaired: boolean;
  copied: number;
  skipped: number;
  total: number;
  ok: number;
  warnings: number;
  errors: number;
  items: DefaultAssetDiagnosticItem[];
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);

  return Boolean(row);
}

function createMd5(content: Buffer | string): string {
  return createHash('md5').update(content).digest('hex');
}

function countFiles(directoryPath: string): number {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
    return 0;
  }

  return readdirSync(directoryPath, { withFileTypes: true }).reduce((total, entry) => {
    const targetPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      return total + countFiles(targetPath);
    }

    return total + (entry.isFile() ? 1 : 0);
  }, 0);
}

function getRuntimeRelativePath(item: DefaultResourceRegistryItem): string {
  const target = DEFAULT_RESOURCE_TARGETS.find((entry) => entry.runtimeKey === item.runtimeKey);
  if (!target) {
    return item.sourceRelativePath;
  }

  const prefix = `${target.sourceRelativePath}/`;
  return item.sourceRelativePath.startsWith(prefix)
    ? item.sourceRelativePath.slice(prefix.length)
    : item.sourceRelativePath;
}

function getRuntimePath(item: DefaultResourceRegistryItem): string {
  const directories = getRuntimeDirectories();
  if (item.kind === 'directory') {
    return directories[item.runtimeKey];
  }

  return safeJoin(directories[item.runtimeKey], getRuntimeRelativePath(item));
}

function toItem(
  item: Omit<DefaultAssetDiagnosticItem, 'sourcePath' | 'runtimePath' | 'pageVisible' | 'chainUsed' | 'seedTargetTable'> & {
    sourcePath?: string | null;
    runtimePath?: string | null;
    pageVisible?: boolean;
    chainUsed?: boolean;
    seedTargetTable?: string | null;
  },
): DefaultAssetDiagnosticItem {
  return {
    sourcePath: item.sourcePath ?? null,
    runtimePath: item.runtimePath ?? null,
    seedTargetTable: item.seedTargetTable ?? null,
    pageVisible: item.pageVisible ?? false,
    chainUsed: item.chainUsed ?? false,
    ...item,
  };
}

function diagnoseRegistryItem(sourceRoot: string, item: DefaultResourceRegistryItem): DefaultAssetDiagnosticItem {
  const sourcePath = join(sourceRoot, item.sourceRelativePath);
  const runtimePath = getRuntimePath(item);

  if (item.kind === 'directory') {
    const sourceOk = existsSync(sourcePath) && statSync(sourcePath).isDirectory();
    const runtimeOk = existsSync(runtimePath) && statSync(runtimePath).isDirectory();
    if (!sourceOk) {
      return toItem({
        id: item.id,
        label: item.label,
        kind: item.kind,
        status: 'error',
        message: '内置默认资源目录不存在，无法自动恢复',
        sourcePath,
        runtimePath,
        seedTargetTable: item.seedTargetTable,
        pageVisible: item.pageVisible,
        chainUsed: item.chainUsed,
        autoFixable: false,
      });
    }

    if (!runtimeOk) {
      return toItem({
        id: item.id,
        label: item.label,
        kind: item.kind,
        status: 'warning',
        message: 'runtime 目录不存在，可自动创建并同步',
        sourcePath,
        runtimePath,
        seedTargetTable: item.seedTargetTable,
        pageVisible: item.pageVisible,
        chainUsed: item.chainUsed,
        autoFixable: true,
      });
    }

    return toItem({
      id: item.id,
      label: item.label,
      kind: item.kind,
      status: 'ok',
      message: `目录正常，runtime 文件数 ${countFiles(runtimePath)}`,
      sourcePath,
      runtimePath,
      seedTargetTable: item.seedTargetTable,
      pageVisible: item.pageVisible,
      chainUsed: item.chainUsed,
      autoFixable: false,
    });
  }

  if (!existsSync(sourcePath)) {
    return toItem({
      id: item.id,
      label: item.label,
      kind: item.kind,
      status: 'error',
      message: '内置源文件不存在，无法自动恢复',
      sourcePath,
      runtimePath,
      seedTargetTable: item.seedTargetTable,
      pageVisible: item.pageVisible,
      chainUsed: item.chainUsed,
      autoFixable: false,
    });
  }

  if (!existsSync(runtimePath)) {
    return toItem({
      id: item.id,
      label: item.label,
      kind: item.kind,
      status: 'warning',
      message: 'runtime 文件缺失，可从内置默认资源恢复',
      sourcePath,
      runtimePath,
      seedTargetTable: item.seedTargetTable,
      pageVisible: item.pageVisible,
      chainUsed: item.chainUsed,
      autoFixable: true,
    });
  }

  const runtimeStat = statSync(runtimePath);
  if (!runtimeStat.isFile() || runtimeStat.size <= 0) {
    return toItem({
      id: item.id,
      label: item.label,
      kind: item.kind,
      status: 'error',
      message: 'runtime 文件为空或不是文件，可从内置默认资源恢复',
      sourcePath,
      runtimePath,
      seedTargetTable: item.seedTargetTable,
      pageVisible: item.pageVisible,
      chainUsed: item.chainUsed,
      autoFixable: true,
    });
  }

  return toItem({
    id: item.id,
    label: item.label,
    kind: item.kind,
    status: 'ok',
    message: `文件正常，md5=${createMd5(readFileSync(runtimePath)).slice(0, 8)}`,
    sourcePath,
    runtimePath,
    seedTargetTable: item.seedTargetTable,
    pageVisible: item.pageVisible,
    chainUsed: item.chainUsed,
    autoFixable: false,
  });
}

function addDatabaseItem(
  items: DefaultAssetDiagnosticItem[],
  input: Pick<DefaultAssetDiagnosticItem, 'id' | 'label' | 'status' | 'message' | 'seedTargetTable' | 'autoFixable'>,
): void {
  items.push(
    toItem({
      ...input,
      kind: 'database',
    }),
  );
}

function parseTabsJson(value: string | null | undefined): Array<{ key?: unknown; content?: unknown }> {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function diagnoseVendorRows(db: Database.Database, items: DefaultAssetDiagnosticItem[]): void {
  if (!tableExists(db, 'model_vendors')) {
    addDatabaseItem(items, {
      id: 'database:model_vendors',
      label: '默认供应商表',
      status: 'warning',
      message: 'model_vendors 表不存在，已跳过默认供应商诊断',
      seedTargetTable: 'model_vendors',
      autoFixable: true,
    });
    return;
  }

  const stmt = db.prepare<[string], { id: string; models: string } | undefined>('SELECT id, models FROM model_vendors WHERE id = ? LIMIT 1');
  for (const vendorId of DEFAULT_VENDOR_IDS) {
    const row = stmt.get(vendorId);
    addDatabaseItem(items, {
      id: `database:vendor:${vendorId}`,
      label: `默认供应商记录 ${vendorId}`,
      status: row ? 'ok' : 'error',
      message: row ? '数据库记录正常' : '数据库缺少默认供应商记录，可重新 seed',
      seedTargetTable: 'model_vendors',
      autoFixable: !row,
    });
  }
}

function diagnoseSkillRows(db: Database.Database, items: DefaultAssetDiagnosticItem[]): void {
  if (!tableExists(db, 'skill_list')) {
    addDatabaseItem(items, {
      id: 'database:skill_list',
      label: '默认 Skill 表',
      status: 'warning',
      message: 'skill_list 表不存在，已跳过 Skill 诊断',
      seedTargetTable: 'skill_list',
      autoFixable: true,
    });
    return;
  }

  const root = getRuntimeDirectories().skills;
  const stmt = db.prepare<[string], { id: string; path: string; md5: string; description: string; type: string } | undefined>(
    'SELECT id, path, md5, description, type FROM skill_list WHERE id = ? LIMIT 1',
  );

  for (const skill of [...DEFAULT_MAIN_SKILLS, ...DEFAULT_REFERENCE_SKILLS]) {
    const row = stmt.get(skill.id);
    if (!row) {
      addDatabaseItem(items, {
        id: `database:skill:${skill.id}`,
        label: `默认 Skill 记录 ${skill.name}`,
        status: 'error',
        message: '数据库缺少 Skill 记录，可重新 seed',
        seedTargetTable: 'skill_list',
        autoFixable: true,
      });
      continue;
    }

    const filePath = safeJoin(root, row.path);
    const expectedMd5 = existsSync(filePath) ? createMd5(readFileSync(filePath, 'utf-8')) : '';
    const md5Matches = !expectedMd5 || row.md5 === expectedMd5;
    addDatabaseItem(items, {
      id: `database:skill:${skill.id}`,
      label: `默认 Skill 记录 ${skill.name}`,
      status: row.path === skill.path && row.type === skill.type && md5Matches ? 'ok' : 'warning',
      message:
        row.path === skill.path && row.type === skill.type && md5Matches
          ? '数据库记录正常'
          : '数据库 Skill 路径、类型或 md5 与 runtime 文件不一致，可重新 seed 同步',
      seedTargetTable: 'skill_list',
      autoFixable: true,
    });
  }

  if (!tableExists(db, 'skill_attributions')) {
    addDatabaseItem(items, {
      id: 'database:skill_attributions',
      label: 'Skill 归属表',
      status: 'warning',
      message: 'skill_attributions 表不存在，已跳过归属诊断',
      seedTargetTable: 'skill_attributions',
      autoFixable: true,
    });
    return;
  }

  const attributionStmt = db.prepare<[string, string], { count: number }>(
    'SELECT COUNT(*) as count FROM skill_attributions WHERE skill_id = ? AND attribution = ?',
  );
  for (const row of DEFAULT_SKILL_ATTRIBUTIONS) {
    const count = attributionStmt.get(row.skillId, row.attribution)?.count ?? 0;
    addDatabaseItem(items, {
      id: `database:skill-attribution:${row.skillId}:${row.attribution}`,
      label: `Skill 归属 ${row.attribution}`,
      status: count > 0 ? 'ok' : 'error',
      message: count > 0 ? '归属记录正常' : '缺少 Skill 归属记录，可重新 seed',
      seedTargetTable: 'skill_attributions',
      autoFixable: count <= 0,
    });
  }
}

function diagnoseModelPromptRows(db: Database.Database, items: DefaultAssetDiagnosticItem[]): void {
  if (!tableExists(db, 'model_prompt_templates')) {
    addDatabaseItem(items, {
      id: 'database:model_prompt_templates',
      label: '模型专用提示词表',
      status: 'warning',
      message: 'model_prompt_templates 表不存在，已跳过模型提示词诊断',
      seedTargetTable: 'model_prompt_templates',
      autoFixable: true,
    });
    return;
  }

  const stmt = db.prepare<[string, string], { id: number; content: string } | undefined>(
    'SELECT id, content FROM model_prompt_templates WHERE type = ? AND lower(name) = lower(?) LIMIT 1',
  );

  for (const prompt of DEFAULT_MODEL_PROMPTS) {
    const row = stmt.get(prompt.type, prompt.name);
    addDatabaseItem(items, {
      id: `database:model-prompt:${prompt.relativePath}`,
      label: `模型提示词模板 ${prompt.name}`,
      status: row?.content?.trim() ? 'ok' : 'error',
      message: row?.content?.trim() ? '数据库模板正常' : '数据库缺少模板内容，可重新 seed',
      seedTargetTable: 'model_prompt_templates',
      autoFixable: !row?.content?.trim(),
    });
  }
}

function diagnoseManualRows(
  db: Database.Database,
  items: DefaultAssetDiagnosticItem[],
  kind: ProjectManualKind,
  tableName: 'visual_manuals' | 'director_manuals',
  manuals: DefaultManualDefinition[],
): void {
  if (!tableExists(db, tableName)) {
    addDatabaseItem(items, {
      id: `database:${tableName}`,
      label: kind === 'visual' ? '视觉手册表' : '导演手册表',
      status: 'warning',
      message: `${tableName} 表不存在，已跳过手册诊断`,
      seedTargetTable: tableName,
      autoFixable: true,
    });
    return;
  }

  const tabs = getDefaultManualTabs(kind);
  const stmt = db.prepare<[string], { id: number; tabs_json: string } | undefined>(
    `SELECT id, tabs_json FROM ${tableName} WHERE path = ? LIMIT 1`,
  );

  for (const manual of manuals) {
    const row = stmt.get(manual.path);
    const parsedTabs = parseTabsJson(row?.tabs_json);
    const hasAllTabs = tabs.every((tab) => {
      const found = parsedTabs.find((item) => item.key === tab.key);
      return typeof found?.content === 'string' && found.content.trim();
    });
    addDatabaseItem(items, {
      id: `database:${tableName}:${manual.path}`,
      label: `${kind === 'visual' ? '视觉手册' : '导演手册'} ${manual.name}`,
      status: row && hasAllTabs ? 'ok' : 'error',
      message: row && hasAllTabs ? '数据库手册内容正常' : '数据库手册缺失或 tabs 为空，可重新 seed',
      seedTargetTable: tableName,
      autoFixable: !row || !hasAllTabs,
    });
  }
}

function diagnoseDatabase(items: DefaultAssetDiagnosticItem[]): void {
  const db = getDatabase();
  diagnoseVendorRows(db, items);
  diagnoseSkillRows(db, items);
  diagnoseModelPromptRows(db, items);
  diagnoseManualRows(db, items, 'visual', 'visual_manuals', DEFAULT_VISUAL_MANUALS);
  diagnoseManualRows(db, items, 'director', 'director_manuals', DEFAULT_DIRECTOR_MANUALS);
}

export function diagnoseDefaultAssets(options: { repair?: boolean } = {}): DefaultAssetDiagnosticsResult {
  const sourceRoot = getDefaultDataRoot();
  const syncResult = options.repair ? syncDefaultAssets() : null;
  if (options.repair) {
    runSeed(getDatabase());
  }

  const items = buildDefaultResourceRegistry().map((item) => diagnoseRegistryItem(sourceRoot, item));
  diagnoseDatabase(items);

  const ok = items.filter((item) => item.status === 'ok').length;
  const warnings = items.filter((item) => item.status === 'warning').length;
  const errors = items.filter((item) => item.status === 'error').length;

  return {
    sourceRoot,
    repaired: Boolean(options.repair),
    copied: syncResult?.copied ?? 0,
    skipped: syncResult?.skipped ?? 0,
    total: items.length,
    ok,
    warnings,
    errors,
    items,
  };
}
