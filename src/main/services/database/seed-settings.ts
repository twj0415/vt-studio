import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { DEFAULT_MODEL_ONNX_FILE } from '../default-assets/registry';
import { insertIfMissing } from './seed-helpers';

const DEFAULT_SETTINGS: Array<{ key: string; value: string }> = [
  { key: 'messagesPerSummary', value: '10' },
  { key: 'shortTermLimit', value: '5' },
  { key: 'summaryMaxLength', value: '500' },
  { key: 'summaryLimit', value: '10' },
  { key: 'ragLimit', value: '3' },
  { key: 'deepRetrieveSummaryLimit', value: '5' },
  { key: 'modelOnnxFile', value: JSON.stringify(DEFAULT_MODEL_ONNX_FILE) },
  { key: 'modelDtype', value: 'fp16' },
  { key: 'switchAiDevTool', value: '0' },
  { key: 'chapterReg', value: '/第\\s*([0-9０-９零一二三四五六七八九十百千万]+)\\s*[章回节]\\s*([^\\n\\r]*)/g' },
  { key: 'requestTimeoutMs', value: '600000' },
  { key: 'canvasWheelMode', value: 'zoom' },
  { key: 'showInteractionState', value: 'true' },
  { key: 'assetsBatchGenerateSize', value: '5' },
  { key: 'scriptEpisodeLength', value: '5000' },
];

export function seedSettings(db: Database.Database, now: number): void {
  const tokenKey = randomUUID().replace(/-/g, '').slice(0, 8);
  insertIfMissing(
    db,
    'app_settings',
    'key',
    'tokenKey',
    'INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ['tokenKey', tokenKey, now, now],
  );

  for (const { key, value } of DEFAULT_SETTINGS) {
    insertIfMissing(
      db,
      'app_settings',
      'key',
      key,
      'INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [key, value, now, now],
    );
  }
}
