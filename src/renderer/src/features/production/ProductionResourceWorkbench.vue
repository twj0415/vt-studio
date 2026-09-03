<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { CloseIcon, FolderOpenIcon, ImageIcon, PlayCircleIcon, RefreshIcon, SaveIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import VtActionBar from '@renderer/components/VtActionBar.vue';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import VtPromptEditor from '@renderer/components/VtPromptEditor.vue';
import PreviewableImage from '@renderer/features/shared/PreviewableImage.vue';
import { useAppStore } from '@renderer/stores/app';
import {
  PRODUCTION_TASK_STATUS,
  type ProductionAssetSummary,
  type ProductionContentOption,
  type ProductionFlowData,
  type ProductionResourceDraft,
  type ProductionResourceDraftAction,
  type ProductionResourceDraftType,
  type ProductionResourceExistingAsset,
} from '@shared/types/production';
import type { AssetTaskStatus } from '@shared/types/assets';
import type { ProjectImageQuality, ProjectModelOption } from '@shared/types/project';

const POLL_INTERVAL = 3000;
const RESOURCE_TYPES: ProductionResourceDraftType[] = ['role', 'scene', 'tool'];
const DRAFT_ACTIONS: ProductionResourceDraftAction[] = ['create', 'merge', 'replace', 'skip'];

const props = withDefaults(defineProps<{
  embedded?: boolean;
  contentId?: number | null;
}>(), {
  embedded: false,
  contentId: null,
});

const emit = defineEmits<{
  changed: [];
}>();

type ResourceItem =
  | {
      key: string;
      kind: 'asset';
      id: number;
      type: ProductionResourceDraftType;
      name: string;
      description: string;
      prompt: string;
      imageUrl: string | null;
      thumbnailUrl: string | null;
      imageStatus: AssetTaskStatus;
      imageErrorReason: string | null;
      asset: ProductionAssetSummary;
    }
  | {
      key: string;
      kind: 'draft';
      id: number;
      type: ProductionResourceDraftType;
      name: string;
      description: string;
      prompt: string;
      imageUrl: string | null;
      thumbnailUrl: string | null;
      imageStatus: 'idle';
      imageErrorReason: string | null;
      draft: ProductionResourceDraft;
    };

type ResourceExtractStatus = 'idle' | 'running' | 'succeeded' | 'failed';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

const currentProjectId = computed(() => Number(appStore.currentProject?.id ?? 0));
const currentProjectName = computed(() => appStore.currentProject?.name ?? t('common.noProject'));

const loading = ref(false);
const refreshing = ref(false);
const draftLoading = ref(false);
const extractStarting = ref(false);
const extractPolling = ref(false);
const extractError = ref<string | null>(null);
const contents = ref<ProductionContentOption[]>([]);
const currentContentId = ref<number | null>(null);
const flowData = ref<ProductionFlowData | null>(null);
const drafts = ref<ProductionResourceDraft[]>([]);
const existingAssets = ref<ProductionResourceExistingAsset[]>([]);
const imageModels = ref<ProjectModelOption[]>([]);
const projectImageModelId = ref('');
const projectImageQuality = ref<ProjectImageQuality>('1K');
const activeType = ref<ProductionResourceDraftType>('role');
const editingItem = ref<ResourceItem | null>(null);
const editVisible = ref(false);
const editSaving = ref(false);
const editDeleting = ref(false);
const editCommitting = ref(false);
const imageGenerating = ref(false);
let extractPollTimer: number | null = null;
let imagePollTimer: number | null = null;

const editForm = reactive({
  type: 'role' as ProductionResourceDraftType,
  action: 'create' as ProductionResourceDraftAction,
  matchedAssetId: null as number | null,
  name: '',
  description: '',
  prompt: '',
  model: '',
  resolution: '' as ProjectImageQuality | '',
});

const contentOptions = computed(() => contents.value.map((content) => ({ label: content.name, value: content.id })));
const formalAssets = computed(() => (flowData.value?.assets ?? []).filter((asset): asset is ProductionAssetSummary & { type: ProductionResourceDraftType } => RESOURCE_TYPES.includes(asset.type as ProductionResourceDraftType)));
const formalItems = computed<ResourceItem[]>(() => formalAssets.value.map((asset) => ({
  key: `asset-${asset.id}`,
  kind: 'asset',
  id: asset.id,
  type: asset.type,
  name: asset.name,
  description: asset.description,
  prompt: asset.prompt,
  imageUrl: asset.imageUrl,
  thumbnailUrl: asset.thumbnailUrl,
  imageStatus: asset.imageStatus,
  imageErrorReason: asset.imageErrorReason,
  asset,
})));
const draftItems = computed<ResourceItem[]>(() => drafts.value.map((draft) => ({
  key: `draft-${draft.id}`,
  kind: 'draft',
  id: draft.id,
  type: draft.type,
  name: draft.name,
  description: draft.description,
  prompt: draft.prompt,
  imageUrl: getMatchedAssetImage(draft.matchedAssetId),
  thumbnailUrl: getMatchedAssetThumbnail(draft.matchedAssetId),
  imageStatus: 'idle',
  imageErrorReason: draft.errorReason,
  draft,
})));
const resourceItems = computed(() => [...draftItems.value, ...formalItems.value]);
const activeItems = computed(() => resourceItems.value.filter((item) => item.type === activeType.value));
const resourceTabs = computed(() => RESOURCE_TYPES.map((type) => ({
  type,
  count: resourceItems.value.filter((item) => item.type === type).length,
})));
const runningImageIds = computed(() => formalItems.value.filter((item) => item.imageStatus === PRODUCTION_TASK_STATUS.RUNNING).map((item) => item.id));
const extractionStatus = computed<ResourceExtractStatus>(() => {
  const status = flowData.value?.content?.resourceStatus;
  if (extractPolling.value || status === PRODUCTION_TASK_STATUS.RUNNING) {
    return 'running';
  }
  if (status === PRODUCTION_TASK_STATUS.FAILED) {
    return 'failed';
  }
  if (drafts.value.length > 0 || formalItems.value.length > 0 || status === PRODUCTION_TASK_STATUS.SUCCEEDED) {
    return 'succeeded';
  }
  return 'idle';
});
const extractActionText = computed(() => (extractionStatus.value === 'failed' ? t('production.resourceWorkbench.retryExtract') : t('production.resourceWorkbench.extract')));
const draftActionOptions = computed(() => DRAFT_ACTIONS.map((action) => ({ label: t(`production.assetExtract.action.${action}`), value: action })));
const typeOptions = computed(() => RESOURCE_TYPES.map((type) => ({ label: t(`production.assetType.${type}`), value: type })));
const matchedAssetOptions = computed(() => existingAssets.value
  .filter((asset) => asset.type === editForm.type)
  .map((asset) => ({
    label: `${asset.name} / ${previewText(asset.description || asset.prompt, 34)}`,
    value: asset.id,
  })));
const imageModelOptions = computed(() => imageModels.value.map((model) => ({
  label: `${model.connectionName} / ${model.displayName}`,
  value: model.modelId,
})));
const selectedImageModel = computed(() => imageModels.value.find((model) => model.modelId === editForm.model) ?? null);
const resolutionValues = computed(() => selectedImageModel.value?.imageQualityOptions ?? []);
const resolutionOptions = computed(() => resolutionValues.value.map((resolution) => ({ label: resolution, value: resolution })));
const hasResolutionOptions = computed(() => resolutionValues.value.length > 0);
const editIsDraft = computed(() => editingItem.value?.kind === 'draft');
const editNeedsMatch = computed(() => editIsDraft.value && (editForm.action === 'merge' || editForm.action === 'replace'));
const editCanGenerateImage = computed(() => Boolean(editingItem.value && editForm.action !== 'skip'));
const editCanSubmitImage = computed(() => Boolean(editCanGenerateImage.value && !editCommitting.value && editForm.model && (!hasResolutionOptions.value || editForm.resolution)));
const editChanged = computed(() => {
  const item = editingItem.value;
  if (!item) {
    return false;
  }
  if (item.kind === 'draft') {
    const draft = item.draft;
    return draft.type !== editForm.type
      || draft.name !== editForm.name
      || draft.description !== editForm.description
      || draft.prompt !== editForm.prompt
      || draft.action !== editForm.action
      || draft.matchedAssetId !== editForm.matchedAssetId;
  }
  const asset = item.asset;
  return asset.type !== editForm.type
    || asset.name !== editForm.name
    || asset.description !== editForm.description
    || asset.prompt !== editForm.prompt;
});
const editPromptMayBeStale = computed(() => {
  const item = editingItem.value;
  if (!item || !editForm.prompt.trim()) {
    return false;
  }
  const sourceName = item.name;
  const sourceDescription = item.description;
  return (sourceName !== editForm.name || sourceDescription !== editForm.description)
    && item.prompt === editForm.prompt;
});

watch(() => editForm.model, () => {
  if (!hasResolutionOptions.value || !resolutionValues.value.includes(editForm.resolution as ProjectImageQuality)) {
    editForm.resolution = '';
  }
});
const editImageUrl = computed(() => editingItem.value?.imageUrl ?? null);
const editImageStatus = computed(() => editingItem.value?.imageStatus ?? 'idle');
const editImageActionText = computed(() => (editImageUrl.value ? t('production.resourceWorkbench.regenerateImage') : t('production.resourceWorkbench.generateImage')));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function queryContentId(): number | null {
  if (props.embedded && props.contentId) {
    return props.contentId;
  }
  const raw = Array.isArray(route.query.contentId) ? route.query.contentId[0] : route.query.contentId;
  const value = Number(raw ?? 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function previewText(value: string | null | undefined, limit: number): string {
  const text = value?.trim() ?? '';
  if (!text) {
    return t('production.emptyText');
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function getMatchedAssetImage(assetId: number | null): string | null {
  if (!assetId) {
    return null;
  }
  return existingAssets.value.find((asset) => asset.id === assetId)?.imageUrl ?? null;
}

function getMatchedAssetThumbnail(assetId: number | null): string | null {
  if (!assetId) {
    return null;
  }
  const asset = existingAssets.value.find((item) => item.id === assetId);
  return asset?.thumbnailUrl ?? asset?.imageUrl ?? null;
}

function getStatusTheme(status: string): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === PRODUCTION_TASK_STATUS.RUNNING || status === 'running') {
    return 'primary';
  }
  if (status === PRODUCTION_TASK_STATUS.SUCCEEDED || status === 'succeeded') {
    return 'success';
  }
  if (status === PRODUCTION_TASK_STATUS.FAILED || status === PRODUCTION_TASK_STATUS.CANCELLED || status === 'failed') {
    return 'danger';
  }
  if (status === 'idle') {
    return 'default';
  }
  return 'warning';
}

function clearExtractPoll(): void {
  if (extractPollTimer) {
    window.clearTimeout(extractPollTimer);
    extractPollTimer = null;
  }
}

function clearImagePoll(): void {
  if (imagePollTimer) {
    window.clearTimeout(imagePollTimer);
    imagePollTimer = null;
  }
}

function scheduleExtractPoll(): void {
  clearExtractPoll();
  if (!currentProjectId.value || !currentContentId.value || !extractPolling.value) {
    return;
  }
  extractPollTimer = window.setTimeout(() => void pollExtractStatus(), POLL_INTERVAL);
}

function scheduleImagePoll(): void {
  clearImagePoll();
  if (!currentProjectId.value || !currentContentId.value || runningImageIds.value.length === 0) {
    return;
  }
  imagePollTimer = window.setTimeout(() => void pollImageStatus(), POLL_INTERVAL);
}

function resetResourceState(): void {
  contents.value = [];
  currentContentId.value = null;
  flowData.value = null;
  drafts.value = [];
  existingAssets.value = [];
  editingItem.value = null;
  editVisible.value = false;
  extractPolling.value = false;
  extractError.value = null;
  clearExtractPoll();
  clearImagePoll();
}

async function loadDrafts(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) {
    drafts.value = [];
    existingAssets.value = [];
    return;
  }

  draftLoading.value = true;
  try {
    const response = await window.vtStudio.production.resources.listDrafts({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    drafts.value = response.data.drafts;
    existingAssets.value = response.data.existingAssets;
  } finally {
    draftLoading.value = false;
  }
}

async function loadImageModelConfig(): Promise<void> {
  const response = await window.vtStudio.project.getPageState();
  if (!isOk(response)) {
    imageModels.value = [];
    projectImageModelId.value = '';
    return;
  }

  imageModels.value = response.data.imageModels;
  const project = response.data.projects.find((item) => item.id === currentProjectId.value);
  const configuredModelId = project?.imageModelId ?? '';
  projectImageModelId.value = imageModels.value.some((model) => model.modelId === configuredModelId)
    ? configuredModelId
    : '';
  projectImageQuality.value = project?.imageQuality ?? '1K';
}

async function loadWorkbench(options: { contentId?: number | null; asRefresh?: boolean; keepDataOnError?: boolean } = {}): Promise<void> {
  if (!currentProjectId.value) {
    resetResourceState();
    return;
  }

  if (options.asRefresh) {
    refreshing.value = true;
  } else {
    loading.value = true;
  }

  try {
    const [response] = await Promise.all([
      window.vtStudio.production.getWorkspace({
        projectId: currentProjectId.value,
        contentId: options.contentId ?? currentContentId.value ?? queryContentId() ?? undefined,
      }),
      loadImageModelConfig(),
    ]);
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
    await loadDrafts();
    scheduleImagePoll();

    if (editingItem.value) {
      refreshEditingItem(editingItem.value);
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function refreshWorkbench(): Promise<void> {
  await loadWorkbench({ asRefresh: true, keepDataOnError: true });
}

async function handleContentChange(value: unknown): Promise<void> {
  if (props.embedded) {
    return;
  }
  const nextContentId = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isInteger(nextContentId) || nextContentId <= 0 || nextContentId === currentContentId.value) {
    return;
  }
  await router.replace({ name: 'production-resources', query: { contentId: String(nextContentId) } });
}

function selectType(type: ProductionResourceDraftType): void {
  activeType.value = type;
}

function openAssetsCenter(): void {
  void router.push({ name: 'assets' });
}

function openCanvas(): void {
  void router.push({ name: 'production' });
}

function syncEditForm(item: ResourceItem): void {
  editForm.type = item.type;
  editForm.name = item.name;
  editForm.description = item.description;
  editForm.prompt = item.prompt;
  editForm.model = projectImageModelId.value;
  const model = imageModels.value.find((model) => model.modelId === editForm.model);
  editForm.resolution = model?.imageQualityOptions?.includes(projectImageQuality.value)
    ? projectImageQuality.value
    : '';
  if (item.kind === 'draft') {
    editForm.action = item.draft.action;
    editForm.matchedAssetId = item.draft.matchedAssetId;
  } else {
    editForm.action = 'create';
    editForm.matchedAssetId = null;
  }
}

function openEditor(item: ResourceItem): void {
  editingItem.value = item;
  syncEditForm(item);
  editVisible.value = true;
}

function refreshEditingItem(previous: ResourceItem): void {
  const next = resourceItems.value.find((item) => item.key === previous.key)
    ?? (previous.kind === 'asset' ? resourceItems.value.find((item) => item.kind === 'asset' && item.id === previous.id) : null)
    ?? null;
  editingItem.value = next;
  if (!next) {
    editVisible.value = false;
  }
}

function validateEditForm(): boolean {
  if (editForm.action !== 'skip' && !editForm.name.trim()) {
    MessagePlugin.warning(t('production.resourceWorkbench.nameRequired'));
    return false;
  }
  if (editNeedsMatch.value && !editForm.matchedAssetId) {
    MessagePlugin.warning(t('production.assetExtract.matchRequired'));
    return false;
  }
  return true;
}

async function saveCurrentItem(showMessage = true): Promise<boolean> {
  const item = editingItem.value;
  if (!item || !currentProjectId.value || !currentContentId.value) {
    return false;
  }
  if (!validateEditForm()) {
    return false;
  }

  editSaving.value = true;
  try {
    if (item.kind === 'draft') {
      const response = await window.vtStudio.production.resources.saveDraft({
        projectId: currentProjectId.value,
        contentId: currentContentId.value,
        draftId: item.id,
        type: editForm.type,
        name: editForm.name,
        description: editForm.description,
        prompt: editForm.prompt,
        action: editForm.action,
        matchedAssetId: editForm.matchedAssetId,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return false;
      }
      drafts.value = drafts.value.map((draft) => (draft.id === response.data.draft.id ? response.data.draft : draft));
      editingItem.value = draftItems.value.find((draftItem) => draftItem.id === response.data.draft.id) ?? editingItem.value;
    } else {
      const response = await window.vtStudio.assets.save({
        projectId: currentProjectId.value,
        asset: {
          id: item.id,
          parentId: null,
          type: editForm.type,
          name: editForm.name,
          description: editForm.description,
          prompt: editForm.prompt,
        },
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return false;
      }
      await loadWorkbench({ asRefresh: true, keepDataOnError: true });
      const next = resourceItems.value.find((resource) => resource.kind === 'asset' && resource.id === item.id);
      editingItem.value = next ?? editingItem.value;
    }
    if (showMessage) {
      MessagePlugin.success(t('production.resourceWorkbench.saved'));
    }
    emit('changed');
    return true;
  } finally {
    editSaving.value = false;
  }
}

function findCommittedAssetId(action: ProductionResourceDraftAction, matchedAssetId: number | null, assets: ProductionAssetSummary[]): number | null {
  if ((action === 'merge' || action === 'replace') && matchedAssetId) {
    return matchedAssetId;
  }
  return assets.find((asset) => asset.type === editForm.type && asset.name.trim().toLowerCase() === editForm.name.trim().toLowerCase())?.id ?? null;
}

async function commitCurrentDraft(options: { keepDialog?: boolean } = {}): Promise<number | null> {
  const item = editingItem.value;
  if (!item || item.kind !== 'draft' || !currentProjectId.value || !currentContentId.value) {
    return item?.kind === 'asset' ? item.id : null;
  }
  if (!validateEditForm()) {
    return null;
  }
  if (editChanged.value) {
    const saved = await saveCurrentItem(false);
    if (!saved) {
      return null;
    }
  }

  editCommitting.value = true;
  try {
    const action = editForm.action;
    const matchedAssetId = editForm.matchedAssetId;
    const response = await window.vtStudio.production.resources.commitDrafts({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      draftIds: [item.id],
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return null;
    }

    flowData.value = response.data.flowData;
    drafts.value = response.data.drafts;
    const assetId = findCommittedAssetId(action, matchedAssetId, response.data.assets);
    MessagePlugin.success(t('production.resourceWorkbench.committed'));
    emit('changed');
    await loadWorkbench({ asRefresh: true, keepDataOnError: true });

    if (options.keepDialog && assetId) {
      const next = resourceItems.value.find((resource) => resource.kind === 'asset' && resource.id === assetId);
      if (next) {
        editingItem.value = next;
      }
    } else {
      editVisible.value = false;
      editingItem.value = null;
    }

    return assetId;
  } finally {
    editCommitting.value = false;
  }
}

async function deleteCurrentDraft(): Promise<void> {
  const item = editingItem.value;
  if (!item || item.kind !== 'draft' || !currentProjectId.value || !currentContentId.value) {
    return;
  }

  editDeleting.value = true;
  try {
    const response = await window.vtStudio.production.resources.deleteDraft({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      draftId: item.id,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    drafts.value = drafts.value.filter((draft) => draft.id !== item.id);
    editVisible.value = false;
    editingItem.value = null;
    MessagePlugin.success(t('production.deleted'));
    emit('changed');
  } finally {
    editDeleting.value = false;
  }
}

async function ensureAssetForImage(): Promise<number | null> {
  const item = editingItem.value;
  if (!item) {
    return null;
  }
  if (item.kind === 'asset') {
    if (editChanged.value) {
      const saved = await saveCurrentItem(false);
      if (!saved) {
        return null;
      }
    }
    return item.id;
  }
  return commitCurrentDraft({ keepDialog: true });
}

async function generateImage(): Promise<void> {
  if (!currentProjectId.value) {
    return;
  }
  if (!editForm.model.trim()) {
    MessagePlugin.warning(t('production.resourceWorkbench.modelRequired'));
    return;
  }
  if (hasResolutionOptions.value && (!editForm.resolution || !resolutionValues.value.includes(editForm.resolution))) {
    MessagePlugin.warning(t('production.workbench.capabilityUnavailable'));
    return;
  }
  if (!editForm.prompt.trim()) {
    MessagePlugin.warning(t('production.resourceWorkbench.promptRequired'));
    return;
  }

  imageGenerating.value = true;
  try {
    const assetId = await ensureAssetForImage();
    if (!assetId) {
      return;
    }
    const response = await window.vtStudio.assets.generateImage({
      projectId: currentProjectId.value,
      assetId,
      model: editForm.model.trim(),
      resolution: hasResolutionOptions.value ? editForm.resolution as ProjectImageQuality : null,
      prompt: editForm.prompt,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.resourceWorkbench.imageStarted'));
    emit('changed');
    await loadWorkbench({ asRefresh: true, keepDataOnError: true });
    const next = resourceItems.value.find((item) => item.kind === 'asset' && item.id === assetId);
    if (next) {
      editingItem.value = next;
    }
    scheduleImagePoll();
  } finally {
    imageGenerating.value = false;
  }
}

async function extractResources(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }

  extractStarting.value = true;
  extractError.value = null;
  try {
    const response = await window.vtStudio.production.workflow.runAction({
      projectId: currentProjectId.value,
      contentId: currentContentId.value,
      step: 'resources',
      input: {},
    });
    if (!isOk(response)) {
      extractError.value = response.msg;
      MessagePlugin.error(response.msg);
      return;
    }
    extractPolling.value = true;
    MessagePlugin.success(t('production.node.assets.extractStarted'));
    emit('changed');
    await loadWorkbench({ asRefresh: true, keepDataOnError: true });
    scheduleExtractPoll();
  } finally {
    extractStarting.value = false;
  }
}

async function pollExtractStatus(): Promise<void> {
  if (!currentProjectId.value || !currentContentId.value || !extractPolling.value) {
    clearExtractPoll();
    return;
  }

  const response = await window.vtStudio.production.resources.pollExtractStatus({
    projectId: currentProjectId.value,
    contentIds: [currentContentId.value],
  });
  if (!isOk(response)) {
    extractPolling.value = false;
    extractError.value = response.msg;
    MessagePlugin.error(response.msg);
    return;
  }

  const [content] = response.data.contents;
  if (!content || content.resourceStatus === PRODUCTION_TASK_STATUS.RUNNING) {
    scheduleExtractPoll();
    return;
  }

  extractPolling.value = false;
  clearExtractPoll();
  await loadWorkbench({ asRefresh: true, keepDataOnError: true });
  if (content.resourceStatus === PRODUCTION_TASK_STATUS.SUCCEEDED) {
    MessagePlugin.success(t('production.assetExtract.completed'));
    emit('changed');
    return;
  }
  if (content.resourceStatus === PRODUCTION_TASK_STATUS.FAILED) {
    extractError.value = content.resourceErrorReason;
    MessagePlugin.error(content.resourceErrorReason || t('production.assetExtract.failed'));
  }
}

async function pollImageStatus(): Promise<void> {
  if (!currentProjectId.value || runningImageIds.value.length === 0) {
    clearImagePoll();
    return;
  }
  const response = await window.vtStudio.assets.pollImageStatus({
    projectId: currentProjectId.value,
    assetIds: [...runningImageIds.value],
  });
  if (isOk(response) && response.data.assets.length > 0) {
    await loadWorkbench({ asRefresh: true, keepDataOnError: true });
    emit('changed');
    return;
  }
  scheduleImagePoll();
}

watch(currentProjectId, () => {
  void loadWorkbench({ contentId: queryContentId() });
});

watch(() => route.query.contentId, () => {
  if (props.embedded) {
    return;
  }
  const nextContentId = queryContentId();
  if (nextContentId && nextContentId !== currentContentId.value) {
    void loadWorkbench({ contentId: nextContentId, keepDataOnError: true });
  }
});

watch(() => props.contentId, (contentId) => {
  if (props.embedded && contentId && contentId !== currentContentId.value) {
    void loadWorkbench({ contentId, keepDataOnError: true });
  }
});

watch(() => editForm.type, (type) => {
  if (editForm.matchedAssetId && !existingAssets.value.some((asset) => asset.id === editForm.matchedAssetId && asset.type === type)) {
    editForm.matchedAssetId = null;
  }
});

watch(() => editForm.action, (action) => {
  if (action === 'create' || action === 'skip') {
    editForm.matchedAssetId = null;
  }
});

onMounted(() => {
  void loadWorkbench({ contentId: queryContentId() });
});

onUnmounted(() => {
  clearExtractPoll();
  clearImagePoll();
});
</script>

<template>
  <div class="resource-workbench-page" :class="{ 'is-embedded': embedded }">
    <header v-if="!embedded" class="resource-workbench-head">
      <div class="resource-workbench-title">
        <span>{{ currentProjectName }}</span>
        <strong>{{ t('production.resourceWorkbench.title') }}</strong>
      </div>
      <label>
        <span>{{ t('production.resourceWorkbench.currentContent') }}</span>
        <t-select :model-value="currentContentId" :options="contentOptions" :placeholder="t('production.scriptPlaceholder')" :loading="loading" size="small" filterable @change="handleContentChange" />
      </label>
      <div class="resource-workbench-actions">
        <t-tag :theme="getStatusTheme(extractionStatus)" variant="light">{{ t(`production.resourceWorkbench.status.${extractionStatus}`) }}</t-tag>
        <t-tooltip :content="extractActionText">
          <VtButton theme="primary" variant="base" shape="square" icon-only :min-width="0" :aria-label="extractActionText" :loading="extractStarting || extractPolling" :disabled="extractPolling" @click="extractResources">
            <template #icon><PlayCircleIcon /></template>
          </VtButton>
        </t-tooltip>
        <t-tooltip :content="t('production.refresh')">
          <VtButton variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.refresh')" :loading="refreshing || draftLoading" @click="refreshWorkbench">
            <template #icon><RefreshIcon /></template>
          </VtButton>
        </t-tooltip>
        <t-tooltip :content="t('production.resourceWorkbench.assetCenter')">
          <VtButton variant="outline" shape="square" icon-only :min-width="0" :aria-label="t('production.resourceWorkbench.assetCenter')" @click="openAssetsCenter">
            <template #icon><FolderOpenIcon /></template>
          </VtButton>
        </t-tooltip>
      </div>
    </header>

    <div v-if="extractError" class="resource-workbench-error">
      <strong>{{ t('production.assetExtract.failed') }}</strong>
      <span>{{ extractError }}</span>
    </div>

    <main class="resource-workbench-main">
      <aside class="resource-workbench-tabs" :aria-label="t('production.assetExtract.typeTabs')">
        <button v-for="tab in resourceTabs" :key="tab.type" type="button" :class="{ 'is-active': activeType === tab.type }" @click="selectType(tab.type)">
          <span>{{ t(`production.assetType.${tab.type}`) }}</span>
          <em>{{ tab.count }}</em>
        </button>
      </aside>

      <section class="resource-workbench-content">
        <div class="resource-workbench-toolbar" :class="{ 'is-embedded': embedded }">
          <div v-if="!embedded">
            <strong>{{ t(`production.assetType.${activeType}`) }}</strong>
          </div>
          <VtButton v-if="!embedded" size="small" variant="outline" @click="openCanvas">{{ t('production.resourceWorkbench.backCanvas') }}</VtButton>
          <div v-else class="resource-workbench-actions">
            <t-tooltip :content="t('production.refresh')">
              <VtButton variant="outline" shape="square" size="small" icon-only :min-width="0" :aria-label="t('production.refresh')" :loading="refreshing || draftLoading" @click="refreshWorkbench">
                <template #icon><RefreshIcon /></template>
              </VtButton>
            </t-tooltip>
            <VtButton class="resource-workbench-extract" theme="primary" variant="base" size="small" :loading="extractStarting || extractPolling" :disabled="extractPolling || !currentContentId" @click="extractResources">
              <template #icon><PlayCircleIcon /></template>
              {{ extractActionText }}
            </VtButton>
          </div>
        </div>

        <t-loading class="resource-workbench-loading" :loading="loading || draftLoading">
          <div v-if="activeItems.length > 0" class="resource-workbench-grid">
            <button v-for="item in activeItems" :key="item.key" type="button" class="resource-card" :aria-label="item.name" @click="openEditor(item)">
              <div class="resource-card-image">
                <img v-if="item.imageUrl" :src="item.thumbnailUrl || item.imageUrl" :alt="item.name" />
                <ImageIcon v-else />
                <div class="resource-card-title">
                  <span>{{ t(`production.assetType.${item.type}`) }}</span>
                  <strong>{{ item.name }}</strong>
                </div>
                <t-tag v-if="item.kind === 'draft'" class="resource-card-kind" size="small" theme="warning" variant="light">
                  {{ t('production.resourceWorkbench.draft') }}
                </t-tag>
              </div>
              <div class="resource-card-body">
                <span>{{ previewText(item.description, 72) }}</span>
                <t-tag v-if="item.kind === 'draft'" size="small" variant="light">{{ t(`production.assetExtract.action.${item.draft.action}`) }}</t-tag>
              </div>
            </button>
          </div>
          <VtEmptyState v-else :description="extractPolling ? t('production.assetExtract.waitingDrafts') : t('production.resourceWorkbench.empty')" />
        </t-loading>
      </section>
    </main>

    <VtDialog
      :visible="editVisible"
      :title="editingItem?.name || t('production.resourceWorkbench.editTitle')"
      width="920px"
      dialog-class-name="resource-editor-dialog"
      :footer="false"
      @update:visible="(value) => (editVisible = value)"
    >
      <div v-if="editingItem" class="resource-editor">
        <div class="resource-editor-preview">
          <PreviewableImage
            v-if="editImageUrl"
            class="resource-editor-image"
            :src="editImageUrl"
            :alt="editingItem.name"
            :heading="editingItem.name"
            aspect-ratio="16 / 9"
            viewport-class="!min-h-0"
            image-class="!max-h-none !object-contain"
          />
          <div v-else class="resource-editor-image-empty">
            <ImageIcon />
          </div>
          <div class="resource-editor-status">
            <t-tag :theme="editingItem.kind === 'draft' ? 'warning' : 'success'" variant="light">{{ editingItem.kind === 'draft' ? t('production.resourceWorkbench.draft') : t('production.resourceWorkbench.asset') }}</t-tag>
            <t-tag v-if="editingItem.kind === 'asset'" :theme="getStatusTheme(editImageStatus)" variant="light">{{ t(`production.status.${editImageStatus}`) }}</t-tag>
          </div>
          <span v-if="editingItem.imageErrorReason" class="resource-editor-error">{{ editingItem.imageErrorReason }}</span>
        </div>

        <div class="resource-editor-form">
          <div class="resource-editor-grid">
            <label>
              <span>{{ t('production.assetExtract.field.type') }}</span>
              <t-select v-model="editForm.type" :options="typeOptions" />
            </label>
            <label v-if="editIsDraft">
              <span>{{ t('production.assetExtract.field.action') }}</span>
              <t-select v-model="editForm.action" :options="draftActionOptions" />
            </label>
            <label v-if="editIsDraft" class="is-wide">
              <span>{{ t('production.assetExtract.field.matchedAsset') }}</span>
              <t-select v-model="editForm.matchedAssetId" clearable filterable :disabled="!editNeedsMatch" :options="matchedAssetOptions" :placeholder="editNeedsMatch ? t('production.assetExtract.matchPlaceholder') : t('production.assetExtract.matchDisabled')" />
            </label>
            <label class="is-wide">
              <span>{{ t('production.assetExtract.field.name') }}</span>
              <t-input v-model="editForm.name" :disabled="editForm.action === 'skip'" />
            </label>
            <label class="is-wide">
              <span>{{ t('production.assetExtract.field.description') }}</span>
              <t-textarea v-model="editForm.description" :disabled="editForm.action === 'skip'" :autosize="{ minRows: 3, maxRows: 6 }" />
            </label>
            <label class="is-wide">
              <VtPromptEditor
                v-model="editForm.prompt"
                :label="t('production.assetExtract.field.prompt')"
                :disabled="editForm.action === 'skip'"
                :placeholder="t('production.node.storyboard.promptPlaceholder')"
                :min-rows="5"
                :max-rows="9"
              />
            </label>
            <t-alert v-if="editPromptMayBeStale" class="is-wide" theme="warning" :message="t('production.resourceWorkbench.promptStale')" />
          </div>

          <div class="resource-editor-generate">
            <label>
              <span>{{ t('production.resourceWorkbench.model') }}</span>
              <t-select v-model="editForm.model" :options="imageModelOptions" :placeholder="t('production.resourceWorkbench.modelPlaceholder')" :disabled="!editCanGenerateImage || imageModelOptions.length === 0" />
            </label>
            <label v-if="hasResolutionOptions">
              <span>{{ t('production.resourceWorkbench.resolution') }}</span>
              <t-select v-model="editForm.resolution" :options="resolutionOptions" :disabled="!editCanGenerateImage" />
            </label>
          </div>

          <VtActionBar class="resource-editor-actions" align="end" density="compact">
            <VtButton v-if="editIsDraft" variant="outline" :loading="editDeleting" :disabled="editCommitting || imageGenerating" @click="deleteCurrentDraft">
              <template #icon><CloseIcon /></template>
              {{ t('production.delete') }}
            </VtButton>
            <VtButton variant="outline" :loading="editSaving" :disabled="!editChanged || editCommitting || imageGenerating" @click="saveCurrentItem()">
              <template #icon><SaveIcon /></template>
              {{ t('production.save') }}
            </VtButton>
            <VtButton v-if="editIsDraft" theme="primary" variant="base" :loading="editCommitting" :disabled="editForm.action === 'skip' || imageGenerating" @click="commitCurrentDraft()">
              <template #icon><SaveIcon /></template>
              {{ t('production.assetExtract.commit') }}
            </VtButton>
            <VtButton theme="primary" variant="base" :loading="imageGenerating" :disabled="!editCanSubmitImage" @click="generateImage">
              <template #icon><ImageIcon /></template>
              {{ editImageActionText }}
            </VtButton>
          </VtActionBar>
        </div>
      </div>
    </VtDialog>
  </div>
</template>

<style scoped>
.resource-workbench-page {
  --rw-bg: var(--vt-surface-app);
  --rw-panel: color-mix(in srgb, var(--vt-surface-panel) 94%, transparent);
  --rw-raised: var(--vt-surface-raised);
  --rw-line: var(--vt-line-soft);
  --rw-text: var(--vt-text-primary);
  --rw-text-secondary: var(--vt-text-secondary);
  --rw-text-muted: var(--vt-text-muted);
  --rw-brand: var(--vt-brand);
  --rw-danger: var(--vt-danger);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
  padding: 16px;
  color: var(--rw-text);
  background: var(--rw-bg);
}

.resource-workbench-page.is-embedded {
  --rw-bg: transparent;
  --rw-panel: color-mix(in srgb, var(--flow-panel, var(--vt-surface-panel)) 94%, transparent);
  --rw-raised: var(--flow-panel-raised, var(--vt-surface-raised));
  --rw-line: var(--flow-line, var(--vt-line-soft));
  --rw-text: var(--flow-text, var(--vt-text-primary));
  --rw-text-secondary: var(--flow-subtle, var(--vt-text-secondary));
  --rw-text-muted: var(--flow-muted, var(--vt-text-muted));
  --rw-brand: var(--flow-accent, var(--vt-brand));
  gap: 8px;
  padding: 0;
  background: transparent;
}

.resource-workbench-head {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(240px, 380px) auto;
  align-items: end;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--rw-line);
  border-radius: 8px;
  background: var(--rw-panel);
}

.resource-workbench-title,
.resource-workbench-head label,
.resource-workbench-toolbar > div:not(.resource-workbench-actions),
.resource-editor-form label {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.resource-workbench-title span,
.resource-workbench-head label > span,
.resource-workbench-toolbar span,
.resource-card-body span,
.resource-editor-form label > span,
.resource-editor-error {
  color: var(--rw-text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.resource-workbench-title strong,
.resource-workbench-toolbar strong {
  overflow: hidden;
  font-size: 17px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-workbench-actions,
.resource-editor-status,
.resource-editor-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.resource-workbench-actions :deep(.vt-button--icon-only) {
  width: 34px;
  height: 34px;
  padding: 0;
}

.resource-workbench-actions :deep(.resource-workbench-extract) {
  height: 34px;
  min-width: 88px;
  padding-right: 12px;
  padding-left: 12px;
}

.resource-workbench-error {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--rw-danger) 34%, var(--rw-line));
  border-radius: 8px;
  color: var(--rw-danger);
  background: color-mix(in srgb, var(--rw-danger) 8%, var(--rw-raised));
}

.resource-workbench-error strong {
  color: var(--rw-text);
  font-size: 13px;
}

.resource-workbench-error span {
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.6;
}

.resource-workbench-main {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  flex: 1 1 auto;
  gap: 12px;
  min-height: 0;
}

.resource-workbench-tabs,
.resource-workbench-content {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--rw-line);
  border-radius: 8px;
  background: var(--rw-panel);
}

.resource-workbench-tabs {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 8px;
}

.resource-workbench-tabs button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--rw-text-secondary);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.resource-workbench-tabs button:hover,
.resource-workbench-tabs button.is-active {
  border-color: color-mix(in srgb, var(--rw-brand) 30%, var(--rw-line));
  color: var(--rw-text);
  background: color-mix(in srgb, var(--rw-brand) 8%, var(--rw-raised));
}

.resource-workbench-tabs span {
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-workbench-tabs em {
  min-width: 26px;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--rw-text-muted);
  background: var(--rw-raised);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
  text-align: center;
}

.resource-workbench-content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.resource-workbench-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--rw-line);
}

.resource-workbench-toolbar.is-embedded {
  justify-content: flex-end;
  min-height: 42px;
  padding: 4px 8px;
}

.resource-workbench-toolbar > .resource-workbench-actions {
  flex-wrap: nowrap;
}

.resource-workbench-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  align-content: start;
  gap: 10px;
  min-height: 0;
  max-height: 100%;
  overflow: auto;
  padding: 10px 12px 12px;
  scrollbar-gutter: stable;
}

.resource-workbench-loading {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.resource-card {
  display: grid;
  grid-template-rows: 150px auto;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--rw-line);
  border-radius: 8px;
  background: var(--rw-raised);
  cursor: pointer;
  text-align: left;
}

.resource-card:hover {
  border-color: color-mix(in srgb, var(--rw-brand) 34%, var(--rw-line));
}

.resource-card-image,
.resource-editor-image-empty {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--rw-panel);
}

.resource-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resource-card-title {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  gap: 2px;
  padding: 28px 10px 10px;
  color: #fff;
  background: linear-gradient(180deg, transparent 0%, rgb(0 0 0 / 68%) 100%);
}

.resource-card-title span {
  overflow: hidden;
  color: rgb(255 255 255 / 72%);
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card-title strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card-image > svg,
.resource-editor-image-empty > svg {
  width: 34px;
  height: 34px;
  color: color-mix(in srgb, var(--rw-text-muted) 78%, transparent);
}

.resource-card-kind {
  position: absolute;
  left: 8px;
  top: 8px;
}

.resource-card-body {
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
  padding: 10px;
}

.resource-card-body strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card-body span {
  display: -webkit-box;
  overflow: hidden;
  min-height: 38px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.resource-card-body > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.resource-editor {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
  max-height: calc(100dvh - 132px);
  overflow: auto;
}

.resource-editor-preview {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
}

.resource-editor-image,
.resource-editor-image-empty {
  aspect-ratio: 16 / 9;
  margin: 0;
  border: 1px solid var(--rw-line);
  border-radius: 8px;
}

.resource-editor-image {
  background: var(--rw-raised);
}

.resource-editor-status {
  justify-content: flex-start;
}

.resource-editor-error {
  color: var(--rw-danger);
  overflow-wrap: anywhere;
}

.resource-editor-form {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}

.resource-editor-grid,
.resource-editor-generate {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.resource-editor-grid label.is-wide {
  grid-column: 1 / -1;
}

.resource-editor-actions {
  padding-top: 2px;
}

:global(.resource-editor-dialog) {
  max-height: calc(100dvh - 32px);
}

:global(.resource-editor-dialog .t-dialog__body) {
  max-height: calc(100dvh - 108px);
  overflow: hidden;
}

@media (max-width: 900px) {
  .resource-workbench-head,
  .resource-workbench-main,
  .resource-editor {
    grid-template-columns: minmax(0, 1fr);
  }

  .resource-workbench-actions {
    justify-content: flex-start;
  }

  .resource-workbench-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .resource-workbench-main {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .resource-editor-preview {
    grid-template-columns: 160px minmax(0, 1fr);
    align-items: start;
  }
}

@media (max-width: 620px) {
  .resource-workbench-page {
    padding: 10px;
  }

  .resource-workbench-tabs,
  .resource-editor-grid,
  .resource-editor-generate,
  .resource-editor-preview {
    grid-template-columns: minmax(0, 1fr);
  }

  .resource-workbench-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .resource-editor-actions {
    justify-content: flex-start;
  }
}
</style>
