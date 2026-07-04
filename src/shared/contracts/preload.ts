import type { AppInfo } from '@shared/types/app';
import type {
  ExternalLinkListResult,
  ExternalLinkOpenPayload,
  ExternalLinkOpenResult,
  WindowStateResult,
} from '@shared/types/shell';
import type {
  ProjectClearRecentPayload,
  ProjectClearRecentResult,
  ProjectDeleteImpactPayload,
  ProjectDeleteImpactResult,
  ProjectDeletePayload,
  ProjectDeleteResult,
  ProjectExportPackagePayload,
  ProjectExportPackageResult,
  ProjectFlowStatsPayload,
  ProjectFlowStatsResult,
  ProjectImportPackagePayload,
  ProjectImportPackageResult,
  ProjectManualDeletePayload,
  ProjectManualDeleteResult,
  ProjectManualGetPayload,
  ProjectManualSavePayload,
  ProjectManualSaveResult,
  ProjectOpenPackagePayload,
  ProjectOpenPackageResult,
  ProjectOpenPayload,
  ProjectOpenResult,
  ProjectPageStateResult,
  ProjectRestoreRecentResult,
  ProjectSavePayload,
  ProjectSaveResult,
  ProjectUpdateRecentRoutePayload,
  ProjectUpdateRecentRouteResult,
} from '@shared/types/project';
import type {
  AuthCurrentUserPayload,
  AuthLoginPayload,
  AuthLoginResult,
  AuthUpdateLocalUserPayload,
  AuthUpdateLocalUserResult,
  AuthUser,
  AuthValidateSessionPayload,
  AuthValidateSessionResult,
} from '@shared/types/auth';
import type { VtResponse } from '@shared/types/response';
import type { AgentSocketInfo } from '@shared/types/socket';
import type {
  ScriptAgentClearMemoryPayload,
  ScriptAgentClearMemoryResult,
  ScriptAgentDeleteScriptPayload,
  ScriptAgentDeleteScriptResult,
  ScriptAgentGetWorkspaceResult,
  ScriptAgentMemoryHistoryResult,
  ScriptAgentModelCapabilityResult,
  ScriptAgentProjectPayload,
  ScriptAgentScriptUpsertPayload,
  ScriptAgentScriptUpsertResult,
  ScriptAgentSourceEventCheckResult,
  ScriptAgentUpdateWorkspaceFieldPayload,
} from '@shared/types/script-agent';
import type {
  TaskCategoryOptionsPayload,
  TaskCategoryOptionsResult,
  TaskListPayload,
  TaskListResult,
  TaskProjectOptionsResult,
} from '@shared/types/task';
import type {
  SourceDeleteChapterPayload,
  SourceDeleteChaptersPayload,
  SourceDeleteResult,
  SourceGenerateEventsPayload,
  SourceGenerateEventsResult,
  SourceImportPayload,
  SourceImportResult,
  SourceListPayload,
  SourceListResult,
  SourcePollEventStatusPayload,
  SourcePollEventStatusResult,
  SourceUpdateChapterPayload,
  SourceUpdateChapterResult,
} from '@shared/types/source';
import type {
  ScriptBatchCreatePayload,
  ScriptBatchCreateResult,
  ScriptBatchDeletePayload,
  ScriptDeletePayload,
  ScriptDeleteResult,
  ScriptExportZipPayload,
  ScriptExportZipResult,
  ScriptExtractAssetsPayload,
  ScriptExtractAssetsResult,
  ScriptGenerateParseRegexPayload,
  ScriptGenerateParseRegexResult,
  ScriptListPayload,
  ScriptListResult,
  ScriptPollExtractStatusPayload,
  ScriptPollExtractStatusResult,
  ScriptSavePayload,
  ScriptSaveResult,
} from '@shared/types/script';
import type {
  AssetAudioBindingPayload,
  AssetAudioBindingResult,
  AssetBatchAudioBindingPayload,
  AssetBatchDeletePayload,
  AssetBatchImagePayload,
  AssetBatchPromptPayload,
  AssetCancelImagePayload,
  AssetDeletePayload,
  AssetDeleteResult,
  AssetGenerateAcceptedResult,
  AssetImagePayload,
  AssetListPayload,
  AssetListResult,
  AssetMediaDeletePayload,
  AssetMediaSelectPayload,
  AssetPollPayload,
  AssetPollResult,
  AssetProjectPayload,
  AssetSavePayload,
  AssetSaveResult,
  AssetUploadPayload,
  AssetUploadResult,
  CornerAssetListPayload,
  CornerAssetListResult,
} from '@shared/types/assets';
import type { AgentConfigResult, AgentConfigSavePayload, AgentConfigSaveResult } from '@shared/types/agent-config';
import type {
  ApiConnectionDeletePayload,
  ApiConnectionDeleteResult,
  ApiConnectionListResult,
  ApiConnectionSavePayload,
  ApiConnectionSaveResult,
  ApiConnectionTestPayload,
  ApiConnectionTestResult,
  ResourceBindingSavePayload,
  ResourceBindingSaveResult,
  ResourceConfigResult,
  ResourceTestPayload,
  ResourceTestResult,
} from '@shared/types/model-config';
import type {
  ModelPromptBindPayload,
  ModelPromptBindResult,
  ModelPromptClearBindingPayload,
  ModelPromptClearBindingResult,
  ModelPromptConfigResult,
  ModelPromptTemplateDeletePayload,
  ModelPromptTemplateDeleteResult,
  ModelPromptTemplateSavePayload,
  ModelPromptTemplateSaveResult,
} from '@shared/types/model-prompt';
import type {
  MediaCreateThumbnailUrlPayload,
  MediaCreateThumbnailUrlResult,
  MediaCreateUrlPayload,
  MediaCreateUrlResult,
  MediaGetOriginalUrlPayload,
  MediaGetOriginalUrlResult,
  MediaResolveUrlPayload,
  MediaResolveUrlResult,
} from '@shared/types/media';
import type {
  MemorySettingsClearPayload,
  MemorySettingsClearResult,
  MemorySettingsResult,
  MemorySettingsRestoreDefaultResult,
  MemorySettingsSavePayload,
  MemorySettingsSaveResult,
  MemorySettingsValidateModelPathPayload,
  MemorySettingsValidateModelPathResult,
} from '@shared/types/memory-settings';
import type {
  DatabaseBackupListResult,
  DatabaseClearAllPayload,
  DatabaseClearAllResult,
  DatabaseClearTablePayload,
  DatabaseClearTableResult,
  DatabaseExportResult,
  DatabaseImportPayload,
  DatabaseImportResult,
  DatabaseManagementInfoResult,
  DatabaseRunningTasksResult,
  DatabaseTableListResult,
} from '@shared/types/database-management';
import type {
  FileLifecycleCleanupPayload,
  FileLifecycleCleanupResult,
  FileLifecycleDiagnoseResult,
  FileManagementListResult,
  FileManagementOpenPayload,
  FileManagementOpenResult,
} from '@shared/types/file-management';
import type {
  BusinessSettingsRestoreDefaultChapterRegResult,
  BusinessSettingsResult,
  BusinessSettingsSavePayload,
  BusinessSettingsSaveResult,
} from '@shared/types/business-settings';
import type { RequestDiagnosticsResult } from '@shared/types/request-settings';
import type {
  AboutCheckUpdatePayload,
  AboutCheckUpdateResult,
  AboutDownloadPayload,
  AboutDownloadResult,
  AboutOpenLinkPayload,
  AboutOpenLinkResult,
  AboutSettingsResult,
} from '@shared/types/about-settings';
import type {
  PromptListResult,
  PromptRestoreDefaultPayload,
  PromptRestoreDefaultResult,
  PromptUpdatePayload,
  PromptUpdateResult,
} from '@shared/types/prompt';
import type {
  SkillManagementContentResult,
  SkillManagementGetContentPayload,
  SkillManagementListPayload,
  SkillManagementListResult,
  SkillManagementRebuildEmbeddingsPayload,
  SkillManagementRebuildEmbeddingsResult,
  SkillManagementSaveContentPayload,
  SkillManagementSaveContentResult,
} from '@shared/types/skill-management';
import type {
  VendorAddCodePayload,
  VendorAddCodeResult,
  VendorCodePayload,
  VendorCodeResult,
  VendorDeleteModelPayload,
  VendorDeleteModelResult,
  VendorDeletePayload,
  VendorDeleteResult,
  VendorListResult,
  VendorModelPayload,
  VendorModelSaveResult,
  VendorSetEnabledPayload,
  VendorSetEnabledResult,
  VendorTestImagePayload,
  VendorTestMediaResult,
  VendorTestTextPayload,
  VendorTestTextResult,
  VendorTestVideoPayload,
  VendorUpdateCodeResult,
  VendorUpdateInputsPayload,
  VendorUpdateInputsResult,
} from '@shared/types/vendor';
import type {
  DevSettingsOpenDevToolsResult,
  DevSettingsResult,
  DevSettingsSavePayload,
  DevSettingsSaveResult,
} from '@shared/types/dev-settings';
import type {
  ProductionAgentContextResult,
  ProductionAgentDerivedAssetPayload,
  ProductionAgentDerivedAssetResult,
  ProductionAgentStoryboardPayload,
  ProductionAgentStoryboardResult,
  ProductionAgentToolsResult,
  ProductionAgentWorkspacePatchPayload,
  ProductionAgentWorkspacePatchResult,
  ProductionBatchDeleteStoryboardsPayload,
  ProductionDeleteResult,
  ProductionDerivedAssetDeletePayload,
  ProductionDerivedAssetPollResult,
  ProductionDerivedAssetSavePayload,
  ProductionGenerateAcceptedResult,
  ProductionGenerateDerivedAssetsPayload,
  ProductionGenerateStoryboardsPayload,
  ProductionGenerateVideoPayload,
  ProductionGenerateVideoPromptPayload,
  ProductionImageFlowApplyPayload,
  ProductionImageFlowApplyResult,
  ProductionImageFlowGetPayload,
  ProductionImageFlowGetResult,
  ProductionImageFlowSavePayload,
  ProductionImageFlowSaveResult,
  ProductionPollPayload,
  ProductionProjectPayload,
  ProductionSaveWorkspacePayload,
  ProductionSaveWorkspaceResult,
  ProductionScriptPayload,
  ProductionSelectVideoPayload,
  ProductionSelectVideoResult,
  ProductionStoryboardDeletePayload,
  ProductionStoryboardPollResult,
  ProductionStoryboardSavePayload,
  ProductionStoryboardSaveResult,
  ProductionVideoDeletePayload,
  ProductionVideoPollResult,
  ProductionVideoPromptPollResult,
  ProductionVideoTrackDeletePayload,
  ProductionVideoTrackSavePayload,
  ProductionVideoTrackSaveResult,
  ProductionWorkbenchResult,
  ProductionWorkspaceResult,
} from '@shared/types/production';
import type {
  ExportBuildTimelinePayload,
  ExportBuildTimelineResult,
  ExportCreateJianyingDraftPayload,
  ExportCreateJianyingDraftResult,
  ExportHistoryDetailPayload,
  ExportHistoryDetailResult,
  ExportHistoryListPayload,
  ExportHistoryListResult,
  ExportOpenDirectoryPayload,
  ExportOpenDirectoryResult,
  ExportStoryboardImagesPayload,
  ExportStoryboardImagesResult,
  ExportValidateAssetsPayload,
  ExportValidateAssetsResult,
} from '@shared/types/export';

export interface VtStudioApi {
  app: {
    getInfo: () => Promise<VtResponse<AppInfo>>;
  };
  shell: {
    listExternalLinks: () => Promise<VtResponse<ExternalLinkListResult>>;
    openExternalByKey: (payload: ExternalLinkOpenPayload) => Promise<VtResponse<ExternalLinkOpenResult>>;
  };
  window: {
    getState: () => Promise<VtResponse<WindowStateResult>>;
    minimize: () => Promise<VtResponse<WindowStateResult>>;
    toggleMaximize: () => Promise<VtResponse<WindowStateResult>>;
    close: () => Promise<VtResponse<Record<string, never>>>;
  };
  agent: {
    getSocketInfo: () => Promise<VtResponse<AgentSocketInfo>>;
    script: {
      getMemoryHistory: (payload: ScriptAgentProjectPayload) => Promise<VtResponse<ScriptAgentMemoryHistoryResult>>;
      clearMemory: (payload: ScriptAgentClearMemoryPayload) => Promise<VtResponse<ScriptAgentClearMemoryResult>>;
      checkSourceEvents: (payload: ScriptAgentProjectPayload) => Promise<VtResponse<ScriptAgentSourceEventCheckResult>>;
      getModelCapability: () => Promise<VtResponse<ScriptAgentModelCapabilityResult>>;
      getWorkspace: (payload: ScriptAgentProjectPayload) => Promise<VtResponse<ScriptAgentGetWorkspaceResult>>;
      updateWorkspaceField: (payload: ScriptAgentUpdateWorkspaceFieldPayload) => Promise<VtResponse<ScriptAgentGetWorkspaceResult>>;
      upsertScript: (payload: ScriptAgentScriptUpsertPayload) => Promise<VtResponse<ScriptAgentScriptUpsertResult>>;
      deleteScript: (payload: ScriptAgentDeleteScriptPayload) => Promise<VtResponse<ScriptAgentDeleteScriptResult>>;
    };
  };
  media: {
    createUrl: (payload: MediaCreateUrlPayload) => Promise<VtResponse<MediaCreateUrlResult>>;
    createThumbnailUrl: (payload: MediaCreateThumbnailUrlPayload) => Promise<VtResponse<MediaCreateThumbnailUrlResult>>;
    resolveUrlToPath: (payload: MediaResolveUrlPayload) => Promise<VtResponse<MediaResolveUrlResult>>;
    getOriginalUrl: (payload: MediaGetOriginalUrlPayload) => Promise<VtResponse<MediaGetOriginalUrlResult>>;
  };
  auth: {
    login: (payload: AuthLoginPayload) => Promise<VtResponse<AuthLoginResult>>;
    getCurrentUser: (payload: AuthCurrentUserPayload) => Promise<VtResponse<AuthUser>>;
    updateLocalUser: (payload: AuthUpdateLocalUserPayload) => Promise<VtResponse<AuthUpdateLocalUserResult>>;
    logout: () => Promise<VtResponse<Record<string, never>>>;
    validateSession: (payload: AuthValidateSessionPayload) => Promise<VtResponse<AuthValidateSessionResult>>;
  };
  project: {
    getPageState: () => Promise<VtResponse<ProjectPageStateResult>>;
    create: (payload: ProjectSavePayload) => Promise<VtResponse<ProjectSaveResult>>;
    update: (payload: ProjectSavePayload) => Promise<VtResponse<ProjectSaveResult>>;
    getDeleteImpact: (payload: ProjectDeleteImpactPayload) => Promise<VtResponse<ProjectDeleteImpactResult>>;
    delete: (payload: ProjectDeletePayload) => Promise<VtResponse<ProjectDeleteResult>>;
    open: (payload: ProjectOpenPayload) => Promise<VtResponse<ProjectOpenResult>>;
    restoreRecent: () => Promise<VtResponse<ProjectRestoreRecentResult>>;
    updateRecentRoute: (payload: ProjectUpdateRecentRoutePayload) => Promise<VtResponse<ProjectUpdateRecentRouteResult>>;
    clearRecent: (payload?: ProjectClearRecentPayload) => Promise<VtResponse<ProjectClearRecentResult>>;
    getFlowStats: (payload: ProjectFlowStatsPayload) => Promise<VtResponse<ProjectFlowStatsResult>>;
    exportPackage: (payload: ProjectExportPackagePayload) => Promise<VtResponse<ProjectExportPackageResult>>;
    importPackage: (payload: ProjectImportPackagePayload) => Promise<VtResponse<ProjectImportPackageResult>>;
    openPackageDirectory: (payload: ProjectOpenPackagePayload) => Promise<VtResponse<ProjectOpenPackageResult>>;
    getManual: (payload: ProjectManualGetPayload) => Promise<VtResponse<ProjectManualSaveResult>>;
    saveManual: (payload: ProjectManualSavePayload) => Promise<VtResponse<ProjectManualSaveResult>>;
    deleteManual: (payload: ProjectManualDeletePayload) => Promise<VtResponse<ProjectManualDeleteResult>>;
  };
  task: {
    list: (payload?: TaskListPayload) => Promise<VtResponse<TaskListResult>>;
    categoryOptions: (payload?: TaskCategoryOptionsPayload) => Promise<VtResponse<TaskCategoryOptionsResult>>;
    projectOptions: () => Promise<VtResponse<TaskProjectOptionsResult>>;
  };
  export: {
    buildTimeline: (payload: ExportBuildTimelinePayload) => Promise<VtResponse<ExportBuildTimelineResult>>;
    validateAssets: (payload: ExportValidateAssetsPayload) => Promise<VtResponse<ExportValidateAssetsResult>>;
    storyboardImages: (payload: ExportStoryboardImagesPayload) => Promise<VtResponse<ExportStoryboardImagesResult>>;
    createJianyingDraft: (payload: ExportCreateJianyingDraftPayload) => Promise<VtResponse<ExportCreateJianyingDraftResult>>;
    listHistory: (payload: ExportHistoryListPayload) => Promise<VtResponse<ExportHistoryListResult>>;
    getHistoryDetail: (payload: ExportHistoryDetailPayload) => Promise<VtResponse<ExportHistoryDetailResult>>;
    openDirectory: (payload: ExportOpenDirectoryPayload) => Promise<VtResponse<ExportOpenDirectoryResult>>;
  };
  source: {
    list: (payload: SourceListPayload) => Promise<VtResponse<SourceListResult>>;
    import: (payload: SourceImportPayload) => Promise<VtResponse<SourceImportResult>>;
    updateChapter: (payload: SourceUpdateChapterPayload) => Promise<VtResponse<SourceUpdateChapterResult>>;
    deleteChapter: (payload: SourceDeleteChapterPayload) => Promise<VtResponse<SourceDeleteResult>>;
    deleteChapters: (payload: SourceDeleteChaptersPayload) => Promise<VtResponse<SourceDeleteResult>>;
    generateEvents: (payload: SourceGenerateEventsPayload) => Promise<VtResponse<SourceGenerateEventsResult>>;
    pollEventStatus: (payload: SourcePollEventStatusPayload) => Promise<VtResponse<SourcePollEventStatusResult>>;
  };
  script: {
    list: (payload: ScriptListPayload) => Promise<VtResponse<ScriptListResult>>;
    save: (payload: ScriptSavePayload) => Promise<VtResponse<ScriptSaveResult>>;
    batchCreate: (payload: ScriptBatchCreatePayload) => Promise<VtResponse<ScriptBatchCreateResult>>;
    delete: (payload: ScriptDeletePayload) => Promise<VtResponse<ScriptDeleteResult>>;
    batchDelete: (payload: ScriptBatchDeletePayload) => Promise<VtResponse<ScriptDeleteResult>>;
    exportZip: (payload: ScriptExportZipPayload) => Promise<VtResponse<ScriptExportZipResult>>;
    generateParseRegex: (payload: ScriptGenerateParseRegexPayload) => Promise<VtResponse<ScriptGenerateParseRegexResult>>;
    extractAssets: (payload: ScriptExtractAssetsPayload) => Promise<VtResponse<ScriptExtractAssetsResult>>;
    pollExtractStatus: (payload: ScriptPollExtractStatusPayload) => Promise<VtResponse<ScriptPollExtractStatusResult>>;
  };
  assets: {
    list: (payload: AssetListPayload) => Promise<VtResponse<AssetListResult>>;
    save: (payload: AssetSavePayload) => Promise<VtResponse<AssetSaveResult>>;
    delete: (payload: AssetDeletePayload) => Promise<VtResponse<AssetDeleteResult>>;
    batchDelete: (payload: AssetBatchDeletePayload) => Promise<VtResponse<AssetDeleteResult>>;
    uploadMedia: (payload: AssetUploadPayload) => Promise<VtResponse<AssetUploadResult>>;
    generatePrompt: (payload: AssetProjectPayload & { assetId: number; extraInstruction?: string | null }) => Promise<VtResponse<AssetGenerateAcceptedResult>>;
    batchGeneratePrompts: (payload: AssetBatchPromptPayload) => Promise<VtResponse<AssetGenerateAcceptedResult>>;
    generateImage: (payload: AssetImagePayload) => Promise<VtResponse<AssetGenerateAcceptedResult>>;
    batchGenerateImages: (payload: AssetBatchImagePayload) => Promise<VtResponse<AssetGenerateAcceptedResult>>;
    selectMedia: (payload: AssetMediaSelectPayload) => Promise<VtResponse<AssetSaveResult>>;
    deleteMedia: (payload: AssetMediaDeletePayload) => Promise<VtResponse<AssetDeleteResult>>;
    cancelImage: (payload: AssetCancelImagePayload) => Promise<VtResponse<AssetSaveResult>>;
    pollPromptStatus: (payload: AssetPollPayload) => Promise<VtResponse<AssetPollResult>>;
    pollImageStatus: (payload: AssetPollPayload) => Promise<VtResponse<AssetPollResult>>;
  };
  cornerScape: {
    list: (payload: CornerAssetListPayload) => Promise<VtResponse<CornerAssetListResult>>;
    updateAudioBinding: (payload: AssetAudioBindingPayload) => Promise<VtResponse<AssetAudioBindingResult>>;
    batchBindAudio: (payload: AssetBatchAudioBindingPayload) => Promise<VtResponse<AssetGenerateAcceptedResult>>;
    pollAudioBindStatus: (payload: AssetPollPayload) => Promise<VtResponse<AssetPollResult>>;
  };
  production: {
    getWorkspace: (payload: ProductionProjectPayload & { scriptId?: number | null }) => Promise<VtResponse<ProductionWorkspaceResult>>;
    saveWorkspace: (payload: ProductionSaveWorkspacePayload) => Promise<VtResponse<ProductionSaveWorkspaceResult>>;
    agent: {
      getTools: () => Promise<VtResponse<ProductionAgentToolsResult>>;
      getContext: (payload: ProductionScriptPayload) => Promise<VtResponse<ProductionAgentContextResult>>;
      applyWorkspacePatch: (payload: ProductionAgentWorkspacePatchPayload) => Promise<VtResponse<ProductionAgentWorkspacePatchResult>>;
      createStoryboard: (payload: ProductionAgentStoryboardPayload) => Promise<VtResponse<ProductionAgentStoryboardResult>>;
      createDerivedAsset: (payload: ProductionAgentDerivedAssetPayload) => Promise<VtResponse<ProductionAgentDerivedAssetResult>>;
      deleteDerivedAsset: (payload: ProductionDerivedAssetDeletePayload) => Promise<VtResponse<ProductionDeleteResult>>;
      generateStoryboardImages: (payload: ProductionGenerateStoryboardsPayload) => Promise<VtResponse<ProductionGenerateAcceptedResult>>;
      generateDerivedAssetImages: (payload: ProductionGenerateDerivedAssetsPayload) => Promise<VtResponse<ProductionGenerateAcceptedResult>>;
    };
    saveStoryboard: (payload: ProductionStoryboardSavePayload) => Promise<VtResponse<ProductionStoryboardSaveResult>>;
    deleteStoryboard: (payload: ProductionStoryboardDeletePayload) => Promise<VtResponse<ProductionDeleteResult>>;
    batchDeleteStoryboards: (payload: ProductionBatchDeleteStoryboardsPayload) => Promise<VtResponse<ProductionDeleteResult>>;
    generateStoryboardImages: (payload: ProductionGenerateStoryboardsPayload) => Promise<VtResponse<ProductionGenerateAcceptedResult>>;
    pollStoryboardImages: (payload: ProductionPollPayload) => Promise<VtResponse<ProductionStoryboardPollResult>>;
    saveDerivedAsset: (payload: ProductionDerivedAssetSavePayload) => Promise<VtResponse<ProductionDerivedAssetPollResult>>;
    deleteDerivedAsset: (payload: ProductionDerivedAssetDeletePayload) => Promise<VtResponse<ProductionDeleteResult>>;
    generateDerivedAssetImages: (payload: ProductionGenerateDerivedAssetsPayload) => Promise<VtResponse<ProductionGenerateAcceptedResult>>;
    pollDerivedAssetImages: (payload: ProductionPollPayload) => Promise<VtResponse<ProductionDerivedAssetPollResult>>;
    getImageFlow: (payload: ProductionImageFlowGetPayload) => Promise<VtResponse<ProductionImageFlowGetResult>>;
    saveImageFlow: (payload: ProductionImageFlowSavePayload) => Promise<VtResponse<ProductionImageFlowSaveResult>>;
    applyImageFlowResult: (payload: ProductionImageFlowApplyPayload) => Promise<VtResponse<ProductionImageFlowApplyResult>>;
    getWorkbench: (payload: ProductionScriptPayload) => Promise<VtResponse<ProductionWorkbenchResult>>;
    saveVideoTrack: (payload: ProductionVideoTrackSavePayload) => Promise<VtResponse<ProductionVideoTrackSaveResult>>;
    deleteVideoTrack: (payload: ProductionVideoTrackDeletePayload) => Promise<VtResponse<ProductionDeleteResult>>;
    generateVideoPrompts: (payload: ProductionGenerateVideoPromptPayload) => Promise<VtResponse<ProductionGenerateAcceptedResult>>;
    pollVideoPrompts: (payload: ProductionPollPayload) => Promise<VtResponse<ProductionVideoPromptPollResult>>;
    generateVideos: (payload: ProductionGenerateVideoPayload) => Promise<VtResponse<ProductionGenerateAcceptedResult>>;
    pollVideos: (payload: ProductionPollPayload) => Promise<VtResponse<ProductionVideoPollResult>>;
    selectVideo: (payload: ProductionSelectVideoPayload) => Promise<VtResponse<ProductionSelectVideoResult>>;
    deleteVideo: (payload: ProductionVideoDeletePayload) => Promise<VtResponse<ProductionDeleteResult>>;
  };
  settings: {
    api: {
      list: () => Promise<VtResponse<ApiConnectionListResult>>;
      templates: () => Promise<
        VtResponse<{
          services: Array<{
            serviceType: string;
            name: string;
            defaultBaseUrl: string;
            capabilities: string[];
            models: Array<{
              id: string;
              displayName: string;
              modelName: string;
              type: string;
              think?: boolean;
            }>;
          }>;
        }>
      >;
      save: (payload: ApiConnectionSavePayload) => Promise<VtResponse<ApiConnectionSaveResult>>;
      delete: (payload: ApiConnectionDeletePayload) => Promise<VtResponse<ApiConnectionDeleteResult>>;
      test: (payload: ApiConnectionTestPayload) => Promise<VtResponse<ApiConnectionTestResult>>;
    };
    resource: {
      get: () => Promise<VtResponse<ResourceConfigResult>>;
      saveBinding: (payload: ResourceBindingSavePayload) => Promise<VtResponse<ResourceBindingSaveResult>>;
      test: (payload: ResourceTestPayload) => Promise<VtResponse<ResourceTestResult>>;
    };
    agentConfig: {
      get: () => Promise<VtResponse<AgentConfigResult>>;
      save: (payload: AgentConfigSavePayload) => Promise<VtResponse<AgentConfigSaveResult>>;
    };
    modelPrompt: {
      get: () => Promise<VtResponse<ModelPromptConfigResult>>;
      saveTemplate: (payload: ModelPromptTemplateSavePayload) => Promise<VtResponse<ModelPromptTemplateSaveResult>>;
      deleteTemplate: (payload: ModelPromptTemplateDeletePayload) => Promise<VtResponse<ModelPromptTemplateDeleteResult>>;
      bind: (payload: ModelPromptBindPayload) => Promise<VtResponse<ModelPromptBindResult>>;
      clearBinding: (payload: ModelPromptClearBindingPayload) => Promise<VtResponse<ModelPromptClearBindingResult>>;
    };
    prompt: {
      list: () => Promise<VtResponse<PromptListResult>>;
      update: (payload: PromptUpdatePayload) => Promise<VtResponse<PromptUpdateResult>>;
      restoreDefault: (payload: PromptRestoreDefaultPayload) => Promise<VtResponse<PromptRestoreDefaultResult>>;
    };
    memory: {
      get: () => Promise<VtResponse<MemorySettingsResult>>;
      save: (payload: MemorySettingsSavePayload) => Promise<VtResponse<MemorySettingsSaveResult>>;
      restoreDefault: () => Promise<VtResponse<MemorySettingsRestoreDefaultResult>>;
      validateModelPath: (payload: MemorySettingsValidateModelPathPayload) => Promise<VtResponse<MemorySettingsValidateModelPathResult>>;
      clear: (payload: MemorySettingsClearPayload) => Promise<VtResponse<MemorySettingsClearResult>>;
    };
    database: {
      info: () => Promise<VtResponse<DatabaseManagementInfoResult>>;
      listBackups: () => Promise<VtResponse<DatabaseBackupListResult>>;
      export: () => Promise<VtResponse<DatabaseExportResult>>;
      import: (payload: DatabaseImportPayload) => Promise<VtResponse<DatabaseImportResult>>;
      listTables: () => Promise<VtResponse<DatabaseTableListResult>>;
      clearTable: (payload: DatabaseClearTablePayload) => Promise<VtResponse<DatabaseClearTableResult>>;
      clearAll: (payload: DatabaseClearAllPayload) => Promise<VtResponse<DatabaseClearAllResult>>;
      checkRunningTasks: () => Promise<VtResponse<DatabaseRunningTasksResult>>;
    };
    files: {
      listOpenableDirs: () => Promise<VtResponse<FileManagementListResult>>;
      openDir: (payload: FileManagementOpenPayload) => Promise<VtResponse<FileManagementOpenResult>>;
      diagnoseLifecycle: () => Promise<VtResponse<FileLifecycleDiagnoseResult>>;
      cleanupLifecycle: (payload: FileLifecycleCleanupPayload) => Promise<VtResponse<FileLifecycleCleanupResult>>;
    };
    business: {
      get: () => Promise<VtResponse<BusinessSettingsResult>>;
      save: (payload: BusinessSettingsSavePayload) => Promise<VtResponse<BusinessSettingsSaveResult>>;
      restoreDefaultChapterReg: () => Promise<VtResponse<BusinessSettingsRestoreDefaultChapterRegResult>>;
    };
    request: {
      get: () => Promise<VtResponse<RequestDiagnosticsResult>>;
      refreshLocalUrl: () => Promise<VtResponse<RequestDiagnosticsResult>>;
    };
    dev: {
      get: () => Promise<VtResponse<DevSettingsResult>>;
      save: (payload: DevSettingsSavePayload) => Promise<VtResponse<DevSettingsSaveResult>>;
      openDevTools: () => Promise<VtResponse<DevSettingsOpenDevToolsResult>>;
    };
    about: {
      get: () => Promise<VtResponse<AboutSettingsResult>>;
      checkUpdate: (payload: AboutCheckUpdatePayload) => Promise<VtResponse<AboutCheckUpdateResult>>;
      download: (payload: AboutDownloadPayload) => Promise<VtResponse<AboutDownloadResult>>;
      openLink: (payload: AboutOpenLinkPayload) => Promise<VtResponse<AboutOpenLinkResult>>;
    };
    skill: {
      list: (payload?: SkillManagementListPayload) => Promise<VtResponse<SkillManagementListResult>>;
      getContent: (payload: SkillManagementGetContentPayload) => Promise<VtResponse<SkillManagementContentResult>>;
      saveContent: (payload: SkillManagementSaveContentPayload) => Promise<VtResponse<SkillManagementSaveContentResult>>;
      rebuildEmbeddings: (payload?: SkillManagementRebuildEmbeddingsPayload) => Promise<VtResponse<SkillManagementRebuildEmbeddingsResult>>;
    };
    vendor: {
      list: () => Promise<VtResponse<VendorListResult>>;
      updateInputs: (payload: VendorUpdateInputsPayload) => Promise<VtResponse<VendorUpdateInputsResult>>;
      setEnabled: (payload: VendorSetEnabledPayload) => Promise<VtResponse<VendorSetEnabledResult>>;
      saveModel: (payload: VendorModelPayload) => Promise<VtResponse<VendorModelSaveResult>>;
      deleteModel: (payload: VendorDeleteModelPayload) => Promise<VtResponse<VendorDeleteModelResult>>;
      getCode: (payload: VendorDeletePayload) => Promise<VtResponse<VendorCodeResult>>;
      addCode: (payload: VendorAddCodePayload) => Promise<VtResponse<VendorAddCodeResult>>;
      updateCode: (payload: VendorCodePayload) => Promise<VtResponse<VendorUpdateCodeResult>>;
      delete: (payload: VendorDeletePayload) => Promise<VtResponse<VendorDeleteResult>>;
      testText: (payload: VendorTestTextPayload) => Promise<VtResponse<VendorTestTextResult>>;
      testImage: (payload: VendorTestImagePayload) => Promise<VtResponse<VendorTestMediaResult>>;
      testVideo: (payload: VendorTestVideoPayload) => Promise<VtResponse<VendorTestMediaResult>>;
    };
  };
}
