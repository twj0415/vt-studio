<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position } from '@vue-flow/core';
import { AddIcon, DeleteIcon, DownloadIcon, EditIcon, ErrorCircleIcon, FileIcon, ImageIcon, PlayCircleIcon, SaveIcon, UserTalkIcon, VideoIcon } from 'tdesign-icons-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import { PRODUCTION_TASK_STATUS, type ProductionAssetSummary, type ProductionFlowData, type ProductionNodeType, type ProductionStoryboardItem, type ProductionVideoTrackItem } from '@shared/types/production';

const props = defineProps<{
  nodeType: ProductionNodeType;
  flowData: ProductionFlowData;
  handleIds: {
    target?: string;
    source?: string;
    assets?: string;
  };
  selectedStoryboardIds: number[];
  selectedTrackIds: number[];
  saving?: boolean;
  runningStoryboardIds?: number[];
  runningTrackIds?: number[];
}>();

const emit = defineEmits<{
  editText: [nodeType: 'script' | 'scriptPlan' | 'storyboardTable'];
  saveWorkspace: [];
  openAgent: [];
  extractAssets: [];
  syncStoryboardTable: [];
  createStoryboard: [];
  insertStoryboard: [afterIndex: number];
  editStoryboard: [storyboard: ProductionStoryboardItem];
  deleteStoryboard: [storyboard: ProductionStoryboardItem];
  toggleStoryboard: [storyboardId: number];
  selectAllStoryboards: [];
  clearStoryboardSelection: [];
  batchDeleteStoryboards: [];
  generateStoryboards: [];
  generateStoryboardOne: [storyboardId: number];
  previewStoryboards: [];
  showDetail: [title: string, content: string];
  createTrack: [];
  editTrack: [track: ProductionVideoTrackItem];
  deleteTrack: [track: ProductionVideoTrackItem];
  toggleTrack: [trackId: number];
  selectAllTracks: [];
  clearTrackSelection: [];
  generateVideoPrompts: [];
  generateVideos: [];
  openWorkbench: [];
  openExport: [];
  openExportCheck: [];
  createDerivedAsset: [asset: ProductionAssetSummary];
  deleteDerivedAsset: [asset: ProductionAssetSummary];
  generateDerivedAssets: [assetIds: number[]];
  editImageFlow: [ownerType: 'storyboard' | 'derivedAsset', item: ProductionStoryboardItem | ProductionAssetSummary];
  selectNode: [nodeType: ProductionNodeType];
}>();

const { t } = useI18n();

const nodeHint = computed(() => t(`production.node.${props.nodeType}.hint`));
const nodeStage = computed(() => t(`production.flow.stage.${props.nodeType}`));
const scriptPreview = computed(() => previewText(props.flowData.contentBody, 420));
const scriptPlanPreview = computed(() => previewText(props.flowData.directorPlan ?? '', 260));
const storyboardTablePreview = computed(() => previewText(props.flowData.storyboardTable, 260));
const topAssets = computed(() => props.flowData.assets);
const derivedAssets = computed(() => props.flowData.assets.flatMap((asset) => asset.children));
const runningStoryboardCount = computed(() => props.runningStoryboardIds?.length ?? 0);
const runningTrackCount = computed(() => props.runningTrackIds?.length ?? 0);
const selectedStoryboardCount = computed(() => props.selectedStoryboardIds.length);
const selectedTrackCount = computed(() => props.selectedTrackIds.length);
const failedStoryboardCount = computed(() => props.flowData.storyboards.filter((storyboard) => storyboard.imageStatus === PRODUCTION_TASK_STATUS.FAILED).length);
const failedDerivedAssetCount = computed(() => derivedAssets.value.filter((asset) => asset.imageStatus === PRODUCTION_TASK_STATUS.FAILED).length);
const generatedStoryboardCount = computed(() => props.flowData.storyboards.filter((storyboard) => storyboard.imageUrl).length);
const isAllStoryboardsSelected = computed(() => props.flowData.storyboards.length > 0 && props.flowData.storyboards.every((storyboard) => props.selectedStoryboardIds.includes(storyboard.id)));
const totalVideoCandidateCount = computed(() => props.flowData.videoTracks.reduce((total, track) => total + track.videos.length, 0));
const selectedVideoCount = computed(() => props.flowData.videoTracks.filter((track) => track.selectedVideoId).length);
const failedTrackCount = computed(() => props.flowData.videoTracks.filter((track) => track.status === PRODUCTION_TASK_STATUS.FAILED || track.videos.some((video) => video.status === PRODUCTION_TASK_STATUS.FAILED)).length);
const isAllTracksSelected = computed(() => props.flowData.videoTracks.length > 0 && props.flowData.videoTracks.every((track) => props.selectedTrackIds.includes(track.id)));
const exportReady = computed(() => props.flowData.videoTracks.length > 0 && props.flowData.videoTracks.every((track) => {
  const selectedVideo = track.videos.find((video) => video.id === track.selectedVideoId);
  return Boolean(selectedVideo?.videoUrl) && selectedVideo?.status === PRODUCTION_TASK_STATUS.SUCCEEDED;
}));
const exportBlockerCount = computed(() => props.flowData.videoTracks.filter((track) => {
  const selectedVideo = track.videos.find((video) => video.id === track.selectedVideoId);
  return !selectedVideo || selectedVideo.status !== PRODUCTION_TASK_STATUS.SUCCEEDED || !selectedVideo.videoUrl;
}).length);

function previewText(value: string | null | undefined, limit: number): string {
  const text = (value ?? '').trim();
  if (!text) {
    return t('production.emptyText');
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function getStatusTheme(status: string): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === PRODUCTION_TASK_STATUS.RUNNING) {
    return 'primary';
  }
  if (status === PRODUCTION_TASK_STATUS.SUCCEEDED) {
    return 'success';
  }
  if (status === PRODUCTION_TASK_STATUS.FAILED || status === PRODUCTION_TASK_STATUS.CANCELLED) {
    return 'danger';
  }
  return 'default';
}

function getAssetTypeLabel(type: ProductionAssetSummary['type']): string {
  return t(`production.assetType.${type}`);
}

function getStoryboardThumb(storyboard: ProductionStoryboardItem): string | null {
  return storyboard.thumbnailUrl ?? storyboard.imageUrl;
}

function getTrackSelectedVideo(track: ProductionVideoTrackItem) {
  return track.videos.find((video) => video.id === track.selectedVideoId) ?? null;
}

function getGenerationRecord(metadata: Record<string, unknown> | null | undefined): unknown {
  return metadata && Object.keys(metadata).length > 0 ? metadata : null;
}

function hasGenerationRecord(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(getGenerationRecord(metadata));
}

function showGenerationRecord(title: string, metadata: Record<string, unknown> | null | undefined): void {
  const record = getGenerationRecord(metadata);
  emit('showDetail', title, record ? JSON.stringify(record, null, 2) : t('production.generationRecord.empty'));
}

function showTrackGenerationRecord(track: ProductionVideoTrackItem): void {
  const selectedVideo = getTrackSelectedVideo(track);
  const record = {
    track: getGenerationRecord(track.generationMetadata),
    selectedVideo: getGenerationRecord(selectedVideo?.generationMetadata),
  };
  emit('showDetail', t('production.generationRecord.title'), JSON.stringify(record, null, 2));
}

function hasTrackGenerationRecord(track: ProductionVideoTrackItem): boolean {
  return hasGenerationRecord(track.generationMetadata) || hasGenerationRecord(getTrackSelectedVideo(track)?.generationMetadata);
}

function canGenerateDerived(asset: ProductionAssetSummary): boolean {
  return asset.children.length > 0;
}

function showStoryboardError(storyboard: ProductionStoryboardItem): void {
  emit('showDetail', t('production.node.storyboard.errorTitle'), storyboard.imageErrorReason || t('production.emptyText'));
}

function showStoryboardPrompt(storyboard: ProductionStoryboardItem): void {
  emit('showDetail', t('production.node.storyboard.prompt'), storyboard.prompt || t('production.emptyText'));
}
</script>

<template>
  <article class="production-flow-node" :class="`production-flow-node-${nodeType}`" @click="emit('selectNode', nodeType)">
    <Handle v-if="handleIds.target" class="production-flow-handle target" type="target" :id="handleIds.target" :position="Position.Left" />
    <Handle v-if="handleIds.source" class="production-flow-handle source" type="source" :id="handleIds.source" :position="Position.Right" />
    <Handle v-if="handleIds.assets" class="production-flow-handle source is-assets" type="source" :id="handleIds.assets" :position="Position.Bottom" />

    <header class="production-node-head production-node-drag-handle">
      <div>
        <strong>{{ nodeStage }}</strong>
        <span>{{ nodeHint }}</span>
      </div>
      <div
        v-if="nodeType === 'script' || nodeType === 'scriptPlan' || nodeType === 'storyboardTable' || nodeType === 'assets'"
        class="production-node-actions is-icon-only production-node-head-actions"
        @click.stop
        @mousedown.stop>
        <template v-if="nodeType === 'script'">
          <t-tooltip :content="t('production.node.script.edit')">
            <VtButton size="small" variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.node.script.edit')" @click="emit('editText', 'script')">
              <template #icon><EditIcon /></template>
            </VtButton>
          </t-tooltip>
        </template>
        <template v-else-if="nodeType === 'scriptPlan'">
          <t-tooltip :content="t('production.edit')">
            <VtButton size="small" variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.edit')" @click="emit('editText', 'scriptPlan')">
              <template #icon><EditIcon /></template>
            </VtButton>
          </t-tooltip>
          <t-tooltip :content="t('production.node.scriptPlan.aiRewrite')">
            <VtButton size="small" variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.node.scriptPlan.aiRewrite')" @click="emit('openAgent')">
              <template #icon><UserTalkIcon /></template>
            </VtButton>
          </t-tooltip>
          <t-tooltip :content="t('production.save')">
            <VtButton size="small" theme="primary" variant="base" shape="square" icon-only :min-width="0" :aria-label="t('production.save')" :loading="saving" @click="emit('saveWorkspace')">
              <template #icon><SaveIcon /></template>
            </VtButton>
          </t-tooltip>
        </template>
        <template v-else-if="nodeType === 'storyboardTable'">
          <t-tooltip :content="t('production.edit')">
            <VtButton size="small" variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.edit')" @click="emit('editText', 'storyboardTable')">
              <template #icon><EditIcon /></template>
            </VtButton>
          </t-tooltip>
          <t-tooltip :content="t('production.node.storyboardTable.sync')">
            <VtButton size="small" variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.node.storyboardTable.sync')" @click="emit('syncStoryboardTable')">
              <template #icon><AddIcon /></template>
            </VtButton>
          </t-tooltip>
          <t-tooltip :content="t('production.save')">
            <VtButton size="small" theme="primary" variant="base" shape="square" icon-only :min-width="0" :aria-label="t('production.save')" :loading="saving" @click="emit('saveWorkspace')">
              <template #icon><SaveIcon /></template>
            </VtButton>
          </t-tooltip>
        </template>
        <template v-else-if="nodeType === 'assets'">
          <t-tooltip :content="t('production.node.assets.extract')">
            <VtButton size="small" theme="primary" variant="base" shape="square" icon-only :min-width="0" :aria-label="t('production.node.assets.extract')" @click="emit('extractAssets')">
              <template #icon><ImageIcon /></template>
            </VtButton>
          </t-tooltip>
        </template>
      </div>
    </header>

    <section v-if="nodeType === 'script'" class="production-node-body">
      <pre class="production-node-text">{{ scriptPreview }}</pre>
      <div class="production-node-meta-grid">
        <span>{{ t('production.node.script.chars', { count: (flowData.contentBody ?? '').length }) }}</span>
        <span>{{ t('production.node.script.assets', { count: topAssets.length }) }}</span>
      </div>
    </section>

    <section v-else-if="nodeType === 'scriptPlan'" class="production-node-body">
      <pre class="production-node-text compact">{{ scriptPlanPreview }}</pre>
    </section>

    <section v-else-if="nodeType === 'storyboardTable'" class="production-node-body">
      <pre class="production-node-text compact">{{ storyboardTablePreview }}</pre>
    </section>

    <section v-else-if="nodeType === 'assets'" class="production-node-body">
      <div class="production-node-toolbar">
        <t-tag variant="light">{{ t('production.node.assets.total', { count: topAssets.length }) }}</t-tag>
        <t-tag variant="light">{{ t('production.node.assets.derived', { count: derivedAssets.length }) }}</t-tag>
        <t-tag v-if="failedDerivedAssetCount" theme="danger" variant="light">{{ t('production.node.assets.failedCount', { count: failedDerivedAssetCount }) }}</t-tag>
      </div>
      <div class="production-asset-list">
        <article v-for="asset in topAssets" :key="asset.id" class="production-asset-row">
          <div class="production-asset-main">
            <img v-if="asset.imageUrl" :src="asset.thumbnailUrl || asset.imageUrl" :alt="asset.name" />
            <span v-else>{{ getAssetTypeLabel(asset.type).slice(0, 1) }}</span>
            <div>
              <strong>{{ asset.name }}</strong>
              <small>{{ getAssetTypeLabel(asset.type) }} / {{ t(`production.status.${asset.imageStatus}`) }}</small>
            </div>
          </div>
          <div class="production-node-actions compact">
            <VtButton size="small" variant="text" @click="emit('createDerivedAsset', asset)">
              <template #icon><AddIcon /></template>
              {{ t('production.node.assets.addDerived') }}
            </VtButton>
            <VtButton size="small" variant="text" :disabled="!canGenerateDerived(asset)" @click="emit('generateDerivedAssets', asset.children.map((item) => item.id))">
              <template #icon><ImageIcon /></template>
              {{ t('production.node.assets.generateDerived') }}
            </VtButton>
          </div>
          <div v-if="asset.children.length" class="production-derived-list">
            <div v-for="child in asset.children" :key="child.id" class="production-derived-row">
              <span>{{ child.name }}</span>
              <t-tag size="small" :theme="getStatusTheme(child.imageStatus)" variant="light">{{ t(`production.status.${child.imageStatus}`) }}</t-tag>
              <t-tooltip v-if="child.imageStatus === PRODUCTION_TASK_STATUS.FAILED" :content="t('production.node.assets.viewError')">
                <button type="button" :aria-label="t('production.node.assets.viewError')" @click="emit('showDetail', t('production.node.assets.errorTitle'), child.imageErrorReason || t('production.emptyText'))">
                  <ErrorCircleIcon />
                </button>
              </t-tooltip>
              <t-tooltip :content="t('production.imageFlow.open')">
                <button type="button" :aria-label="t('production.imageFlow.open')" @click="emit('editImageFlow', 'derivedAsset', child)">
                  <ImageIcon />
                </button>
              </t-tooltip>
              <t-tooltip :content="t('production.delete')">
                <button type="button" :aria-label="t('production.delete')" @click="emit('deleteDerivedAsset', child)">
                  <DeleteIcon />
                </button>
              </t-tooltip>
            </div>
          </div>
        </article>
      </div>
      <VtEmptyState v-if="topAssets.length === 0" size="small" :description="t('production.node.assets.empty')" />
    </section>

    <section v-else-if="nodeType === 'storyboard'" class="production-node-body">
      <div class="production-node-toolbar">
        <t-tag variant="light">{{ t('production.node.storyboard.total', { count: flowData.storyboards.length }) }}</t-tag>
        <t-tag variant="light">{{ t('production.node.storyboard.generated', { count: generatedStoryboardCount }) }}</t-tag>
        <t-tag v-if="selectedStoryboardCount" theme="warning" variant="light">{{ t('production.node.storyboard.selected', { count: selectedStoryboardCount }) }}</t-tag>
        <t-tag v-if="runningStoryboardCount" theme="primary" variant="light">{{ t('production.runningCount', { count: runningStoryboardCount }) }}</t-tag>
        <t-tag v-if="failedStoryboardCount" theme="danger" variant="light">{{ t('production.node.storyboard.failedCount', { count: failedStoryboardCount }) }}</t-tag>
      </div>
      <div class="production-node-actions">
        <VtButton size="small" theme="primary" variant="base" @click="emit('createStoryboard')">
          <template #icon><AddIcon /></template>
          {{ t('production.node.storyboard.create') }}
        </VtButton>
        <VtButton size="small" variant="outline" :disabled="flowData.storyboards.length === 0" @click="emit('previewStoryboards')">
          <template #icon><DownloadIcon /></template>
          {{ t('production.node.storyboard.preview') }}
        </VtButton>
        <VtButton size="small" variant="outline" :disabled="flowData.storyboards.length === 0" @click="isAllStoryboardsSelected ? emit('clearStoryboardSelection') : emit('selectAllStoryboards')">
          {{ isAllStoryboardsSelected ? t('production.node.storyboard.clearSelection') : t('production.node.storyboard.selectAll') }}
        </VtButton>
        <VtButton size="small" variant="outline" :disabled="selectedStoryboardCount === 0" @click="emit('generateStoryboards')">
          <template #icon><ImageIcon /></template>
          {{ t('production.node.storyboard.generateSelected') }}
        </VtButton>
        <VtButton size="small" variant="outline" theme="danger" :disabled="selectedStoryboardCount === 0" @click="emit('batchDeleteStoryboards')">
          <template #icon><DeleteIcon /></template>
          {{ t('production.node.storyboard.batchDelete') }}
        </VtButton>
      </div>
      <div class="production-storyboard-grid">
        <article v-for="storyboard in flowData.storyboards" :key="storyboard.id" class="production-storyboard-card">
          <label class="production-check-row">
            <t-checkbox :model-value="selectedStoryboardIds.includes(storyboard.id)" @change="emit('toggleStoryboard', storyboard.id)" />
            <span>S{{ String(storyboard.index + 1).padStart(2, '0') }}</span>
            <small>{{ t('production.node.storyboard.durationValue', { count: storyboard.duration }) }}</small>
          </label>
          <div class="production-storyboard-thumb" :class="`is-${storyboard.imageStatus}`">
            <img v-if="getStoryboardThumb(storyboard)" :src="getStoryboardThumb(storyboard) || ''" :alt="storyboard.videoDesc" />
            <span v-else-if="storyboard.imageStatus === PRODUCTION_TASK_STATUS.RUNNING">{{ t('production.node.storyboard.generating') }}</span>
            <button v-else-if="storyboard.imageStatus === PRODUCTION_TASK_STATUS.FAILED" class="production-status-link" type="button" @click="showStoryboardError(storyboard)">
              <ErrorCircleIcon />
              {{ t('production.node.storyboard.viewError') }}
            </button>
            <span v-else>{{ t(`production.status.${storyboard.imageStatus}`) }}</span>
          </div>
          <p>{{ previewText(storyboard.videoDesc || storyboard.prompt, 84) }}</p>
          <div class="production-storyboard-meta">
            <span>{{ t('production.node.storyboard.assetCount', { count: storyboard.associatedAssetIds.length }) }}</span>
            <span>{{ storyboard.shouldGenerateImage ? t('production.node.storyboard.shouldGenerateOn') : t('production.node.storyboard.shouldGenerateOff') }}</span>
          </div>
          <div class="production-card-foot">
            <t-tag size="small" :theme="getStatusTheme(storyboard.imageStatus)" variant="light">{{ t(`production.status.${storyboard.imageStatus}`) }}</t-tag>
            <t-tooltip :content="t('production.node.storyboard.prompt')">
              <button type="button" :aria-label="t('production.node.storyboard.prompt')" @click="showStoryboardPrompt(storyboard)"><FileIcon /></button>
            </t-tooltip>
            <t-tooltip v-if="hasGenerationRecord(storyboard.generationMetadata)" :content="t('production.generationRecord.action')">
              <button type="button" :aria-label="t('production.generationRecord.action')" @click="showGenerationRecord(t('production.generationRecord.title'), storyboard.generationMetadata)"><FileIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.imageFlow.open')">
              <button type="button" :aria-label="t('production.imageFlow.open')" @click="emit('editImageFlow', 'storyboard', storyboard)"><ImageIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.node.storyboard.generateOne')">
              <button type="button" :aria-label="t('production.node.storyboard.generateOne')" @click="emit('generateStoryboardOne', storyboard.id)"><PlayCircleIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.node.storyboard.insertAfter')">
              <button type="button" :aria-label="t('production.node.storyboard.insertAfter')" @click="emit('insertStoryboard', storyboard.index)"><AddIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.edit')">
              <button type="button" :aria-label="t('production.edit')" @click="emit('editStoryboard', storyboard)"><EditIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.delete')">
              <button type="button" :aria-label="t('production.delete')" @click="emit('deleteStoryboard', storyboard)"><DeleteIcon /></button>
            </t-tooltip>
          </div>
        </article>
      </div>
      <VtEmptyState v-if="flowData.storyboards.length === 0" size="small" :description="t('production.node.storyboard.empty')" />
    </section>

    <section v-else-if="nodeType === 'workbench'" class="production-node-body">
      <div class="production-node-toolbar">
        <t-tag variant="light">{{ t('production.node.workbench.tracks', { count: flowData.videoTracks.length }) }}</t-tag>
        <t-tag variant="light">{{ t('production.node.workbench.candidates', { count: totalVideoCandidateCount }) }}</t-tag>
        <t-tag variant="light">{{ t('production.workbench.selectedVideos', { count: selectedVideoCount }) }}</t-tag>
        <t-tag v-if="runningTrackCount" theme="primary" variant="light">{{ t('production.runningCount', { count: runningTrackCount }) }}</t-tag>
        <t-tag v-if="failedTrackCount" theme="danger" variant="light">{{ t('production.node.workbench.failedCount', { count: failedTrackCount }) }}</t-tag>
      </div>
      <div class="production-node-actions">
        <VtButton size="small" theme="primary" variant="base" @click="emit('openWorkbench')">
          <template #icon><VideoIcon /></template>
          {{ t('production.node.workbench.open') }}
        </VtButton>
        <VtButton size="small" theme="primary" variant="outline" @click="emit('createTrack')">
          <template #icon><AddIcon /></template>
          {{ t('production.node.workbench.createTrack') }}
        </VtButton>
        <VtButton size="small" variant="outline" :disabled="flowData.videoTracks.length === 0" @click="isAllTracksSelected ? emit('clearTrackSelection') : emit('selectAllTracks')">
          {{ isAllTracksSelected ? t('production.node.workbench.clearSelection') : t('production.node.workbench.selectAll') }}
        </VtButton>
        <VtButton size="small" variant="outline" :disabled="selectedTrackCount === 0" @click="emit('generateVideoPrompts')">
          <template #icon><SaveIcon /></template>
          {{ t('production.node.workbench.promptSelected') }}
        </VtButton>
        <VtButton size="small" variant="outline" :disabled="selectedTrackCount === 0" @click="emit('generateVideos')">
          <template #icon><PlayCircleIcon /></template>
          {{ t('production.node.workbench.videoSelected') }}
        </VtButton>
      </div>
      <div class="production-track-list">
        <article v-for="track in flowData.videoTracks" :key="track.id" class="production-track-card">
          <label class="production-check-row">
            <t-checkbox :model-value="selectedTrackIds.includes(track.id)" @change="emit('toggleTrack', track.id)" />
            <span>{{ t('production.node.workbench.trackName', { index: track.sortIndex + 1 }) }}</span>
          </label>
          <div class="production-track-preview">
            <video v-if="getTrackSelectedVideo(track)?.videoUrl" :src="getTrackSelectedVideo(track)?.videoUrl || ''" muted controls />
            <span v-else>{{ t('production.node.workbench.noSelectedVideo') }}</span>
          </div>
          <p>{{ previewText(track.prompt, 110) }}</p>
          <div class="production-card-foot">
            <t-tag size="small" :theme="getStatusTheme(track.status)" variant="light">{{ t(`production.status.${track.status}`) }}</t-tag>
            <t-tag size="small" variant="light">{{ t('production.node.workbench.candidates', { count: track.videos.length }) }}</t-tag>
            <t-tooltip v-if="hasTrackGenerationRecord(track)" :content="t('production.generationRecord.action')">
              <button type="button" :aria-label="t('production.generationRecord.action')" @click="showTrackGenerationRecord(track)"><FileIcon /></button>
            </t-tooltip>
            <t-tooltip v-if="track.errorReason" :content="t('production.node.workbench.viewError')">
              <button type="button" :aria-label="t('production.node.workbench.viewError')" @click="emit('showDetail', t('production.workbench.promptErrorTitle'), track.errorReason || t('production.emptyText'))"><ErrorCircleIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.edit')">
              <button type="button" :aria-label="t('production.edit')" @click="emit('editTrack', track)"><EditIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.delete')">
              <button type="button" :aria-label="t('production.delete')" @click="emit('deleteTrack', track)"><DeleteIcon /></button>
            </t-tooltip>
          </div>
        </article>
      </div>
      <VtEmptyState v-if="flowData.videoTracks.length === 0" size="small" :description="t('production.node.workbench.empty')" />
    </section>

    <section v-else-if="nodeType === 'export'" class="production-node-body">
      <div class="production-node-toolbar">
        <t-tag :theme="exportReady ? 'success' : 'warning'" variant="light">{{ exportReady ? t('production.node.export.ready') : t('production.node.export.blocked') }}</t-tag>
        <t-tag variant="light">{{ t('production.node.export.selected', { selected: selectedVideoCount, total: flowData.videoTracks.length }) }}</t-tag>
        <t-tag v-if="exportBlockerCount" theme="warning" variant="light">{{ t('production.node.export.blockers', { count: exportBlockerCount }) }}</t-tag>
      </div>
      <div class="production-node-actions">
        <VtButton variant="outline" :disabled="flowData.videoTracks.length === 0" @click="emit('openExportCheck')">
          <template #icon><FileIcon /></template>
          {{ t('production.node.export.check') }}
        </VtButton>
        <VtButton theme="primary" variant="base" :disabled="flowData.videoTracks.length === 0" @click="emit('openExport')">
          <template #icon><DownloadIcon /></template>
          {{ t('production.node.export.open') }}
        </VtButton>
      </div>
      <div class="production-node-meta-grid">
        <span>{{ t('production.node.workbench.tracks', { count: flowData.videoTracks.length }) }}</span>
        <span>{{ t('production.node.workbench.candidates', { count: totalVideoCandidateCount }) }}</span>
      </div>
      <VtEmptyState v-if="flowData.videoTracks.length === 0" size="small" :description="t('production.node.export.empty')" />
    </section>
  </article>
</template>

<style scoped>
.production-node-head > div:first-child {
  overflow: hidden;
}

.production-node-head strong,
.production-node-head span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.production-node-head strong {
  white-space: nowrap;
}

.production-node-head-actions {
  flex: 0 0 auto;
  align-self: flex-start;
  justify-content: flex-end;
}

.production-node-actions.is-icon-only {
  gap: 6px;
}

.production-node-head-actions :deep(.vt-button) {
  width: 32px;
  height: 32px;
  padding: 0;
}
</style>
