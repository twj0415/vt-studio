import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const workspaceRoot = process.cwd();
const requireDatabase = process.argv.includes('--require-db');
const baselinePath = readOption('--baseline');
const writeBaselinePath = readOption('--write-baseline');

const defaultResourceFiles = [
  'resources/default-data/skills/references/derive_assets_extraction.md',
  'resources/default-data/skills/references/storyboard_generation.md',
  'resources/default-data/skills/references/video_dialogue_extract.md',
  'resources/default-data/skills/references/quality_criteria.md',
  'resources/default-data/skills/references/pipeline.md',
  'resources/default-data/skills/references/script_format.md',
  'resources/default-data/skills/production_agent_decision.md',
  'resources/default-data/skills/production_agent_execution.md',
  'resources/default-data/skills/production_agent_supervision.md',
  'resources/default-data/skills/production_execution_derive_assets.md',
  'resources/default-data/skills/production_execution_director_plan.md',
  'resources/default-data/skills/production_execution_generate_assets.md',
  'resources/default-data/skills/production_execution_storyboard_gen.md',
  'resources/default-data/skills/production_execution_storyboard_panel.md',
  'resources/default-data/skills/production_execution_storyboard_table.md',
  'resources/default-data/modelPrompt/video/seedance2Multi-parameterMode.md',
  'resources/default-data/modelPrompt/video/universalFirstAndLastFrameMode.md',
  'resources/default-data/modelPrompt/video/universalMulti-parameterMode.md',
  'resources/default-data/modelPrompt/video/wan2.6Single-imageFirstFrameMode.md',
  'resources/default-data/assets/ending.mp4',
];

const protectedTables = [
  'assets',
  'asset_media',
  'asset_audio_links',
  'visual_manuals',
  'director_manuals',
  'prompts',
  'skill_list',
  'skill_attributions',
  'model_prompt_templates',
  'model_prompt_mappings',
  'model_vendors',
  'agent_model_configs',
  'app_settings',
  'projects',
];

const requiredSettingKeys = [
  'modelOnnxFile',
  'modelDtype',
  'requestTimeoutMs',
  'canvasWheelMode',
  'assetsBatchGenerateSize',
  'scriptEpisodeLength',
];

const requiredAgentKeys = [
  'productionAgent',
  'productionAgent:decisionAgent',
  'productionAgent:supervisionAgent',
  'productionAgent:deriveAssetsAgent',
  'productionAgent:generateAssetsAgent',
  'productionAgent:directorPlanAgent',
  'productionAgent:storyboardGenAgent',
  'productionAgent:storyboardPanelAgent',
  'productionAgent:storyboardTableAgent',
];

function readOption(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1] ?? '';
  }

  return '';
}

function resolveDatabaseCandidates() {
  const candidates = [];
  if (process.env.VT_STUDIO_DATABASE) {
    candidates.push(process.env.VT_STUDIO_DATABASE);
  }
  if (process.env.VT_STUDIO_USER_DATA) {
    candidates.push(join(process.env.VT_STUDIO_USER_DATA, 'database', 'vt-studio.sqlite'));
  }
  candidates.push(join(tmpdir(), 'VT Studio Dev', 'user-data', 'database', 'vt-studio.sqlite'));
  if (process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'VT Studio', 'user-data', 'database', 'vt-studio.sqlite'));
  }
  return Array.from(new Set(candidates.map((item) => resolve(item))));
}

function tableExists(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName);
  return Boolean(row);
}

function countRows(db, tableName) {
  if (!tableExists(db, tableName)) {
    return null;
  }

  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function countWhere(db, tableName, whereSql, params = []) {
  if (!tableExists(db, tableName)) {
    return null;
  }

  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereSql}`).get(...params).count;
}

function getDatabasePath() {
  return resolveDatabaseCandidates().find((candidate) => existsSync(candidate)) ?? null;
}

function verifyDefaultFiles() {
  const missingFiles = defaultResourceFiles.filter((relativePath) => !existsSync(join(workspaceRoot, relativePath)));
  if (missingFiles.length > 0) {
    throw new Error(`默认生产资源缺失:\n${missingFiles.join('\n')}`);
  }

  return {
    checked: defaultResourceFiles.length,
    missing: 0,
  };
}

function createDatabaseSnapshot(databasePath) {
  if (!databasePath) {
    if (requireDatabase) {
      throw new Error(`未找到运行时数据库，已检查:\n${resolveDatabaseCandidates().join('\n')}`);
    }

    return null;
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (error) {
    if (requireDatabase) {
      throw error;
    }

    return {
      path: databasePath,
      skipped: true,
      reason: `better-sqlite3 当前原生模块与本机 Node ABI 不匹配，已跳过数据库快照：${error.message}`,
    };
  }

  let db;
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true });
  } catch (error) {
    if (requireDatabase) {
      throw error;
    }

    return {
      path: databasePath,
      skipped: true,
      reason: `better-sqlite3 当前原生模块与本机 Node ABI 不匹配，已跳过数据库快照：${error.message}`,
    };
  }

  try {
    const tables = Object.fromEntries(protectedTables.map((tableName) => [tableName, countRows(db, tableName)]));
    const settings = Object.fromEntries(requiredSettingKeys.map((key) => [key, countWhere(db, 'app_settings', 'key = ?', [key])]));
    const agents = Object.fromEntries(requiredAgentKeys.map((key) => [key, countWhere(db, 'agent_model_configs', 'key = ?', [key])]));
    const promptTypes = {
      eventExtraction: countWhere(db, 'prompts', 'type = ?', ['eventExtraction']),
      scriptAssetExtraction: countWhere(db, 'prompts', 'type = ?', ['scriptAssetExtraction']),
      videoPromptGeneration: countWhere(db, 'prompts', 'type = ?', ['videoPromptGeneration']),
    };

    const missingTables = Object.entries(tables)
      .filter(([, count]) => count === null)
      .map(([tableName]) => tableName);
    const missingSettings = Object.entries(settings)
      .filter(([, count]) => count === 0)
      .map(([key]) => key);
    const missingAgents = Object.entries(agents)
      .filter(([, count]) => count === 0)
      .map(([key]) => key);

    if (missingTables.length > 0) {
      throw new Error(`运行时数据库缺少受保护表:\n${missingTables.join('\n')}`);
    }
    if (missingSettings.length > 0) {
      throw new Error(`运行时数据库缺少基础设置:\n${missingSettings.join('\n')}`);
    }
    if (missingAgents.length > 0) {
      throw new Error(`运行时数据库缺少生产 Agent 配置:\n${missingAgents.join('\n')}`);
    }

    return {
      path: databasePath,
      tables,
      settings,
      agents,
      promptTypes,
    };
  } finally {
    db.close();
  }
}

function readBaseline(filePath) {
  if (!filePath) {
    return null;
  }

  return JSON.parse(readFileSync(resolve(workspaceRoot, filePath), 'utf8'));
}

function compareBaseline(snapshot, baseline) {
  if (!baseline) {
    return;
  }
  if (!snapshot.database || !baseline.database) {
    throw new Error('baseline 对比需要当前快照和 baseline 都包含 database 数据');
  }

  const failures = [];
  for (const tableName of protectedTables) {
    const current = snapshot.database.tables[tableName];
    const previous = baseline.database.tables[tableName];
    if (typeof current === 'number' && typeof previous === 'number' && current < previous) {
      failures.push(`${tableName}: ${previous} -> ${current}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`受保护资源或配置数量下降:\n${failures.join('\n')}`);
  }
}

function writeBaseline(snapshot, filePath) {
  if (!filePath) {
    return;
  }

  const target = resolve(workspaceRoot, filePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  defaultFiles: verifyDefaultFiles(),
  database: createDatabaseSnapshot(getDatabasePath()),
};

compareBaseline(snapshot, readBaseline(baselinePath));
writeBaseline(snapshot, writeBaselinePath);

console.log(JSON.stringify(snapshot, null, 2));
console.log('[verify-production-resource-guard] passed');
