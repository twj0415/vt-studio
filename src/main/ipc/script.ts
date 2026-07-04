import type {
  ScriptBatchCreatePayload,
  ScriptBatchDeletePayload,
  ScriptDeletePayload,
  ScriptExportZipPayload,
  ScriptExtractAssetsPayload,
  ScriptGenerateParseRegexPayload,
  ScriptListPayload,
  ScriptPollExtractStatusPayload,
  ScriptSavePayload,
} from '@shared/types/script';
import {
  batchCreateScripts,
  deleteScript,
  deleteScripts,
  exportScriptsZip,
  extractScriptAssets,
  generateScriptParseRegex,
  listScripts,
  pollScriptExtractStatus,
  saveScript,
} from '../services/script';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerScriptIpc(): void {
  handleIpc('script:list', (_event, payload) => listScripts(readObjectArg<ScriptListPayload>(payload)));
  handleIpc('script:save', (_event, payload) => saveScript(readObjectArg<ScriptSavePayload>(payload)));
  handleIpc('script:batch-create', (_event, payload) => batchCreateScripts(readObjectArg<ScriptBatchCreatePayload>(payload)));
  handleIpc('script:delete', (_event, payload) => deleteScript(readObjectArg<ScriptDeletePayload>(payload)));
  handleIpc('script:batch-delete', (_event, payload) => deleteScripts(readObjectArg<ScriptBatchDeletePayload>(payload)));
  handleIpc('script:export-zip', (_event, payload) => exportScriptsZip(readObjectArg<ScriptExportZipPayload>(payload)));
  handleIpc('script:generate-parse-regex', (_event, payload) => generateScriptParseRegex(readObjectArg<ScriptGenerateParseRegexPayload>(payload)));
  handleIpc('script:extract-assets', (_event, payload) => extractScriptAssets(readObjectArg<ScriptExtractAssetsPayload>(payload)));
  handleIpc('script:poll-extract-status', (_event, payload) => pollScriptExtractStatus(readObjectArg<ScriptPollExtractStatusPayload>(payload)));
}
