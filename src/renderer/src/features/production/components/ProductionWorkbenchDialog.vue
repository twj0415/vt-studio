<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import {
  AddIcon,
  CheckIcon,
  DeleteIcon,
  DownloadIcon,
  ErrorCircleIcon,
  FileExportIcon,
  FolderOpenIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  SaveIcon,
  VideoIcon,
} from 'tdesign-icons-vue-next';
import {
  PRODUCTION_TASK_STATUS,
  type ProductionAssetSummary,
  type ProductionReferenceFileType,
  type ProductionReferenceInput,
  type ProductionReferenceSource,
  type ProductionStoryboardItem,
  type ProductionVideoItem,
  type ProductionVideoModeValue,
  type ProductionVideoTrackItem,
} from '@shared/types/production';
import {
  COMMON_VIDEO_DURATIONS,
  COMMON_VIDEO_RESOLUTIONS,
  DEPENDENCY_STATUSES,
  type DependencyStatus,
} from '@shared/constants/dictionaries';
import {
  getVideoModeReferenceLimits,
  parseVideoModeKey,
  serializeVideoMode,
  VIDEO_MODE_PRESETS,
} from '@shared/constants/model-capabilities';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import type { ExportCreateJianyingDraftResult, ExportStoryboardImagesResult, ExportValidationFailure } from '@shared/types/export';
import type { ModelCapabilityMatrixItem } from '@shared/types/model-capability';

type WorkbenchTab = 'preview' | 'generate' | 'editor';

interface WorkbenchReferenceOption {
  key: string;
  id: number | null;
  source: ProductionReferenceSource;
  fileType: ProductionReferenceFileType;
  title: string;
  subtitle: string;
  url: string | null;
  prompt: string;
}

interface WorkbenchExportBlocker {
  trackId: number;
  trackLabel: string;
  reasonKey: 'missingSelection' | 'selectedNotReady' | 'missingUrl' | 'dependencyInvalid';
  message: string;
}

const POLL_INTERVAL = 3000;
const DEFAULT_MODEL = '';
const DEFAULT_RESOLUTION = COMMON_VIDEO_RESOLUTIONS[1] ?? COMMON_VIDEO_RESOLUTIONS[0];
const DEFAULT_DURATION = Number(COMMON_VIDEO_DURATIONS[1] ?? COMMON_VIDEO_DURATIONS[0]);
const DEFAULT_VIDEO_MODE = VIDEO_MODE_PRESETS[0]?.value ?? 'singleImage';
const VIDEO_MODE_LABEL_KEYS: Record<string, string> = {
  singleImage: 'singleImage',
  startEndRequired: 'startEndRequired',
  endFrameOptional: 'endFrameOptional',
  startFrameOptional: 'startFrameOptional',
  text: 'text',
  'imageReference:3': 'imageReference',
  'videoReference:1,imageReference:2': 'videoImageReference',
  'audioReference:1,imageReference:1': 'audioImageReference',
  'textReference:1,imageReference:1': 'textImageReference',
};

const props = defineProps<{
  visible: boolean;
  projectId: number;
  contentId: number | null;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  saved: [];
  showDetail: [title: string, content: string];
}>();

const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const promptGenerating = ref(false);
const videoGenerating = ref(false);
const videoDeleting = ref(false);
const storyboardExporting = ref(false);
const jianyingExporting = ref(false);
const activeTab = ref<WorkbenchTab>('generate');
const tracks = ref<ProductionVideoTrackItem[]>([]);
const storyboards = ref<ProductionStoryboardItem[]>([]);
const assets = ref<ProductionAssetSummary[]>([]);
const currentTrackId = ref<number | null>(null);
const selectedTrackIds = ref<number[]>([]);
const selectedPreviewStoryboardIds = ref<number[]>([]);
const previewOrder = ref<number[]>([]);
const currentPreviewStoryboardId = ref<number | null>(null);
const previewPlaying = ref(false);
const previewElapsed = ref(0);
const referenceDrafts = ref<Record<number, ProductionReferenceInput[]>>({});
const previewVideo = ref<ProductionVideoItem | null>(null);
const previewVideoVisible = ref(false);
const draftDialogVisible = ref(false);
const exportCheckVisible = ref(false);
const exportResultVisible = ref(false);
const exportResultTitle = ref('');
const exportResultPath = ref<string | null>(null);
const exportResultFailures = ref<ExportValidationFailure[]>([]);
const exportResultTaskId = ref<number | null>(null);
const exportResultSummary = ref<ExportCreateJianyingDraftResult['summary'] | null>(null);
const videoCapabilities = ref<ModelCapabilityMatrixItem[]>([]);
const projectVideoModelId = ref('');
const projectVideoModelLabel = ref('');
const projectVideoMode = ref('');

const trackForm = reactive<{
  prompt: string;
  duration: number;
  mode: string;
  model: string;
  resolution: string;
  audioEnabled: boolean;
  storyboardIds: number[];
}>({
  prompt: '',
  duration: DEFAULT_DURATION,
  mode: DEFAULT_VIDEO_MODE,
  model: DEFAULT_MODEL,
  resolution: DEFAULT_RESOLUTION,
  audioEnabled: false,
  storyboardIds: [] as number[],
});
const draftForm = reactive({
  draftName: '',
  copyAssets: true,
});

let previewTimer: number | null = null;
let videoPromptPollTimer: number | null = null;
let videoPollTimer: number | null = null;

const tabOptions = computed<Array<{ label: string; value: WorkbenchTab }>>(() => [
  { label: t('production.workbench.tabs.preview'), value: 'preview' },
  { label: t('production.workbench.tabs.generate'), value: 'generate' },
  { label: t('production.workbench.tabs.editor'), value: 'editor' },
]);
const currentTrack = computed(() => tracks.value.find((track) => track.id === currentTrackId.value) ?? tracks.value[0] ?? null);
const selectedTrackCount = computed(() => selectedTrackIds.value.length);
const isAllTracksSelected = computed(() => tracks.value.length > 0 && tracks.value.every((track) => selectedTrackIds.value.includes(track.id)));
const sortedPreviewStoryboards = computed(() => {
  const byId = new Map(storyboards.value.map((storyboard) => [storyboard.id, storyboard]));
  const ordered = previewOrder.value.map((id) => byId.get(id)).filter((item): item is ProductionStoryboardItem => Boolean(item));
  const missing = storyboards.value.filter((storyboard) => !previewOrder.value.includes(storyboard.id));
  return [...ordered, ...missing];
});
const currentPreviewStoryboard = computed(() => sortedPreviewStoryboards.value.find((storyboard) => storyboard.id === currentPreviewStoryboardId.value) ?? sortedPreviewStoryboards.value[0] ?? null);
const previewTotalDuration = computed(() => sortedPreviewStoryboards.value.reduce((total, storyboard) => total + Math.max(1, storyboard.duration), 0));
const previewProgressPercent = computed(() => {
  if (!previewTotalDuration.value) {
    return 0;
  }
  return Math.min(100, Math.max(0, (previewElapsed.value / previewTotalDuration.value) * 100));
});
const storyboardOptions = computed(() => storyboards.value.map((storyboard) => ({
  label: storyboardLabel(storyboard),
  value: storyboard.id,
})));
const referenceOptions = computed<WorkbenchReferenceOption[]>(() => [
  ...storyboards.value.map((storyboard) => ({
    key: `storyboard-${storyboard.id}`,
    id: storyboard.id,
    source: 'storyboard' as const,
    fileType: 'image' as const,
    title: storyboardLabel(storyboard),
    subtitle: t('production.workbench.reference.storyboard'),
    url: storyboard.imageUrl,
    prompt: storyboard.prompt || storyboard.videoDesc,
  })),
  ...flattenAssets(assets.value).map((asset) => ({
    key: `assets-${asset.id}`,
    id: asset.id,
    source: 'assets' as const,
    fileType: asset.type === 'audio' ? 'audio' as const : asset.type === 'clip' ? 'video' as const : 'image' as const,
    title: asset.name,
    subtitle: `${t(`production.assetType.${asset.type}`)} / ${asset.description || t('production.emptyText')}`,
    url: asset.imageUrl,
    prompt: asset.prompt || asset.description,
  })),
]);
const availableReferenceOptions = computed(() => {
  const requirement = getModeRequirement(trackForm.mode);
  const allowed = new Set<ProductionReferenceFileType>();
  if (requirement.image > 0 || requirement.startEnd) {
    allowed.add('image');
  }
  if (requirement.video > 0) {
    allowed.add('video');
  }
  if (requirement.audio > 0) {
    allowed.add('audio');
  }
  if (requirement.text > 0) {
    allowed.add('text');
  }
  return referenceOptions.value.filter((option) => allowed.has(option.fileType));
});
const currentReferences = computed(() => (currentTrack.value ? referenceDrafts.value[currentTrack.value.id] ?? [] : []));
const selectedReferenceKeys = computed({
  get() {
    return currentReferences.value.map((reference) => `${reference.source}-${reference.id ?? reference.index ?? 'manual'}`);
  },
  set(keys: string[]) {
    if (!currentTrack.value) {
      return;
    }
    referenceDrafts.value = {
      ...referenceDrafts.value,
      [currentTrack.value.id]: keys
        .map((key, index) => {
          const option = referenceOptions.value.find((item) => item.key === key);
          if (!option) {
            return null;
          }
          return optionToReference(option, index);
        })
        .filter((item): item is ProductionReferenceInput => Boolean(item)),
    };
  },
});
const selectedVideoCount = computed(() => tracks.value.filter((track) => track.selectedVideoId).length);
const exportBlockers = computed<WorkbenchExportBlocker[]>(() => tracks.value.flatMap((track): WorkbenchExportBlocker[] => {
  const trackLabel = t('production.node.workbench.trackName', { index: track.sortIndex + 1 });
  const selectedVideo = getTrackSelectedVideo(track);

  if (!track.selectedVideoId || !selectedVideo) {
    return [{
      trackId: track.id,
      trackLabel,
      reasonKey: 'missingSelection' as const,
      message: t('production.workbench.exportBlockerReason.missingSelection'),
    }];
  }

  if (isDependencyInvalid(track.dependencyStatus)) {
    return [{
      trackId: track.id,
      trackLabel,
      reasonKey: 'dependencyInvalid' as const,
      message: dependencyStatusMessage(track.dependencyStatus, track.dependencyReason),
    }];
  }

  if (isDependencyInvalid(selectedVideo.dependencyStatus)) {
    return [{
      trackId: track.id,
      trackLabel,
      reasonKey: 'dependencyInvalid' as const,
      message: dependencyStatusMessage(selectedVideo.dependencyStatus, selectedVideo.dependencyReason),
    }];
  }

  if (selectedVideo.status !== PRODUCTION_TASK_STATUS.SUCCEEDED) {
    return [{
      trackId: track.id,
      trackLabel,
      reasonKey: 'selectedNotReady' as const,
      message: t('production.workbench.exportBlockerReason.selectedNotReady'),
    }];
  }

  if (!selectedVideo.videoUrl) {
    return [{
      trackId: track.id,
      trackLabel,
      reasonKey: 'missingUrl' as const,
      message: t('production.workbench.exportBlockerReason.missingUrl'),
    }];
  }

  return [];
}));
const exportReady = computed(() => tracks.value.length > 0 && exportBlockers.value.length === 0);
const hasExportFailures = computed(() => exportResultFailures.value.length > 0);
const runningPromptTrackIds = computed(() => tracks.value.filter((track) => track.status === PRODUCTION_TASK_STATUS.RUNNING).map((track) => track.id));
const runningVideoIds = computed(() => tracks.value.flatMap((track) => track.videos).filter((video) => video.status === PRODUCTION_TASK_STATUS.RUNNING).map((video) => video.id));
const currentSelectedVideo = computed(() => currentTrack.value?.videos.find((video) => video.id === currentTrack.value?.selectedVideoId) ?? null);
const editorStoryboardMedia = computed(() => storyboards.value.filter((storyboard) => storyboard.imageUrl));
const editorAssetMedia = computed(() => flattenAssets(assets.value).filter((asset) => asset.imageUrl || asset.type === 'clip' || asset.type === 'audio'));
const editorSelectedVideoMedia = computed(() => tracks.value
  .map((track) => ({
    track,
    video: getTrackSelectedVideo(track),
  }))
  .filter((item): item is { track: ProductionVideoTrackItem; video: ProductionVideoItem } => Boolean(item.video)));
const editorTimelineRows = computed(() => tracks.value.map((track) => {
  const selectedVideo = getTrackSelectedVideo(track);
  return {
    track,
    selectedVideo,
    storyboards: track.storyboardIds
      .map((storyboardId) => storyboards.value.find((storyboard) => storyboard.id === storyboardId))
      .filter((storyboard): storyboard is ProductionStoryboardItem => Boolean(storyboard)),
    duration: selectedVideo?.duration ?? track.duration,
    isReady: Boolean(selectedVideo?.videoUrl && selectedVideo.status === PRODUCTION_TASK_STATUS.SUCCEEDED),
  };
}));
const editorReadyTrackCount = computed(() => editorTimelineRows.value.filter((row) => row.isReady).length);
const selectedStoryboardTotalDuration = computed(() => selectedPreviewStoryboardIds.value.reduce((total, id) => {
  const storyboard = storyboards.value.find((item) => item.id === id);
  return total + (storyboard?.duration ?? 0);
}, 0));
const effectiveVideoModelId = computed(() => trackForm.model || projectVideoModelId.value);
const effectiveVideoCapabilities = computed(() => {
  if (!effectiveVideoModelId.value) {
    return videoCapabilities.value;
  }

  return videoCapabilities.value.filter((item) => item.modelId === effectiveVideoModelId.value);
});
const selectedModeCapability = computed(() => effectiveVideoCapabilities.value.find((item) => item.modeKey === trackForm.mode) ?? null);
const modelOptions = computed<Array<{ label: string; value: string; content?: string }>>(() => {
  const options = new Map<string, { label: string; value: string; content?: string }>();

  if (projectVideoModelId.value) {
    options.set('', {
      label: projectVideoModelLabel.value ? t('production.workbench.projectDefaultModelWithName', { model: projectVideoModelLabel.value }) : t('production.workbench.projectDefaultModel'),
      value: '',
      content: projectVideoMode.value ? t('production.workbench.projectDefaultMode', { mode: getModeLabel(projectVideoMode.value) }) : undefined,
    });
  } else {
    options.set('', {
      label: t('production.workbench.projectDefaultModel'),
      value: '',
      content: t('production.workbench.projectDefaultMissing'),
    });
  }

  for (const item of videoCapabilities.value) {
    if (!options.has(item.modelId)) {
      options.set(item.modelId, {
        label: `${item.connectionName} / ${item.modelDisplayName}`,
        value: item.modelId,
        content: item.statusText,
      });
    }
  }

  return [...options.values()];
});
const availableModeKeys = computed(() => {
  const capabilityKeys = effectiveVideoCapabilities.value.map((item) => item.modeKey).filter(Boolean);
  const keys = capabilityKeys.length ? capabilityKeys : projectVideoMode.value ? [projectVideoMode.value] : VIDEO_MODE_PRESETS.map((item) => item.value);
  return [...new Set(keys)];
});
const modeOptions = computed<Array<{ label: string; value: string; content: string }>>(() => availableModeKeys.value.map((value) => ({
  label: getModeLabel(value),
  value,
  content: getModeHelp(value),
})));
const currentModeOption = computed(() => modeOptions.value.find((item) => item.value === trackForm.mode) ?? null);
const resolutionValues = computed(() => {
  const values = selectedModeCapability.value?.resolutionOptions.filter(Boolean) ?? [];
  return values.length ? values : [...COMMON_VIDEO_RESOLUTIONS];
});
const durationValues = computed(() => {
  const values = selectedModeCapability.value?.durationOptions.filter((value) => Number.isFinite(value) && value > 0) ?? [];
  return values.length ? values : [...COMMON_VIDEO_DURATIONS];
});
const resolutionOptions = computed(() => resolutionValues.value.map((value) => ({ label: value, value })));
const durationOptions = computed(() => durationValues.value.map((value) => ({ label: t('production.workbench.seconds', { count: value }), value })));
const audioRequired = computed(() => selectedModeCapability.value?.audioSupport === 'required' || getModeRequirement(trackForm.mode).audio > 0);
const audioDisabled = computed(() => selectedModeCapability.value?.audioSupport === 'none');

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

function formatMode(mode: ProductionVideoModeValue | null): string {
  if (!mode) {
    return t('production.workbench.mode.unset');
  }
  return getModeLabel(serializeVideoMode(mode));
}

function formatExportSeconds(durationMs: number): string {
  return (Math.max(0, durationMs) / 1000).toFixed(1);
}

function failureTrackLabel(failure: ExportValidationFailure): string {
  return failure.trackId ? String(failure.trackId) : t('production.emptyText');
}

function failureReasonLabel(reason: ExportValidationFailure['reason']): string {
  return t(`production.workbench.exportFailureReason.${reason}`);
}

function storyboardLabel(storyboard: ProductionStoryboardItem): string {
  return `S${String(storyboard.index + 1).padStart(2, '0')} / ${previewText(storyboard.videoDesc || storyboard.prompt, 52)}`;
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

function isDependencyInvalid(status: DependencyStatus | null | undefined): boolean {
  return Boolean(status && status !== DEPENDENCY_STATUSES.VALID);
}

function getDependencyTheme(status: DependencyStatus | null | undefined): 'success' | 'warning' | 'danger' | 'default' {
  if (!status || status === DEPENDENCY_STATUSES.VALID) {
    return 'success';
  }
  if (status === DEPENDENCY_STATUSES.MISSING_DEPENDENCY || status === DEPENDENCY_STATUSES.BLOCKED) {
    return 'danger';
  }
  if (status === DEPENDENCY_STATUSES.STALE || status === DEPENDENCY_STATUSES.NEEDS_REVIEW) {
    return 'warning';
  }
  return 'default';
}

function dependencyStatusMessage(status: DependencyStatus | null | undefined, reason: string | null | undefined): string {
  if (!status) {
    return t('production.emptyText');
  }
  const label = t(`production.dependencyStatus.${status}`);
  return reason ? `${label}：${reason}` : label;
}

function getTrackThumb(track: ProductionVideoTrackItem): string | null {
  const selectedVideo = track.videos.find((video) => video.id === track.selectedVideoId);
  if (selectedVideo?.videoUrl) {
    return selectedVideo.videoUrl;
  }
  const storyboard = storyboards.value.find((item) => track.storyboardIds.includes(item.id) && item.imageUrl);
  return storyboard?.imageUrl ?? null;
}

function getTrackSelectedVideo(track: ProductionVideoTrackItem): ProductionVideoItem | null {
  return track.videos.find((video) => video.id === track.selectedVideoId) ?? null;
}

function getModeLabel(modeKey: string): string {
  const labelKey = VIDEO_MODE_LABEL_KEYS[modeKey];
  return labelKey ? t(`production.workbench.mode.${labelKey}`) : modeKey || t('production.workbench.mode.unset');
}

function getModeHelp(modeKey: string): string {
  const labelKey = VIDEO_MODE_LABEL_KEYS[modeKey];
  return labelKey ? t(`production.workbench.modeHelp.${labelKey}`) : t('production.workbench.modeHelp.generic', { mode: modeKey });
}

function normalizeModeValue(value: string): ProductionVideoModeValue {
  const parsed = parseVideoModeKey(value);
  return Array.isArray(parsed) ? [...parsed] : parsed;
}

function modeToPreset(value: ProductionVideoModeValue | null): string {
  return serializeVideoMode(value) || DEFAULT_VIDEO_MODE;
}

function getModeRequirement(mode: string) {
  return getVideoModeReferenceLimits(mode);
}

function getFallbackMode(): string {
  if (projectVideoMode.value && availableModeKeys.value.includes(projectVideoMode.value)) {
    return projectVideoMode.value;
  }

  return modeOptions.value[0]?.value ?? DEFAULT_VIDEO_MODE;
}

function ensureTrackFormSelections(): void {
  const modeKeys = modeOptions.value.map((item) => item.value);
  if (!modeKeys.includes(trackForm.mode)) {
    trackForm.mode = getFallbackMode();
  }

  if (!resolutionValues.value.includes(trackForm.resolution)) {
    trackForm.resolution = resolutionValues.value[0] ?? DEFAULT_RESOLUTION;
  }

  if (!durationValues.value.includes(trackForm.duration)) {
    trackForm.duration = Number(durationValues.value[0] ?? DEFAULT_DURATION);
  }

  if (audioDisabled.value) {
    trackForm.audioEnabled = false;
  } else if (audioRequired.value) {
    trackForm.audioEnabled = true;
  }
}

function countReferencesByType(references: ProductionReferenceInput[], type: ProductionReferenceFileType): number {
  return references.filter((reference) => reference.fileType === type && (reference.url || reference.prompt || reference.id)).length;
}

function validateReferences(trackIds: number[]): boolean {
  for (const trackId of trackIds) {
    const track = tracks.value.find((item) => item.id === trackId);
    if (!track) {
      continue;
    }
    const mode = trackForm.mode;
    const requirement = getModeRequirement(mode);
    const references = referenceDrafts.value[trackId] ?? [];
    if (!track.prompt.trim()) {
      MessagePlugin.warning(t('production.workbench.promptRequired'));
      return false;
    }
    if (requirement.image > 0 && countReferencesByType(references, 'image') < requirement.image) {
      MessagePlugin.warning(t('production.workbench.referenceRequired', { count: requirement.image, type: t('production.workbench.reference.image') }));
      return false;
    }
    if (requirement.video > 0 && countReferencesByType(references, 'video') < requirement.video) {
      MessagePlugin.warning(t('production.workbench.referenceRequired', { count: requirement.video, type: t('production.workbench.reference.video') }));
      return false;
    }
    if (requirement.audio > 0 && countReferencesByType(references, 'audio') < requirement.audio) {
      MessagePlugin.warning(t('production.workbench.referenceRequired', { count: requirement.audio, type: t('production.workbench.reference.audio') }));
      return false;
    }
  }
  return true;
}

function optionToReference(option: WorkbenchReferenceOption, index: number): ProductionReferenceInput {
  return {
    id: option.id,
    source: option.source,
    fileType: option.fileType,
    url: option.url,
    prompt: option.prompt,
    index,
  };
}

function syncTrackForm(track: ProductionVideoTrackItem | null): void {
  if (!track) {
    trackForm.prompt = '';
    trackForm.duration = DEFAULT_DURATION;
    trackForm.mode = getFallbackMode();
    trackForm.model = DEFAULT_MODEL;
    trackForm.resolution = DEFAULT_RESOLUTION;
    trackForm.audioEnabled = false;
    trackForm.storyboardIds = [];
    ensureTrackFormSelections();
    return;
  }
  trackForm.prompt = track.prompt;
  trackForm.duration = track.duration || DEFAULT_DURATION;
  trackForm.mode = modeToPreset(track.mode);
  trackForm.storyboardIds = [...track.storyboardIds];
  ensureTrackFormSelections();
  if (!referenceDrafts.value[track.id]) {
    const seeded = buildDefaultReferences(track);
    referenceDrafts.value = {
      ...referenceDrafts.value,
      [track.id]: seeded,
    };
  }
}

function buildDefaultReferences(track: ProductionVideoTrackItem): ProductionReferenceInput[] {
  const firstVideoReferences = track.videos[0]?.references ?? [];
  if (firstVideoReferences.length) {
    return firstVideoReferences;
  }
  const mode = modeToPreset(track.mode);
  if (mode === 'text') {
    return [];
  }
  return track.storyboardIds
    .map<ProductionReferenceInput | null>((storyboardId, index) => {
      const storyboard = storyboards.value.find((item) => item.id === storyboardId);
      if (!storyboard) {
        return null;
      }
      return {
        id: storyboard.id,
        source: 'storyboard' as const,
        fileType: 'image' as const,
        url: storyboard.imageUrl,
        prompt: storyboard.prompt || storyboard.videoDesc,
        index,
      };
    })
    .filter((item): item is ProductionReferenceInput => item !== null)
    .slice(0, getModeRequirement(mode).image || undefined);
}

function updateTrackList(nextTracks: ProductionVideoTrackItem[]): void {
  tracks.value = nextTracks;
  selectedTrackIds.value = selectedTrackIds.value.filter((id) => nextTracks.some((track) => track.id === id));
  if (!currentTrackId.value || !nextTracks.some((track) => track.id === currentTrackId.value)) {
    currentTrackId.value = nextTracks[0]?.id ?? null;
  }
  syncTrackForm(currentTrack.value);
}

async function loadVideoCapabilities(): Promise<void> {
  const response = await window.vtStudio.settings.resource.get();
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    videoCapabilities.value = [];
    return;
  }

  videoCapabilities.value = response.data.capabilityMatrix.filter((item) => item.modelType === 'video' && item.status === 'ready');
  ensureTrackFormSelections();
}

async function loadProjectVideoDefaults(): Promise<void> {
  const response = await window.vtStudio.project.getPageState();
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    projectVideoModelId.value = '';
    projectVideoModelLabel.value = '';
    projectVideoMode.value = '';
    return;
  }

  const project = response.data.projects.find((item) => item.id === props.projectId);
  projectVideoModelId.value = project?.videoModelId ?? '';
  projectVideoModelLabel.value = project?.videoModelLabel ?? '';
  projectVideoMode.value = project?.videoMode ?? '';
  ensureTrackFormSelections();
}

async function loadWorkbench(asRefresh = false): Promise<void> {
  if (!props.visible || !props.projectId || !props.contentId) {
    return;
  }
  if (!asRefresh) {
    loading.value = true;
  }
  try {
    const response = await window.vtStudio.production.workbench.get({
      projectId: props.projectId,
      contentId: props.contentId,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    storyboards.value = response.data.storyboards;
    assets.value = response.data.assets;
    previewOrder.value = response.data.storyboards.map((storyboard) => storyboard.id);
    if (!currentPreviewStoryboardId.value) {
      currentPreviewStoryboardId.value = response.data.storyboards[0]?.id ?? null;
    }
    updateTrackList(response.data.tracks);
    schedulePolls();
  } finally {
    loading.value = false;
  }
}

function toggleTrack(trackId: number): void {
  selectedTrackIds.value = selectedTrackIds.value.includes(trackId)
    ? selectedTrackIds.value.filter((id) => id !== trackId)
    : [...selectedTrackIds.value, trackId];
}

function toggleAllTracks(): void {
  selectedTrackIds.value = isAllTracksSelected.value ? [] : tracks.value.map((track) => track.id);
}

function setCurrentTrack(trackId: number): void {
  currentTrackId.value = trackId;
  syncTrackForm(currentTrack.value);
}

function openWorkbenchTab(tab: WorkbenchTab): void {
  activeTab.value = tab;
}

async function createTrackFromSelection(): Promise<void> {
  if (!props.projectId || !props.contentId) {
    return;
  }
  const selectedStoryboards = selectedPreviewStoryboardIds.value.length ? selectedPreviewStoryboardIds.value : storyboards.value.slice(0, 1).map((storyboard) => storyboard.id);
  const prompt = selectedStoryboards
    .map((id) => storyboards.value.find((storyboard) => storyboard.id === id))
    .filter((item): item is ProductionStoryboardItem => Boolean(item))
    .map((storyboard) => storyboard.videoDesc || storyboard.prompt)
    .join('\n');
  saving.value = true;
  try {
    const response = await window.vtStudio.production.videoTrack.save({
      projectId: props.projectId,
      contentId: props.contentId,
      id: null,
      storyboardIds: selectedStoryboards,
      prompt,
      duration: selectedStoryboardTotalDuration.value || DEFAULT_DURATION,
      mode: normalizeModeValue(trackForm.mode || getFallbackMode()),
      sortIndex: null,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.node.workbench.trackCreated'));
    emit('saved');
    await loadWorkbench(true);
    setCurrentTrack(response.data.track.id);
    activeTab.value = 'generate';
  } finally {
    saving.value = false;
  }
}

async function createEmptyTrack(): Promise<void> {
  if (!props.projectId || !props.contentId) {
    return;
  }
  saving.value = true;
  try {
    const response = await window.vtStudio.production.videoTrack.save({
      projectId: props.projectId,
      contentId: props.contentId,
      id: null,
      storyboardIds: [],
      prompt: '',
      duration: DEFAULT_DURATION,
      mode: normalizeModeValue(trackForm.mode || getFallbackMode()),
      sortIndex: null,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.node.workbench.trackCreated'));
    emit('saved');
    await loadWorkbench(true);
    setCurrentTrack(response.data.track.id);
  } finally {
    saving.value = false;
  }
}

async function saveCurrentTrack(showMessage = true): Promise<boolean> {
  if (!props.projectId || !props.contentId || !currentTrack.value) {
    return false;
  }
  const nextDuration = Math.min(10, Math.max(1, Number(trackForm.duration) || DEFAULT_DURATION));
  saving.value = true;
  try {
    const response = await window.vtStudio.production.videoTrack.save({
      projectId: props.projectId,
      contentId: props.contentId,
      id: currentTrack.value.id,
      storyboardIds: [...trackForm.storyboardIds],
      prompt: trackForm.prompt,
      duration: nextDuration,
      mode: normalizeModeValue(trackForm.mode),
      sortIndex: currentTrack.value.sortIndex,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return false;
    }
    updateTrackList(tracks.value.map((track) => (track.id === response.data.track.id ? response.data.track : track)));
    emit('saved');
    if (showMessage) {
      MessagePlugin.success(t('production.node.workbench.trackSaved'));
    }
    return true;
  } finally {
    saving.value = false;
  }
}

function confirmDeleteTrack(track: ProductionVideoTrackItem): void {
  if (!props.projectId || !props.contentId) {
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('production.node.workbench.deleteTitle'),
    body: t('production.node.workbench.deleteBody', { index: track.sortIndex + 1 }),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.production.videoTrack.delete({
        projectId: props.projectId,
        contentId: props.contentId!,
        trackId: track.id,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      dialog.destroy();
      MessagePlugin.success(t('production.deleted'));
      emit('saved');
      await loadWorkbench(true);
    },
  });
}

async function generatePromptsForSelected(): Promise<void> {
  if (!props.projectId || !props.contentId || selectedTrackIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.workbench.noTrackSelection'));
    return;
  }
  promptGenerating.value = true;
  try {
    const response = await window.vtStudio.production.videoPrompt.generate({
      projectId: props.projectId,
      contentId: props.contentId,
      trackIds: [...selectedTrackIds.value],
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.node.workbench.promptStarted'));
    emit('saved');
    await loadWorkbench(true);
  } finally {
    promptGenerating.value = false;
  }
}

async function generateVideoForTracks(trackIds: number[]): Promise<void> {
  if (!props.projectId || !props.contentId || trackIds.length === 0) {
    MessagePlugin.warning(t('production.node.workbench.noTrackSelection'));
    return;
  }
  if (currentTrack.value && trackIds.includes(currentTrack.value.id)) {
    const saved = await saveCurrentTrack(false);
    if (!saved) {
      return;
    }
  }
  if (!validateReferences(trackIds)) {
    return;
  }
  videoGenerating.value = true;
  try {
    const response = await window.vtStudio.production.video.generate({
      projectId: props.projectId,
      contentId: props.contentId,
      trackIds,
      model: trackForm.model || null,
      mode: normalizeModeValue(trackForm.mode),
      resolution: trackForm.resolution,
      duration: Math.min(10, Math.max(1, Number(trackForm.duration) || DEFAULT_DURATION)),
      audioEnabled: trackForm.audioEnabled,
      referencesByTrackId: Object.fromEntries(trackIds.map((trackId) => [trackId, referenceDrafts.value[trackId] ?? []])),
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.node.workbench.videoStarted'));
    emit('saved');
    await loadWorkbench(true);
  } finally {
    videoGenerating.value = false;
  }
}

async function selectVideo(track: ProductionVideoTrackItem, video: ProductionVideoItem | null): Promise<void> {
  if (!props.projectId || !props.contentId) {
    return;
  }
  const response = await window.vtStudio.production.video.select({
    projectId: props.projectId,
    contentId: props.contentId,
    trackId: track.id,
    videoId: video?.id ?? null,
  });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  updateTrackList(tracks.value.map((item) => (item.id === response.data.track.id ? response.data.track : item)));
  MessagePlugin.success(video ? t('production.workbench.videoSelected') : t('production.workbench.videoUnselected'));
  emit('saved');
}

function confirmDeleteVideo(video: ProductionVideoItem): void {
  if (!props.projectId || !props.contentId) {
    return;
  }
  const dialog = DialogPlugin.confirm({
    header: t('production.workbench.deleteVideoTitle'),
    body: t('production.workbench.deleteVideoBody'),
    confirmBtn: t('production.delete'),
    cancelBtn: t('production.cancel'),
    theme: 'danger',
    async onConfirm() {
      videoDeleting.value = true;
      try {
        const response = await window.vtStudio.production.video.delete({
          projectId: props.projectId,
          contentId: props.contentId!,
          videoId: video.id,
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }
        dialog.destroy();
        MessagePlugin.success(t('production.deleted'));
        emit('saved');
        await loadWorkbench(true);
      } finally {
        videoDeleting.value = false;
      }
    },
  });
}

function showVideoError(video: ProductionVideoItem): void {
  emit('showDetail', t('production.workbench.videoErrorTitle'), video.errorReason || t('production.emptyText'));
}

function showTrackError(track: ProductionVideoTrackItem): void {
  emit('showDetail', t('production.workbench.promptErrorTitle'), track.errorReason || t('production.emptyText'));
}

function openVideoPreview(video: ProductionVideoItem): void {
  previewVideo.value = video;
  previewVideoVisible.value = true;
}

function openDraftDialog(): void {
  if (!props.projectId || !props.contentId) {
    return;
  }
  if (!exportReady.value) {
    exportCheckVisible.value = true;
    return;
  }
  draftForm.draftName = `content-${props.contentId}`;
  draftForm.copyAssets = true;
  draftDialogVisible.value = true;
}

function handleExportAction(): void {
  if (!exportReady.value) {
    exportCheckVisible.value = true;
    return;
  }

  openDraftDialog();
}

function focusExportBlocker(trackId: number): void {
  activeTab.value = 'generate';
  setCurrentTrack(trackId);
  if (!selectedTrackIds.value.includes(trackId)) {
    selectedTrackIds.value = [...selectedTrackIds.value, trackId];
  }
  exportCheckVisible.value = false;
}

function showExportResult(input: {
  title: string;
  path?: string | null;
  failures?: ExportValidationFailure[];
  taskId?: number | null;
  summary?: ExportCreateJianyingDraftResult['summary'] | null;
}): void {
  exportResultTitle.value = input.title;
  exportResultPath.value = input.path ?? null;
  exportResultFailures.value = input.failures ?? [];
  exportResultTaskId.value = input.taskId ?? null;
  exportResultSummary.value = input.summary ?? null;
  exportResultVisible.value = true;
}

async function openExportDirectory(): Promise<void> {
  if (!exportResultPath.value) {
    return;
  }
  const response = await window.vtStudio.export.openDirectory({ path: exportResultPath.value });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
  }
}

async function copyExportPath(): Promise<void> {
  if (!exportResultPath.value) {
    return;
  }

  await navigator.clipboard.writeText(exportResultPath.value);
  MessagePlugin.success(t('production.workbench.pathCopied'));
}

async function copyExportTaskId(): Promise<void> {
  if (!exportResultTaskId.value) {
    return;
  }

  await navigator.clipboard.writeText(String(exportResultTaskId.value));
  MessagePlugin.success(t('production.workbench.taskIdCopied'));
}

function goTaskCenter(): void {
  void router.push({ name: 'tasks' });
}

function clearTimer(timer: number | null): void {
  if (timer) {
    window.clearTimeout(timer);
  }
}

function clearPollTimers(): void {
  clearTimer(videoPromptPollTimer);
  clearTimer(videoPollTimer);
  videoPromptPollTimer = null;
  videoPollTimer = null;
}

function schedulePolls(): void {
  clearPollTimers();
  if (!props.visible || !props.projectId || !props.contentId) {
    return;
  }
  if (runningPromptTrackIds.value.length > 0) {
    videoPromptPollTimer = window.setTimeout(() => void pollVideoPrompts(), POLL_INTERVAL);
  }
  if (runningVideoIds.value.length > 0) {
    videoPollTimer = window.setTimeout(() => void pollVideos(), POLL_INTERVAL);
  }
}

async function pollVideoPrompts(): Promise<void> {
  if (!props.projectId || !props.contentId || runningPromptTrackIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.videoPrompt.poll({
    projectId: props.projectId,
    contentId: props.contentId,
    ids: [...runningPromptTrackIds.value],
  });
  if (isOk(response) && response.data.tracks.length > 0) {
    await loadWorkbench(true);
    return;
  }
  schedulePolls();
}

async function pollVideos(): Promise<void> {
  if (!props.projectId || !props.contentId || runningVideoIds.value.length === 0) {
    schedulePolls();
    return;
  }
  const response = await window.vtStudio.production.video.poll({
    projectId: props.projectId,
    contentId: props.contentId,
    ids: [...runningVideoIds.value],
  });
  if (isOk(response) && response.data.tracks.length > 0) {
    await loadWorkbench(true);
    return;
  }
  schedulePolls();
}

function stopPreview(): void {
  previewPlaying.value = false;
  if (previewTimer) {
    window.clearInterval(previewTimer);
    previewTimer = null;
  }
}

function syncCurrentPreviewByElapsed(): void {
  let elapsed = 0;
  for (const storyboard of sortedPreviewStoryboards.value) {
    elapsed += Math.max(1, storyboard.duration);
    if (previewElapsed.value <= elapsed) {
      currentPreviewStoryboardId.value = storyboard.id;
      return;
    }
  }
  currentPreviewStoryboardId.value = sortedPreviewStoryboards.value.at(-1)?.id ?? null;
}

function startPreview(): void {
  if (!sortedPreviewStoryboards.value.length) {
    return;
  }
  stopPreview();
  previewPlaying.value = true;
  previewTimer = window.setInterval(() => {
    if (previewElapsed.value >= previewTotalDuration.value) {
      previewElapsed.value = 0;
    } else {
      previewElapsed.value += 0.25;
    }
    syncCurrentPreviewByElapsed();
  }, 250);
}

function togglePreviewPlayback(): void {
  if (previewPlaying.value) {
    stopPreview();
  } else {
    startPreview();
  }
}

function setPreviewStoryboard(storyboardId: number): void {
  let elapsed = 0;
  for (const storyboard of sortedPreviewStoryboards.value) {
    if (storyboard.id === storyboardId) {
      currentPreviewStoryboardId.value = storyboard.id;
      previewElapsed.value = elapsed;
      return;
    }
    elapsed += Math.max(1, storyboard.duration);
  }
}

function stepPreview(direction: -1 | 1): void {
  const index = sortedPreviewStoryboards.value.findIndex((storyboard) => storyboard.id === currentPreviewStoryboard.value?.id);
  const nextIndex = Math.min(sortedPreviewStoryboards.value.length - 1, Math.max(0, index + direction));
  const nextStoryboard = sortedPreviewStoryboards.value[nextIndex];
  if (nextStoryboard) {
    setPreviewStoryboard(nextStoryboard.id);
  }
}

function handlePreviewProgressChange(value: number | number[]): void {
  const percent = Number(Array.isArray(value) ? value[0] : value);
  previewElapsed.value = previewTotalDuration.value * (percent / 100);
  syncCurrentPreviewByElapsed();
}

function togglePreviewStoryboard(storyboardId: number): void {
  selectedPreviewStoryboardIds.value = selectedPreviewStoryboardIds.value.includes(storyboardId)
    ? selectedPreviewStoryboardIds.value.filter((id) => id !== storyboardId)
    : [...selectedPreviewStoryboardIds.value, storyboardId];
}

function selectAllPreviewStoryboards(): void {
  selectedPreviewStoryboardIds.value = storyboards.value.map((storyboard) => storyboard.id);
}

function clearPreviewStoryboardSelection(): void {
  selectedPreviewStoryboardIds.value = [];
}

function movePreviewStoryboard(storyboardId: number, direction: -1 | 1): void {
  const order = sortedPreviewStoryboards.value.map((storyboard) => storyboard.id);
  const index = order.indexOf(storyboardId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
    return;
  }
  const [removed] = order.splice(index, 1);
  order.splice(nextIndex, 0, removed!);
  previewOrder.value = order;
}

function resetPreviewOrder(): void {
  previewOrder.value = storyboards.value.map((storyboard) => storyboard.id);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function createStoreZip(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let index = 0;
  for (const file of files) {
    const safeName = file.name.replace(/[\\/:*?"<>|]/g, '_');
    const nameBytes = encoder.encode(safeName);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const checksum = crc32(data);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    chunks.push(header, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);
    offset += header.length + data.length;
    index += 1;
  }
  const centralSize = central.reduce((total, chunk) => total + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, index, true);
  endView.setUint16(10, index, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}

async function downloadUrlsAsZip(items: Array<{ url: string | null; name: string }>, filename: string): Promise<void> {
  const files: Array<{ name: string; blob: Blob }> = [];
  for (const item of items) {
    if (!item.url) {
      continue;
    }
    const response = await fetch(item.url);
    if (!response.ok) {
      continue;
    }
    files.push({ name: item.name, blob: await response.blob() });
  }
  if (!files.length) {
    MessagePlugin.warning(t('production.workbench.noDownloadableMedia'));
    return;
  }
  downloadBlob(await createStoreZip(files), filename);
}

async function downloadSelectedStoryboards(): Promise<void> {
  if (!props.projectId || !props.contentId || selectedPreviewStoryboardIds.value.length === 0) {
    MessagePlugin.warning(t('production.node.storyboard.noSelection'));
    return;
  }
  storyboardExporting.value = true;
  try {
    const orderedIds = sortedPreviewStoryboards.value.map((storyboard) => storyboard.id).filter((id) => selectedPreviewStoryboardIds.value.includes(id));
    const response = await window.vtStudio.export.storyboardImages({
      projectId: props.projectId,
      contentId: props.contentId,
      storyboardIds: [...selectedPreviewStoryboardIds.value],
      order: orderedIds,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    const result: ExportStoryboardImagesResult = response.data;
    if (!result.filePath) {
      MessagePlugin.warning(t('production.workbench.noDownloadableMedia'));
    } else if (result.failedCount > 0) {
      MessagePlugin.warning(t('production.workbench.storyboardExportPartial', { count: result.exportedCount, failed: result.failedCount }));
    } else {
      MessagePlugin.success(t('production.workbench.storyboardExported', { count: result.exportedCount }));
    }
    showExportResult({
      title: result.failedCount > 0 ? t('production.workbench.exportPartialTitle') : t('production.workbench.exportSuccessTitle'),
      path: result.filePath,
      failures: result.failures,
    });
  } finally {
    storyboardExporting.value = false;
  }
}

async function downloadSelectedVideos(): Promise<void> {
  const items = tracks.value
    .filter((track) => selectedTrackIds.value.includes(track.id))
    .map((track) => track.videos.find((video) => video.id === track.selectedVideoId))
    .filter((video): video is ProductionVideoItem => Boolean(video))
    .map((video, index) => ({
      url: video.videoUrl,
      name: `selected-video-${String(index + 1).padStart(2, '0')}.mp4`,
    }));
  await downloadUrlsAsZip(items, 'production-selected-videos.zip');
}

async function createJianyingDraft(): Promise<void> {
  if (!props.projectId || !props.contentId) {
    return;
  }
  if (!exportReady.value) {
    draftDialogVisible.value = false;
    exportCheckVisible.value = true;
    return;
  }
  jianyingExporting.value = true;
  try {
    const response = await window.vtStudio.export.createJianyingDraft({
      projectId: props.projectId,
      contentId: props.contentId,
      draftName: draftForm.draftName,
      copyAssets: draftForm.copyAssets,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    draftDialogVisible.value = false;
    const result = response.data;
    if (result.succeeded) {
      MessagePlugin.success(t('production.workbench.jianyingExportSucceeded'));
    } else {
      MessagePlugin.error(t('production.workbench.jianyingExportFailed'));
    }
    showExportResult({
      title: result.succeeded ? t('production.workbench.exportSuccessTitle') : t('production.workbench.exportFailedTitle'),
      path: result.draftPath,
      failures: result.failures,
      taskId: result.taskId,
      summary: result.summary,
    });
  } finally {
    jianyingExporting.value = false;
  }
}

watch(() => props.visible, (visible) => {
  if (visible) {
    void loadVideoCapabilities();
    void loadProjectVideoDefaults();
    void loadWorkbench();
    void nextTick(() => syncTrackForm(currentTrack.value));
  } else {
    stopPreview();
    clearPollTimers();
  }
});

watch(currentTrack, (track) => {
  syncTrackForm(track);
});

watch(
  () => [trackForm.model, trackForm.mode, projectVideoModelId.value, projectVideoMode.value, availableModeKeys.value.join('|'), resolutionValues.value.join('|'), durationValues.value.join('|')] as const,
  () => {
    ensureTrackFormSelections();
  }
);

watch(() => storyboards.value.length, () => {
  if (!currentPreviewStoryboardId.value) {
    currentPreviewStoryboardId.value = sortedPreviewStoryboards.value[0]?.id ?? null;
  }
});

onUnmounted(() => {
  stopPreview();
  clearPollTimers();
});
</script>

<template>
  <VtDialog
    :visible="visible"
    :title="t('production.workbench.title')"
    width="96vw"
    :footer="false"
    destroy-on-close
    @update:visible="emit('update:visible', $event)">
    <div class="production-workbench-shell">
      <aside class="production-workbench-rail">
        <div>
          <p class="eyebrow">{{ t('production.workbench.eyebrow') }}</p>
          <h4>{{ t('production.workbench.title') }}</h4>
          <span>{{ t('production.workbench.subtitle', { tracks: tracks.length, selected: selectedVideoCount }) }}</span>
        </div>
        <t-radio-group v-model="activeTab" variant="default-filled" class="production-workbench-tabs">
          <t-radio-button v-for="tab in tabOptions" :key="tab.value" :value="tab.value">{{ tab.label }}</t-radio-button>
        </t-radio-group>
        <div class="production-workbench-stat-grid">
          <div>
            <span>{{ t('production.workbench.stats.storyboards') }}</span>
            <b>{{ storyboards.length }}</b>
          </div>
          <div>
            <span>{{ t('production.workbench.stats.tracks') }}</span>
            <b>{{ tracks.length }}</b>
          </div>
          <div>
            <span>{{ t('production.workbench.stats.running') }}</span>
            <b>{{ runningPromptTrackIds.length + runningVideoIds.length }}</b>
          </div>
          <div>
            <span>{{ t('production.workbench.stats.selected') }}</span>
            <b>{{ selectedVideoCount }}</b>
          </div>
        </div>
        <div class="production-workbench-rail-actions">
          <div class="rounded-md border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-app)] p-3">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-sm text-[var(--vt-text-primary)]">{{ t('production.workbench.selectedVideoRatio', { selected: selectedVideoCount, total: tracks.length }) }}</strong>
              <t-tag size="small" :theme="exportReady ? 'success' : 'warning'" variant="light">
                {{ exportReady ? t('production.workbench.exportReady') : t('production.workbench.exportCheck') }}
              </t-tag>
            </div>
            <p class="m-0 mt-2 text-xs leading-5 text-[var(--vt-text-tertiary)]">
              {{ exportReady ? t('production.workbench.exportReadyHint') : t('production.workbench.exportBlockedHint') }}
            </p>
          </div>
          <VtButton block theme="primary" variant="base" :loading="saving" @click="createEmptyTrack">
            <template #icon><AddIcon /></template>
            {{ t('production.node.workbench.createTrack') }}
          </VtButton>
          <VtButton block theme="primary" variant="outline" :loading="jianyingExporting" :disabled="tracks.length === 0" @click="handleExportAction">
            <template #icon><FileExportIcon /></template>
            {{ exportReady ? t('production.workbench.exportJianyingDraft') : t('production.workbench.exportCheck') }}
          </VtButton>
          <VtButton block variant="outline" :disabled="selectedTrackCount === 0" @click="downloadSelectedVideos">
            <template #icon><DownloadIcon /></template>
            {{ t('production.workbench.downloadSelectedVideos') }}
          </VtButton>
        </div>
      </aside>

      <section class="production-workbench-main">
        <t-loading :loading="loading">
          <div v-if="activeTab === 'preview'" class="production-workbench-preview">
            <section class="production-preview-stage">
              <div class="production-preview-media" :class="{ empty: !currentPreviewStoryboard?.imageUrl }">
                <img v-if="currentPreviewStoryboard?.imageUrl" :src="currentPreviewStoryboard.imageUrl" :alt="currentPreviewStoryboard.videoDesc" />
                <span v-else>{{ t('production.workbench.noPreviewImage') }}</span>
              </div>
              <div class="production-preview-controls">
                <t-tooltip :content="t('production.workbench.previous')">
                  <VtButton shape="square" variant="text" icon-only :min-width="0" :aria-label="t('production.workbench.previous')" @click="stepPreview(-1)">‹</VtButton>
                </t-tooltip>
                <t-tooltip :content="previewPlaying ? t('production.workbench.pause') : t('production.workbench.play')">
                  <VtButton shape="square" variant="text" icon-only :min-width="0" :aria-label="previewPlaying ? t('production.workbench.pause') : t('production.workbench.play')" @click="togglePreviewPlayback">
                    <PauseCircleIcon v-if="previewPlaying" />
                    <PlayCircleIcon v-else />
                  </VtButton>
                </t-tooltip>
                <t-tooltip :content="t('production.workbench.next')">
                  <VtButton shape="square" variant="text" icon-only :min-width="0" :aria-label="t('production.workbench.next')" @click="stepPreview(1)">›</VtButton>
                </t-tooltip>
                <t-slider class="production-preview-slider" :model-value="previewProgressPercent" :min="0" :max="100" :step="0.1" @change="handlePreviewProgressChange" />
              </div>
              <div class="production-preview-segments">
                <button
                  v-for="storyboard in sortedPreviewStoryboards"
                  :key="storyboard.id"
                  type="button"
                  :class="{ active: storyboard.id === currentPreviewStoryboard?.id }"
                  :style="{ flexGrow: Math.max(1, storyboard.duration) }"
                  @click="setPreviewStoryboard(storyboard.id)">
                  {{ storyboard.duration }}s
                </button>
              </div>
            </section>

            <aside class="production-preview-detail">
              <h4>{{ currentPreviewStoryboard ? storyboardLabel(currentPreviewStoryboard) : t('production.emptyText') }}</h4>
              <p>{{ currentPreviewStoryboard?.videoDesc || currentPreviewStoryboard?.prompt || t('production.emptyText') }}</p>
              <div class="production-workbench-meta-grid">
                <span>{{ t('production.node.storyboard.durationValue', { count: currentPreviewStoryboard?.duration ?? 0 }) }}</span>
                <span>{{ t('production.node.storyboard.assetCount', { count: currentPreviewStoryboard?.associatedAssetIds.length ?? 0 }) }}</span>
                <span>{{ currentPreviewStoryboard?.shouldGenerateImage ? t('production.node.storyboard.shouldGenerateOn') : t('production.node.storyboard.shouldGenerateOff') }}</span>
              </div>
              <div class="production-workbench-actions">
                <VtButton size="small" variant="outline" @click="selectAllPreviewStoryboards">{{ t('production.node.storyboard.selectAll') }}</VtButton>
                <VtButton size="small" variant="outline" @click="clearPreviewStoryboardSelection">{{ t('production.node.storyboard.clearSelection') }}</VtButton>
                <VtButton size="small" variant="outline" :loading="storyboardExporting" :disabled="selectedPreviewStoryboardIds.length === 0" @click="downloadSelectedStoryboards">
                  <template #icon><DownloadIcon /></template>
                  {{ t('production.workbench.downloadStoryboards') }}
                </VtButton>
                <VtButton size="small" theme="primary" variant="base" :disabled="storyboards.length === 0" :loading="saving" @click="createTrackFromSelection">
                  <template #icon><VideoIcon /></template>
                  {{ t('production.workbench.createTrackFromSelection') }}
                </VtButton>
              </div>
            </aside>

            <section class="production-preview-strip">
              <article v-for="storyboard in sortedPreviewStoryboards" :key="storyboard.id" class="production-preview-card" :class="{ active: storyboard.id === currentPreviewStoryboard?.id }">
                <label>
                  <t-checkbox :model-value="selectedPreviewStoryboardIds.includes(storyboard.id)" @change="togglePreviewStoryboard(storyboard.id)" />
                  <span>{{ storyboardLabel(storyboard) }}</span>
                </label>
                <t-tooltip
                  v-if="isDependencyInvalid(storyboard.dependencyStatus)"
                  :content="dependencyStatusMessage(storyboard.dependencyStatus, storyboard.dependencyReason)"
                >
                  <t-tag
                  size="small"
                  :theme="getDependencyTheme(storyboard.dependencyStatus)"
                  variant="light">
                    {{ t(`production.dependencyStatus.${storyboard.dependencyStatus}`) }}
                  </t-tag>
                </t-tooltip>
                <button type="button" @click="setPreviewStoryboard(storyboard.id)">
                  <img v-if="storyboard.imageUrl" :src="storyboard.imageUrl" :alt="storyboard.videoDesc" />
                  <span v-else>{{ t('production.workbench.noPreviewImage') }}</span>
                </button>
                <div>
                  <VtButton size="small" variant="text" :min-width="0" @click="movePreviewStoryboard(storyboard.id, -1)">↑</VtButton>
                  <VtButton size="small" variant="text" :min-width="0" @click="movePreviewStoryboard(storyboard.id, 1)">↓</VtButton>
                </div>
              </article>
              <VtButton size="small" variant="outline" @click="resetPreviewOrder">{{ t('production.workbench.resetOrder') }}</VtButton>
            </section>
          </div>

          <div v-else-if="activeTab === 'generate'" class="production-workbench-generate">
            <aside class="production-workbench-track-panel">
              <div class="production-workbench-panel-head">
                <div>
                  <strong>{{ t('production.workbench.trackList') }}</strong>
                  <span>{{ t('production.workbench.trackSelection', { count: selectedTrackCount }) }}</span>
                </div>
                <VtButton size="small" variant="outline" @click="toggleAllTracks">{{ isAllTracksSelected ? t('production.node.storyboard.clearSelection') : t('production.node.storyboard.selectAll') }}</VtButton>
              </div>
              <div class="production-workbench-track-list">
                <article v-for="track in tracks" :key="track.id" class="production-workbench-track-item" :class="{ active: track.id === currentTrack?.id }">
                  <label>
                    <t-checkbox :model-value="selectedTrackIds.includes(track.id)" @change="toggleTrack(track.id)" />
                  </label>
                  <button type="button" @click="setCurrentTrack(track.id)">
                    <span class="production-workbench-track-thumb" :class="{ empty: !getTrackThumb(track) }">
                      <video v-if="getTrackSelectedVideo(track)?.videoUrl" :src="getTrackSelectedVideo(track)?.videoUrl || ''" muted />
                      <img v-else-if="getTrackThumb(track)" :src="getTrackThumb(track) || ''" :alt="track.prompt" />
                      <span v-else>{{ track.sortIndex + 1 }}</span>
                    </span>
                    <strong>{{ t('production.node.workbench.trackName', { index: track.sortIndex + 1 }) }}</strong>
                    <small>{{ previewText(track.prompt, 58) }}</small>
                    <span>
                      <t-tag size="small" :theme="getStatusTheme(track.status)" variant="light">{{ t(`production.status.${track.status}`) }}</t-tag>
                      <t-tag
                        v-if="isDependencyInvalid(track.dependencyStatus)"
                        size="small"
                        :theme="getDependencyTheme(track.dependencyStatus)"
                        variant="light">
                        <t-tooltip :content="dependencyStatusMessage(track.dependencyStatus, track.dependencyReason)">
                          <span>{{ t(`production.dependencyStatus.${track.dependencyStatus}`) }}</span>
                        </t-tooltip>
                      </t-tag>
                      <t-tag size="small" variant="light">{{ t('production.node.workbench.candidates', { count: track.videos.length }) }}</t-tag>
                    </span>
                  </button>
                  <t-tooltip v-if="track.status === PRODUCTION_TASK_STATUS.FAILED" :content="t('production.workbench.promptErrorTitle')">
                    <button class="production-track-icon-action" type="button" :aria-label="t('production.workbench.promptErrorTitle')" @click="showTrackError(track)">
                      <ErrorCircleIcon />
                    </button>
                  </t-tooltip>
                  <t-tooltip :content="t('production.delete')">
                    <button class="production-track-icon-action" type="button" :aria-label="t('production.delete')" @click="confirmDeleteTrack(track)">
                      <DeleteIcon />
                    </button>
                  </t-tooltip>
                </article>
              </div>
              <VtEmptyState v-if="tracks.length === 0" size="small" :description="t('production.node.workbench.empty')" />
            </aside>

            <section v-if="currentTrack" class="production-workbench-editor">
              <div class="production-workbench-editor-head">
                <div>
                  <h4>{{ t('production.node.workbench.trackName', { index: currentTrack.sortIndex + 1 }) }}</h4>
                  <span>{{ t('production.workbench.trackId', { id: currentTrack.id }) }} / {{ formatMode(currentTrack.mode) }}</span>
                </div>
                <div class="production-workbench-actions">
                  <VtButton variant="outline" :loading="saving" @click="saveCurrentTrack()">
                    <template #icon><SaveIcon /></template>
                    {{ t('production.save') }}
                  </VtButton>
                  <VtButton variant="outline" :loading="promptGenerating" :disabled="selectedTrackCount === 0" @click="generatePromptsForSelected">
                    <template #icon><SaveIcon /></template>
                    {{ t('production.node.workbench.promptSelected') }}
                  </VtButton>
                  <VtButton theme="primary" variant="base" :loading="videoGenerating" @click="generateVideoForTracks([currentTrack.id])">
                    <template #icon><PlayCircleIcon /></template>
                    {{ t('production.workbench.generateCurrentVideo') }}
                  </VtButton>
                  <VtButton variant="outline" :loading="videoGenerating" :disabled="selectedTrackCount === 0" @click="generateVideoForTracks([...selectedTrackIds])">
                    <template #icon><VideoIcon /></template>
                    {{ t('production.node.workbench.videoSelected') }}
                  </VtButton>
                </div>
              </div>

              <div class="production-workbench-config-grid">
                <label>
                  <span>{{ t('production.workbench.model') }}</span>
                  <t-select v-model="trackForm.model" :options="modelOptions" :placeholder="t('production.workbench.modelPlaceholder')" />
                </label>
                <label>
                  <span>{{ t('production.node.workbench.mode') }}</span>
                  <t-select v-model="trackForm.mode" :options="modeOptions" />
                </label>
                <label>
                  <span>{{ t('production.workbench.resolution') }}</span>
                  <t-select v-model="trackForm.resolution" :options="resolutionOptions" />
                </label>
                <label>
                  <span>{{ t('production.node.workbench.duration') }}</span>
                  <t-select v-model="trackForm.duration" :options="durationOptions" />
                </label>
                <label>
                  <span>{{ t('production.workbench.audioEnabled') }}</span>
                  <t-switch v-model="trackForm.audioEnabled" :disabled="audioDisabled || audioRequired" />
                </label>
              </div>

              <div class="production-workbench-mode-hint">
                <strong>{{ currentModeOption?.label ?? formatMode(trackForm.mode) }}</strong>
                <span>{{ currentModeOption?.content ?? getModeHelp(trackForm.mode) }}</span>
              </div>

              <div class="production-workbench-prompt-editor">
                <section>
                  <label>
                    <span>{{ t('production.node.workbench.storyboards') }}</span>
                    <t-select v-model="trackForm.storyboardIds" multiple clearable :options="storyboardOptions" :placeholder="storyboardOptions.length ? t('production.node.workbench.storyboardsPlaceholder') : t('production.node.workbench.noStoryboards')" />
                  </label>
                  <label>
                    <span>{{ t('production.node.workbench.prompt') }}</span>
                    <t-textarea v-model="trackForm.prompt" :placeholder="t('production.node.workbench.promptPlaceholder')" :autosize="{ minRows: 8, maxRows: 14 }" @blur="saveCurrentTrack(false)" />
                  </label>
                </section>
                <aside>
                  <div class="production-workbench-panel-head">
                    <div>
                      <strong>{{ t('production.workbench.references') }}</strong>
                      <span>{{ t('production.workbench.referencesHint') }}</span>
                    </div>
                  </div>
                  <t-select v-model="selectedReferenceKeys" multiple clearable :options="availableReferenceOptions.map((option) => ({ label: option.title, value: option.key, content: option.subtitle }))" :placeholder="t('production.workbench.referencesPlaceholder')" />
                  <div class="production-workbench-reference-grid">
                    <article v-for="reference in currentReferences" :key="`${reference.source}-${reference.id}-${reference.index}`" class="production-workbench-reference-card">
                      <div :class="{ empty: !reference.url }">
                        <img v-if="reference.fileType === 'image' && reference.url" :src="reference.url" :alt="reference.prompt || ''" />
                        <video v-else-if="reference.fileType === 'video' && reference.url" :src="reference.url" muted />
                        <span v-else>{{ t(`production.workbench.reference.${reference.fileType}`) }}</span>
                      </div>
                      <strong>{{ reference.source === 'storyboard' ? t('production.workbench.reference.storyboard') : t('production.workbench.reference.assets') }}</strong>
                      <small>{{ previewText(reference.prompt ?? '', 54) }}</small>
                    </article>
                  </div>
                </aside>
              </div>

              <section class="production-workbench-candidates">
                <div class="production-workbench-panel-head">
                  <div>
                    <strong>{{ t('production.workbench.candidates') }}</strong>
                    <span>{{ t('production.workbench.candidatesHint') }}</span>
                  </div>
                  <VtButton v-if="currentSelectedVideo" size="small" variant="outline" @click="selectVideo(currentTrack, null)">{{ t('production.workbench.clearSelectedVideo') }}</VtButton>
                </div>
                <div class="production-workbench-candidate-grid">
                  <article v-for="video in currentTrack.videos" :key="video.id" class="production-workbench-candidate-card" :class="{ selected: currentTrack.selectedVideoId === video.id }">
                    <div class="production-workbench-candidate-preview" :class="{ empty: !video.videoUrl }">
                      <video v-if="video.videoUrl" :src="video.videoUrl" muted controls />
                      <span v-else-if="video.status === PRODUCTION_TASK_STATUS.RUNNING">{{ t('production.node.storyboard.generating') }}</span>
                      <button v-else-if="video.status === PRODUCTION_TASK_STATUS.FAILED" type="button" class="production-status-link" @click="showVideoError(video)">
                        <ErrorCircleIcon />
                        {{ t('production.node.storyboard.viewError') }}
                      </button>
                      <span v-else>{{ t(`production.status.${video.status}`) }}</span>
                    </div>
                    <p>{{ previewText(video.prompt, 88) }}</p>
                    <div class="production-workbench-meta-grid">
                      <span>{{ video.resolution || t('production.emptyText') }}</span>
                      <span>{{ t('production.node.storyboard.durationValue', { count: video.duration }) }}</span>
                      <span>{{ formatMode(video.mode) }}</span>
                    </div>
                    <div class="production-workbench-candidate-actions">
                      <t-tag size="small" :theme="getStatusTheme(video.status)" variant="light">{{ t(`production.status.${video.status}`) }}</t-tag>
                      <t-tag
                        v-if="isDependencyInvalid(video.dependencyStatus)"
                        size="small"
                        :theme="getDependencyTheme(video.dependencyStatus)"
                        variant="light">
                        <t-tooltip :content="dependencyStatusMessage(video.dependencyStatus, video.dependencyReason)">
                          <span>{{ t(`production.dependencyStatus.${video.dependencyStatus}`) }}</span>
                        </t-tooltip>
                      </t-tag>
                      <t-tooltip :content="t('production.workbench.selectVideo')">
                        <button type="button" :disabled="video.status !== PRODUCTION_TASK_STATUS.SUCCEEDED" :aria-label="t('production.workbench.selectVideo')" @click="selectVideo(currentTrack, video)">
                          <CheckIcon />
                        </button>
                      </t-tooltip>
                      <t-tooltip :content="t('production.workbench.previewVideo')">
                        <button type="button" :disabled="!video.videoUrl" :aria-label="t('production.workbench.previewVideo')" @click="openVideoPreview(video)">
                          <PlayCircleIcon />
                        </button>
                      </t-tooltip>
                      <t-tooltip :content="t('production.delete')">
                        <button type="button" :disabled="videoDeleting" :aria-label="t('production.delete')" @click="confirmDeleteVideo(video)">
                          <DeleteIcon />
                        </button>
                      </t-tooltip>
                    </div>
                  </article>
                </div>
                <VtEmptyState v-if="currentTrack.videos.length === 0" size="small" :description="t('production.workbench.noCandidates')" />
              </section>
            </section>

            <VtEmptyState v-else :description="t('production.node.workbench.empty')">
              <template #action>
                <VtButton theme="primary" variant="base" :loading="saving" @click="createEmptyTrack">
                  <template #icon><AddIcon /></template>
                  {{ t('production.node.workbench.createTrack') }}
                </VtButton>
              </template>
            </VtEmptyState>
          </div>

          <div v-else class="production-workbench-editor-canvas">
            <header class="production-workbench-editor-top">
              <div>
                <p class="eyebrow">{{ t('production.workbench.editorEyebrow') }}</p>
                <h4>{{ t('production.workbench.editorTitle') }}</h4>
                <p>{{ t('production.workbench.editorHint') }}</p>
              </div>
              <div class="production-workbench-actions">
                <VtButton size="small" variant="outline" @click="openWorkbenchTab('preview')">{{ t('production.workbench.tabs.preview') }}</VtButton>
                <VtButton size="small" variant="outline" @click="openWorkbenchTab('generate')">{{ t('production.workbench.tabs.generate') }}</VtButton>
                <VtButton size="small" theme="primary" variant="base" @click="handleExportAction">{{ t('production.workbench.exportCheck') }}</VtButton>
              </div>
            </header>

            <div class="production-workbench-editor-grid">
              <aside class="production-workbench-media-library">
                <div class="production-workbench-panel-head">
                  <div>
                    <strong>{{ t('production.workbench.mediaLibrary') }}</strong>
                    <span>{{ t('production.workbench.mediaLibraryHint') }}</span>
                  </div>
                </div>

                <section class="production-workbench-media-section">
                  <strong>{{ t('production.workbench.storyboardMedia') }}</strong>
                  <div class="production-workbench-media-grid">
                    <article v-for="storyboard in editorStoryboardMedia" :key="`storyboard-${storyboard.id}`" class="production-workbench-media-card">
                      <img :src="storyboard.imageUrl || ''" :alt="storyboard.videoDesc" />
                      <span>{{ storyboardLabel(storyboard) }}</span>
                    </article>
                  </div>
                  <VtEmptyState v-if="editorStoryboardMedia.length === 0" size="small" :description="t('production.workbench.noStoryboardMedia')" />
                </section>

                <section class="production-workbench-media-section">
                  <strong>{{ t('production.workbench.assetMedia') }}</strong>
                  <div class="production-workbench-media-grid">
                    <article v-for="asset in editorAssetMedia" :key="`asset-${asset.id}`" class="production-workbench-media-card">
                      <img v-if="asset.imageUrl" :src="asset.imageUrl" :alt="asset.name" />
                      <span v-else>{{ t(`production.assetType.${asset.type}`) }}</span>
                      <span>{{ asset.name }}</span>
                    </article>
                  </div>
                  <VtEmptyState v-if="editorAssetMedia.length === 0" size="small" :description="t('production.workbench.noAssetMedia')" />
                </section>

                <section class="production-workbench-media-section">
                  <strong>{{ t('production.workbench.selectedVideoMedia') }}</strong>
                  <div class="production-workbench-media-grid">
                    <article v-for="item in editorSelectedVideoMedia" :key="`video-${item.video.id}`" class="production-workbench-media-card">
                      <video v-if="item.video.videoUrl" :src="item.video.videoUrl" muted />
                      <span v-else>{{ t(`production.status.${item.video.status}`) }}</span>
                      <span>{{ t('production.node.workbench.trackName', { index: item.track.sortIndex + 1 }) }}</span>
                    </article>
                  </div>
                  <VtEmptyState v-if="editorSelectedVideoMedia.length === 0" size="small" :description="t('production.workbench.noSelectedVideo')" />
                </section>
              </aside>

              <section class="production-workbench-timeline">
                <div class="production-workbench-panel-head">
                  <div>
                    <strong>{{ t('production.workbench.timelineTitle') }}</strong>
                    <span>{{ t('production.workbench.timelineHint', { ready: editorReadyTrackCount, total: tracks.length }) }}</span>
                  </div>
                </div>
                <div class="production-workbench-timeline-list">
                  <article v-for="row in editorTimelineRows" :key="row.track.id" class="production-workbench-timeline-row" :class="{ ready: row.isReady }">
                    <div class="production-workbench-timeline-preview" :class="{ empty: !row.selectedVideo?.videoUrl }">
                      <video v-if="row.selectedVideo?.videoUrl" :src="row.selectedVideo.videoUrl" muted />
                      <span v-else>{{ row.track.sortIndex + 1 }}</span>
                    </div>
                    <div class="production-workbench-timeline-main">
                      <div>
                        <strong>{{ t('production.node.workbench.trackName', { index: row.track.sortIndex + 1 }) }}</strong>
                        <t-tag size="small" :theme="row.isReady ? 'success' : 'warning'" variant="light">
                          {{ row.isReady ? t('production.workbench.selectedVideoReady') : t('production.workbench.selectedVideoMissing') }}
                        </t-tag>
                      </div>
                      <p>{{ previewText(row.track.prompt, 120) }}</p>
                      <div class="production-workbench-timeline-shots">
                        <span v-for="storyboard in row.storyboards" :key="storyboard.id">{{ storyboardLabel(storyboard) }}</span>
                        <span v-if="row.storyboards.length === 0">{{ t('production.workbench.noLinkedStoryboards') }}</span>
                      </div>
                    </div>
                    <div class="production-workbench-timeline-actions">
                      <span>{{ t('production.node.storyboard.durationValue', { count: row.duration }) }}</span>
                      <VtButton size="small" variant="outline" @click="setCurrentTrack(row.track.id); openWorkbenchTab('generate')">{{ t('production.workbench.locateTrack') }}</VtButton>
                      <VtButton size="small" variant="outline" :disabled="!row.selectedVideo?.videoUrl" @click="row.selectedVideo && openVideoPreview(row.selectedVideo)">{{ t('production.workbench.previewVideo') }}</VtButton>
                    </div>
                  </article>
                </div>
                <VtEmptyState v-if="editorTimelineRows.length === 0" :description="t('production.workbench.timelineEmpty')">
                  <template #action>
                    <VtButton theme="primary" variant="base" :loading="saving" @click="createEmptyTrack">
                      <template #icon><AddIcon /></template>
                      {{ t('production.node.workbench.createTrack') }}
                    </VtButton>
                  </template>
                </VtEmptyState>
              </section>

              <aside class="production-workbench-export-panel">
                <div class="production-workbench-panel-head">
                  <div>
                    <strong>{{ t('production.workbench.exportCheckTitle') }}</strong>
                    <span>{{ t('production.workbench.selectedVideoRatio', { selected: selectedVideoCount, total: tracks.length }) }}</span>
                  </div>
                </div>
                <t-alert :theme="exportReady ? 'success' : 'warning'" :message="exportReady ? t('production.workbench.exportReadyHint') : t('production.workbench.exportCheckHint')" />
                <section v-if="exportBlockers.length > 0" class="production-workbench-export-failures compact">
                  <article v-for="blocker in exportBlockers.slice(0, 6)" :key="`editor-${blocker.trackId}-${blocker.reasonKey}`">
                    <strong>{{ blocker.trackLabel }}</strong>
                    <span>{{ t(`production.workbench.exportBlockerReason.${blocker.reasonKey}`) }}</span>
                    <small>{{ blocker.message }}</small>
                    <VtButton size="small" variant="outline" @click="focusExportBlocker(blocker.trackId)">{{ t('production.workbench.locateTrack') }}</VtButton>
                  </article>
                </section>
                <VtEmptyState v-else size="small" :description="t('production.workbench.exportReadyHint')" />
                <div class="production-workbench-actions">
                  <VtButton variant="outline" @click="openWorkbenchTab('generate')">{{ t('production.workbench.tabs.generate') }}</VtButton>
                  <VtButton theme="primary" variant="base" :disabled="tracks.length === 0" @click="handleExportAction">{{ t('production.workbench.startExport') }}</VtButton>
                </div>
              </aside>
            </div>
          </div>
        </t-loading>
      </section>
    </div>

    <VtDialog
      :visible="previewVideoVisible"
      :title="t('production.workbench.previewVideo')"
      width="820px"
      :footer="false"
      @update:visible="(value) => (previewVideoVisible = value)">
      <video v-if="previewVideo?.videoUrl" class="production-workbench-video-modal" :src="previewVideo.videoUrl" controls autoplay />
      <VtEmptyState v-else :description="t('production.workbench.noSelectedVideo')" />
    </VtDialog>

    <VtDialog
      :visible="exportCheckVisible"
      :title="t('production.workbench.exportCheckTitle')"
      width="720px"
      :footer="false"
      @update:visible="(value) => (exportCheckVisible = value)">
      <div class="production-form">
        <t-alert :theme="exportReady ? 'success' : 'warning'" :message="exportReady ? t('production.workbench.exportReadyHint') : t('production.workbench.exportCheckHint')" />
        <div class="production-workbench-meta-grid">
          <span>{{ t('production.workbench.selectedVideoRatio', { selected: selectedVideoCount, total: tracks.length }) }}</span>
          <span>{{ t('production.workbench.exportBlockerCount', { count: exportBlockers.length }) }}</span>
        </div>
        <section v-if="exportBlockers.length > 0" class="production-workbench-export-failures">
          <article v-for="blocker in exportBlockers" :key="`${blocker.trackId}-${blocker.reasonKey}`">
            <strong>{{ blocker.trackLabel }}</strong>
            <span>{{ t(`production.workbench.exportBlockerReason.${blocker.reasonKey}`) }}</span>
            <small>{{ blocker.message }}</small>
            <div class="production-workbench-actions">
              <VtButton size="small" variant="outline" @click="focusExportBlocker(blocker.trackId)">
                {{ t('production.workbench.locateTrack') }}
              </VtButton>
            </div>
          </article>
        </section>
        <div class="production-workbench-actions">
          <VtButton variant="outline" @click="exportCheckVisible = false">{{ t('production.cancel') }}</VtButton>
          <VtButton theme="primary" variant="base" :disabled="!exportReady" @click="openDraftDialog">{{ t('production.workbench.startExport') }}</VtButton>
        </div>
      </div>
    </VtDialog>

    <VtDialog
      :visible="draftDialogVisible"
      :title="t('production.workbench.exportJianyingDraft')"
      width="620px"
      :confirm-text="t('production.workbench.startExport')"
      :cancel-text="t('production.cancel')"
      :confirm-loading="jianyingExporting"
      @update:visible="(value) => (draftDialogVisible = value)"
      @confirm="createJianyingDraft">
      <div class="production-form">
        <label>
          <span>{{ t('production.workbench.draftName') }}</span>
          <t-input v-model="draftForm.draftName" :placeholder="t('production.workbench.draftNamePlaceholder')" />
        </label>
        <label>
          <span>{{ t('production.workbench.copyAssets') }}</span>
          <t-switch v-model="draftForm.copyAssets" />
        </label>
        <t-alert v-if="!draftForm.copyAssets" theme="warning" :message="t('production.workbench.copyAssetsOffWarning')" />
        <t-alert theme="info" :message="t('production.workbench.exportBoundary')" />
        <div class="production-workbench-meta-grid">
          <span>{{ t('production.workbench.editorTracks') }}：{{ tracks.length }}</span>
          <span>{{ t('production.workbench.selectedVideoRatio', { selected: selectedVideoCount, total: tracks.length }) }}</span>
          <span>{{ t('production.workbench.selectedVideos', { count: selectedVideoCount }) }}</span>
        </div>
      </div>
    </VtDialog>

    <VtDialog
      :visible="exportResultVisible"
      :title="exportResultTitle"
      width="760px"
      :footer="false"
      @update:visible="(value) => (exportResultVisible = value)">
      <div class="production-form">
        <t-alert v-if="exportResultPath" theme="success" :message="t('production.workbench.exportPath', { path: exportResultPath })" />
        <t-alert v-else-if="hasExportFailures" theme="error" :message="t('production.workbench.exportBlocked')" />
        <div v-if="exportResultSummary" class="production-workbench-meta-grid">
          <span>{{ t('production.workbench.summaryClips', { count: exportResultSummary.clipCount }) }}</span>
          <span>{{ t('production.workbench.summaryAssets', { count: exportResultSummary.copiedAssetCount }) }}</span>
          <span>{{ t('production.workbench.summaryDuration', { seconds: formatExportSeconds(exportResultSummary.durationMs) }) }}</span>
        </div>
        <div v-if="exportResultTaskId" class="production-workbench-meta-grid">
          <span>{{ t('production.workbench.exportTaskId', { id: exportResultTaskId }) }}</span>
        </div>
        <section v-if="hasExportFailures" class="production-workbench-export-failures">
          <div class="production-workbench-panel-head">
            <div>
              <strong>{{ t('production.workbench.failureList') }}</strong>
              <span>{{ t('production.workbench.failureCount', { count: exportResultFailures.length }) }}</span>
            </div>
          </div>
          <article v-for="(failure, index) in exportResultFailures" :key="`${failure.clipId}-${failure.sourceId}-${failure.reason}-${index}`">
            <strong>{{ failureReasonLabel(failure.reason) }}</strong>
            <span>{{ t('production.workbench.failureTrack', { track: failureTrackLabel(failure) }) }}</span>
            <small>{{ failure.message }}</small>
            <code>{{ failure.path || t('production.emptyText') }}</code>
            <div v-if="failure.trackId" class="production-workbench-actions">
              <VtButton size="small" variant="outline" @click="focusExportBlocker(failure.trackId)">
                {{ t('production.workbench.locateTrack') }}
              </VtButton>
            </div>
          </article>
        </section>
        <div v-if="exportResultPath || exportResultTaskId" class="production-workbench-actions">
          <VtButton theme="primary" variant="base" :disabled="!exportResultPath" @click="openExportDirectory">
            <template #icon><FolderOpenIcon /></template>
            {{ t('production.workbench.openExportDirectory') }}
          </VtButton>
          <VtButton variant="outline" :disabled="!exportResultPath" @click="copyExportPath">
            <template #icon><CheckIcon /></template>
            {{ t('production.workbench.copyExportPath') }}
          </VtButton>
          <VtButton variant="outline" :disabled="!exportResultTaskId" @click="copyExportTaskId">
            <template #icon><CheckIcon /></template>
            {{ t('production.workbench.copyTaskId') }}
          </VtButton>
          <VtButton variant="outline" @click="goTaskCenter">
            <template #icon><ErrorCircleIcon /></template>
            {{ t('production.workbench.goTaskCenter') }}
          </VtButton>
        </div>
      </div>
    </VtDialog>
  </VtDialog>
</template>
