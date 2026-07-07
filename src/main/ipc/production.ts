import type {
  ProductionAgentDerivedAssetPayload,
  ProductionAgentStoryboardPayload,
  ProductionAgentWorkspacePatchPayload,
  ProductionBatchDeleteStoryboardsPayload,
  ProductionDerivedAssetDeletePayload,
  ProductionDerivedAssetSavePayload,
  ProductionExtractResourcesPayload,
  ProductionGenerateDerivedAssetsPayload,
  ProductionGenerateStoryboardsPayload,
  ProductionGenerateVideoPayload,
  ProductionGenerateVideoPromptPayload,
  ProductionImageFlowApplyPayload,
  ProductionImageFlowGetPayload,
  ProductionImageFlowSavePayload,
  ProductionPollPayload,
  ProductionSaveWorkspacePayload,
  ProductionScriptPayload,
  ProductionStoryboardDeletePayload,
  ProductionStoryboardSavePayload,
  ProductionVideoDeletePayload,
  ProductionVideoTrackDeletePayload,
  ProductionVideoTrackSavePayload,
  ProductionSelectVideoPayload,
} from '@shared/types/production';
import {
  applyProductionAgentWorkspacePatch,
  applyProductionImageFlowResult,
  createProductionAgentDerivedAsset,
  createProductionAgentStoryboard,
  deleteProductionDerivedAsset,
  deleteProductionStoryboard,
  deleteProductionStoryboards,
  deleteProductionVideo,
  deleteProductionVideoTrack,
  extractProductionResources,
  generateProductionAgentDerivedAssetImages,
  generateProductionAgentStoryboardImages,
  generateProductionDerivedAssetImages,
  generateProductionStoryboardImages,
  generateProductionVideoPrompts,
  generateProductionVideos,
  getProductionAgentContext,
  getProductionAgentTools,
  getProductionImageFlow,
  getProductionWorkbench,
  getProductionWorkspace,
  pollProductionDerivedAssets,
  pollProductionStoryboards,
  pollProductionVideoPrompts,
  pollProductionVideos,
  saveProductionDerivedAsset,
  saveProductionImageFlow,
  saveProductionStoryboard,
  saveProductionVideoTrack,
  saveProductionWorkspace,
  selectProductionVideo,
} from '../services/production';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerProductionIpc(): void {
  handleIpc('production:workspace:get', (_event, payload) => getProductionWorkspace(readObjectArg<ProductionScriptPayload & { scriptId?: number | null }>(payload)));
  handleIpc('production:workspace:save', (_event, payload) => saveProductionWorkspace(readObjectArg<ProductionSaveWorkspacePayload>(payload)));
  handleIpc('production:resources:extract', (_event, payload) => extractProductionResources(readObjectArg<ProductionExtractResourcesPayload>(payload)));

  handleIpc('production:agent:tools', () => getProductionAgentTools());
  handleIpc('production:agent:context', (_event, payload) => getProductionAgentContext(readObjectArg<ProductionScriptPayload>(payload)));
  handleIpc('production:agent:workspace-patch', (_event, payload) => applyProductionAgentWorkspacePatch(readObjectArg<ProductionAgentWorkspacePatchPayload>(payload)));
  handleIpc('production:agent:storyboard:create', (_event, payload) => createProductionAgentStoryboard(readObjectArg<ProductionAgentStoryboardPayload>(payload)));
  handleIpc('production:agent:derived-asset:create', (_event, payload) => createProductionAgentDerivedAsset(readObjectArg<ProductionAgentDerivedAssetPayload>(payload)));
  handleIpc('production:agent:derived-asset:delete', (_event, payload) => deleteProductionDerivedAsset(readObjectArg<ProductionDerivedAssetDeletePayload>(payload)));
  handleIpc('production:agent:storyboard:generate-images', (_event, payload) => generateProductionAgentStoryboardImages(readObjectArg<ProductionGenerateStoryboardsPayload>(payload)));
  handleIpc('production:agent:derived-asset:generate-images', (_event, payload) => generateProductionAgentDerivedAssetImages(readObjectArg<ProductionGenerateDerivedAssetsPayload>(payload)));

  handleIpc('production:storyboard:save', (_event, payload) => saveProductionStoryboard(readObjectArg<ProductionStoryboardSavePayload>(payload)));
  handleIpc('production:storyboard:delete', (_event, payload) => deleteProductionStoryboard(readObjectArg<ProductionStoryboardDeletePayload>(payload)));
  handleIpc('production:storyboard:batch-delete', (_event, payload) => deleteProductionStoryboards(readObjectArg<ProductionBatchDeleteStoryboardsPayload>(payload)));
  handleIpc('production:storyboard:generate-images', (_event, payload) => generateProductionStoryboardImages(readObjectArg<ProductionGenerateStoryboardsPayload>(payload)));
  handleIpc('production:storyboard:poll-images', (_event, payload) => pollProductionStoryboards(readObjectArg<ProductionPollPayload>(payload)));

  handleIpc('production:derived-asset:save', (_event, payload) => saveProductionDerivedAsset(readObjectArg<ProductionDerivedAssetSavePayload>(payload)));
  handleIpc('production:derived-asset:delete', (_event, payload) => deleteProductionDerivedAsset(readObjectArg<ProductionDerivedAssetDeletePayload>(payload)));
  handleIpc('production:derived-asset:generate-images', (_event, payload) => generateProductionDerivedAssetImages(readObjectArg<ProductionGenerateDerivedAssetsPayload>(payload)));
  handleIpc('production:derived-asset:poll-images', (_event, payload) => pollProductionDerivedAssets(readObjectArg<ProductionPollPayload>(payload)));

  handleIpc('production:image-flow:get', (_event, payload) => getProductionImageFlow(readObjectArg<ProductionImageFlowGetPayload>(payload)));
  handleIpc('production:image-flow:save', (_event, payload) => saveProductionImageFlow(readObjectArg<ProductionImageFlowSavePayload>(payload)));
  handleIpc('production:image-flow:apply-result', (_event, payload) => applyProductionImageFlowResult(readObjectArg<ProductionImageFlowApplyPayload>(payload)));

  handleIpc('production:workbench:get', (_event, payload) => getProductionWorkbench(readObjectArg<ProductionScriptPayload>(payload)));
  handleIpc('production:video-track:save', (_event, payload) => saveProductionVideoTrack(readObjectArg<ProductionVideoTrackSavePayload>(payload)));
  handleIpc('production:video-track:delete', (_event, payload) => deleteProductionVideoTrack(readObjectArg<ProductionVideoTrackDeletePayload>(payload)));
  handleIpc('production:video-prompt:generate', (_event, payload) => generateProductionVideoPrompts(readObjectArg<ProductionGenerateVideoPromptPayload>(payload)));
  handleIpc('production:video-prompt:poll', (_event, payload) => pollProductionVideoPrompts(readObjectArg<ProductionPollPayload>(payload)));
  handleIpc('production:video:generate', (_event, payload) => generateProductionVideos(readObjectArg<ProductionGenerateVideoPayload>(payload)));
  handleIpc('production:video:poll', (_event, payload) => pollProductionVideos(readObjectArg<ProductionPollPayload>(payload)));
  handleIpc('production:video:select', (_event, payload) => selectProductionVideo(readObjectArg<ProductionSelectVideoPayload>(payload)));
  handleIpc('production:video:delete', (_event, payload) => deleteProductionVideo(readObjectArg<ProductionVideoDeletePayload>(payload)));
}
