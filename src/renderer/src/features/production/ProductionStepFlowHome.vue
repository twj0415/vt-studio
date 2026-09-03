<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  AddIcon,
  ArrowLeftIcon,
  CheckIcon,
  DeleteIcon,
  EditIcon,
  ErrorCircleIcon,
  ImageIcon,
  PlayCircleIcon,
  RefreshIcon,
  SystemCodeIcon,
} from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { DEPENDENCY_STATUSES, type DependencyStatus } from '@shared/constants/dictionaries';
import { parseVideoModeKey, serializeVideoMode } from '@shared/constants/model-capabilities';
import VtActionBar from '@renderer/components/VtActionBar.vue';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import VtMediaTile from '@renderer/components/VtMediaTile.vue';
import VtPanel from '@renderer/components/VtPanel.vue';
import VtPromptEditor from '@renderer/components/VtPromptEditor.vue';
import VtResourceToken from '@renderer/components/VtResourceToken.vue';
import { getVtResourceKey, type VtResourceKind, type VtResourceReference, type VtResourceStatus } from '@renderer/components/vt-resource-reference';
import { useAppStore } from '@renderer/stores/app';
import ProductionResourceWorkbench from './ProductionResourceWorkbench.vue';
import ProductionStepRulesDialog from './components/ProductionStepRulesDialog.vue';
import PreviewableImage from '../shared/PreviewableImage.vue';
import {
  filterVideoCapabilitiesByModel,
  findVideoModeCapability,
  listReadyVideoCapabilities,
  listVideoCapabilityModeKeys,
  listVideoDurationOptions,
  listVideoResolutionOptions,
  type ReadyVideoCapability,
} from './video-model-capabilities';
import {
  PRODUCTION_TASK_STATUS,
  type ProductionAgentContextResult,
  type ProductionAssetSummary,
  type ProductionContentOption,
  type ProductionFlowData,
  type ProductionStoryboardItem,
  type ProductionVideoItem,
  type ProductionVideoModeValue,
  type ProductionVideoTrackItem,
  type ProductionWorkflowState,
  type ProductionWorkflowStep,
  type ProductionWorkflowStepState,
} from '@shared/types/production';
import type {
  ExportCreateJianyingDraftResult,
  ExportHistoryItem,
  ExportValidateAssetsResult,
} from '@shared/types/export';

type FlowStepDisplayStatus = 'notStarted' | 'active' | 'done' | 'needsAction' | 'locked';

interface FlowStepDefinition {
  step: ProductionWorkflowStep;
  labelKey: string;
}

const STATUS_POLL_INTERVAL = 3000;
const VIDEO_MODE_LABEL_KEYS: Record<string, string> = {
  text: 'text',
  singleImage: 'singleImage',
  startEndRequired: 'startEndRequired',
  endFrameOptional: 'endFrameOptional',
  startFrameOptional: 'startFrameOptional',
  'imageReference:3': 'imageReference',
  'videoReference:1,imageReference:2': 'videoImageReference',
  'audioReference:1,imageReference:1': 'audioImageReference',
  'textReference:1,imageReference:1': 'textImageReference',
};
const FLOW_STEPS: FlowStepDefinition[] = [
  { step: 'content', labelKey: 'production.flow.step.content.label' },
  { step: 'resources', labelKey: 'production.flow.step.resources.label' },
  { step: 'storyboardTable', labelKey: 'production.flow.step.storyboardTable.label' },
  { step: 'storyboardImages', labelKey: 'production.flow.step.storyboardImages.label' },
  { step: 'videoWorkbench', labelKey: 'production.flow.step.videoWorkbench.label' },
  { step: 'export', labelKey: 'production.flow.step.export.label' },
];

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));
const currentProjectName = computed(() => appStore.currentProject?.name ?? t('common.noProject'));

const loading = ref(false);
const refreshing = ref(false);
const contentSaving = ref(false);
const actionRunning = ref(false);
const rulesLoading = ref(false);
const rulesVisible = ref(false);
const ruleContext = ref<ProductionAgentContextResult | null>(null);
const contents = ref<ProductionContentOption[]>([]);
const currentContentId = ref<number | null>(null);
const flowData = ref<ProductionFlowData | null>(null);
const workflowState = ref<ProductionWorkflowState | null>(null);
const activeStep = ref<ProductionWorkflowStep>('content');
const resourceDraftCount = ref(0);
const contentDraft = ref('');
const savedContentBody = ref('');
const activeVideoTrackId = ref<number | null>(null);
const activeStoryboardImageId = ref<number | null>(null);
const storyboardEditorVisible = ref(false);
const storyboardSaving = ref(false);
const exportValidation = ref<ExportValidateAssetsResult | null>(null);
const exportHistories = ref<ExportHistoryItem[]>([]);
const exportResult = ref<ExportCreateJianyingDraftResult | null>(null);
const exportDraftName = ref('');
const exportCopyAssets = ref(true);
const videoCapabilitiesLoading = ref(false);
const videoCapabilities = ref<ReadyVideoCapability[]>([]);
const projectVideoModelId = ref('');
const projectVideoModelLabel = ref('');
const projectVideoRatio = ref('');
let statusPollTimer: number | null = null;

const storyboardForm = reactive({
  id: null as number | null,
  videoDesc: '',
  prompt: '',
  duration: 4,
  associatedAssetIds: [] as number[],
  shouldGenerateImage: true,
});

const videoGenerationForm = reactive({
  model: '',
  mode: '',
  resolution: '',
  duration: 0,
  audioEnabled: false,
});

const currentContent = computed(() => contents.value.find((item) => item.id === currentContentId.value) ?? null);
const currentContentName = computed(() => currentContent.value?.name ?? t('production.node.script.defaultName'));
const contentHasChanges = computed(() => contentDraft.value !== savedContentBody.value);
const activeStepState = computed(() => getStepState(activeStep.value));
const activeStepIndex = computed(() => FLOW_STEPS.findIndex((item) => item.step === activeStep.value));
const canGoPrevious = computed(() => activeStepIndex.value > 0);
const visualAssets = computed(() => flattenAssets(flowData.value?.assets ?? []).filter((asset) => asset.type === 'role' || asset.type === 'scene' || asset.type === 'tool'));
const visualResourceReferences = computed<VtResourceReference[]>(() => visualAssets.value.map(toAssetResourceReference));
const storyboardAssetOptions = computed(() => visualAssets.value.map((asset) => ({ label: asset.name, value: asset.id })));
const storyboards = computed(() => flowData.value?.storyboards ?? []);
const activeStoryboardImage = computed(() => storyboards.value.find((storyboard) => storyboard.id === activeStoryboardImageId.value) ?? storyboards.value[0] ?? null);
const activeStoryboardImageAssets = computed(() => {
  const assetIds = activeStoryboardImage.value?.associatedAssetIds ?? [];
  return assetIds
    .map((id) => visualAssets.value.find((asset) => asset.id === id))
    .filter((asset): asset is ProductionAssetSummary => Boolean(asset));
});
const activeStoryboardResourceKeys = computed(() => activeStoryboardImageAssets.value.map((asset) => getVtResourceKey(toAssetResourceReference(asset))));
const storyboardFormResourceKeys = computed(() => storyboardForm.associatedAssetIds
  .map((id) => visualAssets.value.find((asset) => asset.id === id))
  .filter((asset): asset is ProductionAssetSummary => Boolean(asset))
  .map((asset) => getVtResourceKey(toAssetResourceReference(asset))));
const storyboardReadyImageCount = computed(() => storyboards.value.filter((storyboard) => Boolean(storyboard.imageUrl)).length);
const activeStoryboardImageStatusTheme = computed(() => resolveStoryboardImageStatusTheme(activeStoryboardImage.value));
const videoTracks = computed(() => flowData.value?.videoTracks ?? []);
const boundStoryboardIds = computed(() => new Set(videoTracks.value.flatMap((track) => track.storyboardIds)));
const unboundStoryboards = computed(() => storyboards.value.filter((storyboard) => !boundStoryboardIds.value.has(storyboard.id)));
const contentLevelVideoTracks = computed(() => storyboards.value.length > 0
  ? videoTracks.value.filter((track) => track.storyboardIds.length === 0)
  : []);
const needsVideoTrackSync = computed(() => unboundStoryboards.value.length > 0 || contentLevelVideoTracks.value.length > 0);
const hasProductionSegments = computed(() => storyboards.value.length > 0 || videoTracks.value.length > 0);
const activeVideoTrack = computed(() => videoTracks.value.find((track) => track.id === activeVideoTrackId.value) ?? videoTracks.value[0] ?? null);
const activeSelectedVideo = computed(() => activeVideoTrack.value?.videos.find((video) => video.id === activeVideoTrack.value?.selectedVideoId) ?? null);
const activeVideoTrackStoryboards = computed(() => (activeVideoTrack.value?.storyboardIds ?? [])
  .map((id) => storyboards.value.find((storyboard) => storyboard.id === id))
  .filter((storyboard): storyboard is ProductionStoryboardItem => Boolean(storyboard)));
const activeVideoPromptResources = computed<VtResourceReference[]>(() => {
  const assetIds = new Set<number>();
  for (const storyboard of activeVideoTrackStoryboards.value) {
    for (const assetId of storyboard.associatedAssetIds) {
      assetIds.add(assetId);
    }
  }
  const assetReferences = [...assetIds]
    .map((id) => visualAssets.value.find((asset) => asset.id === id))
    .filter((asset): asset is ProductionAssetSummary => Boolean(asset))
    .map(toAssetResourceReference);
  return [
    ...activeVideoTrackStoryboards.value.map(toStoryboardResourceReference),
    ...assetReferences,
  ];
});
const activeVideoPromptResourceKeys = computed(() => activeVideoPromptResources.value.map(getVtResourceKey));
const effectiveVideoModelId = computed(() => videoGenerationForm.model || projectVideoModelId.value);
const effectiveVideoCapabilities = computed(() => filterVideoCapabilitiesByModel(videoCapabilities.value, effectiveVideoModelId.value));
const videoModeKeys = computed(() => listVideoCapabilityModeKeys(effectiveVideoCapabilities.value));
const selectedVideoCapability = computed(() => findVideoModeCapability(effectiveVideoCapabilities.value, videoGenerationForm.mode));
const videoResolutionValues = computed(() => listVideoResolutionOptions(selectedVideoCapability.value, videoGenerationForm.duration));
const videoDurationValues = computed(() => listVideoDurationOptions(selectedVideoCapability.value));
const videoModelOptions = computed<Array<{ label: string; value: string; content?: string }>>(() => {
  const options = new Map<string, { label: string; value: string; content?: string }>();
  if (projectVideoModelId.value) {
    options.set('', {
      label: projectVideoModelLabel.value
        ? t('production.workbench.projectDefaultModelWithName', { model: projectVideoModelLabel.value })
        : t('production.workbench.projectDefaultModel'),
      value: '',
    });
  }
  for (const capability of videoCapabilities.value) {
    if (!options.has(capability.modelId)) {
      options.set(capability.modelId, {
        label: `${capability.connectionName} / ${capability.modelDisplayName}`,
        value: capability.modelId,
        content: capability.statusText,
      });
    }
  }
  return Array.from(options.values());
});
const videoModeOptions = computed(() => videoModeKeys.value.map((value) => ({ label: getVideoModeLabel(value), value })));
const videoResolutionOptions = computed(() => videoResolutionValues.value.map((value) => ({ label: value, value })));
const videoDurationOptions = computed(() => videoDurationValues.value.map((value) => ({ label: t('production.workbench.seconds', { count: value }), value })));
const videoAudioRequired = computed(() => selectedVideoCapability.value?.audioSupport === 'required');
const videoAudioSupported = computed(() => Boolean(selectedVideoCapability.value && selectedVideoCapability.value.audioSupport !== 'none'));
const videoRatioSupported = computed(() => !selectedVideoCapability.value
  || !projectVideoRatio.value
  || selectedVideoCapability.value.aspectRatioOptions.length === 0
  || selectedVideoCapability.value.aspectRatioOptions.includes(projectVideoRatio.value));
const videoGenerationBlocker = computed(() => {
  if (videoCapabilitiesLoading.value) return '';
  if (!effectiveVideoModelId.value) return t('production.workbench.projectDefaultMissing');
  if (!selectedVideoCapability.value || !videoGenerationForm.resolution || !videoGenerationForm.duration) {
    return t('production.workbench.capabilityUnavailable');
  }
  if (!videoRatioSupported.value) {
    return t('production.workbench.videoRatioUnsupported', { ratio: projectVideoRatio.value });
  }
  return '';
});
const videoGenerationReady = computed(() => !videoCapabilitiesLoading.value && !videoGenerationBlocker.value);
const storyboardImageMissingIds = computed(() => storyboards.value.filter((item) => item.shouldGenerateImage && !item.imageUrl).map((item) => item.id));
const selectedVideoTrackCount = computed(() => videoTracks.value.filter((track) => {
  const selected = track.videos.find((video) => video.id === track.selectedVideoId);
  return Boolean(selected?.videoUrl);
}).length);
const runningTaskCount = computed(() => {
  const imageCount = storyboards.value.filter((item) => item.imageStatus === PRODUCTION_TASK_STATUS.RUNNING).length;
  const videoCount = videoTracks.value.reduce((total, track) => total
    + (track.status === PRODUCTION_TASK_STATUS.RUNNING ? 1 : 0)
    + track.videos.filter((video) => video.status === PRODUCTION_TASK_STATUS.RUNNING).length, 0);
  return imageCount + videoCount;
});
const failedTaskCount = computed(() => {
  const imageCount = storyboards.value.filter((item) => item.imageStatus === PRODUCTION_TASK_STATUS.FAILED).length;
  const videoCount = videoTracks.value.reduce((total, track) => total
    + (track.status === PRODUCTION_TASK_STATUS.FAILED ? 1 : 0)
    + track.videos.filter((video) => video.status === PRODUCTION_TASK_STATUS.FAILED).length, 0);
  return imageCount + videoCount;
});
watch(storyboards, (items) => {
  if (!items.some((item) => item.id === activeStoryboardImageId.value)) {
    activeStoryboardImageId.value = items[0]?.id ?? null;
  }
}, { immediate: true });
const highestAllowedStepIndex = computed(() => {
  if (!workflowState.value) {
    return 0;
  }
  const index = FLOW_STEPS.findIndex((item) => getStepState(item.step)?.status !== 'done');
  return index === -1 ? FLOW_STEPS.length - 1 : index;
});
const activeBlockers = computed(() => resolveBlockers(activeStep.value));
const canGoNext = computed(() => {
  if (activeStepIndex.value < 0 || activeStepIndex.value >= FLOW_STEPS.length - 1) {
    return false;
  }
  if (activeStep.value === 'content' && contentHasChanges.value) {
    return false;
  }
  return activeStepState.value?.status === 'done' && activeBlockers.value.length === 0;
});
function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function getAssetResourceKind(asset: ProductionAssetSummary): VtResourceKind {
  if (asset.type === 'role') {
    return 'character';
  }

  if (asset.type === 'scene') {
    return 'scene';
  }

  if (asset.type === 'tool') {
    return 'prop';
  }

  if (asset.type === 'audio') {
    return 'audio';
  }

  if (asset.type === 'clip') {
    return 'video';
  }

  return 'custom';
}

function getResourceStatus(status: string | null | undefined): VtResourceStatus {
  if (status === PRODUCTION_TASK_STATUS.RUNNING) {
    return 'running';
  }

  if (status === PRODUCTION_TASK_STATUS.SUCCEEDED) {
    return 'success';
  }

  if (status === PRODUCTION_TASK_STATUS.FAILED || status === PRODUCTION_TASK_STATUS.CANCELLED) {
    return 'error';
  }

  return 'idle';
}

function getMediaStatus(status: string | null | undefined): 'idle' | 'running' | 'success' | 'warning' | 'error' {
  if (status === PRODUCTION_TASK_STATUS.RUNNING) {
    return 'running';
  }

  if (status === PRODUCTION_TASK_STATUS.SUCCEEDED) {
    return 'success';
  }

  if (status === PRODUCTION_TASK_STATUS.FAILED || status === PRODUCTION_TASK_STATUS.CANCELLED) {
    return 'error';
  }

  return 'idle';
}

function toAssetResourceReference(asset: ProductionAssetSummary): VtResourceReference {
  return {
    id: asset.id,
    kind: getAssetResourceKind(asset),
    name: asset.name || t('production.emptyText'),
    description: asset.description || asset.prompt || '',
    thumbnailUrl: asset.thumbnailUrl ?? asset.imageUrl ?? undefined,
    status: getResourceStatus(asset.imageStatus),
    statusLabel: t(`production.status.${asset.imageStatus}`),
    meta: t(`production.assetType.${asset.type}`),
    disabled: isDependencyInvalid(asset.dependencyStatus),
  };
}

function toStoryboardResourceReference(storyboard: ProductionStoryboardItem): VtResourceReference {
  return {
    id: storyboard.id,
    kind: 'storyboard',
    name: formatStoryboardCode(storyboard),
    description: storyboard.videoDesc || storyboard.prompt || '',
    thumbnailUrl: storyboard.thumbnailUrl ?? storyboard.imageUrl ?? undefined,
    status: getResourceStatus(storyboard.imageStatus),
    statusLabel: storyboard.shouldGenerateImage ? t(`production.status.${storyboard.imageStatus}`) : t('production.node.storyboard.shouldGenerateOff'),
    meta: t('production.flow.step.storyboardTable.label'),
    disabled: isDependencyInvalid(storyboard.dependencyStatus),
  };
}

function ensureStoryboardFormAsset(resource: VtResourceReference): void {
  const id = Number(resource.id);
  if (!Number.isInteger(id) || id <= 0) {
    return;
  }

  if (!storyboardForm.associatedAssetIds.includes(id)) {
    storyboardForm.associatedAssetIds = [...storyboardForm.associatedAssetIds, id];
  }
}

function removeStoryboardFormAsset(resource: VtResourceReference): void {
  const id = Number(resource.id);
  if (!Number.isInteger(id) || id <= 0) {
    return;
  }

  storyboardForm.associatedAssetIds = storyboardForm.associatedAssetIds.filter((assetId) => assetId !== id);
}

function getVideoModeLabel(modeKey: string): string {
  const labelKey = VIDEO_MODE_LABEL_KEYS[modeKey];
  return labelKey ? t(`production.workbench.mode.${labelKey}`) : modeKey;
}

function selectedVideoMode(): ProductionVideoModeValue {
  return parseVideoModeKey(videoGenerationForm.mode) as ProductionVideoModeValue;
}

function activeTrackHasStoryboardImage(): boolean {
  return Boolean(activeVideoTrack.value?.storyboardIds.some((id) => storyboards.value.find((item) => item.id === id)?.imageUrl));
}

function formatStoryboardCode(storyboard: ProductionStoryboardItem): string {
  return `S${String(storyboard.index + 1).padStart(3, '0')}`;
}

function resolveStoryboardImageStatusTheme(storyboard: ProductionStoryboardItem | null): 'default' | 'success' | 'danger' | 'warning' {
  if (!storyboard) return 'default';
  if (!storyboard.shouldGenerateImage) return 'warning';
  if (storyboard.imageUrl) return 'success';
  if (storyboard.imageStatus === PRODUCTION_TASK_STATUS.FAILED) return 'danger';
  return 'default';
}

function isDependencyInvalid(status: DependencyStatus | null | undefined): boolean {
  return Boolean(status && status !== DEPENDENCY_STATUSES.VALID);
}

function getDependencyTheme(status: DependencyStatus | null | undefined): 'success' | 'warning' | 'danger' | 'default' {
  if (!status || status === DEPENDENCY_STATUSES.VALID) return 'success';
  if (status === DEPENDENCY_STATUSES.MISSING_DEPENDENCY || status === DEPENDENCY_STATUSES.BLOCKED) return 'danger';
  if (status === DEPENDENCY_STATUSES.STALE || status === DEPENDENCY_STATUSES.NEEDS_REVIEW) return 'warning';
  return 'default';
}

function getDependencyAlertTheme(status: DependencyStatus | null | undefined): 'warning' | 'error' {
  return status === DEPENDENCY_STATUSES.MISSING_DEPENDENCY || status === DEPENDENCY_STATUSES.BLOCKED ? 'error' : 'warning';
}

function dependencyStatusMessage(status: DependencyStatus | null | undefined, reason: string | null | undefined): string {
  if (!status) return t('production.emptyText');
  const label = t(`production.dependencyStatus.${status}`);
  return reason ? `${label}：${reason}` : label;
}

function ensureVideoGenerationSelections(): void {
  const storedMode = serializeVideoMode(activeVideoTrack.value?.mode ?? null);
  const preferredMode = (!storedMode || storedMode === 'text') && activeVideoTrack.value?.videos.length === 0 && activeTrackHasStoryboardImage()
    ? 'singleImage'
    : storedMode;
  if (!videoModeKeys.value.includes(videoGenerationForm.mode)) {
    videoGenerationForm.mode = videoModeKeys.value.includes(preferredMode)
      ? preferredMode
      : videoModeKeys.value[0] ?? '';
  }

  const capability = findVideoModeCapability(effectiveVideoCapabilities.value, videoGenerationForm.mode);
  const durations = listVideoDurationOptions(capability);
  if (!durations.includes(videoGenerationForm.duration)) {
    videoGenerationForm.duration = durations[0] ?? 0;
  }

  const resolutions = listVideoResolutionOptions(capability, videoGenerationForm.duration);
  if (!resolutions.includes(videoGenerationForm.resolution)) {
    videoGenerationForm.resolution = resolutions[0] ?? '';
  }

  if (capability?.audioSupport === 'required') {
    videoGenerationForm.audioEnabled = true;
  } else if (capability?.audioSupport === 'none' || !capability) {
    videoGenerationForm.audioEnabled = false;
  }
}

async function loadVideoGenerationSettings(): Promise<void> {
  videoCapabilities.value = [];
  projectVideoModelId.value = '';
  projectVideoModelLabel.value = '';
  projectVideoRatio.value = '';
  if (!currentProjectId.value) return;
  videoCapabilitiesLoading.value = true;
  try {
    const [resourceResponse, projectResponse] = await Promise.all([
      window.vtStudio.settings.resource.get(),
      window.vtStudio.project.getPageState(),
    ]);
    if (!isOk(resourceResponse)) {
      MessagePlugin.error(resourceResponse.msg);
      return;
    }
    if (!isOk(projectResponse)) {
      MessagePlugin.error(projectResponse.msg);
      return;
    }
    videoCapabilities.value = listReadyVideoCapabilities(resourceResponse.data.capabilityMatrix);
    const project = projectResponse.data.projects.find((item) => item.id === currentProjectId.value);
    projectVideoModelId.value = project?.videoModelId ?? '';
    projectVideoModelLabel.value = project?.videoModelLabel ?? '';
    projectVideoRatio.value = project?.videoRatio ?? '';
    ensureVideoGenerationSelections();
  } finally {
    videoCapabilitiesLoading.value = false;
  }
}

function flattenAssets(items: ProductionAssetSummary[]): ProductionAssetSummary[] {
  return items.flatMap((asset) => [asset, ...asset.children]);
}

function backToProjects(): void {
  void router.push({ name: 'projects' });
}

function queryStep(): ProductionWorkflowStep | null {
  const raw = Array.isArray(route.query.step) ? route.query.step[0] : route.query.step;
  return FLOW_STEPS.some((item) => item.step === raw) ? raw as ProductionWorkflowStep : null;
}

function queryContentId(): number | null {
  const raw = Array.isArray(route.query.contentId) ? route.query.contentId[0] : route.query.contentId;
  const value = Number(raw ?? 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getStepState(step: ProductionWorkflowStep): ProductionWorkflowStepState | null {
  return workflowState.value?.steps.find((item) => item.step === step) ?? null;
}

function canSelectStep(step: ProductionWorkflowStep): boolean {
  const index = FLOW_STEPS.findIndex((item) => item.step === step);
  return index >= 0 && index <= highestAllowedStepIndex.value;
}

function resolveStepStatus(step: ProductionWorkflowStep): FlowStepDisplayStatus {
  const state = getStepState(step);
  if (!state) {
    return step === activeStep.value ? 'active' : 'notStarted';
  }
  if (state.status === 'done') {
    return 'done';
  }
  if (!canSelectStep(step)) {
    return 'locked';
  }
  if (state.status === 'blocked' || state.status === 'needsUpdate') {
    return 'needsAction';
  }
  return step === activeStep.value || workflowState.value?.nextStep === step ? 'active' : 'notStarted';
}

function resolveBlockers(step: ProductionWorkflowStep): string[] {
  const blockers: string[] = [];
  const stateReason = getStepState(step)?.reason;
  if (stateReason) blockers.push(stateReason);
  if (step === 'content') {
    if (!contentDraft.value.trim()) blockers.push(t('production.flow.blocker.content'));
    if (contentHasChanges.value) blockers.push(t('production.flow.saveBeforeNext'));
  }
  if (step === 'resources' && resourceDraftCount.value > 0) {
    blockers.push(t('production.flow.blocker.resourceDrafts', { count: resourceDraftCount.value }));
  }
  if (step === 'storyboardImages' && storyboardImageMissingIds.value.length > 0) {
    blockers.push(t('production.flow.blocker.storyboardImages', { count: storyboardImageMissingIds.value.length }));
  }
  if (step === 'videoWorkbench' && selectedVideoTrackCount.value < videoTracks.value.length) {
    blockers.push(videoTracks.value.length === 0
      ? t('production.flow.blocker.videoTracks')
      : t('production.flow.blocker.selectedVideos', { count: videoTracks.value.length - selectedVideoTrackCount.value }));
  }
  return Array.from(new Set(blockers));
}

function selectStep(step: ProductionWorkflowStep): void {
  if (!canSelectStep(step)) {
    MessagePlugin.warning(t('production.flow.stepLocked'));
    return;
  }
  activeStep.value = step;
  void router.replace({ name: 'production', query: { ...route.query, step } });
}

function goPrevious(): void {
  if (canGoPrevious.value) selectStep(FLOW_STEPS[activeStepIndex.value - 1]!.step);
}

function goNext(): void {
  if (canGoNext.value) selectStep(FLOW_STEPS[activeStepIndex.value + 1]!.step);
}

function clearStatusPoll(): void {
  if (statusPollTimer) {
    window.clearTimeout(statusPollTimer);
    statusPollTimer = null;
  }
}

function scheduleStatusPoll(): void {
  clearStatusPoll();
  if (runningTaskCount.value > 0) {
    statusPollTimer = window.setTimeout(() => void refreshFlow(), STATUS_POLL_INTERVAL);
  }
}

async function loadResourceDraftCount(): Promise<void> {
  resourceDraftCount.value = 0;
  if (!currentProjectId.value || !currentContentId.value) return;
  const response = await window.vtStudio.production.resources.listDrafts({ projectId: currentProjectId.value, contentId: currentContentId.value });
  if (isOk(response)) resourceDraftCount.value = response.data.drafts.length;
}

async function loadWorkflowState(): Promise<void> {
  workflowState.value = null;
  if (!currentProjectId.value || !currentContentId.value) return;
  const response = await window.vtStudio.production.workflow.getState({ projectId: currentProjectId.value, contentId: currentContentId.value });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  workflowState.value = response.data.state;
}

async function loadExportHistory(): Promise<void> {
  exportHistories.value = [];
  if (!currentProjectId.value || !currentContentId.value) return;
  const response = await window.vtStudio.export.listHistory({ projectId: currentProjectId.value, contentId: currentContentId.value, limit: 12 });
  if (isOk(response)) exportHistories.value = response.data.histories;
}

async function loadRuleContext(): Promise<void> {
  ruleContext.value = null;
  if (!currentProjectId.value || !currentContentId.value) return;
  rulesLoading.value = true;
  try {
    const response = await window.vtStudio.production.agent.getContext({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
    });
    if (isOk(response)) ruleContext.value = response.data;
  } finally {
    rulesLoading.value = false;
  }
}

async function loadFlow(options: { asRefresh?: boolean; contentId?: number | null; preserveStep?: boolean } = {}): Promise<void> {
  if (!currentProjectId.value) return;
  options.asRefresh ? (refreshing.value = true) : (loading.value = true);
  try {
    const response = await window.vtStudio.production.getWorkspace({
      projectId: currentProjectId.value,
      contentId: options.contentId ?? currentContentId.value ?? queryContentId() ?? undefined,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    contents.value = response.data.contents;
    currentContentId.value = response.data.currentContentId;
    flowData.value = response.data.flowData;
    contentDraft.value = response.data.flowData?.contentBody ?? '';
    savedContentBody.value = contentDraft.value;
    await Promise.all([loadResourceDraftCount(), loadWorkflowState(), loadExportHistory(), loadRuleContext()]);
    if (!options.preserveStep) {
      const requestedStep = queryStep();
      activeStep.value = requestedStep && canSelectStep(requestedStep) ? requestedStep : workflowState.value?.nextStep ?? 'content';
    }
    if (!activeVideoTrackId.value || !videoTracks.value.some((track) => track.id === activeVideoTrackId.value)) {
      activeVideoTrackId.value = videoTracks.value[0]?.id ?? null;
    }
    ensureVideoGenerationSelections();
    scheduleStatusPoll();
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function refreshFlow(): Promise<void> {
  await loadFlow({ asRefresh: true, preserveStep: true });
}

async function saveContent(): Promise<void> {
  if (!currentProjectId.value || !contentDraft.value.trim()) return;
  contentSaving.value = true;
  try {
    const response = await window.vtStudio.production.content.save({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      title: currentContentName.value,
      body: contentDraft.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.flow.contentSaved'));
    await loadFlow({ asRefresh: true, contentId: response.data.content.id, preserveStep: true });
    activeStep.value = 'content';
  } finally {
    contentSaving.value = false;
  }
}

async function smartSplitStoryboards(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) return;
  actionRunning.value = true;
  try {
    const response = await window.vtStudio.production.storyboard.smartSplit({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      replaceExisting: hasProductionSegments.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.flow.storyboard.smartSplitDone', { count: response.data.generatedCount }));
    await refreshFlow();
  } finally {
    actionRunning.value = false;
  }
}

async function createWholeContentStoryboard(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !contentDraft.value.trim()) return;
  actionRunning.value = true;
  try {
    const response = await window.vtStudio.production.storyboard.save({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      videoDesc: contentDraft.value.trim(),
      prompt: '',
      duration: 4,
      associatedAssetIds: visualAssets.value.map((asset) => asset.id),
      shouldGenerateImage: false,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.flow.storyboard.wholeContentCreated'));
    await refreshFlow();
  } finally {
    actionRunning.value = false;
  }
}

function openStoryboardEditor(storyboard?: ProductionStoryboardItem): void {
  storyboardForm.id = storyboard?.id ?? null;
  storyboardForm.videoDesc = storyboard?.videoDesc ?? '';
  storyboardForm.prompt = storyboard?.prompt ?? '';
  storyboardForm.duration = storyboard?.duration ?? 4;
  storyboardForm.associatedAssetIds = [...(storyboard?.associatedAssetIds ?? [])];
  storyboardForm.shouldGenerateImage = storyboard?.shouldGenerateImage ?? true;
  storyboardEditorVisible.value = true;
}

async function saveStoryboard(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !storyboardForm.videoDesc.trim()) {
    MessagePlugin.warning(t('production.node.storyboard.required'));
    return;
  }
  storyboardSaving.value = true;
  try {
    const response = await window.vtStudio.production.storyboard.save({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      id: storyboardForm.id,
      videoDesc: storyboardForm.videoDesc,
      prompt: storyboardForm.prompt,
      duration: Number(storyboardForm.duration) || 4,
      associatedAssetIds: storyboardForm.associatedAssetIds,
      shouldGenerateImage: storyboardForm.shouldGenerateImage,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    storyboardEditorVisible.value = false;
    MessagePlugin.success(t(storyboardForm.id ? 'production.node.storyboard.saved' : 'production.node.storyboard.created'));
    await refreshFlow();
  } finally {
    storyboardSaving.value = false;
  }
}

async function deleteStoryboard(storyboard: ProductionStoryboardItem): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) return;
  const response = await window.vtStudio.production.storyboard.delete({ projectId: currentProjectId.value, contentId: currentContentId.value, storyboardId: storyboard.id });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  await refreshFlow();
}

async function generateStoryboardImages(ids: number[]): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || ids.length === 0) return;
  actionRunning.value = true;
  try {
    const response = await window.vtStudio.production.storyboard.generateImages({ projectId: currentProjectId.value, contentId: currentContentId.value, storyboardIds: ids });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.node.storyboard.generateStarted'));
    await refreshFlow();
  } finally {
    actionRunning.value = false;
  }
}

async function startVideoPromptGeneration(trackIds: number[], showMessage = true): Promise<boolean> {
  if (!currentProjectId.value || !currentContentId.value || trackIds.length === 0) return false;
  if (!videoGenerationReady.value) {
    MessagePlugin.warning(videoGenerationBlocker.value || t('production.workbench.capabilityUnavailable'));
    return false;
  }
  const response = await window.vtStudio.production.videoPrompt.generate({
    projectId: currentProjectId.value,
    contentId: currentContentId.value,
    trackIds,
    model: effectiveVideoModelId.value,
    mode: selectedVideoMode(),
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return false;
  }
  if (showMessage) {
    MessagePlugin.success(t('production.node.workbench.promptStarted'));
  }
  return true;
}

async function prepareVideoTracks(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) return;
  if (storyboards.value.length === 0) {
    MessagePlugin.warning(t('production.flow.storyboard.emptyOptional'));
    return;
  }
  const obsoleteTracks = [...contentLevelVideoTracks.value];
  const missing = [...unboundStoryboards.value];
  actionRunning.value = true;
  try {
    for (const track of obsoleteTracks) {
      const response = await window.vtStudio.production.videoTrack.delete({
        projectId: currentProjectId.value,
        contentId: currentContentId.value,
        trackId: track.id,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
    }
    for (const storyboard of missing) {
      const response = await window.vtStudio.production.videoTrack.save({
        projectId: currentProjectId.value,
        contentId: currentContentId.value,
        storyboardIds: [storyboard.id],
        duration: storyboard.duration,
        prompt: '',
        sortIndex: storyboard.index,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
    }
    MessagePlugin.success(t(obsoleteTracks.length || missing.length
      ? 'production.node.workbench.tracksSynced'
      : 'production.node.workbench.trackCreated'));
    await refreshFlow();
  } finally {
    actionRunning.value = false;
  }
}

async function generateVideoPrompt(track: ProductionVideoTrackItem): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) return;
  actionRunning.value = true;
  try {
    if (await startVideoPromptGeneration([track.id])) {
      await refreshFlow();
    }
  } finally {
    actionRunning.value = false;
  }
}

async function generateVideo(track: ProductionVideoTrackItem): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) return;
  if (!track.prompt.trim()) {
    MessagePlugin.warning(t('production.workbench.promptRequired'));
    return;
  }
  actionRunning.value = true;
  try {
    const response = await window.vtStudio.production.video.generate({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      trackIds: [track.id],
      model: effectiveVideoModelId.value,
      mode: selectedVideoMode(),
      resolution: videoGenerationForm.resolution,
      duration: videoGenerationForm.duration,
      audioEnabled: videoGenerationForm.audioEnabled,
    });
    if (!isOk(response)) MessagePlugin.error(response.msg);
    else MessagePlugin.success(t('production.node.workbench.videoStarted'));
    await refreshFlow();
  } finally {
    actionRunning.value = false;
  }
}

async function selectVideo(track: ProductionVideoTrackItem, video: ProductionVideoItem): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !video.videoUrl) return;
  const response = await window.vtStudio.production.video.select({ projectId: currentProjectId.value, contentId: currentContentId.value, trackId: track.id, videoId: video.id });
  if (!isOk(response)) MessagePlugin.error(response.msg);
  else await refreshFlow();
}

async function validateExport(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) return;
  actionRunning.value = true;
  try {
    const response = await window.vtStudio.export.validateAssets({ projectId: currentProjectId.value, contentId: currentContentId.value });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    exportValidation.value = response.data;
    MessagePlugin[response.data.valid ? 'success' : 'warning'](response.data.valid
      ? t('exportCenter.validationPassed')
      : t('exportCenter.validationFailed', { count: response.data.failures.length }));
  } finally {
    actionRunning.value = false;
  }
}

async function createExport(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !exportValidation.value?.valid) {
    MessagePlugin.warning(t('exportCenter.needCheckFirst'));
    return;
  }
  actionRunning.value = true;
  try {
    const response = await window.vtStudio.export.createJianyingDraft({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      draftName: exportDraftName.value.trim() || null,
      copyAssets: exportCopyAssets.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    exportResult.value = response.data;
    MessagePlugin[response.data.succeeded ? 'success' : 'error'](response.data.succeeded ? t('exportCenter.exportSucceeded') : t('exportCenter.exportFailed'));
    await loadExportHistory();
  } finally {
    actionRunning.value = false;
  }
}

async function openExportDirectory(path: string | null): Promise<void> {
  if (!path) return;
  const response = await window.vtStudio.export.openDirectory({ path });
  if (!isOk(response)) MessagePlugin.error(response.msg);
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString(locale.value, { hour12: false });
}

watch(currentProjectId, () => {
  void loadFlow();
  void loadVideoGenerationSettings();
});
watch(activeVideoTrackId, () => ensureVideoGenerationSelections());
watch(() => [videoGenerationForm.model, videoGenerationForm.mode, videoGenerationForm.duration] as const, () => ensureVideoGenerationSelections());
onMounted(() => {
  void loadFlow();
  void loadVideoGenerationSettings();
});
onUnmounted(clearStatusPoll);
</script>

<template>
  <div class="production-flow-page">
    <header class="production-flow-toolbar">
      <t-tooltip :content="t('layout.backToProjects')">
        <VtButton variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('layout.backToProjects')" @click="backToProjects">
          <template #icon><ArrowLeftIcon /></template>
        </VtButton>
      </t-tooltip>
      <div class="production-flow-project">
        <strong>{{ currentProjectName }}</strong>
        <span>{{ currentContentName }}</span>
      </div>
      <nav class="production-flow-track" :aria-label="t('production.flow.progressLabel')">
        <button
          v-for="item in FLOW_STEPS"
          :key="item.step"
          type="button"
          class="production-flow-step-chip"
          :class="[`is-${resolveStepStatus(item.step)}`, { 'is-active': activeStep === item.step }]"
          :aria-current="activeStep === item.step ? 'step' : undefined"
          :aria-disabled="!canSelectStep(item.step)"
          @click="selectStep(item.step)"
        >
          <i />
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </nav>
      <div class="production-flow-toolbar-actions">
        <div v-if="activeBlockers.length" class="production-flow-step-state has-blocker">
          <ErrorCircleIcon />
          <span>{{ activeBlockers[0] }}</span>
        </div>
        <span v-if="runningTaskCount || failedTaskCount" class="production-flow-task-summary">
          {{ t('production.status.running') }} {{ runningTaskCount }} / {{ t('production.flow.metric.failed') }} {{ failedTaskCount }}
        </span>
        <VtButton class="production-flow-rules-button" variant="outline" size="small" :loading="rulesLoading" @click="rulesVisible = true">
          <template #icon><SystemCodeIcon /></template>
          {{ t('production.flow.rules.open') }}
        </VtButton>
        <t-tooltip v-if="activeStep !== 'resources'" :content="t('production.refresh')">
          <VtButton variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.refresh')" :loading="refreshing" @click="refreshFlow">
            <template #icon><RefreshIcon /></template>
          </VtButton>
        </t-tooltip>
        <div class="production-flow-nav">
          <VtButton variant="outline" size="small" :disabled="!canGoPrevious" @click="goPrevious">{{ t('production.flow.previous') }}</VtButton>
          <VtButton theme="primary" variant="base" size="small" :disabled="!canGoNext" @click="goNext">{{ t('production.flow.next') }}</VtButton>
        </div>
      </div>
    </header>

    <t-loading class="production-flow-loading" :loading="loading">
      <main v-if="currentProjectId" class="production-flow-workspace" :class="{ 'is-resource-step': activeStep === 'resources' }">
        <section class="production-flow-step-body" :class="`is-${activeStep}`">
          <section v-if="activeStep === 'content'" class="production-content-editor">
            <div class="production-inline-actions">
              <span>{{ contentHasChanges ? t('production.flow.unsaved') : t('production.flow.savedState') }}</span>
              <VtButton theme="primary" variant="base" size="small" :loading="contentSaving" :disabled="!contentDraft.trim() || !contentHasChanges" @click="saveContent">{{ t('production.save') }}</VtButton>
            </div>
            <t-textarea v-model="contentDraft" class="production-content-textarea" :placeholder="t('production.flow.contentPlaceholder')" :autosize="{ minRows: 18, maxRows: 28 }" />
          </section>

          <ProductionResourceWorkbench
            v-else-if="activeStep === 'resources' && currentContentId"
            :key="currentContentId"
            embedded
            :content-id="currentContentId"
            @changed="refreshFlow"
          />

          <section v-else-if="activeStep === 'storyboardTable'" class="production-storyboard-workspace">
            <VtPanel class="production-storyboard-list" padding="sm" scrollable>
              <template #header>
                <div class="production-panel-title">
                  <strong>{{ t('production.flow.step.storyboardTable.label') }}</strong>
                  <span>{{ storyboards.length ? t('production.flow.storyboard.count', { count: storyboards.length }) : t('production.flow.storyboard.notSplit') }}</span>
                </div>
              </template>
              <div class="production-storyboard-list-stack">
                <VtMediaTile
                  v-for="storyboard in storyboards"
                  :key="storyboard.id"
                  class="production-storyboard-list-tile"
                  :title="formatStoryboardCode(storyboard)"
                  :description="storyboard.videoDesc || t('production.emptyText')"
                  :media-url="storyboard.thumbnailUrl || storyboard.imageUrl"
                  media-kind="image"
                  :status="storyboard.shouldGenerateImage ? getMediaStatus(storyboard.imageStatus) : 'warning'"
                  :status-label="storyboard.shouldGenerateImage ? t(`production.status.${storyboard.imageStatus}`) : t('production.node.storyboard.shouldGenerateOff')"
                  :selected="activeStoryboardImage?.id === storyboard.id"
                  :empty-text="t('production.resourceWorkbench.imageNotReady')"
                  aspect-ratio="16 / 9"
                  @click="activeStoryboardImageId = storyboard.id"
                />
              </div>
              <VtEmptyState v-if="storyboards.length === 0" size="small" :description="t('production.flow.storyboard.emptyOptional')" />
            </VtPanel>

            <VtPanel v-if="activeStoryboardImage" class="production-storyboard-detail" padding="none">
              <template #header>
                <div class="production-panel-title">
                  <strong>{{ formatStoryboardCode(activeStoryboardImage) }}</strong>
                  <span>{{ activeStoryboardImage.duration }}s</span>
                </div>
                <t-tag :theme="activeStoryboardImage.shouldGenerateImage ? 'success' : 'warning'" variant="light">
                  {{ activeStoryboardImage.shouldGenerateImage ? t('production.node.storyboard.shouldGenerateOn') : t('production.node.storyboard.shouldGenerateOff') }}
                </t-tag>
              </template>
              <div class="production-storyboard-detail-scroll">
                <t-alert
                  v-if="isDependencyInvalid(activeStoryboardImage.dependencyStatus)"
                  :theme="getDependencyAlertTheme(activeStoryboardImage.dependencyStatus)"
                  :message="dependencyStatusMessage(activeStoryboardImage.dependencyStatus, activeStoryboardImage.dependencyReason)"
                />
                <section class="production-storyboard-copy is-description">
                  <strong>{{ t('production.node.storyboard.videoDesc') }}</strong>
                  <p>{{ activeStoryboardImage.videoDesc || t('production.emptyText') }}</p>
                </section>
                <VtPromptEditor
                  readonly
                  :model-value="activeStoryboardImage.prompt || ''"
                  :resources="visualResourceReferences"
                  :selected-resource-keys="activeStoryboardResourceKeys"
                  :label="t('production.node.storyboard.prompt')"
                  :placeholder="t('production.emptyText')"
                  :min-rows="5"
                  :max-rows="10"
                />
                <section class="production-storyboard-linked-section">
                  <strong>{{ t('production.node.storyboard.assets') }}</strong>
                  <div v-if="activeStoryboardImageAssets.length" class="production-resource-token-list">
                    <VtResourceToken
                      v-for="asset in activeStoryboardImageAssets"
                      :key="asset.id"
                      :resource="toAssetResourceReference(asset)"
                    />
                  </div>
                  <span v-else class="production-image-inspector-muted">{{ t('production.emptyText') }}</span>
                </section>
                <section class="production-storyboard-frame-section">
                  <strong>{{ t('production.node.storyboard.title') }}</strong>
                  <VtMediaTile
                    :title="formatStoryboardCode(activeStoryboardImage)"
                    :subtitle="activeStoryboardImage.imageUrl ? t('production.assetExtract.imageReady') : t('production.resourceWorkbench.imageNotReady')"
                    :media-url="activeStoryboardImage.thumbnailUrl || activeStoryboardImage.imageUrl"
                    media-kind="image"
                    :status="activeStoryboardImage.shouldGenerateImage ? getMediaStatus(activeStoryboardImage.imageStatus) : 'warning'"
                    :status-label="activeStoryboardImage.shouldGenerateImage ? t(`production.status.${activeStoryboardImage.imageStatus}`) : t('production.node.storyboard.shouldGenerateOff')"
                    :empty-text="t('production.resourceWorkbench.imageNotReady')"
                    :interactive="false"
                  />
                  <t-alert v-if="activeStoryboardImage.imageErrorReason" theme="error" :message="activeStoryboardImage.imageErrorReason" />
                </section>
              </div>
            </VtPanel>
            <VtPanel v-else class="production-storyboard-detail is-empty" padding="none">
              <VtEmptyState size="small" :description="t('production.flow.storyboard.emptyOptional')" />
            </VtPanel>

            <VtPanel class="production-storyboard-inspector" padding="sm" scrollable>
              <section class="production-storyboard-action-group">
                <strong>{{ t('production.flow.step.storyboardTable.title') }}</strong>
                <VtActionBar align="start" density="compact">
                  <VtButton v-if="!hasProductionSegments" variant="outline" :loading="actionRunning" @click="smartSplitStoryboards">
                    <template #icon><SystemCodeIcon /></template>
                    {{ t('production.flow.storyboard.smartSplit') }}
                  </VtButton>
                  <t-popconfirm v-else :content="t('production.flow.storyboard.replaceConfirm')" @confirm="smartSplitStoryboards">
                    <VtButton variant="outline" :loading="actionRunning">
                      <template #icon><SystemCodeIcon /></template>
                      {{ t('production.flow.storyboard.smartSplitAgain') }}
                    </VtButton>
                  </t-popconfirm>
                  <VtButton v-if="storyboards.length === 0" variant="outline" :loading="actionRunning" @click="createWholeContentStoryboard">
                    {{ t('production.flow.storyboard.wholeContent') }}
                  </VtButton>
                  <VtButton theme="primary" variant="base" @click="openStoryboardEditor()">
                    <template #icon><AddIcon /></template>
                    {{ t('production.node.storyboard.create') }}
                  </VtButton>
                </VtActionBar>
              </section>
              <section v-if="activeStoryboardImage" class="production-storyboard-action-group">
                <strong>{{ formatStoryboardCode(activeStoryboardImage) }}</strong>
                <VtActionBar align="start" density="compact">
                  <VtButton variant="outline" @click="openStoryboardEditor(activeStoryboardImage)">
                    <template #icon><EditIcon /></template>
                    {{ t('production.edit') }}
                  </VtButton>
                  <t-popconfirm :content="t('production.node.storyboard.deleteBody', { index: activeStoryboardImage.index + 1 })" @confirm="deleteStoryboard(activeStoryboardImage)">
                    <VtButton variant="outline">
                      <template #icon><DeleteIcon /></template>
                      {{ t('production.delete') }}
                    </VtButton>
                  </t-popconfirm>
                </VtActionBar>
              </section>
            </VtPanel>
          </section>

          <section v-else-if="activeStep === 'storyboardImages'" class="production-image-workspace">
            <VtPanel class="production-image-list" padding="sm" scrollable>
              <template #header>
                <div class="production-panel-title">
                  <strong>{{ t('production.flow.step.storyboardImages.label') }}</strong>
                  <span>{{ t('production.flow.metric.storyboardImages') }} {{ storyboardReadyImageCount }}/{{ storyboards.length }}</span>
                </div>
              </template>
              <div class="production-image-list-stack">
                <VtMediaTile
                  v-for="storyboard in storyboards"
                  :key="storyboard.id"
                  class="production-image-list-tile"
                  :title="formatStoryboardCode(storyboard)"
                  :description="storyboard.videoDesc || t('production.emptyText')"
                  :media-url="storyboard.thumbnailUrl || storyboard.imageUrl"
                  media-kind="image"
                  :status="storyboard.shouldGenerateImage ? getMediaStatus(storyboard.imageStatus) : 'warning'"
                  :status-label="storyboard.shouldGenerateImage ? t(`production.status.${storyboard.imageStatus}`) : t('production.node.storyboard.shouldGenerateOff')"
                  :selected="activeStoryboardImage?.id === storyboard.id"
                  :empty-text="t('production.resourceWorkbench.imageNotReady')"
                  aspect-ratio="16 / 9"
                  @click="activeStoryboardImageId = storyboard.id"
                />
              </div>
              <VtEmptyState v-if="storyboards.length === 0" size="small" :description="t('production.flow.storyboard.imagesSkipped')" />
            </VtPanel>

            <VtPanel v-if="activeStoryboardImage" class="production-image-canvas" padding="none">
              <template #header>
                <div class="production-panel-title">
                  <strong>{{ formatStoryboardCode(activeStoryboardImage) }}</strong>
                  <span>{{ activeStoryboardImage.videoDesc || t('production.emptyText') }}</span>
                </div>
                <t-tag :theme="activeStoryboardImageStatusTheme" variant="light">
                  {{ activeStoryboardImage.shouldGenerateImage ? t(`production.status.${activeStoryboardImage.imageStatus}`) : t('production.node.storyboard.shouldGenerateOff') }}
                </t-tag>
              </template>
              <div class="production-image-canvas-view">
                <PreviewableImage
                  v-if="activeStoryboardImage.imageUrl"
                  :src="activeStoryboardImage.imageUrl"
                  :alt="activeStoryboardImage.videoDesc"
                  :heading="formatStoryboardCode(activeStoryboardImage)"
                  frame-class="production-storyboard-image-frame"
                  viewport-class="production-storyboard-image-viewport"
                  image-class="production-storyboard-image-media"
                />
                <VtMediaTile
                  v-else
                  class="production-image-empty-tile"
                  :title="formatStoryboardCode(activeStoryboardImage)"
                  :subtitle="t('production.resourceWorkbench.imageNotReady')"
                  media-kind="image"
                  :status="activeStoryboardImage.shouldGenerateImage ? getMediaStatus(activeStoryboardImage.imageStatus) : 'warning'"
                  :status-label="activeStoryboardImage.shouldGenerateImage ? t(`production.status.${activeStoryboardImage.imageStatus}`) : t('production.node.storyboard.shouldGenerateOff')"
                  :empty-text="t('production.resourceWorkbench.imageNotReady')"
                  :interactive="false"
                />
              </div>
            </VtPanel>

            <VtPanel v-if="activeStoryboardImage" class="production-image-inspector" padding="sm" scrollable>
              <template #header>
                <div class="production-panel-title">
                  <strong>{{ t('production.node.storyboard.prompt') }}</strong>
                  <span>{{ formatStoryboardCode(activeStoryboardImage) }}</span>
                </div>
                <VtButton size="small" variant="outline" @click="openStoryboardEditor(activeStoryboardImage)">
                  <template #icon><EditIcon /></template>
                  {{ t('production.edit') }}
                </VtButton>
              </template>
              <VtPromptEditor
                readonly
                :model-value="activeStoryboardImage.prompt || activeStoryboardImage.videoDesc"
                :resources="visualResourceReferences"
                :selected-resource-keys="activeStoryboardResourceKeys"
                :placeholder="t('production.emptyText')"
                :min-rows="7"
                :max-rows="14"
              />
              <section class="production-image-inspector-section">
                <strong>{{ t('production.node.storyboard.assets') }}</strong>
                <div v-if="activeStoryboardImageAssets.length" class="production-resource-token-list">
                  <VtResourceToken
                    v-for="asset in activeStoryboardImageAssets"
                    :key="asset.id"
                    :resource="toAssetResourceReference(asset)"
                  />
                </div>
                <span v-else class="production-image-inspector-muted">{{ t('production.emptyText') }}</span>
              </section>
              <t-alert
                v-if="isDependencyInvalid(activeStoryboardImage.dependencyStatus)"
                :theme="getDependencyAlertTheme(activeStoryboardImage.dependencyStatus)"
                :message="dependencyStatusMessage(activeStoryboardImage.dependencyStatus, activeStoryboardImage.dependencyReason)"
              />
              <t-alert v-if="activeStoryboardImage.imageErrorReason" theme="error" :message="activeStoryboardImage.imageErrorReason" />
              <VtActionBar align="start" density="compact">
                <VtButton
                  theme="primary"
                  variant="base"
                  :loading="actionRunning"
                  :disabled="activeStoryboardImage.imageStatus === PRODUCTION_TASK_STATUS.RUNNING"
                  @click="generateStoryboardImages([activeStoryboardImage.id])"
                >
                  <template #icon><ImageIcon /></template>
                  {{ activeStoryboardImage.imageUrl ? t('production.resourceWorkbench.regenerateImage') : t('production.node.storyboard.generateOne') }}
                </VtButton>
                <VtButton
                  variant="outline"
                  :loading="actionRunning"
                  :disabled="storyboardImageMissingIds.length === 0"
                  @click="generateStoryboardImages(storyboardImageMissingIds)"
                >
                  {{ t('production.node.storyboard.generateSelected') }}
                </VtButton>
              </VtActionBar>
            </VtPanel>
          </section>

          <section v-else-if="activeStep === 'videoWorkbench'" class="production-video-workspace">
            <VtEmptyState v-if="videoTracks.length === 0" :description="t('production.node.workbench.empty')">
              <template #action><VtButton theme="primary" variant="base" :loading="actionRunning" @click="prepareVideoTracks">{{ t('production.node.workbench.createTrack') }}</VtButton></template>
            </VtEmptyState>
            <template v-else>
              <div v-if="needsVideoTrackSync" class="production-inline-actions production-video-sync">
                <span>{{ t('production.node.workbench.syncHint') }}</span>
                <t-popconfirm
                  v-if="contentLevelVideoTracks.length"
                  :content="t('production.node.workbench.syncConfirm')"
                  @confirm="prepareVideoTracks"
                >
                  <VtButton variant="outline" size="small" :loading="actionRunning">
                    <template #icon><RefreshIcon /></template>{{ t('production.node.workbench.syncTracks') }}
                  </VtButton>
                </t-popconfirm>
                <VtButton v-else variant="outline" size="small" :loading="actionRunning" @click="prepareVideoTracks">
                  <template #icon><RefreshIcon /></template>{{ t('production.node.workbench.syncTracks') }}
                </VtButton>
              </div>
              <VtPanel class="production-video-tracks" padding="sm" scrollable>
                <template #header>
                  <div class="production-panel-title">
                    <strong>{{ t('production.flow.step.videoWorkbench.label') }}</strong>
                    <span>{{ selectedVideoTrackCount }}/{{ videoTracks.length }}</span>
                  </div>
                </template>
                <button
                  v-for="track in videoTracks"
                  :key="track.id"
                  type="button"
                  class="production-video-track-item"
                  :class="{ 'is-active': activeVideoTrack?.id === track.id }"
                  @click="activeVideoTrackId = track.id"
                >
                  <strong>{{ t('production.node.workbench.trackName', { index: track.sortIndex + 1 }) }}</strong>
                  <span>{{ track.selectedVideoId ? t('production.workbench.selectedVideoReady') : t('production.node.workbench.noSelectedVideo') }}</span>
                  <t-tag v-if="isDependencyInvalid(track.dependencyStatus)" size="small" variant="light" :theme="getDependencyTheme(track.dependencyStatus)">
                    {{ t(`production.dependencyStatus.${track.dependencyStatus}`) }}
                  </t-tag>
                </button>
              </VtPanel>
              <VtPanel v-if="activeVideoTrack" class="production-video-candidates" padding="sm">
                <template #header>
                  <div class="production-panel-title">
                    <strong>{{ t('production.workbench.candidates') }}</strong>
                    <span>{{ t('production.node.workbench.candidates', { count: activeVideoTrack.videos.length }) }}</span>
                  </div>
                </template>
                <div v-if="activeVideoTrack.videos.length" class="production-video-grid">
                  <VtMediaTile
                    v-for="video in activeVideoTrack.videos"
                    :key="video.id"
                    :title="`${video.duration}s / ${video.resolution || '-'}`"
                    :description="video.prompt || activeVideoTrack.prompt || t('production.emptyText')"
                    :media-url="video.videoUrl"
                    media-kind="video"
                    :status="getMediaStatus(video.status)"
                    :status-label="t(`production.status.${video.status}`)"
                    :selected="activeVideoTrack.selectedVideoId === video.id"
                    :empty-text="t(`production.status.${video.status}`)"
                    aspect-ratio="16 / 9"
                    controls
                    :interactive="false"
                  >
                    <template #badge>
                      <t-tag v-if="isDependencyInvalid(video.dependencyStatus)" size="small" variant="light" :theme="getDependencyTheme(video.dependencyStatus)">
                        {{ t(`production.dependencyStatus.${video.dependencyStatus}`) }}
                      </t-tag>
                    </template>
                    <template #actions>
                      <VtButton
                        size="small"
                        :theme="activeVideoTrack.selectedVideoId === video.id ? 'default' : 'primary'"
                        :variant="activeVideoTrack.selectedVideoId === video.id ? 'outline' : 'base'"
                        :disabled="!video.videoUrl"
                        @click="selectVideo(activeVideoTrack, video)"
                      >
                        <template #icon><CheckIcon /></template>{{ t('production.workbench.selectVideo') }}
                      </VtButton>
                    </template>
                  </VtMediaTile>
                </div>
                <VtEmptyState v-else size="small" :description="t('production.workbench.noCandidates')" />
              </VtPanel>
              <VtPanel v-if="activeVideoTrack" class="production-video-inspector" padding="sm" scrollable>
                <template #header>
                  <div class="production-panel-title">
                    <strong>{{ t('production.node.workbench.prompt') }}</strong>
                    <span>{{ t('production.node.workbench.trackName', { index: activeVideoTrack.sortIndex + 1 }) }}</span>
                  </div>
                </template>
                <div class="production-video-config">
                  <label class="is-wide">
                    <span>{{ t('production.workbench.model') }}</span>
                    <t-select v-model="videoGenerationForm.model" :loading="videoCapabilitiesLoading" :options="videoModelOptions" :placeholder="t('production.workbench.modelPlaceholder')" />
                  </label>
                  <label class="is-wide">
                    <span>{{ t('production.node.workbench.mode') }}</span>
                    <t-select v-model="videoGenerationForm.mode" :options="videoModeOptions" :disabled="videoModeOptions.length === 0" />
                  </label>
                  <label>
                    <span>{{ t('production.workbench.resolution') }}</span>
                    <t-select v-model="videoGenerationForm.resolution" :options="videoResolutionOptions" :disabled="videoResolutionOptions.length === 0" />
                  </label>
                  <label>
                    <span>{{ t('production.node.workbench.duration') }}</span>
                    <t-select v-model="videoGenerationForm.duration" :options="videoDurationOptions" :disabled="videoDurationOptions.length === 0" />
                  </label>
                  <label v-if="videoAudioSupported" class="production-video-audio is-wide">
                    <span>{{ t('production.workbench.audioEnabled') }}</span>
                    <t-switch v-model="videoGenerationForm.audioEnabled" :disabled="videoAudioRequired" />
                  </label>
                  <div class="production-video-ratio is-wide">
                    <span>{{ t('production.workbench.videoRatio') }}</span>
                    <strong>{{ projectVideoRatio || '-' }}</strong>
                  </div>
                </div>
                <VtPromptEditor
                  readonly
                  :model-value="activeVideoTrack.prompt"
                  :resources="activeVideoPromptResources"
                  :selected-resource-keys="activeVideoPromptResourceKeys"
                  :placeholder="t('production.emptyText')"
                  :min-rows="8"
                  :max-rows="12"
                />
                <t-alert
                  v-if="isDependencyInvalid(activeVideoTrack.dependencyStatus)"
                  :theme="getDependencyAlertTheme(activeVideoTrack.dependencyStatus)"
                  :message="dependencyStatusMessage(activeVideoTrack.dependencyStatus, activeVideoTrack.dependencyReason)"
                />
                <t-alert
                  v-if="activeSelectedVideo && isDependencyInvalid(activeSelectedVideo.dependencyStatus)"
                  :theme="getDependencyAlertTheme(activeSelectedVideo.dependencyStatus)"
                  :message="dependencyStatusMessage(activeSelectedVideo.dependencyStatus, activeSelectedVideo.dependencyReason)"
                />
                <t-alert v-if="activeVideoTrack.status === PRODUCTION_TASK_STATUS.FAILED && activeVideoTrack.errorReason" theme="error" :message="activeVideoTrack.errorReason" />
                <t-alert v-else-if="videoGenerationBlocker" theme="warning" :message="videoGenerationBlocker" />
                <VtActionBar align="start" density="compact" bordered>
                  <VtButton variant="outline" :loading="actionRunning" :disabled="actionRunning || !videoGenerationReady" @click="generateVideoPrompt(activeVideoTrack)">
                    {{ t(activeVideoTrack.prompt.trim() ? 'production.node.workbench.promptAgain' : 'production.node.workbench.promptSelected') }}
                  </VtButton>
                  <VtButton theme="primary" variant="base" :loading="actionRunning" :disabled="actionRunning || !videoGenerationReady || !activeVideoTrack.prompt.trim()" @click="generateVideo(activeVideoTrack)">
                    <template #icon><PlayCircleIcon /></template>{{ t('production.node.workbench.videoSelected') }}
                  </VtButton>
                </VtActionBar>
              </VtPanel>
            </template>
          </section>

          <section v-else class="production-export-workspace">
            <div class="production-export-main">
              <label><span>{{ t('exportCenter.draftName') }}</span><t-input v-model="exportDraftName" :placeholder="t('exportCenter.draftNamePlaceholder')" /></label>
              <t-checkbox v-model="exportCopyAssets">{{ t('exportCenter.copyAssets') }}</t-checkbox>
              <t-alert theme="warning" :message="t('exportCenter.jianyingSchemaUnverified')" />
              <div class="production-inline-actions">
                <VtButton variant="outline" :loading="actionRunning" @click="validateExport">{{ t('exportCenter.checkAssets') }}</VtButton>
                <VtButton theme="primary" variant="base" :loading="actionRunning" :disabled="!exportValidation?.valid" @click="createExport">{{ t('exportCenter.startExport') }}</VtButton>
              </div>
              <section class="production-export-validation">
                <strong>{{ exportValidation?.valid ? t('exportCenter.validationPassed') : t('exportCenter.failureTitle') }}</strong>
                <ul v-if="exportValidation?.failures.length"><li v-for="(failure, index) in exportValidation.failures" :key="`${failure.trackId}-${failure.sourceId}-${index}`"><ErrorCircleIcon /><span>{{ failure.message }}</span></li></ul>
                <span v-else>{{ exportValidation ? t('exportCenter.noFailures') : t('exportCenter.noCheckYet') }}</span>
              </section>
              <section v-if="exportResult" class="production-export-result">
                <strong>{{ exportResult.succeeded ? t('exportCenter.exportSucceeded') : t('exportCenter.exportFailed') }}</strong>
                <span>{{ exportResult.draftPath || t('exportCenter.noResult') }}</span>
                <VtButton size="small" variant="outline" :disabled="!exportResult.draftPath" @click="openExportDirectory(exportResult.draftPath)">{{ t('exportCenter.openDirectory') }}</VtButton>
              </section>
            </div>
            <aside class="production-export-history">
              <div class="production-inline-actions"><strong>{{ t('exportCenter.historyTitle') }}</strong><span>{{ exportHistories.length }}</span></div>
              <button v-for="history in exportHistories" :key="history.id" type="button" :disabled="!history.outputPath" @click="openExportDirectory(history.outputPath)">
                <strong>{{ history.draftName }}</strong><span>{{ formatTime(history.createdAt) }} / {{ history.status }}</span>
              </button>
              <VtEmptyState v-if="exportHistories.length === 0" size="small" :description="t('exportCenter.historyEmpty')" />
            </aside>
          </section>

          <VtEmptyState v-if="activeStep !== 'content' && !currentContentId" :description="t('production.noScript')" />
        </section>
      </main>
      <VtEmptyState v-else :description="t('production.noProject')" />
    </t-loading>

    <VtDialog
      :visible="storyboardEditorVisible"
      :title="storyboardForm.id ? t('production.node.storyboard.editTitle') : t('production.node.storyboard.createTitle')"
      width="760px"
      :confirm-text="t('production.save')"
      :cancel-text="t('production.cancel')"
      :confirm-loading="storyboardSaving"
      @update:visible="(value) => (storyboardEditorVisible = value)"
      @confirm="saveStoryboard"
    >
      <div class="production-storyboard-form">
        <label><span>{{ t('production.node.storyboard.videoDesc') }}</span><t-textarea v-model="storyboardForm.videoDesc" :autosize="{ minRows: 4, maxRows: 7 }" :placeholder="t('production.node.storyboard.videoDescPlaceholder')" /></label>
        <VtPromptEditor
          v-model="storyboardForm.prompt"
          :resources="visualResourceReferences"
          :selected-resource-keys="storyboardFormResourceKeys"
          :label="t('production.node.storyboard.prompt')"
          :placeholder="t('production.node.storyboard.promptPlaceholder')"
          :mention-placeholder="t('production.node.storyboard.assetsPlaceholder')"
          :empty-text="t('production.emptyText')"
          :min-rows="4"
          :max-rows="7"
          @select-resource="ensureStoryboardFormAsset"
          @remove-resource="removeStoryboardFormAsset"
        />
        <div>
          <label><span>{{ t('production.node.storyboard.duration') }}</span><t-input-number v-model="storyboardForm.duration" :min="1" :max="60" /></label>
          <label><span>{{ t('production.node.storyboard.shouldGenerate') }}</span><t-switch v-model="storyboardForm.shouldGenerateImage" /></label>
        </div>
        <label><span>{{ t('production.node.storyboard.assets') }}</span><t-select v-model="storyboardForm.associatedAssetIds" multiple clearable filterable :options="storyboardAssetOptions" :placeholder="t('production.node.storyboard.assetsPlaceholder')" /></label>
      </div>
    </VtDialog>

    <ProductionStepRulesDialog
      v-model:visible="rulesVisible"
      :step="activeStep"
      :context="ruleContext"
      :loading="rulesLoading"
    />
  </div>
</template>

<style scoped>
.production-flow-page {
  --flow-bg: var(--vt-surface-app);
  --flow-panel: var(--vt-surface-panel);
  --flow-panel-raised: var(--vt-surface-raised);
  --flow-line: var(--vt-line-soft);
  --flow-line-strong: var(--vt-line-strong);
  --flow-text: var(--vt-text-primary);
  --flow-subtle: var(--vt-text-secondary);
  --flow-muted: var(--vt-text-muted);
  --flow-accent: var(--vt-brand);
  --flow-warning: var(--vt-warning);
  --td-bg-color-container: var(--flow-panel-raised);
  --td-bg-color-container-hover: color-mix(in srgb, var(--vt-brand) 8%, var(--flow-panel-raised));
  --td-component-border: var(--flow-line);
  --td-text-color-primary: var(--flow-text);
  --td-text-color-secondary: var(--flow-subtle);
  --td-text-color-placeholder: var(--flow-muted);
  --td-brand-color: var(--vt-brand);
  display: grid;
  grid-template-rows: 54px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--flow-text);
  background: var(--flow-bg);
}

.production-flow-toolbar {
  display: grid;
  grid-template-columns: 34px minmax(120px, 210px) minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--flow-line);
  background: color-mix(in srgb, var(--flow-panel) 94%, transparent);
}

.production-flow-toolbar :deep(.vt-button--icon-only) {
  width: 34px;
  height: 34px;
  padding: 0;
}

.production-flow-toolbar :deep(.production-flow-rules-button) { height: 34px; }

.production-flow-project {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.production-flow-project strong,
.production-flow-project span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-flow-project strong { font-size: 14px; }
.production-flow-project span { color: var(--flow-muted); font-size: 11px; }

.production-flow-track {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.production-flow-track::-webkit-scrollbar { display: none; }

.production-flow-step-chip {
  position: relative;
  display: flex;
  flex: 1 0 82px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-right: 1px solid var(--flow-line);
  color: var(--flow-muted);
  background: transparent;
  cursor: pointer;
}

.production-flow-step-chip:first-child { border-left: 1px solid var(--flow-line); }
.production-flow-step-chip:hover { color: var(--flow-text); background: color-mix(in srgb, var(--flow-accent) 5%, transparent); }
.production-flow-step-chip.is-active { color: var(--flow-text); background: var(--flow-panel-raised); }
.production-flow-step-chip.is-active::after { position: absolute; right: 10px; bottom: 0; left: 10px; height: 2px; background: var(--flow-accent); content: ''; }
.production-flow-step-chip.is-locked { cursor: not-allowed; opacity: 0.48; }
.production-flow-step-chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--flow-muted); }
.production-flow-step-chip.is-done i { background: var(--flow-accent); }
.production-flow-step-chip.is-needsAction i { background: var(--flow-warning); }
.production-flow-step-chip span { overflow: hidden; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }

.production-flow-toolbar-actions,
.production-inline-actions,
.production-row-actions,
.production-video-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.production-flow-task-summary { color: var(--flow-muted); font-size: 11px; white-space: nowrap; }
.production-flow-step-state {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 220px;
  gap: 5px;
  color: var(--flow-muted);
  font-size: 11px;
}
.production-flow-step-state.has-blocker { color: var(--flow-warning); }
.production-flow-step-state svg { flex: 0 0 auto; width: 14px; height: 14px; }
.production-flow-step-state span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.production-flow-nav { display: flex; align-items: center; gap: 6px; }
.production-flow-loading { display: grid; height: 100%; min-height: 0; }

.production-flow-workspace {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  padding: 10px 12px 12px;
}

.production-flow-workspace.is-resource-step {
  grid-template-rows: minmax(0, 1fr);
  padding-top: 6px;
}

.production-flow-step-body {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 10px 0;
  scrollbar-gutter: stable;
}

.production-flow-step-body.is-resources { overflow: hidden; padding-top: 0; }
.production-content-editor,
.production-text-workspace,
.production-storyboard-workspace,
.production-image-workspace { display: grid; min-height: 100%; gap: 10px; }
.production-content-editor,
.production-text-workspace { grid-template-rows: auto minmax(0, 1fr); }

.production-inline-actions { justify-content: flex-end; min-height: 32px; }
.production-inline-actions > span:first-child { margin-right: auto; color: var(--flow-muted); font-size: 11px; }

.production-panel-title {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.production-panel-title strong,
.production-panel-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-panel-title strong {
  color: var(--flow-text);
  font-size: 13px;
  font-weight: 780;
  line-height: 1.35;
}

.production-panel-title span {
  color: var(--flow-muted);
  font-size: 11px;
  line-height: 1.35;
}

.production-resource-token-list {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 7px;
}

.production-content-textarea,
.production-stage-textarea { display: grid; height: 100%; min-height: 0; }
.production-content-textarea :deep(.t-textarea),
.production-content-textarea :deep(textarea),
.production-stage-textarea :deep(.t-textarea),
.production-stage-textarea :deep(textarea) { height: 100% !important; min-height: 0 !important; }
.production-content-textarea :deep(textarea),
.production-stage-textarea :deep(textarea) { padding: 14px; color: var(--flow-text); font-size: 14px; line-height: 1.75; border-color: var(--flow-line); background: var(--flow-panel); resize: none; }

.production-storyboard-workspace {
  grid-template-columns: 220px minmax(0, 1fr) 260px;
  grid-template-rows: minmax(0, 1fr);
  min-height: 100%;
}

.production-storyboard-list,
.production-storyboard-detail,
.production-storyboard-inspector {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--flow-line);
  border-radius: 6px;
  background: var(--flow-panel);
}

.production-storyboard-list {
  display: grid;
  align-content: start;
  gap: 4px;
  overflow: auto;
  padding: 6px;
}

.production-storyboard-list > button {
  display: grid;
  gap: 8px;
  min-width: 0;
  min-height: 86px;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--flow-subtle);
  background: transparent;
  text-align: left;
}

.production-storyboard-list > button.is-active,
.production-storyboard-list > button:hover {
  border-color: var(--flow-line-strong);
  color: var(--flow-text);
  background: var(--flow-panel-raised);
}

.production-storyboard-list-main {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.production-storyboard-list strong,
.production-storyboard-list span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-storyboard-list strong {
  color: var(--flow-text);
  font-size: 13px;
}

.production-storyboard-list span {
  color: var(--flow-muted);
  font-size: 11px;
}

.production-storyboard-list p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--flow-subtle);
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-storyboard-list-status {
  justify-self: end;
}

.production-storyboard-detail {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.production-storyboard-detail.is-empty {
  place-items: center;
}

.production-storyboard-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--flow-line);
}

.production-storyboard-detail-head > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.production-storyboard-detail-head strong { font-size: 14px; }
.production-storyboard-detail-head span {
  overflow: hidden;
  color: var(--flow-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-storyboard-detail-scroll {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.production-storyboard-detail-scroll section {
  display: grid;
  gap: 7px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--flow-line);
}

.production-storyboard-detail-scroll section:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.production-storyboard-detail-scroll strong {
  color: var(--flow-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
}

.production-storyboard-detail-scroll p {
  margin: 0;
  color: var(--flow-text);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.production-storyboard-copy.is-prompt {
  padding: 10px;
  border: 1px solid var(--flow-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--flow-panel-raised) 78%, transparent);
}

.production-storyboard-copy.is-prompt p {
  color: var(--flow-subtle);
}

.production-storyboard-frame-card {
  display: grid;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--flow-line);
  border-radius: 6px;
  background: var(--flow-bg);
}

.production-storyboard-frame-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.production-storyboard-frame-empty {
  display: grid;
  place-items: center;
  gap: 7px;
  color: var(--flow-muted);
  font-size: 12px;
}

.production-storyboard-frame-empty svg {
  width: 28px;
  height: 28px;
}

.production-storyboard-image-state {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: var(--flow-muted);
  font-size: 11px;
}

.production-storyboard-inspector {
  display: grid;
  align-content: start;
  gap: 10px;
  overflow: auto;
  padding: 10px;
}

.production-storyboard-action-group,
.production-storyboard-metrics {
  display: grid;
  gap: 8px;
  color: var(--flow-muted);
  font-size: 12px;
}

.production-storyboard-action-group {
  padding-top: 10px;
  border-top: 1px solid var(--flow-line);
}

.production-storyboard-action-group:first-child {
  padding-top: 0;
  border-top: 0;
}

.production-storyboard-action-group > strong {
  overflow: hidden;
  color: var(--flow-text);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-storyboard-list,
.production-image-list,
.production-video-tracks,
.production-storyboard-inspector,
.production-image-inspector,
.production-video-inspector {
  overflow: hidden;
}

.production-storyboard-list :deep(.vt-panel__header),
.production-image-list :deep(.vt-panel__header),
.production-video-tracks :deep(.vt-panel__header),
.production-storyboard-detail :deep(.vt-panel__header),
.production-image-canvas :deep(.vt-panel__header),
.production-image-inspector :deep(.vt-panel__header),
.production-video-candidates :deep(.vt-panel__header),
.production-video-inspector :deep(.vt-panel__header) {
  flex: 0 0 auto;
  align-items: center;
  min-height: 42px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--flow-line);
}

.production-storyboard-list :deep(.vt-panel__body),
.production-image-list :deep(.vt-panel__body),
.production-video-tracks :deep(.vt-panel__body),
.production-storyboard-inspector :deep(.vt-panel__body),
.production-image-inspector :deep(.vt-panel__body),
.production-video-inspector :deep(.vt-panel__body) {
  align-content: start;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.production-storyboard-list :deep(.vt-panel__body),
.production-image-list :deep(.vt-panel__body),
.production-video-tracks :deep(.vt-panel__body) {
  gap: 8px;
}

.production-storyboard-inspector :deep(.vt-panel__body),
.production-image-inspector :deep(.vt-panel__body),
.production-video-inspector :deep(.vt-panel__body) {
  gap: 12px;
}

.production-storyboard-detail :deep(.vt-panel__body),
.production-image-canvas :deep(.vt-panel__body),
.production-video-candidates :deep(.vt-panel__body) {
  min-height: 0;
  overflow: hidden;
}

.production-storyboard-list-stack,
.production-image-list-stack {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 8px;
}

.production-storyboard-list :deep(.vt-media-tile),
.production-image-list :deep(.vt-media-tile) {
  box-shadow: none;
}

.production-storyboard-list :deep(.vt-media-tile__main),
.production-image-list :deep(.vt-media-tile__main) {
  padding: 8px;
}

.production-storyboard-list :deep(.vt-media-tile__text p),
.production-image-list :deep(.vt-media-tile__text p) {
  -webkit-line-clamp: 2;
}

.production-image-workspace {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 320px;
  gap: 10px;
  min-height: 100%;
}
.production-image-list,
.production-image-canvas,
.production-image-inspector {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--flow-line);
  border-radius: 6px;
  background: var(--flow-panel);
}
.production-image-list {
  display: grid;
  align-content: start;
  gap: 4px;
  overflow: auto;
  padding: 6px;
}
.production-image-list-head {
  padding: 4px 6px 8px;
  color: var(--flow-muted);
  font-size: 11px;
}
.production-image-list > button {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--flow-subtle);
  background: transparent;
  text-align: left;
}
.production-image-list > button.is-active,
.production-image-list > button:hover {
  border-color: var(--flow-line-strong);
  color: var(--flow-text);
  background: var(--flow-panel-raised);
}
.production-image-list-thumb {
  display: grid;
  width: 44px;
  aspect-ratio: 16 / 9;
  place-items: center;
  overflow: hidden;
  border-radius: 4px;
  background: var(--flow-bg);
}
.production-image-list-thumb img { width: 100%; height: 100%; object-fit: cover; }
.production-image-list-thumb svg { width: 18px; height: 18px; color: var(--flow-muted); }
.production-image-list > button > div:nth-child(2) {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.production-image-list strong,
.production-image-list span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.production-image-list strong { font-size: 12px; }
.production-image-list span { color: var(--flow-muted); font-size: 11px; }
.production-image-list .t-tag { grid-column: 1 / -1; justify-self: start; }
.production-image-canvas {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
.production-image-canvas-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--flow-line);
}
.production-image-canvas-head > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.production-image-canvas-head strong { font-size: 14px; }
.production-image-canvas-head span {
  overflow: hidden;
  color: var(--flow-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.production-image-canvas-view {
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: center;
  overflow: auto;
  padding: 14px;
}
.production-storyboard-image-frame {
  width: min(100%, 760px);
  border: 0;
  background: transparent;
}
.production-storyboard-image-viewport {
  min-height: 0;
  height: min(70vh, 100%);
  aspect-ratio: 16 / 9;
  border-radius: 6px;
}
.production-storyboard-image-media {
  width: 100%;
  height: 100%;
  max-height: none;
  object-fit: contain;
}
.production-image-canvas-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  width: min(100%, 760px);
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  color: var(--flow-muted);
  background: var(--flow-bg);
}
.production-image-canvas-empty svg { width: 36px; height: 36px; }
.production-image-empty-tile {
  width: min(100%, 760px);
}
.production-image-inspector {
  display: grid;
  align-content: start;
  gap: 12px;
  overflow: auto;
  padding: 10px;
}
.production-image-inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.production-image-inspector label {
  display: grid;
  gap: 5px;
}
.production-image-inspector label > span,
.production-image-inspector-section > strong {
  color: var(--flow-muted);
  font-size: 11px;
}
.production-image-inspector-section {
  display: grid;
  gap: 7px;
  padding-top: 10px;
  border-top: 1px solid var(--flow-line);
}
.production-image-linked-assets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 7px;
}

.production-linked-asset {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px;
  border: 1px solid var(--flow-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--flow-panel-raised) 72%, transparent);
}

.production-linked-asset-thumb {
  display: grid;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border-radius: 5px;
  color: var(--flow-muted);
  background: var(--flow-bg);
}

.production-linked-asset-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.production-linked-asset-thumb svg {
  width: 18px;
  height: 18px;
}

.production-linked-asset > div:last-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.production-linked-asset strong,
.production-linked-asset span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-linked-asset strong {
  color: var(--flow-text);
  font-size: 12px;
}

.production-linked-asset span {
  color: var(--flow-muted);
  font-size: 11px;
}
.production-image-inspector-muted { color: var(--flow-muted); font-size: 11px; }
.production-image-inspector-actions {
  display: grid;
  gap: 7px;
}

.production-video-workspace { display: grid; grid-template-columns: 210px minmax(0, 1fr) 320px; align-content: start; gap: 10px; min-height: 100%; }
.production-video-sync { grid-column: 1 / -1; padding-bottom: 2px; border-bottom: 1px solid var(--flow-line); }
.production-video-tracks,
.production-video-candidates,
.production-video-inspector,
.production-export-main,
.production-export-history { min-width: 0; border: 1px solid var(--flow-line); border-radius: 6px; background: var(--flow-panel); }
.production-video-tracks { display: grid; align-content: start; gap: 4px; padding: 6px; overflow: auto; }
.production-video-tracks button { display: grid; gap: 2px; padding: 9px; border: 1px solid transparent; border-radius: 4px; color: var(--flow-subtle); background: transparent; text-align: left; }
.production-video-tracks button.is-active { border-color: var(--flow-line-strong); color: var(--flow-text); background: var(--flow-panel-raised); }
.production-video-tracks span,
.production-video-inspector span { color: var(--flow-muted); font-size: 11px; }
.production-video-candidates { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; padding: 10px; overflow: hidden; }
.production-video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); align-content: start; gap: 10px; min-height: 0; overflow: auto; }
.production-video-grid article { display: grid; gap: 8px; padding: 8px; border: 1px solid var(--flow-line); border-radius: 5px; }
.production-video-grid article.is-selected { border-color: var(--flow-line-strong); }
.production-video-grid video,
.production-video-placeholder { width: 100%; aspect-ratio: 16 / 9; border-radius: 4px; background: var(--flow-bg); }
.production-video-placeholder { display: grid; place-items: center; color: var(--flow-muted); }
.production-video-placeholder svg { width: 28px; height: 28px; }
.production-video-grid footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; color: var(--flow-muted); font-size: 11px; }
.production-video-inspector { display: grid; align-content: start; gap: 12px; padding: 10px; }
.production-video-inspector label,
.production-export-main label,
.production-storyboard-form label { display: grid; gap: 5px; }
.production-video-config { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.production-video-config .is-wide { grid-column: 1 / -1; }
.production-video-audio { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.production-video-ratio { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; padding-top: 6px; border-top: 1px solid var(--flow-line); }
.production-video-ratio strong { font-size: 12px; }
.production-video-actions { align-items: stretch; flex-direction: column; }

.production-video-tracks :deep(.vt-panel__body) {
  display: grid;
}

.production-video-track-item {
  display: grid;
  gap: 4px;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--flow-subtle);
  background: transparent;
  text-align: left;
}

.production-video-track-item:hover,
.production-video-track-item.is-active {
  border-color: var(--flow-line-strong);
  color: var(--flow-text);
  background: var(--flow-panel-raised);
}

.production-video-track-item strong,
.production-video-track-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-video-track-item strong {
  color: var(--flow-text);
  font-size: 13px;
}

.production-video-grid :deep(.vt-media-tile) {
  padding: 0;
  border-color: var(--flow-line);
  border-radius: 8px;
  background: var(--flow-panel-raised);
}

.production-video-grid :deep(.vt-media-tile--selected) {
  border-color: color-mix(in srgb, var(--flow-accent) 44%, var(--flow-line-strong));
}

.production-video-grid :deep(.vt-media-tile__preview video) {
  object-fit: contain;
  background: #08090a;
}

.production-video-grid :deep(.vt-media-tile__main) {
  align-items: center;
}

.production-export-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 10px; min-height: 100%; }
.production-export-main { display: grid; align-content: start; gap: 12px; padding: 12px; }
.production-export-validation,
.production-export-result { display: grid; gap: 8px; padding: 10px; border-top: 1px solid var(--flow-line); color: var(--flow-subtle); font-size: 12px; }
.production-export-validation ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.production-export-validation li { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 6px; }
.production-export-validation li svg { color: var(--flow-warning); }
.production-export-history { display: grid; align-content: start; gap: 5px; padding: 10px; overflow: auto; }
.production-export-history > button { display: grid; gap: 2px; padding: 9px; border: 1px solid var(--flow-line); border-radius: 4px; color: var(--flow-text); background: transparent; text-align: left; }
.production-export-history > button:disabled { cursor: default; opacity: 0.68; }
.production-export-history span { color: var(--flow-muted); font-size: 11px; }

.production-storyboard-form { display: grid; gap: 12px; }
.production-storyboard-form > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.production-storyboard-form label > span,
.production-export-main label > span { color: var(--vt-text-muted); font-size: 12px; }

@media (max-width: 1100px) {
  .production-flow-toolbar { grid-template-columns: 34px minmax(100px, 160px) minmax(0, 1fr) auto; }
  .production-flow-task-summary { display: none; }
  .production-storyboard-workspace { grid-template-columns: 180px minmax(0, 1fr); }
  .production-storyboard-inspector { grid-column: 1 / -1; }
  .production-image-workspace { grid-template-columns: 180px minmax(0, 1fr); }
  .production-image-inspector { grid-column: 1 / -1; }
  .production-video-workspace { grid-template-columns: 180px minmax(0, 1fr); }
  .production-video-inspector { grid-column: 1 / -1; }
}

@media (max-width: 760px) {
  .production-flow-toolbar { grid-template-columns: 34px minmax(0, 1fr) 34px; }
  .production-flow-project { display: none; }
  .production-flow-track { grid-column: 2; }
  .production-flow-toolbar-actions { grid-column: 3; }
  .production-flow-step-state,
  .production-flow-task-summary,
  .production-flow-nav > .vt-button:first-child { display: none; }
  .production-flow-workspace { padding: 8px; }
  .production-storyboard-workspace,
  .production-video-workspace,
  .production-export-workspace { grid-template-columns: minmax(0, 1fr); }
  .production-image-workspace { grid-template-columns: minmax(0, 1fr); }
  .production-storyboard-list {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    max-height: 190px;
  }
  .production-storyboard-inspector { grid-column: auto; }
  .production-image-list {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    max-height: 180px;
  }
  .production-image-inspector { grid-column: auto; }
  .production-video-tracks { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); max-height: 150px; }
  .production-storyboard-form > div { grid-template-columns: minmax(0, 1fr); }
}
</style>
