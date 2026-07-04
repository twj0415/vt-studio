<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position } from '@vue-flow/core';
import { AddIcon, DeleteIcon, EditIcon, ErrorCircleIcon, FileIcon, ImageIcon, PlayCircleIcon, SaveIcon, VideoIcon } from 'tdesign-icons-vue-next';
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
  editText: [nodeType: 'scriptPlan' | 'storyboardTable'];
  saveWorkspace: [];
  createStoryboard: [];
  editStoryboard: [storyboard: ProductionStoryboardItem];
  deleteStoryboard: [storyboard: ProductionStoryboardItem];
  toggleStoryboard: [storyboardId: number];
  selectAllStoryboards: [];
  clearStoryboardSelection: [];
  batchDeleteStoryboards: [];
  generateStoryboards: [];
  showDetail: [title: string, content: string];
  createTrack: [];
  editTrack: [track: ProductionVideoTrackItem];
  deleteTrack: [track: ProductionVideoTrackItem];
  toggleTrack: [trackId: number];
  generateVideoPrompts: [];
  generateVideos: [];
  openWorkbench: [];
  createDerivedAsset: [asset: ProductionAssetSummary];
  deleteDerivedAsset: [asset: ProductionAssetSummary];
  generateDerivedAssets: [assetIds: number[]];
  editImageFlow: [ownerType: 'storyboard' | 'derivedAsset', item: ProductionStoryboardItem | ProductionAssetSummary];
}>();

const { t } = useI18n();

const nodeTitle = computed(() => t(`production.node.${props.nodeType}.title`));
const nodeHint = computed(() => t(`production.node.${props.nodeType}.hint`));
const scriptPreview = computed(() => previewText(props.flowData.script, 420));
const scriptPlanPreview = computed(() => previewText(props.flowData.scriptPlan, 260));
const storyboardTablePreview = computed(() => previewText(props.flowData.storyboardTable, 260));
const topAssets = computed(() => props.flowData.assets);
const derivedAssets = computed(() => props.flowData.assets.flatMap((asset) => asset.children));
const runningStoryboardCount = computed(() => props.runningStoryboardIds?.length ?? 0);
const runningTrackCount = computed(() => props.runningTrackIds?.length ?? 0);
const selectedStoryboardCount = computed(() => props.selectedStoryboardIds.length);
const selectedTrackCount = computed(() => props.selectedTrackIds.length);
const failedStoryboardCount = computed(() => props.flowData.storyboards.filter((storyboard) => storyboard.imageStatus === PRODUCTION_TASK_STATUS.FAILED).length);
const generatedStoryboardCount = computed(() => props.flowData.storyboards.filter((storyboard) => storyboard.imageUrl).length);
const isAllStoryboardsSelected = computed(() => props.flowData.storyboards.length > 0 && props.flowData.storyboards.every((storyboard) => props.selectedStoryboardIds.includes(storyboard.id)));
const totalVideoCandidateCount = computed(() => props.flowData.videoTracks.reduce((total, track) => total + track.videos.length, 0));
const selectedVideoCount = computed(() => props.flowData.videoTracks.filter((track) => track.selectedVideoId).length);

function previewText(value: string, limit: number): string {
  const text = value.trim();
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
  return storyboard.imageUrl;
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
  <article class="production-flow-node" :class="`production-flow-node-${nodeType}`">
    <Handle v-if="handleIds.target" class="production-flow-handle target" type="target" :id="handleIds.target" :position="Position.Left" />
    <Handle v-if="handleIds.source" class="production-flow-handle source" type="source" :id="handleIds.source" :position="Position.Right" />
    <Handle v-if="handleIds.assets" class="production-flow-handle source is-assets" type="source" :id="handleIds.assets" :position="Position.Bottom" />

    <header class="production-node-head production-node-drag-handle">
      <div>
        <strong>{{ nodeTitle }}</strong>
        <span>{{ nodeHint }}</span>
      </div>
      <t-tag size="small" variant="light">{{ t('production.flow.moduleTag') }}</t-tag>
    </header>

    <section v-if="nodeType === 'script'" class="production-node-body">
      <pre class="production-node-text">{{ scriptPreview }}</pre>
      <div class="production-node-meta-grid">
        <span>{{ t('production.node.script.chars', { count: flowData.script.length }) }}</span>
        <span>{{ t('production.node.script.assets', { count: topAssets.length }) }}</span>
      </div>
    </section>

    <section v-else-if="nodeType === 'scriptPlan'" class="production-node-body">
      <pre class="production-node-text compact">{{ scriptPlanPreview }}</pre>
      <div class="production-node-actions">
        <t-button size="small" variant="outline" @click="emit('editText', 'scriptPlan')">
          <template #icon><EditIcon /></template>
          {{ t('production.edit') }}
        </t-button>
        <t-button size="small" theme="primary" :loading="saving" @click="emit('saveWorkspace')">
          <template #icon><SaveIcon /></template>
          {{ t('production.save') }}
        </t-button>
      </div>
    </section>

    <section v-else-if="nodeType === 'storyboardTable'" class="production-node-body">
      <pre class="production-node-text compact">{{ storyboardTablePreview }}</pre>
      <div class="production-node-actions">
        <t-button size="small" variant="outline" @click="emit('editText', 'storyboardTable')">
          <template #icon><EditIcon /></template>
          {{ t('production.edit') }}
        </t-button>
        <t-button size="small" theme="primary" :loading="saving" @click="emit('saveWorkspace')">
          <template #icon><SaveIcon /></template>
          {{ t('production.save') }}
        </t-button>
      </div>
    </section>

    <section v-else-if="nodeType === 'assets'" class="production-node-body">
      <div class="production-node-toolbar">
        <t-tag variant="light">{{ t('production.node.assets.total', { count: topAssets.length }) }}</t-tag>
        <t-tag variant="light">{{ t('production.node.assets.derived', { count: derivedAssets.length }) }}</t-tag>
      </div>
      <div class="production-asset-list">
        <article v-for="asset in topAssets" :key="asset.id" class="production-asset-row">
          <div class="production-asset-main">
            <img v-if="asset.imageUrl" :src="asset.imageUrl" :alt="asset.name" />
            <span v-else>{{ getAssetTypeLabel(asset.type).slice(0, 1) }}</span>
            <div>
              <strong>{{ asset.name }}</strong>
              <small>{{ getAssetTypeLabel(asset.type) }} / {{ t(`production.status.${asset.imageStatus}`) }}</small>
            </div>
          </div>
          <div class="production-node-actions compact">
            <t-button size="small" variant="text" @click="emit('createDerivedAsset', asset)">
              <template #icon><AddIcon /></template>
              {{ t('production.node.assets.addDerived') }}
            </t-button>
            <t-button size="small" variant="text" :disabled="!canGenerateDerived(asset)" @click="emit('generateDerivedAssets', asset.children.map((item) => item.id))">
              <template #icon><ImageIcon /></template>
              {{ t('production.node.assets.generateDerived') }}
            </t-button>
          </div>
          <div v-if="asset.children.length" class="production-derived-list">
            <div v-for="child in asset.children" :key="child.id" class="production-derived-row">
              <span>{{ child.name }}</span>
              <t-tag size="small" :theme="getStatusTheme(child.imageStatus)" variant="light">{{ t(`production.status.${child.imageStatus}`) }}</t-tag>
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
      <t-empty v-if="topAssets.length === 0" :description="t('production.node.assets.empty')" />
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
        <t-button size="small" theme="primary" @click="emit('createStoryboard')">
          <template #icon><AddIcon /></template>
          {{ t('production.node.storyboard.create') }}
        </t-button>
        <t-button size="small" variant="outline" :disabled="flowData.storyboards.length === 0" @click="isAllStoryboardsSelected ? emit('clearStoryboardSelection') : emit('selectAllStoryboards')">
          {{ isAllStoryboardsSelected ? t('production.node.storyboard.clearSelection') : t('production.node.storyboard.selectAll') }}
        </t-button>
        <t-button size="small" variant="outline" :disabled="selectedStoryboardCount === 0" @click="emit('generateStoryboards')">
          <template #icon><ImageIcon /></template>
          {{ t('production.node.storyboard.generateSelected') }}
        </t-button>
        <t-button size="small" variant="outline" theme="danger" :disabled="selectedStoryboardCount === 0" @click="emit('batchDeleteStoryboards')">
          <template #icon><DeleteIcon /></template>
          {{ t('production.node.storyboard.batchDelete') }}
        </t-button>
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
            <t-tooltip :content="t('production.edit')">
              <button type="button" :aria-label="t('production.edit')" @click="emit('editStoryboard', storyboard)"><EditIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.delete')">
              <button type="button" :aria-label="t('production.delete')" @click="emit('deleteStoryboard', storyboard)"><DeleteIcon /></button>
            </t-tooltip>
          </div>
        </article>
      </div>
      <t-empty v-if="flowData.storyboards.length === 0" :description="t('production.node.storyboard.empty')" />
    </section>

    <section v-else class="production-node-body">
      <div class="production-node-toolbar">
        <t-tag variant="light">{{ t('production.node.workbench.tracks', { count: flowData.videoTracks.length }) }}</t-tag>
        <t-tag variant="light">{{ t('production.node.workbench.candidates', { count: totalVideoCandidateCount }) }}</t-tag>
        <t-tag variant="light">{{ t('production.workbench.selectedVideos', { count: selectedVideoCount }) }}</t-tag>
        <t-tag v-if="runningTrackCount" theme="primary" variant="light">{{ t('production.runningCount', { count: runningTrackCount }) }}</t-tag>
      </div>
      <div class="production-node-actions">
        <t-button size="small" theme="primary" @click="emit('openWorkbench')">
          <template #icon><VideoIcon /></template>
          {{ t('production.node.workbench.open') }}
        </t-button>
        <t-button size="small" theme="primary" @click="emit('createTrack')">
          <template #icon><AddIcon /></template>
          {{ t('production.node.workbench.createTrack') }}
        </t-button>
        <t-button size="small" variant="outline" :disabled="selectedTrackCount === 0" @click="emit('generateVideoPrompts')">
          <template #icon><SaveIcon /></template>
          {{ t('production.node.workbench.promptSelected') }}
        </t-button>
        <t-button size="small" variant="outline" :disabled="selectedTrackCount === 0" @click="emit('generateVideos')">
          <template #icon><PlayCircleIcon /></template>
          {{ t('production.node.workbench.videoSelected') }}
        </t-button>
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
            <t-tooltip :content="t('production.edit')">
              <button type="button" :aria-label="t('production.edit')" @click="emit('editTrack', track)"><EditIcon /></button>
            </t-tooltip>
            <t-tooltip :content="t('production.delete')">
              <button type="button" :aria-label="t('production.delete')" @click="emit('deleteTrack', track)"><DeleteIcon /></button>
            </t-tooltip>
          </div>
        </article>
      </div>
      <t-empty v-if="flowData.videoTracks.length === 0" :description="t('production.node.workbench.empty')" />
    </section>
  </article>
</template>
