<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { VueFlow, useVueFlow, type NodeDragEvent } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import { GitBranchIcon, RefreshIcon, SaveIcon, UserTalkIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { useAppStore } from '@renderer/stores/app';
import WorkflowNextStepHint from '@renderer/features/shared/WorkflowNextStepHint.vue';
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

const POLL_INTERVAL = 3000;
const FLOW_ID = 'productionMainFlow';

const { t } = useI18n();
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
const textDialogType = ref<'scriptPlan' | 'storyboardTable'>('scriptPlan');
const textDraft = ref('');
const storyboardDialogVisible = ref(false);
const storyboardSaving = ref(false);
const editingStoryboard = ref<ProductionStoryboardItem | null>(null);
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

let storyboardPollTimer: number | null = null;
let derivedPollTimer: number | null = null;
let videoPromptPollTimer: number | null = null;
let videoPollTimer: number | null = null;

const { fitView, getNodes, updateNodeInternals } = useVueFlow(FLOW_ID);

const scriptOptions = computed(() => scripts.value.map((script) => ({ label: script.name, value: script.id })));
const nodes = computed<ProductionCanvasNode[]>(() => buildProductionNodes(flowData.value, positions.value));
const edges = computed<ProductionCanvasEdge[]>(() => buildProductionEdges(flowData.value));
const currentScript = computed(() => scripts.value.find((script) => script.id === currentScriptId.value) ?? null);
const hasFlowData = computed(() => Boolean(flowData.value && currentScriptId.value));
const assetOptions = computed(() => flattenAssets(flowData.value?.assets ?? []).map((asset) => ({ label: `${t(`production.assetType.${asset.type}`)} / ${asset.name}`, value: asset.id })));
const storyboardOptions = computed(() => (flowData.value?.storyboards ?? []).map((storyboard) => ({ label: `S${String(storyboard.index + 1).padStart(2, '0')} / ${previewText(storyboard.videoDesc || storyboard.prompt, 44)}`, value: storyboard.id })));
const runningStoryboardIds = computed(() => (flowData.value?.storyboards ?? []).filter((storyboard) => storyboard.imageStatus === PRODUCTION_TASK_STATUS.RUNNING).map((storyboard) => storyboard.id));
const runningDerivedAssetIds = computed(() => flattenAssets(flowData.value?.assets ?? []).filter((asset) => asset.parentId && asset.imageStatus === PRODUCTION_TASK_STATUS.RUNNING).map((asset) => asset.id));
const runningVideoPromptTrackIds = computed(() => (flowData.value?.videoTracks ?? []).filter((track) => track.status === PRODUCTION_TASK_STATUS.RUNNING).map((track) => track.id));
const runningVideoIds = computed(() => (flowData.value?.videoTracks ?? []).flatMap((track) => track.videos).filter((video) => video.status === PRODUCTION_TASK_STATUS.RUNNING).map((video) => video.id));
const textDialogTitle = computed(() => t(`production.node.${textDialogType.value}.editTitle`));

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

function clearTimer(timer: number | null): void {
  if (timer) {
    window.clearTimeout(timer);
  }
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

function openTextDialog(nodeType: 'scriptPlan' | 'storyboardTable'): void {
  if (!flowData.value) {
    return;
  }
  textDialogType.value = nodeType;
  textDraft.value = nodeType === 'scriptPlan' ? flowData.value.scriptPlan : flowData.value.storyboardTable;
  textDialogVisible.value = true;
}

async function confirmTextDialog(): Promise<void> {
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

function openEditStoryboard(storyboard: ProductionStoryboardItem): void {
  editingStoryboard.value = storyboard;
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

function openAgentPanel(): void {
  if (!currentProjectId.value || !currentScriptId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }
  agentPanelVisible.value = true;
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

async function pollStoryboards(): Promise<void> {
  if (!currentProjectId.value || !currentScriptId.value || runningStoryboardIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.pollStoryboardImages({ projectId: currentProjectId.value, scriptId: currentScriptId.value, ids: runningStoryboardIds.value });
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
  const response = await window.vtStudio.production.pollDerivedAssetImages({ projectId: currentProjectId.value, scriptId: currentScriptId.value, ids: runningDerivedAssetIds.value });
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
  const response = await window.vtStudio.production.pollVideoPrompts({ projectId: currentProjectId.value, scriptId: currentScriptId.value, ids: runningVideoPromptTrackIds.value });
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
  const response = await window.vtStudio.production.pollVideos({ projectId: currentProjectId.value, scriptId: currentScriptId.value, ids: runningVideoIds.value });
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
});
</script>

<template>
  <div class="production-page">
    <section class="production-page-head">
      <div>
        <p class="eyebrow">{{ t('common.project') }}</p>
        <h3>{{ t('production.title') }}</h3>
        <p>{{ t('production.summary') }}</p>
      </div>
      <div class="production-page-context">
        <span>{{ t('production.currentProject') }}</span>
        <strong>{{ currentProjectName }}</strong>
        <small v-if="currentScript">{{ currentScript.name }}</small>
      </div>
    </section>

    <WorkflowNextStepHint hint-key="production" next-route-name="export" />

    <section class="production-toolbar">
      <label>
        <span>{{ t('production.scriptSelect') }}</span>
        <t-select :model-value="currentScriptId" :options="scriptOptions" :placeholder="t('production.scriptPlaceholder')" :loading="loading" filterable @change="handleScriptChange" />
      </label>
      <div class="production-toolbar-actions">
        <t-button variant="outline" :disabled="!hasFlowData" @click="openAgentPanel">
          <template #icon><UserTalkIcon /></template>
          {{ t('production.agent.open') }}
        </t-button>
        <t-button variant="outline" :loading="refreshing" @click="refreshWorkspace">
          <template #icon><RefreshIcon /></template>
          {{ t('production.refresh') }}
        </t-button>
        <t-button variant="outline" :disabled="!hasFlowData" @click="autoLayout()">
          <template #icon><GitBranchIcon /></template>
          {{ t('production.autoLayout') }}
        </t-button>
        <t-button theme="primary" :loading="saving" :disabled="!hasFlowData" @click="saveWorkspace()">
          <template #icon><SaveIcon /></template>
          {{ t('production.saveFlow') }}
        </t-button>
      </div>
    </section>

    <section class="production-canvas-shell">
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
              @create-storyboard="openCreateStoryboard"
              @edit-storyboard="openEditStoryboard"
              @delete-storyboard="confirmDeleteStoryboard"
              @toggle-storyboard="toggleStoryboard"
              @select-all-storyboards="selectAllStoryboards"
              @clear-storyboard-selection="clearStoryboardSelection"
              @batch-delete-storyboards="confirmBatchDeleteStoryboards"
              @generate-storyboards="generateSelectedStoryboards"
              @show-detail="openProductionDetail"
              @create-track="openCreateTrack"
              @edit-track="openEditTrack"
              @delete-track="confirmDeleteTrack"
              @toggle-track="toggleTrack"
              @generate-video-prompts="generateVideoPrompts"
              @generate-videos="generateVideos"
              @open-workbench="openWorkbench"
              @create-derived-asset="openDerivedDialog"
              @delete-derived-asset="confirmDeleteDerivedAsset"
              @generate-derived-assets="generateDerivedAssets"
              @edit-image-flow="openImageFlow" />
          </template>
          <Background pattern-color="rgba(47, 111, 99, 0.22)" :gap="22" />
          <Controls />
          <MiniMap pannable zoomable />
        </VueFlow>
        <t-empty v-if="!loading && !hasFlowData" class="production-empty" :description="currentProjectId ? t('production.noScript') : t('production.noProject')">
          <template #action>
            <t-button variant="outline" @click="refreshWorkspace">
              <template #icon><RefreshIcon /></template>
              {{ t('production.refresh') }}
            </t-button>
          </template>
        </t-empty>
      </t-loading>
    </section>

    <t-dialog :visible="textDialogVisible" :header="textDialogTitle" width="920px" :confirm-btn="t('production.save')" :cancel-btn="t('production.cancel')" :confirm-loading="saving" @update:visible="(value) => (textDialogVisible = value)" @confirm="confirmTextDialog">
      <t-textarea v-model="textDraft" class="production-text-editor" :placeholder="t(`production.node.${textDialogType}.placeholder`)" :autosize="{ minRows: 16, maxRows: 24 }" />
    </t-dialog>

    <t-dialog :visible="storyboardDialogVisible" :header="editingStoryboard ? t('production.node.storyboard.editTitle') : t('production.node.storyboard.createTitle')" width="760px" :confirm-btn="t('production.save')" :cancel-btn="t('production.cancel')" :confirm-loading="storyboardSaving" @update:visible="(value) => (storyboardDialogVisible = value)" @confirm="saveStoryboard">
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
    </t-dialog>

    <t-dialog :visible="trackDialogVisible" :header="editingTrack ? t('production.node.workbench.editTrackTitle') : t('production.node.workbench.createTrackTitle')" width="760px" :confirm-btn="t('production.save')" :cancel-btn="t('production.cancel')" :confirm-loading="trackSaving" @update:visible="(value) => (trackDialogVisible = value)" @confirm="saveTrack">
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
    </t-dialog>

    <t-dialog :visible="derivedDialogVisible" :header="t('production.node.assets.derivedTitle')" width="620px" :confirm-btn="t('production.save')" :cancel-btn="t('production.cancel')" :confirm-loading="derivedSaving" @update:visible="(value) => (derivedDialogVisible = value)" @confirm="saveDerivedAsset">
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
    </t-dialog>

    <t-dialog :visible="detailDialogVisible" :header="detailDialogTitle" width="720px" :footer="false" @update:visible="(value) => (detailDialogVisible = value)">
      <pre class="production-detail-content">{{ detailDialogContent }}</pre>
    </t-dialog>

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
