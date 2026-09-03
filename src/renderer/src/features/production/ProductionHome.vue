<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { VueFlow, useVueFlow, type NodeDragEvent } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import { ArrowLeftIcon, CloseIcon, FolderOpenIcon, FullscreenIcon, GitBranchIcon, PlayCircleIcon, RefreshIcon, SaveIcon, UserTalkIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import { useAppStore } from '@renderer/stores/app';
import ProductionAgentPanel from './components/ProductionAgentPanel.vue';
import ProductionFlowNode from './components/ProductionFlowNode.vue';
import ProductionImageFlowDialog from './components/ProductionImageFlowDialog.vue';
import ProductionWorkbenchDialog from './components/ProductionWorkbenchDialog.vue';
import type { ProductionImageFlowOwnerContext } from './types';
import {
  buildProductionEdges,
  buildProductionNodes,
  collectProductionPositions,
  createDefaultProductionPositions,
  layoutProductionPositions,
  mergeProductionPositions,
  type ProductionCanvasEdge,
  type ProductionCanvasNode,
} from './utils/productionFlowBuilder';
import { PRODUCTION_TASK_STATUS, type ProductionAssetSummary, type ProductionContentOption, type ProductionFlowData, type ProductionFlowPositions, type ProductionNodeType, type ProductionResourceDraft, type ProductionResourceDraftAction, type ProductionResourceDraftType, type ProductionResourceExistingAsset, type ProductionStoryboardItem, type ProductionVideoTrackItem } from '@shared/types/production';
import type { ProjectImageQuality } from '@shared/types/project';

const POLL_INTERVAL = 3000;
const FLOW_ID = 'productionMainFlow';
const RESOURCE_EXTRACT_STATUS = {
  IDLE: 'idle',
  WAITING: 'waiting',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

type ResourceExtractStatus = (typeof RESOURCE_EXTRACT_STATUS)[keyof typeof RESOURCE_EXTRACT_STATUS];
const ASSET_EXTRACT_TYPES: ProductionResourceDraftType[] = ['role', 'scene', 'tool'];
const ASSET_DRAFT_ACTIONS: ProductionResourceDraftAction[] = ['create', 'merge', 'replace', 'skip'];

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));

const loading = ref(false);
const refreshing = ref(false);
const saving = ref(false);
const contents = ref<ProductionContentOption[]>([]);
const currentContentId = ref<number | null>(null);
const flowData = ref<ProductionFlowData | null>(null);
const positions = ref<ProductionFlowPositions>(createDefaultProductionPositions());
const selectedStoryboardIds = ref<number[]>([]);
const selectedTrackIds = ref<number[]>([]);
const selectedDerivedAssetIds = ref<number[]>([]);
const textDialogVisible = ref(false);
const textDialogType = ref<'script' | 'scriptPlan' | 'storyboardTable'>('scriptPlan');
const textDraft = ref('');
const storyboardDialogVisible = ref(false);
const storyboardSaving = ref(false);
const editingStoryboard = ref<ProductionStoryboardItem | null>(null);
const storyboardInsertAfterIndex = ref<number | null>(null);
const storyboardForm = reactive({
  prompt: '',
  videoDesc: '',
  duration: 4,
  associatedAssetIds: [] as number[],
  shouldGenerateImage: true,
});
const trackDialogVisible = ref(false);
const trackSaving = ref(false);
const editingTrack = ref<ProductionVideoTrackItem | null>(null);
const trackForm = reactive({
  prompt: '',
  duration: 4,
  storyboardIds: [] as number[],
  mode: '',
  sortIndex: null as number | null,
});
const derivedDialogVisible = ref(false);
const derivedSaving = ref(false);
const derivedParent = ref<ProductionAssetSummary | null>(null);
const derivedForm = reactive({
  name: '',
  description: '',
  prompt: '',
});
const detailDialogVisible = ref(false);
const detailDialogTitle = ref('');
const detailDialogContent = ref('');
const agentPanelVisible = ref(false);
const imageFlowVisible = ref(false);
const imageFlowOwner = ref<ProductionImageFlowOwnerContext | null>(null);
const workbenchVisible = ref(false);
const activeNodeType = ref<ProductionNodeType>('script');
const nodeDetailVisible = ref(false);
const nodeDetailCollapsed = ref(false);
const syncStoryboardVisible = ref(false);
const storyboardPreviewVisible = ref(false);
const exportCheckVisible = ref(false);
const assetExtractVisible = ref(false);
const assetExtractLoading = ref(false);
const assetExtractPolling = ref(false);
const assetExtractTaskId = ref<number | null>(null);
const assetExtractStatus = ref<ResourceExtractStatus>(RESOURCE_EXTRACT_STATUS.IDLE);
const assetExtractError = ref<string | null>(null);
const assetDrafts = ref<ProductionResourceDraft[]>([]);
const assetExistingAssets = ref<ProductionResourceExistingAsset[]>([]);
const activeAssetDraftType = ref<ProductionResourceDraftType>('role');
const activeAssetDraftId = ref<number | null>(null);
const assetDraftLoading = ref(false);
const assetDraftSaving = ref(false);
const assetDraftDeleting = ref(false);
const assetDraftCommitting = ref(false);
const assetImageGenerateVisible = ref(false);
const assetImageGenerating = ref(false);
const assetDraftForm = reactive({
  type: 'role' as ProductionResourceDraftType,
  name: '',
  description: '',
  prompt: '',
  action: 'create' as ProductionResourceDraftAction,
  matchedAssetId: null as number | null,
});
const assetImageForm = reactive({
  model: '',
  resolution: '1K' as ProjectImageQuality,
  prompt: '',
});

let storyboardPollTimer: number | null = null;
let derivedPollTimer: number | null = null;
let videoPromptPollTimer: number | null = null;
let videoPollTimer: number | null = null;
let assetExtractPollTimer: number | null = null;

const { fitView, getNodes, updateNodeInternals } = useVueFlow(FLOW_ID);

const contentOptions = computed(() => contents.value.map((content) => ({ label: content.name, value: content.id })));
const currentContent = computed(() => contents.value.find((content) => content.id === currentContentId.value) ?? null);
const currentContentName = computed(() => currentContent.value?.name ?? t('production.node.script.defaultName'));
const nodes = computed<ProductionCanvasNode[]>(() => buildProductionNodes(flowData.value, positions.value));
const edges = computed<ProductionCanvasEdge[]>(() => buildProductionEdges(flowData.value));
const hasFlowData = computed(() => Boolean(flowData.value && currentContentId.value));
const assetOptions = computed(() => flattenAssets(flowData.value?.assets ?? []).map((asset) => ({ label: `${t(`production.assetType.${asset.type}`)} / ${asset.name}`, value: asset.id })));
const storyboardOptions = computed(() => (flowData.value?.storyboards ?? []).map((storyboard) => ({ label: `S${String(storyboard.index + 1).padStart(2, '0')} / ${previewText(storyboard.videoDesc || storyboard.prompt, 44)}`, value: storyboard.id })));
const runningStoryboardIds = computed(() => (flowData.value?.storyboards ?? []).filter((storyboard) => storyboard.imageStatus === PRODUCTION_TASK_STATUS.RUNNING).map((storyboard) => storyboard.id));
const runningDerivedAssetIds = computed(() => flattenAssets(flowData.value?.assets ?? []).filter((asset) => asset.parentId && asset.imageStatus === PRODUCTION_TASK_STATUS.RUNNING).map((asset) => asset.id));
const runningVideoPromptTrackIds = computed(() => (flowData.value?.videoTracks ?? []).filter((track) => track.status === PRODUCTION_TASK_STATUS.RUNNING).map((track) => track.id));
const runningVideoIds = computed(() => (flowData.value?.videoTracks ?? []).flatMap((track) => track.videos).filter((video) => video.status === PRODUCTION_TASK_STATUS.RUNNING).map((video) => video.id));
const textDialogTitle = computed(() => t(`production.node.${textDialogType.value}.editTitle`));
const visualAssets = computed(() => flattenAssets(flowData.value?.assets ?? []).filter((asset) => asset.type === 'role' || asset.type === 'scene' || asset.type === 'tool'));
const visualAssetReadyCount = computed(() => visualAssets.value.filter((asset) => Boolean(asset.imageUrl)).length);
const storyboardImageReadyCount = computed(() => (flowData.value?.storyboards ?? []).filter((storyboard) => Boolean(storyboard.imageUrl)).length);
const selectedVideoTrackCount = computed(() => (flowData.value?.videoTracks ?? []).filter((track) => Boolean(track.selectedVideoId)).length);
const canvasStats = computed(() => ({
  assets: visualAssets.value.length,
  readyAssets: visualAssetReadyCount.value,
  storyboards: flowData.value?.storyboards.length ?? 0,
  tracks: flowData.value?.videoTracks.length ?? 0,
}));
const activeNodeTitle = computed(() => t(`production.node.${activeNodeType.value}.title`));
const activeNodeHint = computed(() => t(`production.node.${activeNodeType.value}.hint`));
const activeNodeStats = computed(() => [
  { label: t('production.nodeDetail.contentChars'), value: flowData.value?.contentBody.length ?? 0 },
  { label: t('production.nodeDetail.assets'), value: `${visualAssetReadyCount.value}/${visualAssets.value.length}` },
  { label: t('production.nodeDetail.storyboards'), value: `${storyboardImageReadyCount.value}/${flowData.value?.storyboards.length ?? 0}` },
  { label: t('production.nodeDetail.videos'), value: `${selectedVideoTrackCount.value}/${flowData.value?.videoTracks.length ?? 0}` },
]);
const previewStoryboards = computed(() => (flowData.value?.storyboards ?? []).filter((storyboard) => storyboard.imageUrl));
const exportBlockers = computed(() => (flowData.value?.videoTracks ?? []).filter((track) => {
  const selectedVideo = track.videos.find((video) => video.id === track.selectedVideoId);
  return !selectedVideo || selectedVideo.status !== PRODUCTION_TASK_STATUS.SUCCEEDED || !selectedVideo.videoUrl || track.status === PRODUCTION_TASK_STATUS.FAILED;
}));
const assetDraftTabs = computed(() => ASSET_EXTRACT_TYPES.map((type) => ({
  type,
  count: assetDrafts.value.filter((draft) => draft.type === type).length,
})));
const activeAssetDrafts = computed(() => assetDrafts.value.filter((draft) => draft.type === activeAssetDraftType.value));
const selectedAssetDraft = computed(() => assetDrafts.value.find((draft) => draft.id === activeAssetDraftId.value) ?? activeAssetDrafts.value[0] ?? null);
const assetDraftActionOptions = computed(() => ASSET_DRAFT_ACTIONS.map((action) => ({ label: t(`production.assetExtract.action.${action}`), value: action })));
const assetDraftTypeOptions = computed(() => ASSET_EXTRACT_TYPES.map((type) => ({ label: t(`production.assetType.${type}`), value: type })));
const assetDraftMatchedAssetOptions = computed(() => assetExistingAssets.value
  .filter((asset) => asset.type === assetDraftForm.type)
  .map((asset) => ({
    label: `${asset.name} / ${previewText(asset.description || asset.prompt, 34)}`,
    value: asset.id,
  })));
const assetDraftNeedsMatch = computed(() => assetDraftForm.action === 'merge' || assetDraftForm.action === 'replace');
const assetDraftChanged = computed(() => {
  const draft = selectedAssetDraft.value;
  if (!draft) {
    return false;
  }
  return draft.type !== assetDraftForm.type
    || draft.name !== assetDraftForm.name
    || draft.description !== assetDraftForm.description
    || draft.prompt !== assetDraftForm.prompt
    || draft.action !== assetDraftForm.action
    || draft.matchedAssetId !== assetDraftForm.matchedAssetId;
});
const effectiveAssetExtractStatus = computed<ResourceExtractStatus>(() => {
  if (assetExtractStatus.value === RESOURCE_EXTRACT_STATUS.IDLE && (flowData.value?.assets.length ?? 0) > 0) {
    return RESOURCE_EXTRACT_STATUS.SUCCEEDED;
  }
  return assetExtractStatus.value;
});
const assetExtractActionText = computed(() => (effectiveAssetExtractStatus.value === RESOURCE_EXTRACT_STATUS.FAILED ? t('production.assetExtract.retryExtract') : t('production.assetExtract.extractAll')));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function flattenAssets(items: ProductionAssetSummary[]): ProductionAssetSummary[] {
  return items.flatMap((asset) => [asset, ...asset.children]);
}

function previewText(value: string | null, limit: number): string {
  const text = value?.trim() ?? '';
  if (!text) {
    return t('production.emptyText');
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function getStatusTheme(status: string): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === PRODUCTION_TASK_STATUS.RUNNING || status === RESOURCE_EXTRACT_STATUS.RUNNING) {
    return 'primary';
  }
  if (status === RESOURCE_EXTRACT_STATUS.WAITING) {
    return 'warning';
  }
  if (status === PRODUCTION_TASK_STATUS.SUCCEEDED || status === RESOURCE_EXTRACT_STATUS.SUCCEEDED) {
    return 'success';
  }
  if (status === PRODUCTION_TASK_STATUS.FAILED || status === PRODUCTION_TASK_STATUS.CANCELLED || status === RESOURCE_EXTRACT_STATUS.FAILED) {
    return 'danger';
  }
  return 'default';
}

function resolveRecommendedNode(data: ProductionFlowData | null): ProductionNodeType {
  if (!data) {
    return 'script';
  }
  if (!data.contentBody.trim()) {
    return 'script';
  }
  if (!data.directorPlan?.trim()) {
    return 'scriptPlan';
  }
  if (data.assets.length === 0) {
    return 'assets';
  }
  if (!data.storyboardTable.trim()) {
    return 'storyboardTable';
  }
  if (data.storyboards.length === 0 || data.storyboards.some((storyboard) => !storyboard.imageUrl && storyboard.shouldGenerateImage)) {
    return 'storyboard';
  }
  if (data.videoTracks.length === 0 || data.videoTracks.some((track) => !track.selectedVideoId)) {
    return 'workbench';
  }
  return 'export';
}

async function refreshCanvas(): Promise<void> {
  await loadWorkspace({ keepDataOnError: true, asRefresh: true, autoLayout: true });
}

function openAiBuilder(): void {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  openAgentPanel();
}

function selectNode(nodeType: ProductionNodeType): void {
  activeNodeType.value = nodeType;
  nodeDetailVisible.value = true;
  nodeDetailCollapsed.value = false;
}

function closeNodeDetail(): void {
  nodeDetailVisible.value = false;
  nodeDetailCollapsed.value = false;
}

function collapseNodeDetail(): void {
  nodeDetailVisible.value = true;
  nodeDetailCollapsed.value = true;
}

function expandNodeDetail(): void {
  if (!hasFlowData.value) {
    return;
  }
  nodeDetailVisible.value = true;
  nodeDetailCollapsed.value = false;
}

function fitCanvasView(): void {
  fitView({ duration: 240, padding: 0.16 });
}

function clearTimer(timer: number | null): void {
  if (timer) {
    window.clearTimeout(timer);
  }
}

function clearAssetExtractPollTimer(): void {
  clearTimer(assetExtractPollTimer);
  assetExtractPollTimer = null;
}

function resetAssetDraftState(): void {
  assetDrafts.value = [];
  assetExistingAssets.value = [];
  activeAssetDraftType.value = 'role';
  activeAssetDraftId.value = null;
  assetDraftLoading.value = false;
  assetDraftSaving.value = false;
  assetDraftDeleting.value = false;
  assetDraftCommitting.value = false;
  assetImageGenerateVisible.value = false;
  assetImageGenerating.value = false;
  assetDraftForm.type = 'role';
  assetDraftForm.name = '';
  assetDraftForm.description = '';
  assetDraftForm.prompt = '';
  assetDraftForm.action = 'create';
  assetDraftForm.matchedAssetId = null;
  assetImageForm.model = '';
  assetImageForm.resolution = '1K';
  assetImageForm.prompt = '';
}

function resetAssetExtractState(): void {
  clearAssetExtractPollTimer();
  assetExtractLoading.value = false;
  assetExtractPolling.value = false;
  assetExtractTaskId.value = null;
  assetExtractStatus.value = RESOURCE_EXTRACT_STATUS.IDLE;
  assetExtractError.value = null;
  resetAssetDraftState();
}

function clearPollTimers(): void {
  clearTimer(storyboardPollTimer);
  clearTimer(derivedPollTimer);
  clearTimer(videoPromptPollTimer);
  clearTimer(videoPollTimer);
  storyboardPollTimer = null;
  derivedPollTimer = null;
  videoPromptPollTimer = null;
  videoPollTimer = null;
}

function schedulePolls(): void {
  clearPollTimers();
  if (!currentProjectId.value || !currentContentId.value) {
    return;
  }
  if (runningStoryboardIds.value.length > 0) {
    storyboardPollTimer = window.setTimeout(() => void pollStoryboards(), POLL_INTERVAL);
  }
  if (runningDerivedAssetIds.value.length > 0) {
    derivedPollTimer = window.setTimeout(() => void pollDerivedAssets(), POLL_INTERVAL);
  }
  if (runningVideoPromptTrackIds.value.length > 0) {
    videoPromptPollTimer = window.setTimeout(() => void pollVideoPrompts(), POLL_INTERVAL);
  }
  if (runningVideoIds.value.length > 0) {
    videoPollTimer = window.setTimeout(() => void pollVideos(), POLL_INTERVAL);
  }
}

async function loadWorkspace(options: { keepDataOnError?: boolean; asRefresh?: boolean; contentId?: number | null; autoLayout?: boolean } = {}): Promise<void> {
  if (!currentProjectId.value) {
    contents.value = [];
    currentContentId.value = null;
    flowData.value = null;
    selectedStoryboardIds.value = [];
    selectedTrackIds.value = [];
    selectedDerivedAssetIds.value = [];
    assetExtractVisible.value = false;
    resetAssetExtractState();
    closeNodeDetail();
    clearPollTimers();
    return;
  }

  if (options.asRefresh) {
    refreshing.value = true;
  } else {
    loading.value = true;
  }

  try {
    const response = await window.vtStudio.production.getWorkspace({
      projectId: currentProjectId.value,
      contentId: options.contentId ?? currentContentId.value ?? undefined,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      if (!options.keepDataOnError) {
        flowData.value = null;
      }
      return;
    }

    contents.value = response.data.contents;
    currentContentId.value = response.data.currentContentId;
    flowData.value = response.data.flowData;
    activeNodeType.value = resolveRecommendedNode(response.data.flowData);
    positions.value = mergeProductionPositions(response.data.flowData?.positions);
    selectedStoryboardIds.value = selectedStoryboardIds.value.filter((id) => response.data.flowData?.storyboards.some((storyboard) => storyboard.id === id));
    selectedTrackIds.value = selectedTrackIds.value.filter((id) => response.data.flowData?.videoTracks.some((track) => track.id === id));
    selectedDerivedAssetIds.value = selectedDerivedAssetIds.value.filter((id) => flattenAssets(response.data.flowData?.assets ?? []).some((asset) => asset.id === id));
    schedulePolls();
    if (options.autoLayout) {
      await nextTick();
      await autoLayout(false);
    } else {
      await nextTick();
      fitView({ duration: 240, padding: 0.16 });
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function refreshWorkspace(): Promise<void> {
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
}

function syncAssetDraftForm(draft: ProductionResourceDraft | null): void {
  if (!draft) {
    assetDraftForm.type = activeAssetDraftType.value;
    assetDraftForm.name = '';
    assetDraftForm.description = '';
    assetDraftForm.prompt = '';
    assetDraftForm.action = 'create';
    assetDraftForm.matchedAssetId = null;
    return;
  }

  assetDraftForm.type = draft.type;
  assetDraftForm.name = draft.name;
  assetDraftForm.description = draft.description;
  assetDraftForm.prompt = draft.prompt;
  assetDraftForm.action = draft.action;
  assetDraftForm.matchedAssetId = draft.matchedAssetId;
}

function ensureAssetDraftSelection(preferredId: number | null = activeAssetDraftId.value): void {
  const preferred = preferredId ? assetDrafts.value.find((draft) => draft.id === preferredId) ?? null : null;
  const scoped = assetDrafts.value.filter((draft) => draft.type === activeAssetDraftType.value);
  const next = preferred ?? scoped[0] ?? assetDrafts.value[0] ?? null;
  if (!next) {
    activeAssetDraftId.value = null;
    syncAssetDraftForm(null);
    return;
  }

  activeAssetDraftType.value = next.type;
  activeAssetDraftId.value = next.id;
  syncAssetDraftForm(next);
}

function selectAssetDraftType(type: ProductionResourceDraftType): void {
  activeAssetDraftType.value = type;
  const next = assetDrafts.value.find((draft) => draft.type === type) ?? null;
  activeAssetDraftId.value = next?.id ?? null;
  syncAssetDraftForm(next);
}

function selectAssetDraft(draft: ProductionResourceDraft): void {
  activeAssetDraftType.value = draft.type;
  activeAssetDraftId.value = draft.id;
  syncAssetDraftForm(draft);
}

async function loadAssetDrafts(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) {
    resetAssetDraftState();
    return;
  }

  assetDraftLoading.value = true;
  try {
    const response = await window.vtStudio.production.resources.listDrafts({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    assetDrafts.value = response.data.drafts;
    assetExistingAssets.value = response.data.existingAssets;
    ensureAssetDraftSelection();
  } finally {
    assetDraftLoading.value = false;
  }
}

async function saveSelectedAssetDraft(showMessage = true): Promise<boolean> {
  const draft = selectedAssetDraft.value;
  if (!currentProjectId.value || !currentContentId.value || !draft) {
    MessagePlugin.warning(t('production.assetExtract.noDraftSelected'));
    return false;
  }
  if (assetDraftNeedsMatch.value && !assetDraftForm.matchedAssetId) {
    MessagePlugin.warning(t('production.assetExtract.matchRequired'));
    return false;
  }

  assetDraftSaving.value = true;
  try {
    const response = await window.vtStudio.production.resources.saveDraft({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      draftId: draft.id,
      type: assetDraftForm.type,
      name: assetDraftForm.name,
      description: assetDraftForm.description,
      prompt: assetDraftForm.prompt,
      action: assetDraftForm.action,
      matchedAssetId: assetDraftForm.matchedAssetId,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return false;
    }
    assetDrafts.value = assetDrafts.value.map((item) => (item.id === response.data.draft.id ? response.data.draft : item));
    selectAssetDraft(response.data.draft);
    if (showMessage) {
      MessagePlugin.success(t('production.assetExtract.draftSaved'));
    }
    return true;
  } finally {
    assetDraftSaving.value = false;
  }
}

async function deleteSelectedAssetDraft(): Promise<void> {
  const draft = selectedAssetDraft.value;
  if (!currentProjectId.value || !currentContentId.value || !draft) {
    MessagePlugin.warning(t('production.assetExtract.noDraftSelected'));
    return;
  }

  assetDraftDeleting.value = true;
  try {
    const response = await window.vtStudio.production.resources.deleteDraft({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      draftId: draft.id,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    assetDrafts.value = assetDrafts.value.filter((item) => item.id !== draft.id);
    ensureAssetDraftSelection(null);
    MessagePlugin.success(t('production.deleted'));
  } finally {
    assetDraftDeleting.value = false;
  }
}

async function commitAssetDrafts(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  if (assetDrafts.value.length === 0) {
    MessagePlugin.warning(t('production.assetExtract.noDrafts'));
    return;
  }
  if (assetDraftChanged.value) {
    const saved = await saveSelectedAssetDraft(false);
    if (!saved) {
      return;
    }
  }

  assetDraftCommitting.value = true;
  try {
    const response = await window.vtStudio.production.resources.commitDrafts({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    flowData.value = response.data.flowData;
    assetDrafts.value = response.data.drafts;
    ensureAssetDraftSelection(null);
    assetExtractVisible.value = false;
    MessagePlugin.success(t('production.assetExtract.committed', { count: response.data.savedCount }));
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
  } finally {
    assetDraftCommitting.value = false;
  }
}

async function handleContentChange(value: unknown): Promise<void> {
  const nextContentId = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(nextContentId) || nextContentId === currentContentId.value) {
    return;
  }
  selectedStoryboardIds.value = [];
  selectedTrackIds.value = [];
  selectedDerivedAssetIds.value = [];
  assetExtractVisible.value = false;
  resetAssetExtractState();
  closeNodeDetail();
  await loadWorkspace({ contentId: nextContentId, keepDataOnError: true, autoLayout: true });
}

async function saveWorkspace(showMessage = true): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !flowData.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }

  saving.value = true;
  try {
    const nextPositions = mergeProductionPositions({ ...positions.value, ...collectProductionPositions(getNodes.value) });
    const response = await window.vtStudio.production.saveWorkspace({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      directorPlan: flowData.value.directorPlan ?? '',
      storyboardTable: flowData.value.storyboardTable,
      positions: nextPositions,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    positions.value = nextPositions;
    if (flowData.value) {
      flowData.value.positions = nextPositions;
    }
    if (showMessage) {
      MessagePlugin.success(t('production.saved'));
    }
  } finally {
    saving.value = false;
  }
}

async function autoLayout(showMessage = true): Promise<void> {
  if (!flowData.value) {
    return;
  }
  updateNodeInternals(getNodes.value.map((node) => node.id));
  await nextTick();
  positions.value = layoutProductionPositions(getNodes.value);
  if (flowData.value) {
    flowData.value.positions = positions.value;
  }
  await nextTick();
  fitView({ duration: 280, padding: 0.16 });
  if (showMessage) {
    MessagePlugin.success(t('production.layoutDone'));
  }
}

function handleNodeDragStop(event: NodeDragEvent): void {
  const draggedNodes = Array.isArray(event.nodes) ? event.nodes : [event.node].filter(Boolean);
  positions.value = mergeProductionPositions({ ...positions.value, ...collectProductionPositions(draggedNodes) });
  if (flowData.value) {
    flowData.value.positions = positions.value;
  }
}

function openTextDialog(nodeType: 'script' | 'scriptPlan' | 'storyboardTable'): void {
  if (nodeType !== 'script' && !flowData.value) {
    return;
  }
  textDialogType.value = nodeType;
  if (nodeType === 'script') {
    textDraft.value = flowData.value?.contentBody ?? '';
  } else {
    textDraft.value = nodeType === 'scriptPlan' ? flowData.value!.directorPlan ?? '' : flowData.value!.storyboardTable;
  }
  textDialogVisible.value = true;
}

async function confirmTextDialog(): Promise<void> {
  if (!currentProjectId.value) {
    return;
  }
  if (textDialogType.value === 'script') {
    saving.value = true;
    try {
      if (currentContentId.value) {
        const response = await window.vtStudio.production.content.save({
          projectId: currentProjectId.value,
          contentId: currentContentId.value,
          title: currentContentName.value,
          body: textDraft.value,
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }
      } else {
        const response = await window.vtStudio.production.content.save({
          projectId: currentProjectId.value,
          title: t('production.node.script.defaultName'),
          body: textDraft.value,
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }
        currentContentId.value = response.data.content.id;
      }
      textDialogVisible.value = false;
      await loadWorkspace({ contentId: currentContentId.value, keepDataOnError: true, asRefresh: true, autoLayout: true });
    } finally {
      saving.value = false;
    }
    return;
  }

  if (!flowData.value) {
    return;
  }
  if (textDialogType.value === 'scriptPlan') {
    flowData.value.directorPlan = textDraft.value;
  } else {
    flowData.value.storyboardTable = textDraft.value;
  }
  textDialogVisible.value = false;
  await saveWorkspace();
}

function resetStoryboardForm(): void {
  editingStoryboard.value = null;
  storyboardInsertAfterIndex.value = null;
  storyboardForm.prompt = '';
  storyboardForm.videoDesc = '';
  storyboardForm.duration = 4;
  storyboardForm.associatedAssetIds = [];
  storyboardForm.shouldGenerateImage = true;
}

function openCreateStoryboard(): void {
  resetStoryboardForm();
  storyboardDialogVisible.value = true;
}

function openInsertStoryboard(afterIndex: number): void {
  resetStoryboardForm();
  storyboardInsertAfterIndex.value = afterIndex;
  storyboardDialogVisible.value = true;
}

function openEditStoryboard(storyboard: ProductionStoryboardItem): void {
  editingStoryboard.value = storyboard;
  storyboardInsertAfterIndex.value = null;
  storyboardForm.prompt = storyboard.prompt;
  storyboardForm.videoDesc = storyboard.videoDesc;
  storyboardForm.duration = storyboard.duration;
  storyboardForm.associatedAssetIds = [...storyboard.associatedAssetIds];
  storyboardForm.shouldGenerateImage = storyboard.shouldGenerateImage;
  storyboardDialogVisible.value = true;
}

async function saveStoryboard(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) {
    return;
  }
  if (!storyboardForm.videoDesc.trim()) {
    MessagePlugin.warning(t('production.node.storyboard.required'));
    return;
  }
  storyboardSaving.value = true;
  try {
    const response = await window.vtStudio.production.storyboard.save({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      id: editingStoryboard.value?.id ?? null,
      prompt: storyboardForm.prompt,
      videoDesc: storyboardForm.videoDesc,
      duration: Number(storyboardForm.duration) || 4,
      associatedAssetIds: storyboardForm.associatedAssetIds,
      index: editingStoryboard.value ? null : storyboardInsertAfterIndex.value === null ? null : storyboardInsertAfterIndex.value + 1,
      shouldGenerateImage: storyboardForm.shouldGenerateImage,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(editingStoryboard.value ? t('production.node.storyboard.saved') : t('production.node.storyboard.created'));
    storyboardDialogVisible.value = false;
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
  } finally {
    storyboardSaving.value = false;
  }
}

function confirmDeleteStoryboard(storyboard: ProductionStoryboardItem): void {
  if (!currentProjectId.value || !currentContentId.value) {
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('production.node.storyboard.deleteTitle'),
    body: t('production.node.storyboard.deleteBody', { index: storyboard.index + 1 }),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.production.storyboard.delete({ projectId: currentProjectId.value, contentId: currentContentId.value!, storyboardId: storyboard.id });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      MessagePlugin.success(t('production.deleted'));
      dialog.destroy();
      await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    },
  });
}

function toggleStoryboard(storyboardId: number): void {
  selectedStoryboardIds.value = selectedStoryboardIds.value.includes(storyboardId) ? selectedStoryboardIds.value.filter((id) => id !== storyboardId) : [...selectedStoryboardIds.value, storyboardId];
}

function selectAllStoryboards(): void {
  selectedStoryboardIds.value = flowData.value?.storyboards.map((storyboard) => storyboard.id) ?? [];
}

function clearStoryboardSelection(): void {
  selectedStoryboardIds.value = [];
}

function openProductionDetail(title: string, content: string): void {
  detailDialogTitle.value = title;
  detailDialogContent.value = content.trim() || t('production.emptyText');
  detailDialogVisible.value = true;
}

function openImageFlow(ownerType: 'storyboard' | 'derivedAsset', item: ProductionStoryboardItem | ProductionAssetSummary): void {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }

  if (ownerType === 'storyboard') {
    const storyboard = item as ProductionStoryboardItem;
    imageFlowOwner.value = {
      ownerType,
      ownerId: storyboard.id,
      flowId: storyboard.flowId,
      title: `S${String(storyboard.index + 1).padStart(2, '0')} / ${previewText(storyboard.videoDesc || storyboard.prompt, 34)}`,
      imageUrl: storyboard.imageUrl,
      prompt: storyboard.prompt || storyboard.videoDesc,
      status: storyboard.imageStatus,
    };
  } else {
    const asset = item as ProductionAssetSummary;
    imageFlowOwner.value = {
      ownerType,
      ownerId: asset.id,
      flowId: asset.flowId,
      title: `${t(`production.assetType.${asset.type}`)} / ${asset.name}`,
      imageUrl: asset.imageUrl,
      prompt: asset.prompt || asset.description,
      status: asset.imageStatus,
    };
  }
  imageFlowVisible.value = true;
}

function openWorkbench(): void {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  workbenchVisible.value = true;
}

function openExportCenter(): void {
  void router.push({ name: 'export' });
}

function backToProjects(): void {
  void router.push({ name: 'projects' });
}

function openAgentPanel(): void {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  agentPanelVisible.value = true;
}

function openAssetExtractDialog(): void {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  void router.push({ name: 'production', query: { step: 'resources', contentId: String(currentContentId.value) } });
}

function openAssetsCenter(): void {
  assetExtractVisible.value = false;
  void router.push({ name: 'assets' });
}

function scheduleAssetExtractPoll(): void {
  clearAssetExtractPollTimer();
  if (!currentProjectId.value || !currentContentId.value || !assetExtractPolling.value) {
    return;
  }
  assetExtractPollTimer = window.setTimeout(() => void pollAssetExtractStatus(), POLL_INTERVAL);
}

async function pollAssetExtractStatus(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !assetExtractPolling.value) {
    clearAssetExtractPollTimer();
    return;
  }

  const response = await window.vtStudio.production.resources.pollExtractStatus({
    projectId: currentProjectId.value,
    contentIds: [currentContentId.value],
  });
  if (!isOk(response)) {
    assetExtractPolling.value = false;
    MessagePlugin.error(response.msg);
    return;
  }

  const [content] = response.data.contents;
  if (!content) {
    assetExtractStatus.value = RESOURCE_EXTRACT_STATUS.RUNNING;
    scheduleAssetExtractPoll();
    return;
  }

  const nextStatus = content.resourceStatus === PRODUCTION_TASK_STATUS.SUCCEEDED
    ? RESOURCE_EXTRACT_STATUS.SUCCEEDED
    : content.resourceStatus === PRODUCTION_TASK_STATUS.FAILED
      ? RESOURCE_EXTRACT_STATUS.FAILED
      : content.resourceStatus === PRODUCTION_TASK_STATUS.RUNNING
        ? RESOURCE_EXTRACT_STATUS.RUNNING
        : RESOURCE_EXTRACT_STATUS.IDLE;
  assetExtractStatus.value = nextStatus;
  assetExtractError.value = content.resourceErrorReason;
  if (nextStatus === RESOURCE_EXTRACT_STATUS.RUNNING) {
    scheduleAssetExtractPoll();
    return;
  }
  assetExtractPolling.value = false;
  assetExtractTaskId.value = null;
  clearAssetExtractPollTimer();
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
  if (nextStatus === RESOURCE_EXTRACT_STATUS.SUCCEEDED) {
    await loadAssetDrafts();
    MessagePlugin.success(t('production.assetExtract.completed'));
  } else if (nextStatus === RESOURCE_EXTRACT_STATUS.FAILED) {
    MessagePlugin.error(content.resourceErrorReason || t('production.assetExtract.failed'));
  }
}

function confirmBatchDeleteStoryboards(): void {
  if (!currentProjectId.value || !currentContentId.value || selectedStoryboardIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.storyboard.noSelection'));
    return;
  }

  const ids = [...selectedStoryboardIds.value];
  const dialog = DialogPlugin.confirm({
    header: t('production.node.storyboard.batchDeleteTitle'),
    body: t('production.node.storyboard.batchDeleteBody', { count: ids.length }),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.production.storyboard.batchDelete({
        projectId: currentProjectId.value,
        contentId: currentContentId.value!,
        storyboardIds: ids,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      selectedStoryboardIds.value = selectedStoryboardIds.value.filter((id) => !ids.includes(id));
      MessagePlugin.success(t('production.deleted'));
      dialog.destroy();
      await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    },
  });
}

async function generateSelectedStoryboards(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || selectedStoryboardIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.storyboard.noSelection'));
    return;
  }
  const response = await window.vtStudio.production.workflow.runAction({
    projectId: currentProjectId.value,
    contentId: currentContentId.value,
    step: 'storyboardImages',
    input: { storyboardIds: [...selectedStoryboardIds.value], compulsory: true },
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('production.node.storyboard.generateStarted'));
  selectedStoryboardIds.value = [];
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
}

async function generateStoryboardOne(storyboardId: number): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  const response = await window.vtStudio.production.workflow.runAction({
    projectId: currentProjectId.value,
    contentId: currentContentId.value,
    step: 'storyboardImages',
    input: { storyboardIds: [storyboardId], compulsory: true },
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('production.node.storyboard.generateStarted'));
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
}

function resetTrackForm(): void {
  editingTrack.value = null;
  trackForm.prompt = '';
  trackForm.duration = 4;
  trackForm.storyboardIds = [];
  trackForm.mode = '';
  trackForm.sortIndex = null;
}

function openCreateTrack(): void {
  resetTrackForm();
  trackDialogVisible.value = true;
}

function openEditTrack(track: ProductionVideoTrackItem): void {
  editingTrack.value = track;
  trackForm.prompt = track.prompt;
  trackForm.duration = track.duration;
  trackForm.storyboardIds = [...track.storyboardIds];
  trackForm.mode = Array.isArray(track.mode) ? track.mode.join(',') : track.mode ?? '';
  trackForm.sortIndex = track.sortIndex;
  trackDialogVisible.value = true;
}

async function saveTrack(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) {
    return;
  }
  trackSaving.value = true;
  try {
    const mode = trackForm.mode.trim() ? trackForm.mode.split(',').map((item) => item.trim()).filter(Boolean) : null;
    const response = await window.vtStudio.production.videoTrack.save({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      id: editingTrack.value?.id ?? null,
      storyboardIds: trackForm.storyboardIds,
      prompt: trackForm.prompt,
      duration: Number(trackForm.duration) || 4,
      mode: mode && mode.length === 1 ? mode[0]! : mode,
      sortIndex: trackForm.sortIndex,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(editingTrack.value ? t('production.node.workbench.trackSaved') : t('production.node.workbench.trackCreated'));
    trackDialogVisible.value = false;
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
  } finally {
    trackSaving.value = false;
  }
}

function confirmDeleteTrack(track: ProductionVideoTrackItem): void {
  if (!currentProjectId.value || !currentContentId.value) {
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('production.node.workbench.deleteTitle'),
    body: t('production.node.workbench.deleteBody', { index: track.sortIndex + 1 }),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.production.videoTrack.delete({ projectId: currentProjectId.value, contentId: currentContentId.value!, trackId: track.id });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      MessagePlugin.success(t('production.deleted'));
      dialog.destroy();
      await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    },
  });
}

function toggleTrack(trackId: number): void {
  selectedTrackIds.value = selectedTrackIds.value.includes(trackId) ? selectedTrackIds.value.filter((id) => id !== trackId) : [...selectedTrackIds.value, trackId];
}

function selectAllTracks(): void {
  selectedTrackIds.value = flowData.value?.videoTracks.map((track) => track.id) ?? [];
}

function clearTrackSelection(): void {
  selectedTrackIds.value = [];
}

async function generateVideoPrompts(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || selectedTrackIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.workbench.noTrackSelection'));
    return;
  }
  const response = await window.vtStudio.production.workflow.runAction({ projectId: currentProjectId.value, contentId: currentContentId.value, step: 'videoWorkbench', input: { trackIds: [...selectedTrackIds.value] } });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('production.node.workbench.promptStarted'));
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
}

async function generateVideos(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || selectedTrackIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.workbench.noTrackSelection'));
    return;
  }
  const response = await window.vtStudio.production.tools.run({ projectId: currentProjectId.value, contentId: currentContentId.value, toolName: 'generate_video', source: 'canvas', input: { trackIds: [...selectedTrackIds.value] } });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('production.node.workbench.videoStarted'));
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
}

function openDerivedDialog(asset: ProductionAssetSummary): void {
  derivedParent.value = asset;
  derivedForm.name = '';
  derivedForm.description = '';
  derivedForm.prompt = '';
  derivedDialogVisible.value = true;
}

async function saveDerivedAsset(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !derivedParent.value) {
    return;
  }
  if (!derivedForm.name.trim()) {
    MessagePlugin.warning(t('production.node.assets.derivedRequired'));
    return;
  }
  derivedSaving.value = true;
  try {
    const response = await window.vtStudio.production.derivedAsset.save({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      parentAssetId: derivedParent.value.id,
      name: derivedForm.name,
      description: derivedForm.description,
      prompt: derivedForm.prompt,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.node.assets.derivedCreated'));
    derivedDialogVisible.value = false;
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
  } finally {
    derivedSaving.value = false;
  }
}

function confirmDeleteDerivedAsset(asset: ProductionAssetSummary): void {
  if (!currentProjectId.value || !currentContentId.value) {
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('production.node.assets.deleteDerivedTitle'),
    body: t('production.node.assets.deleteDerivedBody', { name: asset.name }),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.production.derivedAsset.delete({ projectId: currentProjectId.value, contentId: currentContentId.value!, assetId: asset.id });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      MessagePlugin.success(t('production.deleted'));
      dialog.destroy();
      await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    },
  });
}

async function generateDerivedAssets(assetIds: number[]): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || assetIds.length === 0) {
    MessagePlugin.warning(t('production.node.assets.noDerived'));
    return;
  }
  const response = await window.vtStudio.production.tools.run({ projectId: currentProjectId.value, contentId: currentContentId.value, toolName: 'generate_deriveAsset', source: 'canvas', input: { assetIds } });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('production.node.assets.generateStarted'));
  selectedDerivedAssetIds.value = assetIds;
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
}

async function extractCurrentContentResources(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  assetExtractVisible.value = true;
  assetExtractLoading.value = true;
  assetExtractStatus.value = RESOURCE_EXTRACT_STATUS.WAITING;
  assetExtractError.value = null;
  assetDrafts.value = [];
  activeAssetDraftId.value = null;
  try {
    const response = await window.vtStudio.production.workflow.runAction({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      step: 'resources',
      input: {},
    });
    if (!isOk(response)) {
      assetExtractStatus.value = RESOURCE_EXTRACT_STATUS.FAILED;
      MessagePlugin.error(response.msg);
      return;
    }
    const toolResult = response.data.result as { result?: { taskId?: number } } | undefined;
    assetExtractTaskId.value = Number(toolResult?.result?.taskId ?? 0) || null;
    assetExtractPolling.value = true;
    MessagePlugin.success(t('production.node.assets.extractStarted'));
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    scheduleAssetExtractPoll();
  } finally {
    assetExtractLoading.value = false;
  }
}

function openSyncStoryboardDialog(): void {
  syncStoryboardVisible.value = true;
}

async function confirmSyncStoryboardTable(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !flowData.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  const rows = flowData.value.storyboardTable.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length === 0) {
    MessagePlugin.warning(t('production.node.storyboardTable.emptySync'));
    return;
  }

  storyboardSaving.value = true;
  try {
    const createdStoryboardIds: number[] = [];
    for (const [index, row] of rows.entries()) {
      const response = await window.vtStudio.production.storyboard.save({
        projectId: currentProjectId.value,
        contentId: currentContentId.value,
        videoDesc: row,
        prompt: '',
        duration: 4,
        index,
        associatedAssetIds: [],
        shouldGenerateImage: true,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      createdStoryboardIds.push(response.data.storyboard.id);
    }
    const generateResponse = await window.vtStudio.production.workflow.runAction({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      step: 'storyboardImages',
      input: { storyboardIds: createdStoryboardIds, compulsory: true },
    });
    syncStoryboardVisible.value = false;
    if (!isOk(generateResponse)) {
      selectedStoryboardIds.value = createdStoryboardIds;
      MessagePlugin.error(generateResponse.msg);
      await loadWorkspace({ keepDataOnError: true, asRefresh: true });
      return;
    }
    MessagePlugin.success(t('production.node.storyboardTable.synced', { count: rows.length }));
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
  } finally {
    storyboardSaving.value = false;
  }
}

function openStoryboardPreview(): void {
  storyboardPreviewVisible.value = true;
}

function openExportCheck(): void {
  exportCheckVisible.value = true;
}

async function pollStoryboards(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || runningStoryboardIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.storyboard.pollImages({ projectId: currentProjectId.value, contentId: currentContentId.value, ids: [...runningStoryboardIds.value] });
  if (isOk(response) && response.data.storyboards.length > 0) {
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    return;
  }
  schedulePolls();
}

async function pollDerivedAssets(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || runningDerivedAssetIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.derivedAsset.pollImages({ projectId: currentProjectId.value, contentId: currentContentId.value, ids: [...runningDerivedAssetIds.value] });
  if (isOk(response) && response.data.assets.length > 0) {
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    return;
  }
  schedulePolls();
}

async function pollVideoPrompts(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || runningVideoPromptTrackIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.videoPrompt.poll({ projectId: currentProjectId.value, contentId: currentContentId.value, ids: [...runningVideoPromptTrackIds.value] });
  if (isOk(response) && response.data.tracks.length > 0) {
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    return;
  }
  schedulePolls();
}

async function pollVideos(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || runningVideoIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.video.poll({ projectId: currentProjectId.value, contentId: currentContentId.value, ids: [...runningVideoIds.value] });
  if (isOk(response) && response.data.tracks.length > 0) {
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    return;
  }
  schedulePolls();
}

watch(currentProjectId, () => {
  void loadWorkspace({ autoLayout: true });
});

watch(() => assetDraftForm.type, (type) => {
  if (assetDraftForm.matchedAssetId && !assetExistingAssets.value.some((asset) => asset.id === assetDraftForm.matchedAssetId && asset.type === type)) {
    assetDraftForm.matchedAssetId = null;
  }
});

watch(() => assetDraftForm.action, (action) => {
  if (action === 'create' || action === 'skip') {
    assetDraftForm.matchedAssetId = null;
  }
});

onMounted(() => {
  void loadWorkspace({ autoLayout: true });
});

onUnmounted(() => {
  clearPollTimers();
  clearAssetExtractPollTimer();
});
</script>

<template>
  <div class="production-page !grid-rows-[minmax(0,1fr)] !gap-0">
    <section class="production-canvas-shell min-h-0">
      <div
        class="absolute left-3 top-3 z-[8] flex max-w-[calc(100%_-_24px)] items-center gap-2 rounded-lg border border-line-soft p-1.5 shadow-[0_10px_26px_rgba(16,24,20,0.08)] backdrop-blur-xl [background:color-mix(in_srgb,var(--vt-surface-panel)_92%,transparent)] max-[960px]:right-3 max-[960px]:min-w-0 max-[960px]:flex-wrap">
        <t-tooltip :content="t('layout.backToProjects')">
          <VtButton variant="outline" size="small" shape="square" icon-only :min-width="0" :aria-label="t('layout.backToProjects')" @click="backToProjects">
            <template #icon><ArrowLeftIcon /></template>
          </VtButton>
        </t-tooltip>
        <label v-if="hasFlowData" class="grid w-[min(320px,34vw)] min-w-[180px] gap-1 max-[960px]:w-[min(300px,100%)]">
          <span class="text-xs leading-[1.35] text-text-muted">{{ t('production.scriptSelect') }}</span>
          <t-select :model-value="currentContentId" :options="contentOptions" :placeholder="t('production.scriptPlaceholder')" :loading="loading" size="small" filterable @change="handleContentChange" />
        </label>
        <span v-if="hasFlowData" class="min-w-[180px] truncate text-xs leading-[1.35] text-text-muted max-[960px]:basis-full max-[960px]:min-w-0">{{ t('production.canvasStatsValue', canvasStats) }}</span>
      </div>

      <div class="absolute right-3 top-3 z-[8] flex max-w-[calc(100%_-_24px)] items-center gap-2 rounded-lg border border-line-soft p-1.5 shadow-[0_10px_26px_rgba(16,24,20,0.08)] backdrop-blur-xl [background:color-mix(in_srgb,var(--vt-surface-panel)_92%,transparent)] max-[960px]:bottom-3 max-[960px]:top-auto">
        <t-tooltip :content="t('production.aiBuild')">
          <VtButton theme="primary" variant="base" size="small" shape="square" icon-only :min-width="0" :aria-label="t('production.aiBuild')" :disabled="!hasFlowData" @click="openAiBuilder">
            <template #icon><UserTalkIcon /></template>
          </VtButton>
        </t-tooltip>
        <t-tooltip :content="t('production.refresh')">
          <VtButton variant="outline" size="small" shape="square" icon-only :min-width="0" :aria-label="t('production.refresh')" :loading="refreshing" @click="refreshCanvas">
            <template #icon><RefreshIcon /></template>
          </VtButton>
        </t-tooltip>
        <t-tooltip :content="t('production.autoLayout')">
          <VtButton variant="outline" size="small" shape="square" icon-only :min-width="0" :aria-label="t('production.autoLayout')" :disabled="!hasFlowData" @click="autoLayout()">
            <template #icon><GitBranchIcon /></template>
          </VtButton>
        </t-tooltip>
        <t-tooltip :content="t('production.fitView')">
          <VtButton variant="outline" size="small" shape="square" icon-only :min-width="0" :aria-label="t('production.fitView')" :disabled="!hasFlowData" @click="fitCanvasView">
            <template #icon><FullscreenIcon /></template>
          </VtButton>
        </t-tooltip>
        <t-tooltip :content="t('production.saveFlow')">
          <VtButton theme="primary" variant="base" size="small" shape="square" icon-only :min-width="0" :aria-label="t('production.saveFlow')" :loading="saving" :disabled="!hasFlowData" @click="saveWorkspace()">
            <template #icon><SaveIcon /></template>
          </VtButton>
        </t-tooltip>
      </div>

      <t-loading :loading="loading">
        <VueFlow
          :id="FLOW_ID"
          class="production-flow-canvas"
          :nodes="nodes"
          :edges="edges"
          :nodes-draggable="true"
          :nodes-connectable="false"
          :elements-selectable="false"
          :only-render-visible-elements="false"
          :min-zoom="0.18"
          :max-zoom="1.6"
          fit-view-on-init
          :zoom-on-double-click="false"
          @pane-click="closeNodeDetail"
          @node-drag-stop="handleNodeDragStop">
          <template #node-productionNode="{ data }">
            <ProductionFlowNode
              v-if="flowData"
              :node-type="data.nodeType as ProductionNodeType"
              :flow-data="flowData"
              :handle-ids="data.handleIds"
              :selected-storyboard-ids="selectedStoryboardIds"
              :selected-track-ids="selectedTrackIds"
              :saving="saving"
              :running-storyboard-ids="runningStoryboardIds"
              :running-track-ids="runningVideoPromptTrackIds"
              @edit-text="openTextDialog"
              @save-workspace="saveWorkspace"
              @open-agent="openAgentPanel"
              @extract-assets="openAssetExtractDialog"
              @sync-storyboard-table="openSyncStoryboardDialog"
              @create-storyboard="openCreateStoryboard"
              @insert-storyboard="openInsertStoryboard"
              @edit-storyboard="openEditStoryboard"
              @delete-storyboard="confirmDeleteStoryboard"
              @toggle-storyboard="toggleStoryboard"
              @select-all-storyboards="selectAllStoryboards"
              @clear-storyboard-selection="clearStoryboardSelection"
              @batch-delete-storyboards="confirmBatchDeleteStoryboards"
              @generate-storyboards="generateSelectedStoryboards"
              @generate-storyboard-one="generateStoryboardOne"
              @preview-storyboards="openStoryboardPreview"
              @show-detail="openProductionDetail"
              @create-track="openCreateTrack"
              @edit-track="openEditTrack"
              @delete-track="confirmDeleteTrack"
              @toggle-track="toggleTrack"
              @select-all-tracks="selectAllTracks"
              @clear-track-selection="clearTrackSelection"
              @generate-video-prompts="generateVideoPrompts"
              @generate-videos="generateVideos"
              @open-workbench="openWorkbench"
              @open-export="openExportCenter"
              @open-export-check="openExportCheck"
              @create-derived-asset="openDerivedDialog"
              @delete-derived-asset="confirmDeleteDerivedAsset"
              @generate-derived-assets="generateDerivedAssets"
              @edit-image-flow="openImageFlow"
              @select-node="selectNode" />
          </template>
          <Background pattern-color="rgba(47, 111, 99, 0.22)" :gap="22" />
          <Controls />
          <MiniMap pannable zoomable />
        </VueFlow>
        <VtEmptyState v-if="!loading && !hasFlowData" class="production-empty" :description="currentProjectId ? t('production.noScript') : t('production.noProject')">
          <template #action>
            <VtButton variant="outline" @click="refreshWorkspace">
              <template #icon><RefreshIcon /></template>
              {{ t('production.refresh') }}
            </VtButton>
          </template>
        </VtEmptyState>
      </t-loading>

      <aside
        v-if="hasFlowData && nodeDetailVisible && !nodeDetailCollapsed"
        class="absolute right-3 top-16 z-[9] grid w-[min(360px,calc(100%_-_24px))] max-h-[calc(100%_-_88px)] content-start gap-2.5 overflow-auto rounded-lg border border-line-soft p-3.5 shadow-[0_18px_44px_rgba(16,24,20,0.16)] backdrop-blur-xl [background:color-mix(in_srgb,var(--vt-surface-panel)_94%,transparent)] max-[960px]:top-[108px]"
        @click.stop>
        <header class="flex items-start justify-between gap-2.5">
          <div class="grid min-w-0 gap-[3px]">
            <span class="text-xs leading-[1.5] text-text-muted">{{ t('production.nodeDetail.selected') }}</span>
            <strong class="truncate text-[15px] leading-[1.35] text-text-primary">{{ activeNodeTitle }}</strong>
          </div>
          <div class="flex flex-none items-center gap-1">
            <VtButton size="small" variant="text" :min-width="44" @click="collapseNodeDetail">{{ t('production.nodeDetail.collapse') }}</VtButton>
            <VtButton size="small" variant="text" shape="square" icon-only :min-width="0" :aria-label="t('production.nodeDetail.close')" @click="closeNodeDetail">
              <template #icon><CloseIcon /></template>
            </VtButton>
          </div>
        </header>
        <p class="m-0 text-[13px] leading-[1.7] text-text-secondary">{{ activeNodeHint }}</p>
        <dl class="m-0 mt-0.5 grid gap-2">
          <div v-for="item in activeNodeStats" :key="item.label" class="flex items-center justify-between gap-2.5 rounded-lg border border-line-soft bg-surface-raised px-2.5 py-2">
            <dt class="text-xs leading-[1.5] text-text-muted">{{ item.label }}</dt>
            <dd class="m-0 text-[13px] font-bold text-text-primary">{{ item.value }}</dd>
          </div>
        </dl>
        <div class="grid gap-2 pt-1">
          <template v-if="activeNodeType === 'script'">
            <VtButton size="small" variant="outline" @click="openTextDialog('script')">{{ t('production.node.script.edit') }}</VtButton>
          </template>
          <template v-else-if="activeNodeType === 'scriptPlan'">
            <VtButton size="small" variant="outline" @click="openTextDialog('scriptPlan')">{{ t('production.edit') }}</VtButton>
            <VtButton size="small" theme="primary" variant="base" @click="openAgentPanel">{{ t('production.node.scriptPlan.aiRewrite') }}</VtButton>
          </template>
          <template v-else-if="activeNodeType === 'assets'">
            <VtButton size="small" variant="outline" @click="openAssetExtractDialog">{{ t('production.node.assets.extract') }}</VtButton>
          </template>
          <template v-else-if="activeNodeType === 'storyboardTable'">
            <VtButton size="small" variant="outline" @click="openTextDialog('storyboardTable')">{{ t('production.edit') }}</VtButton>
            <VtButton size="small" theme="primary" variant="base" @click="openSyncStoryboardDialog">{{ t('production.node.storyboardTable.sync') }}</VtButton>
          </template>
          <template v-else-if="activeNodeType === 'storyboard'">
            <VtButton size="small" variant="outline" @click="openCreateStoryboard">{{ t('production.node.storyboard.create') }}</VtButton>
            <VtButton size="small" variant="outline" :disabled="selectedStoryboardIds.length === 0" @click="generateSelectedStoryboards">{{ t('production.node.storyboard.generateSelected') }}</VtButton>
            <VtButton size="small" theme="primary" variant="base" @click="openStoryboardPreview">{{ t('production.node.storyboard.preview') }}</VtButton>
          </template>
          <template v-else-if="activeNodeType === 'workbench'">
            <VtButton size="small" variant="outline" @click="openCreateTrack">{{ t('production.node.workbench.createTrack') }}</VtButton>
            <VtButton size="small" variant="outline" :disabled="selectedTrackIds.length === 0" @click="generateVideoPrompts">{{ t('production.node.workbench.promptSelected') }}</VtButton>
            <VtButton size="small" theme="primary" variant="base" @click="openWorkbench">{{ t('production.node.workbench.open') }}</VtButton>
          </template>
          <template v-else-if="activeNodeType === 'export'">
            <VtButton size="small" variant="outline" @click="openExportCheck">{{ t('production.node.export.check') }}</VtButton>
            <VtButton size="small" theme="primary" variant="base" @click="openExportCenter">{{ t('production.node.export.open') }}</VtButton>
          </template>
        </div>
      </aside>
      <VtButton v-if="hasFlowData && nodeDetailVisible && nodeDetailCollapsed" class="absolute right-3 top-16 z-[9] max-[960px]:top-[108px]" size="small" variant="outline" :min-width="96" @click.stop="expandNodeDetail">
        {{ t('production.nodeDetail.expand') }}
      </VtButton>
    </section>

    <VtDialog :visible="textDialogVisible" :title="textDialogTitle" width="920px" :confirm-text="t('production.save')" :cancel-text="t('production.cancel')" :confirm-loading="saving" @update:visible="(value) => (textDialogVisible = value)" @confirm="confirmTextDialog">
      <t-textarea v-model="textDraft" class="production-text-editor" :placeholder="t(`production.node.${textDialogType}.placeholder`)" :autosize="{ minRows: 16, maxRows: 24 }" />
    </VtDialog>

    <VtDialog :visible="storyboardDialogVisible" :title="editingStoryboard ? t('production.node.storyboard.editTitle') : t('production.node.storyboard.createTitle')" width="760px" :confirm-text="t('production.save')" :cancel-text="t('production.cancel')" :confirm-loading="storyboardSaving" @update:visible="(value) => (storyboardDialogVisible = value)" @confirm="saveStoryboard">
      <div class="production-form">
        <label>
          <span>{{ t('production.node.storyboard.videoDesc') }}</span>
          <t-textarea v-model="storyboardForm.videoDesc" :placeholder="t('production.node.storyboard.videoDescPlaceholder')" :autosize="{ minRows: 4, maxRows: 8 }" />
        </label>
        <label>
          <span>{{ t('production.node.storyboard.prompt') }}</span>
          <t-textarea v-model="storyboardForm.prompt" :placeholder="t('production.node.storyboard.promptPlaceholder')" :autosize="{ minRows: 4, maxRows: 8 }" />
        </label>
        <div class="production-form-grid">
          <label>
            <span>{{ t('production.node.storyboard.duration') }}</span>
            <t-input-number v-model="storyboardForm.duration" :min="1" :max="60" />
          </label>
          <label>
            <span>{{ t('production.node.storyboard.shouldGenerate') }}</span>
            <t-switch v-model="storyboardForm.shouldGenerateImage" />
          </label>
        </div>
        <label>
          <span>{{ t('production.node.storyboard.assets') }}</span>
          <t-select v-model="storyboardForm.associatedAssetIds" multiple clearable :options="assetOptions" :placeholder="assetOptions.length ? t('production.node.storyboard.assetsPlaceholder') : t('production.node.storyboard.noAssets')" />
        </label>
      </div>
    </VtDialog>

    <VtDialog :visible="trackDialogVisible" :title="editingTrack ? t('production.node.workbench.editTrackTitle') : t('production.node.workbench.createTrackTitle')" width="760px" :confirm-text="t('production.save')" :cancel-text="t('production.cancel')" :confirm-loading="trackSaving" @update:visible="(value) => (trackDialogVisible = value)" @confirm="saveTrack">
      <div class="production-form">
        <label>
          <span>{{ t('production.node.workbench.prompt') }}</span>
          <t-textarea v-model="trackForm.prompt" :placeholder="t('production.node.workbench.promptPlaceholder')" :autosize="{ minRows: 5, maxRows: 9 }" />
        </label>
        <label>
          <span>{{ t('production.node.workbench.storyboards') }}</span>
          <t-select v-model="trackForm.storyboardIds" multiple clearable :options="storyboardOptions" :placeholder="storyboardOptions.length ? t('production.node.workbench.storyboardsPlaceholder') : t('production.node.workbench.noStoryboards')" />
        </label>
        <div class="production-form-grid">
          <label>
            <span>{{ t('production.node.workbench.duration') }}</span>
            <t-input-number v-model="trackForm.duration" :min="1" :max="60" />
          </label>
          <label>
            <span>{{ t('production.node.workbench.mode') }}</span>
            <t-input v-model="trackForm.mode" :placeholder="t('production.node.workbench.modePlaceholder')" />
          </label>
        </div>
      </div>
    </VtDialog>

    <VtDialog :visible="derivedDialogVisible" :title="t('production.node.assets.derivedTitle')" width="620px" :confirm-text="t('production.save')" :cancel-text="t('production.cancel')" :confirm-loading="derivedSaving" @update:visible="(value) => (derivedDialogVisible = value)" @confirm="saveDerivedAsset">
      <div class="production-form">
        <label>
          <span>{{ t('production.node.assets.derivedName') }}</span>
          <t-input v-model="derivedForm.name" :placeholder="t('production.node.assets.derivedNamePlaceholder')" />
        </label>
        <label>
          <span>{{ t('production.node.assets.derivedDesc') }}</span>
          <t-textarea v-model="derivedForm.description" :autosize="{ minRows: 3, maxRows: 6 }" />
        </label>
        <label>
          <span>{{ t('production.node.assets.derivedPrompt') }}</span>
          <t-textarea v-model="derivedForm.prompt" :autosize="{ minRows: 4, maxRows: 8 }" />
        </label>
      </div>
    </VtDialog>

    <VtDialog :visible="assetExtractVisible" :title="t('production.assetExtract.title')" width="1120px" :footer="false" @update:visible="(value) => (assetExtractVisible = value)">
      <div class="production-asset-extract-dialog">
        <header class="production-asset-extract-head">
          <div class="production-asset-extract-title">
            <span>{{ t('production.assetExtract.current') }}</span>
            <strong>{{ currentContentName }}</strong>
          </div>
          <div class="production-asset-extract-head-actions">
            <div class="production-asset-extract-status">
              <t-tag :theme="getStatusTheme(effectiveAssetExtractStatus)" variant="light">{{ t(`production.assetExtract.status.${effectiveAssetExtractStatus}`) }}</t-tag>
              <t-tag v-if="assetExtractTaskId" variant="light">{{ t('production.assetExtract.taskId', { id: assetExtractTaskId }) }}</t-tag>
            </div>
            <div class="production-asset-extract-actions">
              <t-tooltip :content="assetExtractActionText">
                <VtButton theme="primary" variant="base" shape="square" icon-only :min-width="0" :aria-label="assetExtractActionText" :loading="assetExtractLoading || assetExtractPolling" :disabled="assetExtractPolling" @click="extractCurrentContentResources">
                  <template #icon><PlayCircleIcon /></template>
                </VtButton>
              </t-tooltip>
              <t-tooltip :content="t('production.refresh')">
                <VtButton variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.refresh')" :loading="assetDraftLoading" @click="loadAssetDrafts">
                  <template #icon><RefreshIcon /></template>
                </VtButton>
              </t-tooltip>
              <t-tooltip :content="t('production.assetExtract.assetCenter')">
                <VtButton variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.assetExtract.assetCenter')" @click="openAssetsCenter">
                  <template #icon><FolderOpenIcon /></template>
                </VtButton>
              </t-tooltip>
            </div>
          </div>
        </header>

        <div v-if="assetExtractError" class="production-asset-extract-error">
          <strong>{{ t('production.assetExtract.failed') }}</strong>
          <span>{{ t('production.assetExtract.failedHint') }}</span>
          <details>
            <summary>{{ t('production.assetExtract.errorDetail') }}</summary>
            <code>{{ assetExtractError }}</code>
          </details>
        </div>

        <div class="production-asset-extract-content">
          <nav class="production-asset-extract-tabs" :aria-label="t('production.assetExtract.typeTabs')">
            <button v-for="tab in assetDraftTabs" :key="tab.type" type="button" :class="{ 'is-active': activeAssetDraftType === tab.type }" @click="selectAssetDraftType(tab.type)">
              <span class="production-asset-extract-type-mark">{{ t(`production.assetType.${tab.type}`).slice(0, 1) }}</span>
              <strong>{{ t(`production.assetType.${tab.type}`) }}</strong>
              <em>{{ tab.count }}</em>
            </button>
          </nav>

          <section class="production-asset-extract-list-panel">
            <header>
              <strong>{{ t(`production.assetType.${activeAssetDraftType}`) }}</strong>
              <span>{{ t('production.assetExtract.draftCount', { count: activeAssetDrafts.length }) }}</span>
            </header>
            <t-loading :loading="assetDraftLoading">
              <div v-if="activeAssetDrafts.length > 0" class="production-asset-extract-draft-list">
                <button v-for="draft in activeAssetDrafts" :key="draft.id" type="button" :class="{ 'is-active': selectedAssetDraft?.id === draft.id }" @click="selectAssetDraft(draft)">
                  <strong>{{ draft.name }}</strong>
                  <span>{{ previewText(draft.description || draft.prompt, 88) }}</span>
                  <t-tag size="small" variant="light">{{ t(`production.assetExtract.action.${draft.action}`) }}</t-tag>
                </button>
              </div>
              <VtEmptyState v-else :description="assetExtractPolling ? t('production.assetExtract.waitingDrafts') : t('production.assetExtract.empty')" />
            </t-loading>
          </section>

          <section class="production-asset-extract-detail">
            <template v-if="selectedAssetDraft">
              <header>
                <div>
                  <span>{{ t('production.assetExtract.detail') }}</span>
                  <strong>{{ selectedAssetDraft.name }}</strong>
                </div>
                <t-tag :theme="assetDraftChanged ? 'warning' : 'success'" variant="light">{{ assetDraftChanged ? t('production.assetExtract.unsaved') : t('production.assetExtract.saved') }}</t-tag>
              </header>
              <div class="production-asset-extract-form">
                <label>
                  <span>{{ t('production.assetExtract.field.type') }}</span>
                  <t-select v-model="assetDraftForm.type" :options="assetDraftTypeOptions" />
                </label>
                <label>
                  <span>{{ t('production.assetExtract.field.action') }}</span>
                  <t-select v-model="assetDraftForm.action" :options="assetDraftActionOptions" />
                </label>
                <label class="is-wide">
                  <span>{{ t('production.assetExtract.field.matchedAsset') }}</span>
                  <t-select v-model="assetDraftForm.matchedAssetId" clearable filterable :disabled="!assetDraftNeedsMatch" :options="assetDraftMatchedAssetOptions" :placeholder="assetDraftNeedsMatch ? t('production.assetExtract.matchPlaceholder') : t('production.assetExtract.matchDisabled')" />
                </label>
                <label class="is-wide">
                  <span>{{ t('production.assetExtract.field.name') }}</span>
                  <t-input v-model="assetDraftForm.name" :disabled="assetDraftForm.action === 'skip'" />
                </label>
                <label class="is-wide">
                  <span>{{ t('production.assetExtract.field.description') }}</span>
                  <t-textarea v-model="assetDraftForm.description" :disabled="assetDraftForm.action === 'skip'" :autosize="{ minRows: 4, maxRows: 7 }" />
                </label>
                <label class="is-wide">
                  <span>{{ t('production.assetExtract.field.prompt') }}</span>
                  <t-textarea v-model="assetDraftForm.prompt" :disabled="assetDraftForm.action === 'skip'" :autosize="{ minRows: 6, maxRows: 10 }" />
                </label>
              </div>
            </template>
            <VtEmptyState v-else :description="t('production.assetExtract.noDraftSelected')" />
          </section>
        </div>

        <footer class="production-asset-extract-footer">
          <div>
            <span>{{ t('production.assetExtract.footerStats', { draft: assetDrafts.length, existing: assetExistingAssets.length }) }}</span>
          </div>
          <div>
            <VtButton variant="outline" :disabled="!selectedAssetDraft || assetDraftDeleting || assetDraftCommitting" :loading="assetDraftDeleting" @click="deleteSelectedAssetDraft">
              <template #icon><CloseIcon /></template>
              {{ t('production.delete') }}
            </VtButton>
            <VtButton variant="outline" :disabled="!selectedAssetDraft || !assetDraftChanged || assetDraftCommitting" :loading="assetDraftSaving" @click="saveSelectedAssetDraft()">
              <template #icon><SaveIcon /></template>
              {{ t('production.save') }}
            </VtButton>
            <VtButton theme="primary" variant="base" :disabled="assetDrafts.length === 0 || assetExtractPolling" :loading="assetDraftCommitting" @click="commitAssetDrafts">
              <template #icon><SaveIcon /></template>
              {{ t('production.assetExtract.commit') }}
            </VtButton>
          </div>
        </footer>
      </div>
    </VtDialog>

    <VtDialog :visible="detailDialogVisible" :title="detailDialogTitle" width="720px" :footer="false" @update:visible="(value) => (detailDialogVisible = value)">
      <pre class="production-detail-content">{{ detailDialogContent }}</pre>
    </VtDialog>

    <VtDialog
      :visible="syncStoryboardVisible"
      :title="t('production.node.storyboardTable.syncTitle')"
      width="620px"
      :confirm-text="t('production.node.storyboardTable.sync')"
      :cancel-text="t('production.cancel')"
      :confirm-loading="storyboardSaving"
      @update:visible="(value) => (syncStoryboardVisible = value)"
      @confirm="confirmSyncStoryboardTable">
      <div class="production-dialog-note">
        <strong>{{ t('production.node.storyboardTable.syncTitle') }}</strong>
        <p>{{ t('production.node.storyboardTable.syncHint') }}</p>
      </div>
    </VtDialog>

    <VtDialog :visible="storyboardPreviewVisible" :title="t('production.node.storyboard.previewTitle')" width="980px" :footer="false" @update:visible="(value) => (storyboardPreviewVisible = value)">
      <div v-if="previewStoryboards.length > 0" class="production-storyboard-preview-grid">
        <article v-for="storyboard in previewStoryboards" :key="storyboard.id">
          <img :src="storyboard.thumbnailUrl || storyboard.imageUrl || ''" :alt="storyboard.videoDesc" />
          <span>S{{ String(storyboard.index + 1).padStart(2, '0') }}</span>
        </article>
      </div>
      <VtEmptyState v-else :description="t('production.node.storyboard.noPreviewImages')" />
    </VtDialog>

    <VtDialog :visible="exportCheckVisible" :title="t('production.node.export.checkTitle')" width="760px" :footer="false" @update:visible="(value) => (exportCheckVisible = value)">
      <div class="production-export-check">
        <div class="production-dialog-note">
          <strong>{{ exportBlockers.length === 0 ? t('production.node.export.ready') : t('production.node.export.blockers', { count: exportBlockers.length }) }}</strong>
          <p>{{ exportBlockers.length === 0 ? t('production.node.export.readyHint') : t('production.node.export.checkHint') }}</p>
        </div>
        <div v-if="exportBlockers.length > 0" class="production-export-check-list">
          <article v-for="track in exportBlockers" :key="track.id">
            <strong>{{ t('production.node.workbench.trackName', { index: track.sortIndex + 1 }) }}</strong>
            <span>{{ track.errorReason || t(track.selectedVideoId ? 'production.node.export.selectedNotReady' : 'production.node.export.missingSelection') }}</span>
            <VtButton size="small" variant="outline" @click="openWorkbench">{{ t('production.workbench.locateTrack') }}</VtButton>
          </article>
        </div>
      </div>
    </VtDialog>

    <ProductionAgentPanel v-model:visible="agentPanelVisible" :project-id="currentProjectId" :content-id="currentContentId" @applied="loadWorkspace({ keepDataOnError: true, asRefresh: true })" />

    <ProductionImageFlowDialog
      v-model:visible="imageFlowVisible"
      :project-id="currentProjectId"
      :content-id="currentContentId"
      :owner="imageFlowOwner"
      :storyboards="flowData?.storyboards ?? []"
      :assets="flowData?.assets ?? []"
      @saved="loadWorkspace({ keepDataOnError: true, asRefresh: true })" />

    <ProductionWorkbenchDialog
      v-model:visible="workbenchVisible"
      :project-id="currentProjectId"
      :content-id="currentContentId"
      @saved="loadWorkspace({ keepDataOnError: true, asRefresh: true })"
      @show-detail="openProductionDetail" />
  </div>
</template>

<style scoped>
.production-asset-extract-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(76vh, calc(100dvh - 150px));
  min-height: 0;
  overflow: hidden;
}

.production-asset-extract-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--vt-line-soft);
  border-radius: 8px;
  background: var(--vt-surface-panel);
}

.production-asset-extract-title {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.production-asset-extract-title span,
.production-asset-extract-list-panel header span,
.production-asset-extract-detail header span,
.production-asset-extract-draft-list span,
.production-asset-extract-form label > span,
.production-asset-extract-footer span {
  color: var(--vt-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.production-asset-extract-title strong {
  overflow: hidden;
  color: var(--vt-text-primary);
  font-size: 15px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-asset-extract-head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.production-asset-extract-status,
.production-asset-extract-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.production-asset-extract-status {
  justify-content: flex-end;
}

.production-asset-extract-actions {
  justify-content: flex-end;
}

.production-asset-extract-actions :deep(.vt-button) {
  width: 34px;
  height: 34px;
  padding: 0;
}

.production-asset-extract-error {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--vt-danger) 34%, var(--vt-line-soft));
  border-radius: 8px;
  color: var(--vt-danger);
  background: color-mix(in srgb, var(--vt-danger) 8%, var(--vt-surface-raised));
}

.production-asset-extract-error strong {
  color: var(--vt-text-primary);
  font-size: 13px;
  line-height: 1.4;
}

.production-asset-extract-error span {
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.production-asset-extract-error details {
  display: grid;
  gap: 6px;
}

.production-asset-extract-error summary {
  width: fit-content;
  cursor: pointer;
  color: var(--vt-danger);
  font-size: 12px;
  font-weight: 700;
}

.production-asset-extract-error code {
  display: block;
  max-height: 96px;
  overflow: auto;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--vt-danger) 22%, var(--vt-line-soft));
  border-radius: 8px;
  color: var(--vt-text-primary);
  background: var(--vt-surface-panel);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.production-asset-extract-content {
  display: grid;
  grid-template-columns: 132px minmax(260px, 0.76fr) minmax(360px, 1fr);
  align-items: stretch;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.production-asset-extract-type-mark {
  display: grid;
  width: 34px;
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--vt-brand) 24%, var(--vt-line-soft));
  border-radius: 8px;
  color: var(--vt-brand-strong);
  background: color-mix(in srgb, var(--vt-brand) 9%, var(--vt-surface-raised));
  font-size: 14px;
  font-weight: 800;
}

.production-asset-extract-tabs,
.production-asset-extract-list-panel,
.production-asset-extract-detail {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--vt-line-soft);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vt-surface-panel) 94%, transparent);
}

.production-asset-extract-tabs {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 8px;
}

.production-asset-extract-tabs button {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--vt-text-secondary);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.production-asset-extract-tabs button:hover,
.production-asset-extract-tabs button.is-active {
  border-color: color-mix(in srgb, var(--vt-brand) 28%, var(--vt-line-soft));
  color: var(--vt-text-primary);
  background: color-mix(in srgb, var(--vt-brand) 8%, var(--vt-surface-raised));
}

.production-asset-extract-tabs strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-asset-extract-tabs em {
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--vt-text-muted);
  background: var(--vt-surface-raised);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
  line-height: 1.4;
  text-align: center;
}

.production-asset-extract-list-panel,
.production-asset-extract-detail {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.production-asset-extract-list-panel > header,
.production-asset-extract-detail > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--vt-line-soft);
}

.production-asset-extract-detail > header > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.production-asset-extract-list-panel header strong,
.production-asset-extract-detail header strong {
  overflow: hidden;
  color: var(--vt-text-primary);
  font-size: 15px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-asset-extract-draft-list {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
  max-height: 100%;
  overflow: auto;
  padding: 10px;
  scrollbar-gutter: stable;
}

.production-asset-extract-draft-list button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--vt-line-soft);
  border-radius: 8px;
  background: var(--vt-surface-raised);
  cursor: pointer;
  text-align: left;
}

.production-asset-extract-draft-list button:hover,
.production-asset-extract-draft-list button.is-active {
  border-color: color-mix(in srgb, var(--vt-brand) 34%, var(--vt-line-soft));
  background: color-mix(in srgb, var(--vt-brand) 7%, var(--vt-surface-panel));
}

.production-asset-extract-draft-list strong {
  grid-column: 1 / -1;
  overflow: hidden;
  color: var(--vt-text-primary);
  font-size: 13px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-asset-extract-draft-list span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-asset-extract-draft-list :deep(.t-tag) {
  justify-self: start;
}

.production-asset-extract-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  scrollbar-gutter: stable;
}

.production-asset-extract-form label {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.production-asset-extract-form label.is-wide {
  grid-column: 1 / -1;
}

.production-asset-extract-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--vt-line-soft);
  border-radius: 8px;
  background: var(--vt-surface-panel);
}

.production-asset-extract-footer > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

@media (max-width: 720px) {
  .production-asset-extract-dialog {
    max-height: calc(100dvh - 128px);
  }

  .production-asset-extract-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .production-asset-extract-content {
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }

  .production-asset-extract-head-actions,
  .production-asset-extract-status {
    justify-content: flex-start;
  }

  .production-asset-extract-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .production-asset-extract-tabs button {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    text-align: center;
  }

  .production-asset-extract-type-mark {
    width: 30px;
  }

  .production-asset-extract-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .production-asset-extract-footer {
    align-items: stretch;
  }

  .production-asset-extract-footer > div {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
