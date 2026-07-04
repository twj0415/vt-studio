<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { VueFlow, useVueFlow, type Connection, type EdgeMouseEvent } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import { AddIcon, GitBranchIcon, ImageIcon, SaveIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import {
  DEFAULT_IMAGE_FLOW_RATIOS,
  PROJECT_IMAGE_QUALITIES,
  PROJECT_IMAGE_QUALITY_VALUES,
  PROJECT_VIDEO_RATIOS,
} from '@shared/constants/dictionaries';
import { type ProductionAssetSummary, type ProductionImageFlowData, type ProductionImageFlowEdge, type ProductionImageFlowNode as ProductionImageFlowStoredNode, type ProductionStoryboardItem } from '@shared/types/production';
import ProductionImageFlowNode from './ProductionImageFlowNode.vue';
import type {
  ProductionImageFlowNodeData,
  ProductionImageFlowNodeKind,
  ProductionImageFlowOwnerContext,
  ProductionImageFlowSourceOption,
  ProductionImageFlowSourceType,
} from '../types';

interface ImageFlowGraphNode {
  id: string;
  type: 'imageFlowNode';
  position: { x: number; y: number };
  data: ProductionImageFlowNodeData;
  draggable: boolean;
  selectable: boolean;
}

interface ImageFlowGraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep';
  animated: boolean;
  interactionWidth: number;
}

const FLOW_ID = 'productionImageFlow';
const DEFAULT_RATIO = PROJECT_VIDEO_RATIOS.LANDSCAPE;
const DEFAULT_QUALITY = PROJECT_IMAGE_QUALITIES.ONE_K;
const DEFAULT_MODEL = 'project-default-image-model';

const props = defineProps<{
  visible: boolean;
  projectId: number;
  scriptId: number | null;
  owner: ProductionImageFlowOwnerContext | null;
  storyboards: ProductionStoryboardItem[];
  assets: ProductionAssetSummary[];
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  saved: [];
}>();

const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const applying = ref(false);
const currentFlowId = ref<string | null>(null);
const nodes = ref<ImageFlowGraphNode[]>([]);
const edges = ref<ImageFlowGraphEdge[]>([]);
const selectedGeneratedNodeId = ref<string | null>(null);

const { fitView, getNodes } = useVueFlow(FLOW_ID);

const title = computed(() => (props.owner ? t('production.imageFlow.title', { name: props.owner.title }) : t('production.imageFlow.titleFallback')));
const sourceTypeOptions = computed<Array<{ label: string; value: ProductionImageFlowSourceType }>>(() => [
  { label: t('production.imageFlow.source.storyboard'), value: 'storyboard' },
  { label: t('production.imageFlow.source.assets'), value: 'assets' },
  { label: t('production.imageFlow.source.manual'), value: 'manual' },
]);
const ratioOptions = computed(() => DEFAULT_IMAGE_FLOW_RATIOS.map((value) => ({ label: value, value })));
const qualityOptions = computed(() => PROJECT_IMAGE_QUALITY_VALUES.map((value) => ({ label: value, value })));
const storyboardSourceOptions = computed<ProductionImageFlowSourceOption[]>(() => props.storyboards.map((storyboard) => ({
  label: `S${String(storyboard.index + 1).padStart(2, '0')} / ${previewText(storyboard.videoDesc || storyboard.prompt, 52)}`,
  value: storyboard.id,
  imageUrl: storyboard.imageUrl,
  prompt: storyboard.prompt || storyboard.videoDesc,
})));
const assetSourceOptions = computed<ProductionImageFlowSourceOption[]>(() => flattenAssets(props.assets).map((asset) => ({
  label: `${t(`production.assetType.${asset.type}`)} / ${asset.name}`,
  value: asset.id,
  imageUrl: asset.imageUrl,
  prompt: asset.prompt || asset.description,
})));
const sourceOptionsByType = computed<Record<Exclude<ProductionImageFlowSourceType, 'manual'>, ProductionImageFlowSourceOption[]>>(() => ({
  storyboard: storyboardSourceOptions.value,
  assets: assetSourceOptions.value,
}));
const selectedGeneratedNodes = computed(() => nodes.value.filter((node) => node.data.generatedImage));
const selectedGeneratedOptions = computed(() => selectedGeneratedNodes.value.map((node) => ({
  label: node.data.label || t('production.imageFlow.node.generated'),
  value: node.id,
})));
const selectedGeneratedNode = computed(() => selectedGeneratedNodes.value.find((node) => node.id === selectedGeneratedNodeId.value) ?? selectedGeneratedNodes.value[0] ?? null);
const canApply = computed(() => Boolean(props.owner && selectedGeneratedNode.value?.data.generatedImage));

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

function createNodeData(kind: ProductionImageFlowNodeKind, patch: Partial<ProductionImageFlowNodeData> = {}): ProductionImageFlowNodeData {
  return {
    label: kind === 'upload' ? t('production.imageFlow.node.upload') : t('production.imageFlow.node.generated'),
    source: 'manual',
    sourceId: null,
    image: null,
    references: [],
    prompt: '',
    model: DEFAULT_MODEL,
    ratio: DEFAULT_RATIO,
    quality: DEFAULT_QUALITY,
    generatedImage: null,
    ...patch,
    kind,
  };
}

function normalizeNodeData(kind: ProductionImageFlowNodeKind, value: Record<string, unknown>): ProductionImageFlowNodeData {
  const source = value.source === 'storyboard' || value.source === 'assets' || value.source === 'manual' ? value.source : 'manual';
  const references = Array.isArray(value.references) ? value.references.map((item) => String(item)).filter(Boolean) : [];
  return createNodeData(kind, {
    label: String(value.label ?? ''),
    source,
    sourceId: value.sourceId === null || value.sourceId === undefined ? null : Number(value.sourceId),
    image: value.image ? String(value.image) : null,
    references,
    prompt: String(value.prompt ?? ''),
    model: String(value.model ?? DEFAULT_MODEL),
    ratio: String(value.ratio ?? DEFAULT_RATIO),
    quality: String(value.quality ?? DEFAULT_QUALITY),
    generatedImage: value.generatedImage ? String(value.generatedImage) : null,
  });
}

function getNodeKind(node: ProductionImageFlowStoredNode | ImageFlowGraphNode): ProductionImageFlowNodeKind {
  const dataKind = (node.data as { kind?: unknown } | undefined)?.kind;
  return node.type === 'generated' || dataKind === 'generated' ? 'generated' : 'upload';
}

function createGraphNode(kind: ProductionImageFlowNodeKind, data: Partial<ProductionImageFlowNodeData>, position: { x: number; y: number }): ImageFlowGraphNode {
  const id = `${kind}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
  return {
    id,
    type: 'imageFlowNode',
    position,
    data: createNodeData(kind, data),
    draggable: true,
    selectable: false,
  };
}

function createDefaultNodes(): ImageFlowGraphNode[] {
  const owner = props.owner;
  const ownerSource: ProductionImageFlowSourceType = owner?.ownerType === 'storyboard' ? 'storyboard' : owner?.ownerType === 'derivedAsset' ? 'assets' : 'manual';
  return [
    createGraphNode('upload', {
      label: t('production.imageFlow.defaultUploadLabel'),
      source: ownerSource,
      sourceId: owner?.ownerId ?? null,
      image: owner?.imageUrl ?? null,
      prompt: owner?.prompt ?? '',
    }, { x: 0, y: 80 }),
    createGraphNode('generated', {
      label: t('production.imageFlow.defaultGeneratedLabel'),
      prompt: owner?.prompt ?? '',
      generatedImage: owner?.imageUrl ?? null,
    }, { x: 460, y: 48 }),
  ];
}

function createDefaultEdges(sourceNodeId: string, targetNodeId: string): ImageFlowGraphEdge[] {
  return [{
    id: `${sourceNodeId}-${targetNodeId}`,
    source: sourceNodeId,
    target: targetNodeId,
    type: 'smoothstep',
    animated: true,
    interactionWidth: 18,
  }];
}

function toGraphData(flowData: ProductionImageFlowData | null): void {
  if (!flowData?.nodes.length) {
    const defaultNodes = createDefaultNodes();
    nodes.value = defaultNodes;
    edges.value = createDefaultEdges(defaultNodes[0]!.id, defaultNodes[1]!.id);
    syncReferencesFromEdges();
    return;
  }

  nodes.value = flowData.nodes.map((node) => {
    const kind = getNodeKind(node);
    return {
      id: node.id,
      type: 'imageFlowNode',
      position: node.position,
      data: normalizeNodeData(kind, node.data),
      draggable: true,
      selectable: false,
    };
  });
  edges.value = flowData.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: true,
    interactionWidth: 18,
  }));
  syncReferencesFromEdges();
}

function toFlowData(): ProductionImageFlowData {
  const nodePositions = new Map(getNodes.value.map((node) => [node.id, node.position]));
  return {
    nodes: nodes.value.map<ProductionImageFlowStoredNode>((node) => ({
      id: node.id,
      type: getNodeKind(node),
      position: nodePositions.get(node.id) ?? node.position,
      data: {
        ...node.data,
        kind: getNodeKind(node),
      },
    })),
    edges: edges.value.map<ProductionImageFlowEdge>((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
}

function getNodeOutputImage(node: ImageFlowGraphNode | undefined): string | null {
  if (!node) {
    return null;
  }
  return node.data.generatedImage || node.data.image || null;
}

function syncReferencesFromEdges(): void {
  const imageByNodeId = new Map(nodes.value.map((node) => [node.id, getNodeOutputImage(node)]));
  const referencesByTarget = new Map<string, string[]>();
  for (const edge of edges.value) {
    const image = imageByNodeId.get(edge.source);
    if (!image) {
      continue;
    }
    const references = referencesByTarget.get(edge.target) ?? [];
    references.push(image);
    referencesByTarget.set(edge.target, references);
  }

  nodes.value = nodes.value.map((node) => {
    if (getNodeKind(node) !== 'generated') {
      return node;
    }
    return {
      ...node,
      data: {
        ...node.data,
        references: referencesByTarget.get(node.id) ?? [],
      },
    };
  });
}

function getSourceOptions(source: ProductionImageFlowSourceType): ProductionImageFlowSourceOption[] {
  if (source === 'manual') {
    return [];
  }
  return sourceOptionsByType.value[source];
}

async function openDialog(): Promise<void> {
  if (!props.visible || !props.projectId || !props.scriptId || !props.owner) {
    return;
  }

  loading.value = true;
  try {
    let flowData: ProductionImageFlowData | null = null;
    currentFlowId.value = props.owner.flowId;
    if (props.owner.flowId) {
      const response = await window.vtStudio.production.getImageFlow({
        projectId: props.projectId,
        scriptId: props.scriptId,
        flowId: props.owner.flowId,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      flowData = response.data.flow?.flowData ?? null;
      currentFlowId.value = response.data.flow?.id ?? props.owner.flowId;
    }

    toGraphData(flowData);
    selectedGeneratedNodeId.value = selectedGeneratedNodes.value[0]?.id ?? null;
    await nextTick();
    fitView({ duration: 220, padding: 0.18 });
  } finally {
    loading.value = false;
  }
}

function closeDialog(): void {
  emit('update:visible', false);
}

function addUploadNode(): void {
  nodes.value = [
    ...nodes.value,
    createGraphNode('upload', {}, { x: 40, y: 80 + nodes.value.length * 32 }),
  ];
  void nextTick(() => fitView({ duration: 180, padding: 0.18 }));
}

function addGeneratedNode(): void {
  nodes.value = [
    ...nodes.value,
    createGraphNode('generated', { prompt: props.owner?.prompt ?? '' }, { x: 480, y: 60 + nodes.value.length * 34 }),
  ];
  void nextTick(() => fitView({ duration: 180, padding: 0.18 }));
}

function deleteNode(nodeId: string): void {
  if (nodes.value.length <= 1) {
    MessagePlugin.warning(t('production.imageFlow.cannotDeleteLastNode'));
    return;
  }
  nodes.value = nodes.value.filter((node) => node.id !== nodeId);
  edges.value = edges.value.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
  if (selectedGeneratedNodeId.value === nodeId) {
    selectedGeneratedNodeId.value = selectedGeneratedNodes.value[0]?.id ?? null;
  }
  syncReferencesFromEdges();
}

function updateNodeData(nodeId: string, patch: Partial<ProductionImageFlowNodeData>): void {
  nodes.value = nodes.value.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch, kind: patch.kind ?? node.data.kind } } : node));
  syncReferencesFromEdges();
}

function handleConnect(connection: Connection): void {
  if (!connection.source || !connection.target || connection.source === connection.target) {
    return;
  }
  const targetNode = nodes.value.find((node) => node.id === connection.target);
  if (!targetNode || getNodeKind(targetNode) !== 'generated') {
    MessagePlugin.warning(t('production.imageFlow.connectGeneratedOnly'));
    return;
  }

  const id = `${connection.source}-${connection.target}`;
  if (edges.value.some((edge) => edge.source === connection.source && edge.target === connection.target)) {
    return;
  }

  edges.value = [
    ...edges.value,
    {
      id,
      source: connection.source,
      target: connection.target,
      type: 'smoothstep',
      animated: true,
      interactionWidth: 18,
    },
  ];
  syncReferencesFromEdges();
}

function confirmDeleteEdge(event: EdgeMouseEvent): void {
  const edgeId = event.edge.id;
  const dialog = DialogPlugin.confirm({
    header: t('production.imageFlow.deleteEdgeTitle'),
    body: t('production.imageFlow.deleteEdgeBody'),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    onConfirm() {
      edges.value = edges.value.filter((edge) => edge.id !== edgeId);
      syncReferencesFromEdges();
      dialog.destroy();
    },
  });
}

function autoLayout(): void {
  const uploads = nodes.value.filter((node) => getNodeKind(node) === 'upload');
  const generated = nodes.value.filter((node) => getNodeKind(node) === 'generated');
  const nextNodes = [
    ...uploads.map((node, index) => ({ ...node, position: { x: 0, y: 40 + index * 280 } })),
    ...generated.map((node, index) => ({ ...node, position: { x: 500, y: 40 + index * 340 } })),
  ];
  nodes.value = nextNodes;
  void nextTick(() => fitView({ duration: 240, padding: 0.18 }));
}

async function saveFlow(showMessage = true): Promise<string | null> {
  if (!props.projectId || !props.scriptId || !props.owner) {
    return null;
  }

  saving.value = true;
  try {
    const response = await window.vtStudio.production.saveImageFlow({
      projectId: props.projectId,
      scriptId: props.scriptId,
      flowId: currentFlowId.value,
      ownerType: props.owner.ownerType,
      ownerId: props.owner.ownerId,
      flowData: toFlowData(),
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return null;
    }
    currentFlowId.value = response.data.flow.id;
    if (showMessage) {
      MessagePlugin.success(t('production.imageFlow.saved'));
    }
    emit('saved');
    return response.data.flow.id;
  } finally {
    saving.value = false;
  }
}

async function applyResult(): Promise<void> {
  if (!props.owner) {
    return;
  }

  const flowId = currentFlowId.value ?? await saveFlow(false);
  const generatedImage = selectedGeneratedNode.value?.data.generatedImage;
  if (!flowId || !generatedImage || !props.projectId || !props.scriptId) {
    MessagePlugin.warning(t('production.imageFlow.noResultToApply'));
    return;
  }

  applying.value = true;
  try {
    const response = await window.vtStudio.production.applyImageFlowResult({
      projectId: props.projectId,
      scriptId: props.scriptId,
      flowId,
      ownerType: props.owner.ownerType,
      ownerId: props.owner.ownerId,
      imageUrl: generatedImage,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.imageFlow.applied'));
    emit('saved');
    closeDialog();
  } finally {
    applying.value = false;
  }
}

watch(() => props.visible, (visible) => {
  if (visible) {
    void openDialog();
  }
});
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="title"
    width="96vw"
    :footer="false"
    destroy-on-close
    @update:visible="emit('update:visible', $event)">
    <div class="production-image-flow-shell">
      <aside class="production-image-flow-side">
        <div>
          <p class="eyebrow">Image Flow</p>
          <h4>{{ owner?.title || t('production.imageFlow.titleFallback') }}</h4>
          <span>{{ t('production.imageFlow.ownerStatus') }}：{{ owner ? t(`production.status.${owner.status}`) : t('production.emptyText') }}</span>
        </div>
        <div class="production-image-flow-owner-preview" :class="{ empty: !owner?.imageUrl }">
          <img v-if="owner?.imageUrl" :src="owner.imageUrl" :alt="owner.title" />
          <span v-else>{{ t('production.imageFlow.noOwnerImage') }}</span>
        </div>
        <div class="production-image-flow-actions">
          <t-button block theme="primary" @click="addUploadNode">
            <template #icon><AddIcon /></template>
            {{ t('production.imageFlow.addUpload') }}
          </t-button>
          <t-button block variant="outline" @click="addGeneratedNode">
            <template #icon><ImageIcon /></template>
            {{ t('production.imageFlow.addGenerated') }}
          </t-button>
          <t-button block variant="outline" @click="autoLayout">
            <template #icon><GitBranchIcon /></template>
            {{ t('production.autoLayout') }}
          </t-button>
        </div>
        <label>
          <span>{{ t('production.imageFlow.applyTarget') }}</span>
          <t-select v-model="selectedGeneratedNodeId" :options="selectedGeneratedOptions" :placeholder="t('production.imageFlow.noGeneratedResult')" />
        </label>
        <div class="production-image-flow-actions">
          <t-button block variant="outline" :loading="saving" @click="saveFlow()">
            <template #icon><SaveIcon /></template>
            {{ t('production.imageFlow.save') }}
          </t-button>
          <t-button block theme="primary" :loading="applying" :disabled="!canApply" @click="applyResult">
            <template #icon><ImageIcon /></template>
            {{ t('production.imageFlow.apply') }}
          </t-button>
        </div>
      </aside>

      <section class="production-image-flow-canvas-wrap">
        <t-loading :loading="loading">
          <VueFlow
            :id="FLOW_ID"
            class="production-image-flow-canvas"
            :nodes="nodes"
            :edges="edges"
            :nodes-draggable="true"
            :nodes-connectable="true"
            :elements-selectable="false"
            :min-zoom="0.18"
            :max-zoom="1.45"
            fit-view-on-init
            @connect="handleConnect"
            @edge-click="confirmDeleteEdge">
            <template #node-imageFlowNode="{ id, data }">
              <ProductionImageFlowNode
                :id="id"
                :kind="data.kind === 'generated' ? 'generated' : 'upload'"
                :data="data"
                :source-type-options="sourceTypeOptions"
                :source-options="getSourceOptions(data.source)"
                :ratio-options="ratioOptions"
                :quality-options="qualityOptions"
                @update="updateNodeData"
                @delete="deleteNode" />
            </template>
            <Background pattern-color="rgba(47, 111, 99, 0.2)" :gap="22" />
            <Controls />
            <MiniMap pannable zoomable />
          </VueFlow>
        </t-loading>
      </section>
    </div>
  </t-dialog>
</template>
