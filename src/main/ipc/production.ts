import type {
  ProductionAgentDerivedAssetPayload,
  ProductionAgentStoryboardPayload,
  ProductionAgentWorkspacePatchPayload,
  ProductionBatchDeleteStoryboardsPayload,
  ProductionContentDeletePayload,
  ProductionContentPayload,
  ProductionContentScopedPayload,
  ProductionContentSavePayload,
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
  ProductionPollResourceExtractionPayload,
  ProductionProjectPayload,
  ProductionResourceContextPayload,
  ProductionResourceDraftCommitPayload,
  ProductionResourceDraftDeletePayload,
  ProductionResourceDraftListPayload,
  ProductionResourceDraftSavePayload,
  ProductionRunWorkflowActionPayload,
  ProductionSaveDirectorPlanPayload,
  ProductionSaveFlowPositionsPayload,
  ProductionSaveStoryboardTablePayload,
  ProductionSaveWorkspacePayload,
  ProductionStoryboardDeletePayload,
  ProductionStoryboardSavePayload,
  ProductionToolRunPayload,
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
  deleteProductionContent,
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
  getProductionContent,
  getProductionFlowData,
  getProductionImageFlow,
  getProductionResourceContext,
  getProductionSkillBundle,
  getProductionWorkflowState,
  getProductionWorkbench,
  getProductionWorkspace,
  listProductionResourceDrafts,
  listProductionContents,
  pollProductionDerivedAssets,
  pollProductionResourceExtraction,
  pollProductionStoryboards,
  pollProductionVideoPrompts,
  pollProductionVideos,
  saveProductionDerivedAsset,
  saveProductionContent,
  saveProductionDirectorPlan,
  saveProductionFlowPositions,
  saveProductionImageFlow,
  saveProductionResourceDraft,
  saveProductionStoryboardTable,
  saveProductionStoryboard,
  saveProductionVideoTrack,
  saveProductionWorkspace,
  selectProductionVideo,
  commitProductionResourceDrafts,
  deleteProductionResourceDraft,
  runProductionTool,
  runProductionWorkflowAction,
} from '../services/production';
import { handleIpc } from './handle';

function readObjectArg<T extends object>(value: unknown): T {
  return value && typeof value === 'object' ? (value as T) : ({} as T);
}

export function registerProductionIpc(): void {
  handleIpc('production:resource-context:get', (_event, payload) => getProductionResourceContext(readObjectArg<ProductionResourceContextPayload>(payload)));
  handleIpc('production:skill-bundle:get', (_event, payload) => getProductionSkillBundle(readObjectArg<ProductionResourceContextPayload>(payload)));

  handleIpc('production:content:list', (_event, payload) => listProductionContents(readObjectArg<ProductionProjectPayload>(payload)));
  handleIpc('production:content:get', (_event, payload) => getProductionContent(readObjectArg<ProductionContentPayload>(payload)));
  handleIpc('production:content:save', (_event, payload) => saveProductionContent(readObjectArg<ProductionContentSavePayload>(payload)));
  handleIpc('production:content:delete', (_event, payload) => deleteProductionContent(readObjectArg<ProductionContentDeletePayload>(payload)));

  handleIpc('production:flow-data:get', (_event, payload) => getProductionFlowData(readObjectArg<ProductionContentPayload>(payload)));
  handleIpc('production:workspace:positions:save', (_event, payload) => saveProductionFlowPositions(readObjectArg<ProductionSaveFlowPositionsPayload>(payload)));
  handleIpc('production:director-plan:save', (_event, payload) => saveProductionDirectorPlan(readObjectArg<ProductionSaveDirectorPlanPayload>(payload)));
  handleIpc('production:storyboard-table:save', (_event, payload) => saveProductionStoryboardTable(readObjectArg<ProductionSaveStoryboardTablePayload>(payload)));

  handleIpc('production:workspace:get', (_event, payload) => getProductionWorkspace(readObjectArg<ProductionProjectPayload & { contentId?: number | null }>(payload)));
  handleIpc('production:workspace:save', (_event, payload) => saveProductionWorkspace(readObjectArg<ProductionSaveWorkspacePayload>(payload)));
  handleIpc('production:resources:extract', (_event, payload) => extractProductionResources(readObjectArg<ProductionExtractResourcesPayload>(payload)));
  handleIpc('production:resources:poll-extract-status', (_event, payload) => pollProductionResourceExtraction(readObjectArg<ProductionPollResourceExtractionPayload>(payload)));
  handleIpc('production:resources:list-drafts', (_event, payload) => listProductionResourceDrafts(readObjectArg<ProductionResourceDraftListPayload>(payload)));
  handleIpc('production:resources:save-draft', (_event, payload) => saveProductionResourceDraft(readObjectArg<ProductionResourceDraftSavePayload>(payload)));
  handleIpc('production:resources:delete-draft', (_event, payload) => deleteProductionResourceDraft(readObjectArg<ProductionResourceDraftDeletePayload>(payload)));
  handleIpc('production:resources:commit-drafts', (_event, payload) => commitProductionResourceDrafts(readObjectArg<ProductionResourceDraftCommitPayload>(payload)));
  handleIpc('production:workflow:state', (_event, payload) => getProductionWorkflowState(readObjectArg<ProductionContentPayload>(payload)));
  handleIpc('production:workflow:run-action', (_event, payload) => runProductionWorkflowAction(readObjectArg<ProductionRunWorkflowActionPayload>(payload)));
  handleIpc('production:tools:run', (_event, payload) => runProductionTool(readObjectArg<ProductionToolRunPayload>(payload)));

  handleIpc('production:agent:tools', () => getProductionAgentTools());
  handleIpc('production:agent:context', (_event, payload) => getProductionAgentContext(readObjectArg<ProductionContentScopedPayload>(payload)));
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

  handleIpc('production:workbench:get', (_event, payload) => getProductionWorkbench(readObjectArg<ProductionContentScopedPayload>(payload)));
  handleIpc('production:video-track:save', (_event, payload) => saveProductionVideoTrack(readObjectArg<ProductionVideoTrackSavePayload>(payload)));
  handleIpc('production:video-track:delete', (_event, payload) => deleteProductionVideoTrack(readObjectArg<ProductionVideoTrackDeletePayload>(payload)));
  handleIpc('production:video-prompt:generate', (_event, payload) => generateProductionVideoPrompts(readObjectArg<ProductionGenerateVideoPromptPayload>(payload)));
  handleIpc('production:video-prompt:poll', (_event, payload) => pollProductionVideoPrompts(readObjectArg<ProductionPollPayload>(payload)));
  handleIpc('production:video:generate', (_event, payload) => generateProductionVideos(readObjectArg<ProductionGenerateVideoPayload>(payload)));
  handleIpc('production:video:poll', (_event, payload) => pollProductionVideos(readObjectArg<ProductionPollPayload>(payload)));
  handleIpc('production:video:select', (_event, payload) => selectProductionVideo(readObjectArg<ProductionSelectVideoPayload>(payload)));
  handleIpc('production:video:delete', (_event, payload) => deleteProductionVideo(readObjectArg<ProductionVideoDeletePayload>(payload)));
}
