const Database = require('better-sqlite3');
const { writeFileSync } = require('node:fs');

const databasePath = 'C:\\Users\\Twj\\AppData\\Local\\Temp\\VT Studio Dev\\user-data\\database\\vt-studio.sqlite';
const database = new Database(databasePath, { readonly: true, fileMustExist: true });

const vendors = database
  .prepare('SELECT id, models, enabled, updated_at FROM model_vendors ORDER BY id')
  .all()
  .map((row) => ({
    id: row.id,
    enabled: row.enabled,
    models: JSON.parse(row.models || '[]').map((model) => ({
      name: model.name,
      modelName: model.modelName,
      type: model.type,
      mode: model.mode,
      think: model.think,
      reasoning: model.reasoning,
      audio: model.audio,
      durationResolutionMap: model.durationResolutionMap,
      voices: model.voices,
    })),
    updatedAt: row.updated_at,
  }));
const connectionRow = database
  .prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1')
  .get('modelConnections.v1');
const recentVideos = database
  .prepare(`
    SELECT id, project_id, script_id, track_id, status, mode_json, reference_json,
      resolution, duration, audio_enabled, error_reason, generation_metadata, created_at
    FROM production_videos
    ORDER BY id DESC
    LIMIT 12
  `)
  .all()
  .map((row) => {
    const references = JSON.parse(row.reference_json || '[]');
    const metadata = JSON.parse(row.generation_metadata || '{}');
    return {
      id: row.id,
      projectId: row.project_id,
      scriptId: row.script_id,
      trackId: row.track_id,
      status: row.status,
      mode: JSON.parse(row.mode_json || 'null'),
      references: references.map((reference) => ({
        id: reference.id,
        source: reference.source,
        fileType: reference.fileType,
        hasUrl: Boolean(reference.url),
      })),
      resolution: row.resolution,
      duration: row.duration,
      audioEnabled: row.audio_enabled === 1,
      errorReason: row.error_reason,
      snapshot: {
        source: metadata.source,
        model: metadata.model,
        runtime: metadata.runtime,
        referenceCount: metadata.references?.referenceCount,
      },
      createdAt: row.created_at,
    };
  });

const rawConnections = connectionRow ? JSON.parse(connectionRow.value) : [];
const connections = rawConnections.map((connection) => ({
  id: connection.id,
  name: connection.name,
  serviceType: connection.serviceType,
  protocolType: connection.protocolType,
  baseUrlHost: connection.baseUrl ? new URL(connection.baseUrl).host : '',
  capabilities: connection.capabilities,
  models: (connection.models || []).map((model) => ({
    id: model.id,
    displayName: model.displayName,
    modelName: model.modelName,
    type: model.type,
    think: model.think,
    reasoning: model.reasoning,
    imageModes: model.imageModes,
    videoModes: model.videoModes,
    durationOptions: model.durationOptions,
    resolutionOptions: model.resolutionOptions,
    aspectRatioOptions: model.aspectRatioOptions,
    audioSupport: model.audioSupport,
    voices: model.voices,
  })),
}));

const output = JSON.stringify({
  vendors,
  connections,
  recentVideos,
}, null, 2);

writeFileSync('D:\\project\\vt-studio\\scripts\\inspect-current-models.json', output, 'utf8');

database.close();
