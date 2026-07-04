import { existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const DEMO_CONNECTION_ID = 'vt_demo_media_connection';
const DEMO_MODEL_NAMES = new Set(['vt-demo-image', 'vt-demo-video']);
const CONNECTIONS_KEY = 'modelConnections.v1';
const BINDINGS_KEY = 'modelCapabilityBindings.v1';
const CAPABILITIES = ['text', 'image', 'video', 'tts'];

function candidateUserDataRoots() {
  return [
    process.env.VT_STUDIO_USER_DATA,
    join(tmpdir(), 'VT Studio Dev', 'user-data'),
    join(process.env.LOCALAPPDATA ?? tmpdir(), 'VT Studio', 'user-data'),
  ].filter(Boolean);
}

function countFilesRecursive(path, limit = 5000) {
  if (!existsSync(path)) {
    return { files: 0, directories: 0 };
  }

  let files = 0;
  let directories = 0;
  const stack = [path];

  while (stack.length > 0 && files + directories < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const target = join(current, entry);
      let stat;
      try {
        stat = statSync(target);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        directories += 1;
        stack.push(target);
      } else if (stat.isFile()) {
        files += 1;
      }

      if (files + directories >= limit) {
        break;
      }
    }
  }

  return { files, directories };
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName));
}

function countRows(db, tableName, where = '') {
  if (!tableExists(db, tableName)) {
    return null;
  }

  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} ${where}`).get().count;
}

function countTables(db) {
  return db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count;
}

function readSettingJson(db, key, fallback) {
  if (!tableExists(db, 'app_settings')) {
    return fallback;
  }

  const row = db.prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get(key);
  if (!row?.value) {
    return fallback;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function isDemoConnection(connection) {
  return connection?.id === DEMO_CONNECTION_ID;
}

function isRealReadyConnection(connection) {
  return connection?.status === 'ready' && !isDemoConnection(connection);
}

function getModelsByCapability(connections) {
  const result = Object.fromEntries(CAPABILITIES.map((capability) => [capability, 0]));

  for (const connection of connections) {
    if (!isRealReadyConnection(connection) || !Array.isArray(connection.models)) {
      continue;
    }

    for (const model of connection.models) {
      if (CAPABILITIES.includes(model?.type) && !DEMO_MODEL_NAMES.has(model.modelName)) {
        result[model.type] += 1;
      }
    }
  }

  return result;
}

function getValidBindings(connections, bindings) {
  const result = {};

  for (const capability of CAPABILITIES) {
    const binding = bindings?.[capability];
    const connection = connections.find((item) => item.id === binding?.connectionId);
    const model = connection?.models?.find((item) => item.modelName === binding?.modelName);
    result[capability] = Boolean(
      binding &&
        isRealReadyConnection(connection) &&
        model?.type === capability &&
        !DEMO_MODEL_NAMES.has(model.modelName),
    );
  }

  return result;
}

function getStatusCounts(db, tableName, statusColumn) {
  if (!tableExists(db, tableName)) {
    return null;
  }

  const rows = db.prepare(`SELECT ${statusColumn} AS status, COUNT(*) AS count FROM ${tableName} GROUP BY ${statusColumn}`).all();
  return Object.fromEntries(rows.map((row) => [row.status ?? 'null', row.count]));
}

function inspectDatabase(databasePath, userDataRoot) {
  if (!existsSync(databasePath)) {
    return { exists: false };
  }

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const connections = readSettingJson(db, CONNECTIONS_KEY, []);
    const bindings = readSettingJson(db, BINDINGS_KEY, {});
    const realConnections = connections.filter((connection) => !isDemoConnection(connection));
    const readyConnections = realConnections.filter(isRealReadyConnection);
    const modelsByCapability = getModelsByCapability(connections);
    const validBindings = getValidBindings(connections, bindings);

    const storyboardsWithImages = countRows(db, 'production_storyboards', "WHERE relative_path IS NOT NULL AND trim(relative_path) != ''");
    const videosWithFiles = countRows(db, 'production_videos', "WHERE relative_path IS NOT NULL AND trim(relative_path) != ''");
    const selectedTracks = countRows(db, 'production_video_tracks', 'WHERE selected_video_id IS NOT NULL');
    const completedSelectedVideos = tableExists(db, 'production_video_tracks') && tableExists(db, 'production_videos')
      ? db.prepare(`
          SELECT COUNT(*) AS count
          FROM production_video_tracks t
          JOIN production_videos v ON v.id = t.selected_video_id
          WHERE t.selected_video_id IS NOT NULL
            AND v.status = 'succeeded'
            AND v.relative_path IS NOT NULL
            AND trim(v.relative_path) != ''
        `).get().count
      : null;

    const demoResiduals = {
      modelConnections: connections.filter((connection) => isDemoConnection(connection)).length,
      visualManuals: countRows(db, 'visual_manuals', "WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'"),
      directorManuals: countRows(db, 'director_manuals', "WHERE path LIKE 'vt_demo_%' OR name LIKE '[演示]%'"),
      modelVendors: countRows(db, 'model_vendors', `WHERE id = '${DEMO_CONNECTION_ID}'`),
    };

    return {
      exists: true,
      path: databasePath,
      tables: countTables(db),
      projects: countRows(db, 'projects'),
      sourceChapters: countRows(db, 'source_chapters'),
      scripts: countRows(db, 'scripts'),
      assets: countRows(db, 'assets'),
      assetMedia: countRows(db, 'asset_media'),
      productionWorkspaces: countRows(db, 'production_workspaces'),
      storyboards: countRows(db, 'production_storyboards'),
      storyboardsWithImages,
      imageFlows: countRows(db, 'production_image_flows'),
      videoTracks: countRows(db, 'production_video_tracks'),
      selectedTracks,
      videos: countRows(db, 'production_videos'),
      videosWithFiles,
      completedSelectedVideos,
      exportTasks: countRows(db, 'tasks', "WHERE category = 'export'"),
      taskStatus: getStatusCounts(db, 'tasks', 'status'),
      sourceEventStatus: getStatusCounts(db, 'source_chapters', 'event_status'),
      assetImageStatus: getStatusCounts(db, 'assets', 'image_status'),
      storyboardImageStatus: getStatusCounts(db, 'production_storyboards', 'image_status'),
      videoStatus: getStatusCounts(db, 'production_videos', 'status'),
      modelConnections: {
        total: connections.length,
        real: realConnections.length,
        ready: readyConnections.length,
        modelsByCapability,
        validBindings,
      },
      demoResiduals,
      directories: {
        projects: countFilesRecursive(join(userDataRoot, 'projects')),
        assets: countFilesRecursive(join(userDataRoot, 'assets')),
        exports: countFilesRecursive(join(userDataRoot, 'exports')),
      },
    };
  } finally {
    db.close();
  }
}

function summarizeReadiness(result) {
  if (!result.exists) {
    return ['数据库不存在，无法进行真实数据验收'];
  }

  const blockers = [];

  if (!result.projects) {
    blockers.push('没有真实项目');
  }
  if (!result.sourceChapters) {
    blockers.push('没有真实原文章节');
  }
  if (!result.scripts) {
    blockers.push('没有真实剧本');
  }
  if (!result.modelConnections.validBindings.text) {
    blockers.push('没有可用文本模型绑定');
  }
  if (!result.modelConnections.validBindings.image) {
    blockers.push('没有可用图片模型绑定');
  }
  if (!result.modelConnections.validBindings.video) {
    blockers.push('没有可用视频模型绑定');
  }
  if (!result.storyboards) {
    blockers.push('没有生产分镜');
  }
  if (!result.selectedTracks || !result.completedSelectedVideos) {
    blockers.push('没有可用于 P10 导出的已选成功视频');
  }
  if (Object.values(result.demoResiduals).some((count) => Number(count ?? 0) > 0)) {
    blockers.push('仍存在明确标识的历史演示数据，需要启动 seed 清理后再验收');
  }

  return blockers.length > 0 ? blockers : ['具备完整 P5-P10 真实数据走查输入'];
}

const roots = candidateUserDataRoots();
const reports = roots.map((root) => {
  const databasePath = join(root, 'database', 'vt-studio.sqlite');
  const database = inspectDatabase(databasePath, root);
  return {
    userDataRoot: root,
    database,
    readiness: summarizeReadiness(database),
  };
});

const best = reports.find((report) => report.database.exists) ?? reports[0];

console.log(JSON.stringify({
  inspectedAt: new Date().toISOString(),
  workspace: process.cwd(),
  candidates: reports,
  selected: best,
}, null, 2));
