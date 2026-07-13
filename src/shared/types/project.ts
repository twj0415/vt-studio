import type {
  ProjectImageQuality,
  ProjectManualKind,
  ProjectSourceType,
  ProjectTemplateType,
  ProjectVideoRatio,
} from '../constants/dictionaries';
import type { BusinessLockSummary } from './business-lock';

export {
  PROJECT_IMAGE_QUALITIES,
  PROJECT_IMAGE_QUALITY_VALUES,
  PROJECT_MANUAL_KINDS,
  PROJECT_MANUAL_KIND_VALUES,
  PROJECT_SOURCE_TYPES,
  PROJECT_SOURCE_TYPE_VALUES,
  PROJECT_TEMPLATE_TYPES,
  PROJECT_TEMPLATE_TYPE_VALUES,
  PROJECT_VIDEO_RATIOS,
  PROJECT_VIDEO_RATIO_VALUES,
} from '../constants/dictionaries';
export type {
  ProjectImageQuality,
  ProjectManualKind,
  ProjectSourceType,
  ProjectTemplateType,
  ProjectVideoRatio,
} from '../constants/dictionaries';

export interface ProjectVideoModeOption {
  value: string;
  label: string;
}

export interface ProjectModelOption {
  modelId: string;
  connectionId: string;
  connectionName: string;
  modelName: string;
  displayName: string;
  type: 'image' | 'video';
  modes?: ProjectVideoModeOption[];
}

export interface ProjectManualTab {
  key: string;
  label: string;
  relativePath: string;
  content: string;
}

export interface ProjectManualSummary {
  id: number;
  kind: ProjectManualKind;
  name: string;
  path: string;
  coverRelativePath: string | null;
  coverUrl: string | null;
  referenceCount: number;
  updatedAt: number;
}

export interface ProjectManualDetail extends ProjectManualSummary {
  tabs: ProjectManualTab[];
}

export interface ProjectSummary {
  id: number;
  templateType: ProjectTemplateType;
  sourceType: ProjectSourceType;
  name: string;
  genre: string;
  description: string;
  imageModelId: string;
  imageModelLabel: string;
  imageQuality: ProjectImageQuality;
  videoModelId: string;
  videoModelLabel: string;
  videoMode: string;
  videoModeLabel: string;
  videoRatio: ProjectVideoRatio;
  visualManualId: number;
  visualManualName: string;
  directorManualId: number;
  directorManualName: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectPageStateResult {
  projects: ProjectSummary[];
  imageModels: ProjectModelOption[];
  videoModels: ProjectModelOption[];
  visualManuals: ProjectManualSummary[];
  directorManuals: ProjectManualSummary[];
  imageQualityOptions: ProjectImageQuality[];
  videoRatioOptions: ProjectVideoRatio[];
}

export interface ProjectSavePayload {
  id?: number;
  templateType: ProjectTemplateType;
  sourceType: ProjectSourceType;
  name: string;
  genre: string;
  description: string;
  imageModelId: string;
  imageQuality: ProjectImageQuality;
  videoModelId: string;
  videoMode: string;
  videoRatio: ProjectVideoRatio;
  visualManualId: number;
  directorManualId: number;
}

export interface ProjectSaveResult {
  project: ProjectSummary;
}

export interface ProjectDeleteImpact {
  projectId: number;
  projectName: string;
  runningTaskCount: number;
  runningLockCount: number;
  runningLocks: BusinessLockSummary[];
  taskCount: number;
  memoryCount: number;
  projectDirectory: string;
}

export interface ProjectDeleteImpactPayload {
  projectId: number;
}

export interface ProjectDeleteImpactResult {
  impact: ProjectDeleteImpact;
}

export interface ProjectDeletePayload {
  projectId: number;
  deleteFiles: boolean;
}

export interface ProjectDeleteResult {
  projectId: number;
  deletedFiles: boolean;
  filePath: string | null;
}

export interface ProjectOpenPayload {
  projectId: number;
}

export interface ProjectCurrentContext {
  id: string;
  name: string;
  templateType: ProjectTemplateType;
}

export interface ProjectOpenResult {
  project: ProjectCurrentContext;
  targetRoute: ProjectRouteName;
}

export type ProjectRouteName =
  | 'project-overview'
  | 'novel'
  | 'assets'
  | 'corner-scape'
  | 'production'
  | 'export';

export interface ProjectRecentContext {
  project: ProjectCurrentContext;
  lastRoute: ProjectRouteName;
  openedAt: number;
  updatedAt: number;
}

export interface ProjectRestoreRecentResult {
  project: ProjectCurrentContext | null;
  targetRoute: ProjectRouteName | 'projects';
  reason: 'restored' | 'empty' | 'invalid';
}

export interface ProjectUpdateRecentRoutePayload {
  projectId: number;
  routeName: ProjectRouteName;
}

export interface ProjectUpdateRecentRouteResult {
  saved: boolean;
  recent: ProjectRecentContext | null;
}

export interface ProjectClearRecentPayload {
  projectId?: number;
}

export interface ProjectClearRecentResult {
  cleared: boolean;
}

export interface ProjectFlowStatsPayload {
  projectId: number;
}

export interface ProjectFlowFailedTaskSummary {
  id: number;
  category: string;
  description: string | null;
  modelName: string | null;
  relatedObjects: string | null;
  errorReason: string | null;
  updatedAt: number;
}

export interface ProjectFlowStatsResult {
  projectId: number;
  templateType: ProjectTemplateType;
  sourceChapterCount: number;
  sourceEventSucceededCount: number;
  sourceEventFailedCount: number;
  sourceEventRunningCount: number;
  sourceEventStaleCount: number;
  agentWorkspaceCount: number;
  contentCount: number;
  resourceExtractSucceededCount: number;
  resourceExtractFailedCount: number;
  resourceExtractRunningCount: number;
  assetCount: number;
  visualAssetCount: number;
  assetImageReadyCount: number;
  assetImageFailedCount: number;
  assetImageRunningCount: number;
  audioAssetCount: number;
  audioBindingReadyCount: number;
  audioBindingFailedCount: number;
  audioBindingRunningCount: number;
  storyboardCount: number;
  storyboardImageReadyCount: number;
  storyboardImageFailedCount: number;
  storyboardImageRunningCount: number;
  videoTrackCount: number;
  selectedVideoTrackCount: number;
  videoCandidateCount: number;
  videoReadyCount: number;
  videoFailedCount: number;
  videoRunningCount: number;
  failedTaskCount: number;
  runningTaskCount: number;
  failedTaskSummaries: ProjectFlowFailedTaskSummary[];
}

export interface ProjectManualSavePayload {
  id?: number;
  kind: ProjectManualKind;
  name: string;
  path: string;
  coverImageDataUrl: string | null;
  tabs: Array<{
    key: string;
    content: string;
  }>;
}

export interface ProjectManualSaveResult {
  manual: ProjectManualDetail;
}

export interface ProjectManualGetPayload {
  id: number;
  kind: ProjectManualKind;
}

export interface ProjectManualDeletePayload {
  id: number;
  kind: ProjectManualKind;
}

export interface ProjectManualDeleteResult {
  id: number;
  kind: ProjectManualKind;
}

export interface ProjectPackageTableSummary {
  tableName: string;
  rowCount: number;
}

export interface ProjectPackageFileSummary {
  folder: string;
  fileCount: number;
  sizeBytes: number;
}

export interface ProjectPackageSummary {
  projectName: string;
  packageVersion: number;
  tableRows: ProjectPackageTableSummary[];
  files: ProjectPackageFileSummary[];
  excluded: string[];
}

export interface ProjectExportPackagePayload {
  projectId: number;
}

export interface ProjectExportPackageResult {
  packageName: string;
  packagePath: string;
  exportedAt: number;
  summary: ProjectPackageSummary;
}

export interface ProjectImportPackagePayload {
  packagePath: string;
}

export interface ProjectImportPackageResult {
  project: ProjectSummary;
  packagePath: string;
  importedAt: number;
  summary: ProjectPackageSummary;
  warnings: string[];
}

export interface ProjectOpenPackagePayload {
  packagePath: string;
}

export interface ProjectOpenPackageResult {
  packagePath: string;
}
