import type {
  AssetAudioBindingPayload,
  AssetBatchAudioBindingPayload,
  AssetBatchDeletePayload,
  AssetBatchImagePayload,
  AssetBatchPromptPayload,
  AssetCancelImagePayload,
  AssetDeletePayload,
  AssetImagePayload,
  AssetListPayload,
  AssetMediaDeletePayload,
  AssetMediaSelectPayload,
  AssetPollPayload,
  AssetProjectPayload,
  AssetSavePayload,
  AssetUploadPayload,
  CornerAssetListPayload,
} from '@shared/types/assets';
import {
  batchBindAssetAudio,
  batchGenerateAssetImages,
  batchGenerateAssetPrompts,
  cancelAssetImage,
  deleteAsset,
  deleteAssetMedia,
  deleteAssets,
  generateAssetImage,
  generateAssetPrompt,
  listAssets,
  listCornerAssets,
  pollAssetImageStatus,
  pollAssetPromptStatus,
  pollAudioBindStatus,
  saveAsset,
  selectAssetMedia,
  updateAssetAudioBinding,
  uploadAssetMedia,
} from '../services/assets';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerAssetsIpc(): void {
  handleIpc('assets:list', (_event, payload) => listAssets(readObjectArg<AssetListPayload>(payload)));
  handleIpc('assets:save', (_event, payload) => saveAsset(readObjectArg<AssetSavePayload>(payload)));
  handleIpc('assets:delete', (_event, payload) => deleteAsset(readObjectArg<AssetDeletePayload>(payload)));
  handleIpc('assets:batch-delete', (_event, payload) => deleteAssets(readObjectArg<AssetBatchDeletePayload>(payload)));
  handleIpc('assets:upload-media', (_event, payload) => uploadAssetMedia(readObjectArg<AssetUploadPayload>(payload)));
  handleIpc('assets:generate-prompt', (_event, payload) => generateAssetPrompt(readObjectArg<AssetProjectPayload & { assetId: number; extraInstruction?: string | null }>(payload)));
  handleIpc('assets:batch-generate-prompts', (_event, payload) => batchGenerateAssetPrompts(readObjectArg<AssetBatchPromptPayload>(payload)));
  handleIpc('assets:generate-image', (_event, payload) => generateAssetImage(readObjectArg<AssetImagePayload>(payload)));
  handleIpc('assets:batch-generate-images', (_event, payload) => batchGenerateAssetImages(readObjectArg<AssetBatchImagePayload>(payload)));
  handleIpc('assets:select-media', (_event, payload) => selectAssetMedia(readObjectArg<AssetMediaSelectPayload>(payload)));
  handleIpc('assets:delete-media', (_event, payload) => deleteAssetMedia(readObjectArg<AssetMediaDeletePayload>(payload)));
  handleIpc('assets:cancel-image', (_event, payload) => cancelAssetImage(readObjectArg<AssetCancelImagePayload>(payload)));
  handleIpc('assets:poll-prompt-status', (_event, payload) => pollAssetPromptStatus(readObjectArg<AssetPollPayload>(payload)));
  handleIpc('assets:poll-image-status', (_event, payload) => pollAssetImageStatus(readObjectArg<AssetPollPayload>(payload)));

  handleIpc('corner-scape:list', (_event, payload) => listCornerAssets(readObjectArg<CornerAssetListPayload>(payload)));
  handleIpc('corner-scape:update-audio-binding', (_event, payload) => updateAssetAudioBinding(readObjectArg<AssetAudioBindingPayload>(payload)));
  handleIpc('corner-scape:batch-bind-audio', (_event, payload) => batchBindAssetAudio(readObjectArg<AssetBatchAudioBindingPayload>(payload)));
  handleIpc('corner-scape:poll-audio-bind-status', (_event, payload) => pollAudioBindStatus(readObjectArg<AssetPollPayload>(payload)));
}
