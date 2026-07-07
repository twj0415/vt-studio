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
import { AddIcon, CloseIcon, FolderOpenIcon, FullscreenIcon, GitBranchIcon, ImageIcon, PlayCircleIcon, RefreshIcon, SaveIcon, UserTalkIcon } from 'tdesign-icons-vue-next';
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
import { PRODUCTION_TASK_STATUS, type ProductionAssetSummary, type ProductionFlowData, type ProductionFlowPositions, type ProductionNodeType, type ProductionScriptOption, type ProductionStoryboardItem, type ProductionVideoTrackItem } from '@shared/types/production';
import { SCRIPT_EXTRACT_STATUS, type ScriptExtractStatus } from '@shared/types/script-agent';

const POLL_INTERVAL = 3000;
const FLOW_ID = 'productionMainFlow';
type ExtractableAssetType = Extract<ProductionAssetSummary['type'], 'role' | 'scene' | 'tool'>;
type AssetExtractGroupStatus = 'idle' | 'waiting' | 'running' | 'failed' | 'done' | 'empty';
const ASSET_EXTRACT_TYPES: ExtractableAssetType[] = ['role', 'scene', 'tool'];

interface AssetExtractGroup {
  type: ExtractableAssetType;
  assets: ProductionAssetSummary[];
  status: AssetExtractGroupStatus;
  readyCount: number;
  missingImageCount: number;
  derivedCount: number;
}

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));
const currentProjectName = computed(() => appStore.currentProject?.name ?? t('common.noProject'));

const loading = ref(false);
const refreshing = ref(false);
const saving = ref(false);
const scripts = ref<ProductionScriptOption[]>([]);
const currentScriptId = ref<number | null>(null);
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
const assetExtractStatus = ref<ScriptExtractStatus>(SCRIPT_EXTRACT_STATUS.IDLE);
const assetExtractError = ref<string | null>(null);

let storyboardPollTimer: number | null = null;
let derivedPollTimer: number | null = null;
let videoPromptPollTimer: number | null = null;
let videoPollTimer: number | null = null;
let assetExtractPollTimer: number | null = null;

const { fitView, getNodes, updateNodeInternals } = useVueFlow(FLOW_ID);

const scriptOptions = computed(() => scripts.value.map((script) => ({ label: script.name, value: script.id })));
const currentScript = computed(() => scripts.value.find((script) => script.id === currentScriptId.value) ?? null);
const currentScriptName = computed(() => currentScript.value?.name ?? t('production.node.script.defaultName'));
const nodes = computed<ProductionCanvasNode[]>(() => buildProductionNodes(flowData.value, positions.value));
const edges = computed<ProductionCanvasEdge[]>(() => buildProductionEdges(flowData.value));
const hasFlowData = computed(() => Boolean(flowData.value && currentScriptId.value));
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
  { label: t('production.nodeDetail.contentChars'), value: flowData.value?.script.length ?? 0 },
  { label: t('production.nodeDetail.assets'), value: `${visualAssetReadyCount.value}/${visualAssets.value.length}` },
  { label: t('production.nodeDetail.storyboards'), value: `${storyboardImageReadyCount.value}/${flowData.value?.storyboards.length ?? 0}` },
  { label: t('production.nodeDetail.videos'), value: `${selectedVideoTrackCount.value}/${flowData.value?.videoTracks.length ?? 0}` },
]);
const previewStoryboards = computed(() => (flowData.value?.storyboards ?? []).filter((storyboard) => storyboard.imageUrl));
const exportBlockers = computed(() => (flowData.value?.videoTracks ?? []).filter((track) => {
  const selectedVideo = track.videos.find((video) => video.id === track.selectedVideoId);
  return !selectedVideo || selectedVideo.status !== PRODUCTION_TASK_STATUS.SUCCEEDED || !selectedVideo.videoUrl || track.status === PRODUCTION_TASK_STATUS.FAILED;
}));
const assetExtractGroups = computed<AssetExtractGroup[]>(() => {
  const assets = flowData.value?.assets ?? [];
  return ASSET_EXTRACT_TYPES.map((type) => {
    const groupAssets = assets.filter((asset) => asset.type === type);
    const groupDerivedAssets = groupAssets.flatMap((asset) => asset.children);
    const groupItems = [...groupAssets, ...groupDerivedAssets];
    return {
      type,
      assets: groupAssets,
      status: resolveAssetExtractGroupStatus(groupAssets.length),
      readyCount: groupItems.filter((asset) => Boolean(asset.imageUrl)).length,
      missingImageCount: groupItems.filter((asset) => !asset.imageUrl && asset.imageStatus !== PRODUCTION_TASK_STATUS.RUNNING).length,
      derivedCount: groupDerivedAssets.length,
    };
  });
});
const derivedAssets = computed(() => flattenAssets(flowData.value?.assets ?? []).filter((asset) => asset.parentId));
const missingDerivedAssets = computed(() => derivedAssets.value.filter((asset) => !asset.imageUrl && asset.imageStatus !== PRODUCTION_TASK_STATUS.RUNNING));
const effectiveAssetExtractStatus = computed<ScriptExtractStatus>(() => {
  if (assetExtractStatus.value === SCRIPT_EXTRACT_STATUS.IDLE && (flowData.value?.assets.length ?? 0) > 0) {
    return SCRIPT_EXTRACT_STATUS.SUCCEEDED;
  }
  return assetExtractStatus.value;
});
const assetExtractActionText = computed(() => (effectiveAssetExtractStatus.value === SCRIPT_EXTRACT_STATUS.FAILED ? t('production.assetExtract.retryExtract') : t('production.assetExtract.extractAll')));

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
  if (status === PRODUCTION_TASK_STATUS.RUNNING || status === SCRIPT_EXTRACT_STATUS.RUNNING) {
    return 'primary';
  }
  if (status === SCRIPT_EXTRACT_STATUS.WAITING) {
    return 'warning';
  }
  if (status === PRODUCTION_TASK_STATUS.SUCCEEDED || status === SCRIPT_EXTRACT_STATUS.SUCCEEDED) {
    return 'success';
  }
  if (status === PRODUCTION_TASK_STATUS.FAILED || status === PRODUCTION_TASK_STATUS.CANCELLED || status === SCRIPT_EXTRACT_STATUS.FAILED) {
    return 'danger';
  }
  return 'default';
}

function getAssetImageStatusLabel(asset: ProductionAssetSummary): string {
  if (asset.imageUrl) {
    return t('production.assetExtract.imageReady');
  }
  if (asset.imageStatus === PRODUCTION_TASK_STATUS.RUNNING) {
    return t('production.assetExtract.imageRunning');
  }
  if (asset.imageStatus === PRODUCTION_TASK_STATUS.FAILED) {
    return t('production.assetExtract.imageFailed');
  }
  return t('production.assetExtract.imageMissing');
}

function resolveAssetExtractGroupStatus(count: number): AssetExtractGroupStatus {
  if (assetExtractStatus.value === SCRIPT_EXTRACT_STATUS.WAITING) {
    return 'waiting';
  }
  if (assetExtractStatus.value === SCRIPT_EXTRACT_STATUS.RUNNING) {
    return 'running';
  }
  if (effectiveAssetExtractStatus.value === SCRIPT_EXTRACT_STATUS.FAILED) {
    return 'failed';
  }
  if (count > 0) {
    return 'done';
  }
  if (effectiveAssetExtractStatus.value === SCRIPT_EXTRACT_STATUS.SUCCEEDED) {
    return 'empty';
  }
  return 'idle';
}

function getAssetExtractGroupTheme(status: AssetExtractGroupStatus): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === 'waiting' || status === 'running') {
    return 'primary';
  }
  if (status === 'done') {
    return 'success';
  }
  if (status === 'failed') {
    return 'danger';
  }
  if (status === 'empty') {
    return 'warning';
  }
  return 'default';
}

function getAssetExtractGroupEmptyLabel(group: AssetExtractGroup): string {
  return t(`production.assetExtract.groupEmpty.${group.status}`, { type: t(`production.assetType.${group.type}`) });
}

function getGeneratableDerivedAssetIds(asset: ProductionAssetSummary): number[] {
  return asset.children.filter((child) => !child.imageUrl && child.imageStatus !== PRODUCTION_TASK_STATUS.RUNNING).map((child) => child.id);
}

function resolveRecommendedNode(data: ProductionFlowData | null): ProductionNodeType {
  if (!data) {
    return 'script';
  }
  if (!data.script.trim()) {
    return 'script';
  }
  if (!data.scriptPlan.trim()) {
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
  if (!currentProjectId.value || !currentScriptId.value) {
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

function resetAssetExtractState(): void {
  clearAssetExtractPollTimer();
  assetExtractLoading.value = false;
  assetExtractPolling.value = false;
  assetExtractTaskId.value = null;
  assetExtractStatus.value = SCRIPT_EXTRACT_STATUS.IDLE;
  assetExtractError.value = null;
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
  if (!currentProjectId.value || !currentScriptId.value) {
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

async function loadWorkspace(options: { keepDataOnError?: boolean; asRefresh?: boolean; scriptId?: number | null; autoLayout?: boolean } = {}): Promise<void> {
  if (!currentProjectId.value) {
    scripts.value = [];
    currentScriptId.value = null;
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
      scriptId: options.scriptId ?? currentScriptId.value ?? undefined,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      if (!options.keepDataOnError) {
        flowData.value = null;
      }
      return;
    }

    scripts.value = response.data.scripts;
    currentScriptId.value = response.data.currentScriptId;
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

async function handleScriptChange(value: unknown): Promise<void> {
  const nextScriptId = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(nextScriptId) || nextScriptId === currentScriptId.value) {
    return;
  }
  selectedStoryboardIds.value = [];
  selectedTrackIds.value = [];
  selectedDerivedAssetIds.value = [];
  assetExtractVisible.value = false;
  resetAssetExtractState();
  closeNodeDetail();
  await loadWorkspace({ scriptId: nextScriptId, keepDataOnError: true, autoLayout: true });
}

async function saveWorkspace(showMessage = true): Promise<void> {
  if (!currentProjectId.value || !currentScriptId.value || !flowData.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }

  saving.value = true;
  try {
    const nextPositions = mergeProductionPositions({ ...positions.value, ...collectProductionPositions(getNodes.value) });
    const response = await window.vtStudio.production.saveWorkspace({
      projectId: currentProjectId.value,
      scriptId: currentScriptId.value,
      scriptPlan: flowData.value.scriptPlan,
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
    textDraft.value = flowData.value?.script ?? '';
  } else {
    textDraft.value = nodeType === 'scriptPlan' ? flowData.value!.scriptPlan : flowData.value!.storyboardTable;
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
      if (currentScriptId.value) {
        const response = await window.vtStudio.production.agent.applyWorkspacePatch({
          projectId: currentProjectId.value,
          scriptId: currentScriptId.value,
          source: 'manual',
          patches: [{ field: 'script', content: textDraft.value }],
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }
      } else {
        const response = await window.vtStudio.script.save({
          projectId: currentProjectId.value,
          script: {
            name: t('production.node.script.defaultName'),
            content: textDraft.value,
            assetIds: [],
          },
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }
        currentScriptId.value = response.data.script.id;
      }
      textDialogVisible.value = false;
      await loadWorkspace({ scriptId: currentScriptId.value, keepDataOnError: true, asRefresh: true, autoLayout: true });
    } finally {
      saving.value = false;
    }
    return;
  }

  if (!flowData.value) {
    return;
  }
  if (textDialogType.value === 'scriptPlan') {
    flowData.value.scriptPlan = textDraft.value;
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
  if (!currentProjectId.value || !currentScriptId.value) {
    return;
  }
  if (!storyboardForm.videoDesc.trim()) {
    MessagePlugin.warning(t('production.node.storyboard.required'));
    return;
  }
  storyboardSaving.value = true;
  try {
    const response = await window.vtStudio.production.saveStoryboard({
      projectId: currentProjectId.value,
      scriptId: currentScriptId.value,
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
  if (!currentProjectId.value || !currentScriptId.value) {
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('production.node.storyboard.deleteTitle'),
    body: t('production.node.storyboard.deleteBody', { index: storyboard.index + 1 }),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.production.deleteStoryboard({ projectId: currentProjectId.value, scriptId: currentScriptId.value!, storyboardId: storyboard.id });
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
  if (!currentProjectId.value || !currentScriptId.value) {
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
  if (!currentProjectId.value || !currentScriptId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  workbenchVisible.value = true;
}

function openExportCenter(): void {
  void router.push({ name: 'export' });
}

function openAgentPanel(): void {
  if (!currentProjectId.value || !currentScriptId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  agentPanelVisible.value = true;
}

function openAssetExtractDialog(): void {
  if (!currentProjectId.value || !currentScriptId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  if (!assetExtractPolling.value) {
    assetExtractStatus.value = (flowData.value?.assets.length ?? 0) > 0 ? SCRIPT_EXTRACT_STATUS.SUCCEEDED : SCRIPT_EXTRACT_STATUS.IDLE;
    assetExtractError.value = null;
  }
  assetExtractVisible.value = true;
}

function openAssetsCenter(): void {
  assetExtractVisible.value = false;
  void router.push({ name: 'assets' });
}

function openAssetDerivedDialog(asset: ProductionAssetSummary): void {
  assetExtractVisible.value = false;
  openDerivedDialog(asset);
}

function openDerivedAssetImageFlow(asset: ProductionAssetSummary): void {
  assetExtractVisible.value = false;
  openImageFlow('derivedAsset', asset);
}

async function generateMissingDerivedAssetImages(): Promise<void> {
  const assetIds = missingDerivedAssets.value.map((asset) => asset.id);
  if (assetIds.length === 0) {
    MessagePlugin.warning(t('production.assetExtract.noMissingImages'));
    return;
  }
  await generateDerivedAssets(assetIds);
}

function scheduleAssetExtractPoll(): void {
  clearAssetExtractPollTimer();
  if (!currentProjectId.value || !currentScriptId.value || !assetExtractPolling.value) {
    return;
  }
  assetExtractPollTimer = window.setTimeout(() => void pollAssetExtractStatus(), POLL_INTERVAL);
}

async function pollAssetExtractStatus(): Promise<void> {
  if (!currentProjectId.value || !currentScriptId.value || !assetExtractPolling.value) {
    clearAssetExtractPollTimer();
    return;
  }

  const response = await window.vtStudio.script.pollExtractStatus({
    projectId: currentProjectId.value,
    scriptIds: [currentScriptId.value],
  });
  if (!isOk(response)) {
    assetExtractPolling.value = false;
    MessagePlugin.error(response.msg);
    return;
  }

  const [script] = response.data.scripts;
  if (!script) {
    assetExtractStatus.value = SCRIPT_EXTRACT_STATUS.RUNNING;
    scheduleAssetExtractPoll();
    return;
  }

  assetExtractStatus.value = script.extractStatus;
  assetExtractError.value = script.errorReason;
  assetExtractPolling.value = false;
  assetExtractTaskId.value = null;
  clearAssetExtractPollTimer();
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
  if (script.extractStatus === SCRIPT_EXTRACT_STATUS.SUCCEEDED) {
    MessagePlugin.success(t('production.assetExtract.completed'));
  } else if (script.extractStatus === SCRIPT_EXTRACT_STATUS.FAILED) {
    MessagePlugin.error(script.errorReason || t('production.assetExtract.failed'));
  }
}

function confirmBatchDeleteStoryboards(): void {
  if (!currentProjectId.value || !currentScriptId.value || selectedStoryboardIds.value.length === 0) {
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
      const response = await window.vtStudio.production.batchDeleteStoryboards({
        projectId: currentProjectId.value,
        scriptId: currentScriptId.value!,
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
  if (!currentProjectId.value || !currentScriptId.value || selectedStoryboardIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.storyboard.noSelection'));
    return;
  }
  const response = await window.vtStudio.production.generateStoryboardImages({
    projectId: currentProjectId.value,
    scriptId: currentScriptId.value,
    storyboardIds: [...selectedStoryboardIds.value],
    compulsory: true,
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
  if (!currentProjectId.value || !currentScriptId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  const response = await window.vtStudio.production.generateStoryboardImages({
    projectId: currentProjectId.value,
    scriptId: currentScriptId.value,
    storyboardIds: [storyboardId],
    compulsory: true,
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
  if (!currentProjectId.value || !currentScriptId.value) {
    return;
  }
  trackSaving.value = true;
  try {
    const mode = trackForm.mode.trim() ? trackForm.mode.split(',').map((item) => item.trim()).filter(Boolean) : null;
    const response = await window.vtStudio.production.saveVideoTrack({
      projectId: currentProjectId.value,
      scriptId: currentScriptId.value,
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
  if (!currentProjectId.value || !currentScriptId.value) {
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('production.node.workbench.deleteTitle'),
    body: t('production.node.workbench.deleteBody', { index: track.sortIndex + 1 }),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.production.deleteVideoTrack({ projectId: currentProjectId.value, scriptId: currentScriptId.value!, trackId: track.id });
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
  if (!currentProjectId.value || !currentScriptId.value || selectedTrackIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.workbench.noTrackSelection'));
    return;
  }
  const response = await window.vtStudio.production.generateVideoPrompts({ projectId: currentProjectId.value, scriptId: currentScriptId.value, trackIds: [...selectedTrackIds.value] });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('production.node.workbench.promptStarted'));
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
}

async function generateVideos(): Promise<void> {
  if (!currentProjectId.value || !currentScriptId.value || selectedTrackIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.workbench.noTrackSelection'));
    return;
  }
  const response = await window.vtStudio.production.generateVideos({ projectId: currentProjectId.value, scriptId: currentScriptId.value, trackIds: [...selectedTrackIds.value] });
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
  if (!currentProjectId.value || !currentScriptId.value || !derivedParent.value) {
    return;
  }
  if (!derivedForm.name.trim()) {
    MessagePlugin.warning(t('production.node.assets.derivedRequired'));
    return;
  }
  derivedSaving.value = true;
  try {
    const response = await window.vtStudio.production.saveDerivedAsset({
      projectId: currentProjectId.value,
      scriptId: currentScriptId.value,
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
  if (!currentProjectId.value || !currentScriptId.value) {
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('production.node.assets.deleteDerivedTitle'),
    body: t('production.node.assets.deleteDerivedBody', { name: asset.name }),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.production.deleteDerivedAsset({ projectId: currentProjectId.value, scriptId: currentScriptId.value!, assetId: asset.id });
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
  if (!currentProjectId.value || !currentScriptId.value || assetIds.length === 0) {
    MessagePlugin.warning(t('production.node.assets.noDerived'));
    return;
  }
  const response = await window.vtStudio.production.generateDerivedAssetImages({ projectId: currentProjectId.value, scriptId: currentScriptId.value, assetIds });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  MessagePlugin.success(t('production.node.assets.generateStarted'));
  selectedDerivedAssetIds.value = assetIds;
  await loadWorkspace({ keepDataOnError: true, asRefresh: true });
}

async function extractCurrentContentResources(): Promise<void> {
  if (!currentProjectId.value || !currentScriptId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  assetExtractVisible.value = true;
  assetExtractLoading.value = true;
  assetExtractStatus.value = SCRIPT_EXTRACT_STATUS.WAITING;
  assetExtractError.value = null;
  try {
    const response = await window.vtStudio.production.extractResources({
      projectId: currentProjectId.value,
      contentId: currentScriptId.value,
    });
    if (!isOk(response)) {
      assetExtractStatus.value = SCRIPT_EXTRACT_STATUS.FAILED;
      MessagePlugin.error(response.msg);
      return;
    }
    assetExtractTaskId.value = response.data.taskId;
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
  if (!currentProjectId.value || !currentScriptId.value || !flowData.value) {
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
      const response = await window.vtStudio.production.saveStoryboard({
        projectId: currentProjectId.value,
        scriptId: currentScriptId.value,
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
    const generateResponse = await window.vtStudio.production.generateStoryboardImages({
      projectId: currentProjectId.value,
      scriptId: currentScriptId.value,
      storyboardIds: createdStoryboardIds,
      compulsory: true,
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
  if (!currentProjectId.value || !currentScriptId.value || runningStoryboardIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.pollStoryboardImages({ projectId: currentProjectId.value, scriptId: currentScriptId.value, ids: [...runningStoryboardIds.value] });
  if (isOk(response) && response.data.storyboards.length > 0) {
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    return;
  }
  schedulePolls();
}

async function pollDerivedAssets(): Promise<void> {
  if (!currentProjectId.value || !currentScriptId.value || runningDerivedAssetIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.pollDerivedAssetImages({ projectId: currentProjectId.value, scriptId: currentScriptId.value, ids: [...runningDerivedAssetIds.value] });
  if (isOk(response) && response.data.assets.length > 0) {
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    return;
  }
  schedulePolls();
}

async function pollVideoPrompts(): Promise<void> {
  if (!currentProjectId.value || !currentScriptId.value || runningVideoPromptTrackIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.pollVideoPrompts({ projectId: currentProjectId.value, scriptId: currentScriptId.value, ids: [...runningVideoPromptTrackIds.value] });
  if (isOk(response) && response.data.tracks.length > 0) {
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    return;
  }
  schedulePolls();
}

async function pollVideos(): Promise<void> {
  if (!currentProjectId.value || !currentScriptId.value || runningVideoIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.pollVideos({ projectId: currentProjectId.value, scriptId: currentScriptId.value, ids: [...runningVideoIds.value] });
  if (isOk(response) && response.data.tracks.length > 0) {
    await loadWorkspace({ keepDataOnError: true, asRefresh: true });
    return;
  }
  schedulePolls();
}

watch(currentProjectId, () => {
  void loadWorkspace({ autoLayout: true });
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
        v-if="hasFlowData"
        class="absolute left-3 top-3 z-[8] flex min-w-[min(760px,calc(100%_-_24px))] max-w-[calc(100%_-_24px)] items-center gap-2 rounded-lg border border-line-soft p-2.5 shadow-[0_10px_26px_rgba(16,24,20,0.08)] backdrop-blur-xl [background:color-mix(in_srgb,var(--vt-surface-panel)_92%,transparent)] max-[960px]:right-3 max-[960px]:min-w-0 max-[960px]:flex-wrap">
        <div class="grid min-w-[140px] max-w-[240px] gap-0.5">
          <span class="text-xs leading-[1.35] text-text-muted">{{ t('production.title') }}</span>
          <strong class="truncate text-[13px] leading-[1.35] text-text-primary">{{ currentProjectName }}</strong>
        </div>
        <label class="grid w-[min(320px,34vw)] min-w-[180px] gap-1 max-[960px]:w-[min(300px,100%)]">
          <span class="text-xs leading-[1.35] text-text-muted">{{ t('production.scriptSelect') }}</span>
          <t-select :model-value="currentScriptId" :options="scriptOptions" :placeholder="t('production.scriptPlaceholder')" :loading="loading" size="small" filterable @change="handleScriptChange" />
        </label>
        <span class="min-w-[180px] truncate text-xs leading-[1.35] text-text-muted max-[960px]:basis-full max-[960px]:min-w-0">{{ t('production.canvasStatsValue', canvasStats) }}</span>
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

    <VtDialog :visible="assetExtractVisible" :title="t('production.assetExtract.title')" width="980px" :footer="false" @update:visible="(value) => (assetExtractVisible = value)">
      <div class="production-asset-extract-dialog">
        <header class="production-asset-extract-head">
          <div class="production-asset-extract-title">
            <span>{{ t('production.assetExtract.current') }}</span>
            <strong>{{ currentScriptName }}</strong>
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
              <t-tooltip :content="t('production.assetExtract.generateMissingImages')">
                <VtButton variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.assetExtract.generateMissingImages')" :disabled="missingDerivedAssets.length === 0" @click="generateMissingDerivedAssetImages">
                  <template #icon><ImageIcon /></template>
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
          <section v-for="group in assetExtractGroups" :key="group.type" class="production-asset-extract-group" :class="`is-${group.status}`">
            <header>
              <div class="production-asset-extract-group-title">
                <span class="production-asset-extract-type-mark">{{ t(`production.assetType.${group.type}`).slice(0, 1) }}</span>
                <div>
                  <strong>{{ t(`production.assetType.${group.type}`) }}</strong>
                  <span>{{ t('production.assetExtract.groupStats', { count: group.assets.length, ready: group.readyCount, missing: group.missingImageCount, derived: group.derivedCount }) }}</span>
                </div>
              </div>
              <t-tag :theme="getAssetExtractGroupTheme(group.status)" variant="light">{{ t(`production.assetExtract.groupStatus.${group.status}`) }}</t-tag>
            </header>
            <div v-if="group.assets.length > 0" class="production-asset-extract-list">
              <article v-for="asset in group.assets" :key="asset.id" class="production-asset-extract-card">
                <div class="production-asset-extract-thumb">
                  <img v-if="asset.imageUrl" :src="asset.imageUrl" :alt="asset.name" />
                  <span v-else>{{ t(`production.assetType.${asset.type}`).slice(0, 1) }}</span>
                </div>
                <div class="production-asset-extract-info">
                  <strong>{{ asset.name }}</strong>
                  <p>{{ previewText(asset.description || asset.prompt, 120) }}</p>
                  <div>
                    <t-tag size="small" :theme="getStatusTheme(asset.imageStatus)" variant="light">{{ getAssetImageStatusLabel(asset) }}</t-tag>
                    <t-tag size="small" variant="light">{{ t('production.assetExtract.childCount', { count: asset.children.length }) }}</t-tag>
                  </div>
                </div>
                <div class="production-asset-extract-card-actions">
                  <t-tooltip :content="t('production.assetExtract.addDerived')">
                    <VtButton size="small" variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.assetExtract.addDerived')" @click="openAssetDerivedDialog(asset)">
                      <template #icon><AddIcon /></template>
                    </VtButton>
                  </t-tooltip>
                  <t-tooltip :content="t('production.assetExtract.generateDerived')">
                    <VtButton size="small" variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.assetExtract.generateDerived')" :disabled="getGeneratableDerivedAssetIds(asset).length === 0" @click="generateDerivedAssets(getGeneratableDerivedAssetIds(asset))">
                      <template #icon><ImageIcon /></template>
                    </VtButton>
                  </t-tooltip>
                </div>
                <div v-if="asset.children.length" class="production-asset-extract-children">
                  <article v-for="child in asset.children" :key="child.id">
                    <div>
                      <strong>{{ child.name }}</strong>
                      <span>{{ previewText(child.description || child.prompt, 82) }}</span>
                    </div>
                    <t-tag size="small" :theme="getStatusTheme(child.imageStatus)" variant="light">{{ getAssetImageStatusLabel(child) }}</t-tag>
                    <t-tooltip :content="t('production.assetExtract.openImageFlow')">
                      <VtButton size="small" variant="text" shape="square" icon-only :min-width="0" :aria-label="t('production.assetExtract.openImageFlow')" @click="openDerivedAssetImageFlow(child)">
                        <template #icon><ImageIcon /></template>
                      </VtButton>
                    </t-tooltip>
                  </article>
                </div>
              </article>
            </div>
            <div v-else class="production-asset-extract-task-empty">
              <strong>{{ t(`production.assetExtract.groupStatus.${group.status}`) }}</strong>
              <span>{{ getAssetExtractGroupEmptyLabel(group) }}</span>
            </div>
          </section>
        </div>
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
          <img :src="storyboard.imageUrl || ''" :alt="storyboard.videoDesc" />
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

    <ProductionAgentPanel v-model:visible="agentPanelVisible" :project-id="currentProjectId" :script-id="currentScriptId" @applied="loadWorkspace({ keepDataOnError: true, asRefresh: true })" />

    <ProductionImageFlowDialog
      v-model:visible="imageFlowVisible"
      :project-id="currentProjectId"
      :script-id="currentScriptId"
      :owner="imageFlowOwner"
      :storyboards="flowData?.storyboards ?? []"
      :assets="flowData?.assets ?? []"
      @saved="loadWorkspace({ keepDataOnError: true, asRefresh: true })" />

    <ProductionWorkbenchDialog
      v-model:visible="workbenchVisible"
      :project-id="currentProjectId"
      :script-id="currentScriptId"
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
.production-asset-extract-group header span,
.production-asset-extract-info p,
.production-asset-extract-children span {
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

.production-asset-extract-info p {
  margin: 0;
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
.production-asset-extract-actions,
.production-asset-extract-info > div {
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 1px 2px 2px 0;
  scrollbar-gutter: stable;
}

.production-asset-extract-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 320px;
  padding: 12px;
  border: 1px solid var(--vt-line-soft);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vt-surface-panel) 92%, transparent);
}

.production-asset-extract-group.is-running,
.production-asset-extract-group.is-waiting {
  border-color: color-mix(in srgb, var(--vt-brand) 32%, var(--vt-line-soft));
  background: color-mix(in srgb, var(--vt-brand) 7%, var(--vt-surface-panel));
}

.production-asset-extract-group.is-failed {
  border-color: color-mix(in srgb, var(--vt-danger) 34%, var(--vt-line-soft));
}

.production-asset-extract-group.is-done {
  border-color: color-mix(in srgb, var(--vt-success) 34%, var(--vt-line-soft));
}

.production-asset-extract-group header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.production-asset-extract-group-title {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  min-width: 0;
  gap: 9px;
}

.production-asset-extract-group-title > div {
  display: grid;
  min-width: 0;
  gap: 1px;
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

.production-asset-extract-group header strong {
  color: var(--vt-text-primary);
  font-size: 15px;
  line-height: 1.4;
}

.production-asset-extract-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
}

.production-asset-extract-task-empty {
  display: grid;
  align-content: center;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 180px;
  place-items: center;
  padding: 18px;
  border: 1px dashed var(--vt-line-soft);
  border-radius: 8px;
  color: var(--vt-text-muted);
  background: var(--vt-surface-raised);
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
}

.production-asset-extract-task-empty strong {
  color: var(--vt-text-primary);
  font-size: 14px;
  line-height: 1.4;
}

.production-asset-extract-task-empty span {
  max-width: 180px;
}

.production-asset-extract-card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--vt-line-soft);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vt-surface-panel) 88%, transparent);
}

.production-asset-extract-thumb {
  display: grid;
  width: 56px;
  aspect-ratio: 1;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--vt-line-soft);
  border-radius: 8px;
  color: var(--vt-brand-strong);
  background: color-mix(in srgb, var(--vt-brand) 9%, var(--vt-surface-raised));
  font-size: 18px;
  font-weight: 800;
}

.production-asset-extract-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.production-asset-extract-info {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.production-asset-extract-info strong,
.production-asset-extract-children strong {
  overflow: hidden;
  color: var(--vt-text-primary);
  font-size: 13px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-asset-extract-info p,
.production-asset-extract-children span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-asset-extract-card-actions {
  display: grid;
  gap: 6px;
}

.production-asset-extract-children {
  grid-column: 1 / -1;
  display: grid;
  gap: 6px;
  padding-top: 2px;
}

.production-asset-extract-children article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--vt-line-soft);
  border-radius: 8px;
  background: var(--vt-surface-raised);
}

.production-asset-extract-children article > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

@media (max-width: 720px) {
  .production-asset-extract-dialog {
    max-height: calc(100dvh - 128px);
  }

  .production-asset-extract-head,
  .production-asset-extract-card,
  .production-asset-extract-children article {
    grid-template-columns: minmax(0, 1fr);
  }

  .production-asset-extract-content {
    grid-template-columns: minmax(0, 1fr);
  }

  .production-asset-extract-head-actions,
  .production-asset-extract-status {
    justify-content: flex-start;
  }

  .production-asset-extract-group {
    min-height: 240px;
  }

  .production-asset-extract-card-actions {
    display: flex;
    flex-wrap: wrap;
  }
}
</style>
