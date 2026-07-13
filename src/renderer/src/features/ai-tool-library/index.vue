<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AddIcon, ArticleIcon, CopyIcon, ImageIcon, PlayCircleIcon, SaveIcon, VideoIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import { useAppStore } from '@renderer/stores/app';
import { PROJECT_SOURCE_TYPES, PROJECT_TEMPLATE_TYPES } from '@shared/constants/dictionaries';
import type { ProjectPageStateResult, ProjectSavePayload } from '@shared/types/project';

type ToolKey = 'longTextSplit' | 'adaptation' | 'contentOrganize' | 'assetExtract' | 'directorPlan' | 'storyboardTable' | 'imagePrompt' | 'videoPrompt' | 'batchImage' | 'batchVideo';
type BindTarget = 'content' | 'directorPlan' | 'assets' | 'storyboardTable' | 'storyboard' | 'videoPrompt';

interface AiToolItem {
  key: ToolKey;
  icon: Component;
  bindTargets: BindTarget[];
}

interface ToolResultDraft {
  title: string;
  summary: string;
  content: string;
  items: string[];
}

const DRAFT_STORAGE_KEY = 'vt:ai-tool-library:drafts';

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();

const currentProject = computed(() => appStore.currentProject);
const currentProjectId = computed(() => Number(currentProject.value?.id ?? 0));
const hasCurrentProject = computed(() => Boolean(currentProjectId.value));
const selectedToolKey = ref<ToolKey>('longTextSplit');
const toolInput = ref('');
const actionLoading = ref(false);
const bindConfirmVisible = ref(false);
const pendingBindTarget = ref<BindTarget | null>(null);

const tools: AiToolItem[] = [
  { key: 'longTextSplit', icon: ArticleIcon, bindTargets: ['content'] },
  { key: 'adaptation', icon: ArticleIcon, bindTargets: ['content'] },
  { key: 'contentOrganize', icon: ArticleIcon, bindTargets: ['content', 'directorPlan'] },
  { key: 'assetExtract', icon: ArticleIcon, bindTargets: ['assets'] },
  { key: 'directorPlan', icon: VideoIcon, bindTargets: ['directorPlan'] },
  { key: 'storyboardTable', icon: VideoIcon, bindTargets: ['storyboardTable', 'storyboard'] },
  { key: 'imagePrompt', icon: ImageIcon, bindTargets: ['storyboardTable', 'storyboard'] },
  { key: 'videoPrompt', icon: PlayCircleIcon, bindTargets: ['videoPrompt'] },
  { key: 'batchImage', icon: ImageIcon, bindTargets: ['storyboard'] },
  { key: 'batchVideo', icon: PlayCircleIcon, bindTargets: ['videoPrompt'] },
];

const selectedTool = computed(() => tools.find((tool) => tool.key === selectedToolKey.value) ?? tools[0]!);
const bindConfirmImpact = computed(() => (pendingBindTarget.value ? t(`aiToolLibrary.bindImpact.${pendingBindTarget.value}`) : ''));
const inputLines = computed(() => toolInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
const resultDraft = computed<ToolResultDraft | null>(() => {
  const source = toolInput.value.trim();
  if (!source) {
    return null;
  }

  const lines = inputLines.value.length ? inputLines.value : [source.slice(0, 80)];
  const items = selectedToolKey.value === 'longTextSplit'
    ? lines.map((line, index) => `${t('aiToolLibrary.result.episodePrefix', { index: index + 1 })}${line}`)
    : lines.slice(0, 8).map((line, index) => `${index + 1}. ${line}`);

  return {
    title: t(`aiToolLibrary.tool.${selectedToolKey.value}.title`),
    summary: t(`aiToolLibrary.tool.${selectedToolKey.value}.resultSummary`, { count: items.length }),
    content: source,
    items,
  };
});

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function selectTool(tool: AiToolItem): void {
  selectedToolKey.value = tool.key;
}

function openProjects(): void {
  void router.push({ name: 'projects' });
}

function openCanvas(): void {
  if (!hasCurrentProject.value) {
    MessagePlugin.warning(t('aiToolLibrary.needWork'));
    return;
  }
  void router.push({ name: 'production' });
}

function requestBindToCurrentWork(target: BindTarget): void {
  if (!resultDraft.value) {
    MessagePlugin.warning(t('aiToolLibrary.result.empty'));
    return;
  }
  if (!hasCurrentProject.value) {
    MessagePlugin.warning(t('aiToolLibrary.needWork'));
    return;
  }
  pendingBindTarget.value = target;
  bindConfirmVisible.value = true;
}

async function confirmBindToCurrentWork(): Promise<void> {
  if (!pendingBindTarget.value) {
    bindConfirmVisible.value = false;
    return;
  }
  await bindToCurrentWork(pendingBindTarget.value);
  bindConfirmVisible.value = false;
  pendingBindTarget.value = null;
}

function cancelBindConfirm(): void {
  if (actionLoading.value) {
    return;
  }
  bindConfirmVisible.value = false;
  pendingBindTarget.value = null;
}

function updateBindConfirmVisible(value: boolean): void {
  if (value) {
    bindConfirmVisible.value = true;
    return;
  }
  cancelBindConfirm();
}

function serializeResult(): string {
  const result = resultDraft.value;
  if (!result) {
    return '';
  }
  return [result.title, result.summary, '', result.content, '', ...result.items].join('\n');
}

async function copyResult(): Promise<void> {
  const content = serializeResult();
  if (!content) {
    MessagePlugin.warning(t('aiToolLibrary.result.empty'));
    return;
  }
  await navigator.clipboard.writeText(content);
  MessagePlugin.success(t('aiToolLibrary.result.copied'));
}

function saveDraft(): void {
  const result = resultDraft.value;
  if (!result) {
    MessagePlugin.warning(t('aiToolLibrary.result.empty'));
    return;
  }
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  const drafts = raw ? safeParseDrafts(raw) : [];
  drafts.unshift(result);
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.slice(0, 20)));
  MessagePlugin.success(t('aiToolLibrary.result.saved'));
}

function safeParseDrafts(raw: string): ToolResultDraft[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ToolResultDraft[] : [];
  } catch {
    return [];
  }
}

function resolveWorkTitles(batch: boolean): string[] {
  const result = resultDraft.value;
  if (!result) {
    return [];
  }
  if (!batch) {
    return [result.title];
  }
  return result.items.length ? result.items.slice(0, 12).map((item, index) => previewText(item.replace(/^\d+\.\s*/, ''), 28) || t('aiToolLibrary.result.workFallback', { index: index + 1 })) : [result.title];
}

async function getDefaultProjectPayload(title: string, content: string): Promise<ProjectSavePayload | null> {
  const response = await window.vtStudio.project.getPageState();
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return null;
  }

  const state: ProjectPageStateResult = response.data;
  const imageModel = state.imageModels[0];
  const videoModel = state.videoModels[0];
  const visualManual = state.visualManuals[0];
  const directorManual = state.directorManuals[0];
  const videoMode = videoModel?.modes?.[0]?.value ?? '';
  const imageQuality = state.imageQualityOptions[0];
  const videoRatio = state.videoRatioOptions[0];
  if (!imageModel || !videoModel || !visualManual || !directorManual || !imageQuality || !videoRatio) {
    MessagePlugin.warning(t('aiToolLibrary.result.projectDefaultsMissing'));
    return null;
  }

  return {
    templateType: PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA,
    ['source' + 'Type']: PROJECT_SOURCE_TYPES.SCRIPT,
    name: title,
    genre: t('aiToolLibrary.result.defaultGenre'),
    description: previewText(content, 120),
    imageModelId: imageModel.modelId,
    imageQuality,
    videoModelId: videoModel.modelId,
    videoMode,
    videoRatio,
    visualManualId: visualManual.id,
    directorManualId: directorManual.id,
  } as unknown as ProjectSavePayload;
}

async function createWorks(batch: boolean): Promise<void> {
  const result = resultDraft.value;
  if (!result) {
    MessagePlugin.warning(t('aiToolLibrary.result.empty'));
    return;
  }

  actionLoading.value = true;
  try {
    const titles = resolveWorkTitles(batch);
    let created = 0;
    for (const title of titles) {
      const payload = await getDefaultProjectPayload(title, result.content);
      if (!payload) {
        return;
      }
      const response = await window.vtStudio.project.create(payload);
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      created += 1;
    }
    MessagePlugin.success(t('aiToolLibrary.result.createdWorks', { count: created }));
    await router.push({ name: 'projects' });
  } finally {
    actionLoading.value = false;
  }
}

async function bindToCurrentWork(target: BindTarget): Promise<void> {
  const result = resultDraft.value;
  if (!result) {
    MessagePlugin.warning(t('aiToolLibrary.result.empty'));
    return;
  }
  if (!currentProjectId.value) {
    MessagePlugin.warning(t('aiToolLibrary.needWork'));
    return;
  }

  actionLoading.value = true;
  try {
    const workspaceResponse = await window.vtStudio.production.getWorkspace({ projectId: currentProjectId.value });
    if (!isOk(workspaceResponse)) {
      MessagePlugin.error(workspaceResponse.msg);
      return;
    }

    let contentId = workspaceResponse.data.currentContentId;
    if (!contentId) {
      const response = await window.vtStudio.production.content.save({
        projectId: currentProjectId.value,
        title: result.title,
        body: result.content,
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      contentId = response.data.content.id;
      if (target === 'content') {
        MessagePlugin.success(t('aiToolLibrary.result.bound'));
        await router.push({ name: 'production' });
        return;
      }
    }

    if (target === 'assets') {
      const response = await window.vtStudio.production.tools.run({
        projectId: currentProjectId.value,
        contentId,
        toolName: 'extract_resources',
        source: 'toolLibrary',
        input: {},
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      MessagePlugin.success(t('aiToolLibrary.result.assetExtractionStarted'));
      await router.push({ name: 'production' });
      return;
    }

    if (!contentId) {
      MessagePlugin.warning(t('aiToolLibrary.result.noContentVersion'));
      return;
    }

    if (target === 'content') {
      const response = await window.vtStudio.production.tools.run({
        projectId: currentProjectId.value,
        contentId,
        toolName: 'save_content',
        source: 'toolLibrary',
        input: { title: result.title, body: result.content },
      });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }
      MessagePlugin.success(t('aiToolLibrary.result.bound'));
      await router.push({ name: 'production' });
      return;
    }

    if (target === 'storyboard') {
      const drafts = result.items.length ? result.items : [result.content];
      for (const [index, item] of drafts.slice(0, 12).entries()) {
        const response = await window.vtStudio.production.tools.run({
          projectId: currentProjectId.value,
          contentId,
          toolName: 'add_storyboard',
          source: 'toolLibrary',
          input: {
            videoDesc: item,
            prompt: '',
            duration: 4,
            index,
            shouldGenerateImage: true,
            associatedAssetIds: [],
          },
        });
        if (!isOk(response)) {
          MessagePlugin.error(response.msg);
          return;
        }
      }
      MessagePlugin.success(t('aiToolLibrary.result.bound'));
      await router.push({ name: 'production' });
      return;
    }

    if (target === 'videoPrompt') {
      MessagePlugin.info(t('aiToolLibrary.result.videoPromptOpenCanvas'));
      await router.push({ name: 'production' });
      return;
    }

    const content = target === 'storyboardTable' ? result.items.join('\n') || result.content : result.content;
    const response = await window.vtStudio.production.tools.run({
      projectId: currentProjectId.value,
      contentId,
      toolName: target === 'directorPlan' ? 'save_director_plan' : 'save_storyboard_table',
      source: 'toolLibrary',
      input: target === 'directorPlan' ? { directorPlan: content } : { storyboardTable: content },
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('aiToolLibrary.result.bound'));
    await router.push({ name: 'production' });
  } finally {
    actionLoading.value = false;
  }
}

function previewText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
</script>

<template>
  <div class="ai-tool-library-page">
    <section class="ai-tool-library-head">
      <div>
        <h3>{{ t('aiToolLibrary.title') }}</h3>
        <p>{{ t('aiToolLibrary.summary') }}</p>
      </div>
      <div class="ai-tool-library-context">
        <span>{{ t('aiToolLibrary.currentWork') }}</span>
        <strong>{{ currentProject?.name ?? t('aiToolLibrary.noWork') }}</strong>
      </div>
    </section>

    <section class="ai-tool-library-workspace">
      <aside class="ai-tool-library-rail">
        <button v-for="tool in tools" :key="tool.key" class="ai-tool-library-tab" :class="{ 'is-active': selectedToolKey === tool.key }" type="button" @click="selectTool(tool)">
          <component :is="tool.icon" />
          <span>{{ t(`aiToolLibrary.tool.${tool.key}.title`) }}</span>
        </button>
      </aside>

      <main class="ai-tool-library-main">
        <section class="ai-tool-library-panel">
          <div class="ai-tool-library-panel-head">
            <div class="ai-tool-card-icon">
              <component :is="selectedTool.icon" />
            </div>
            <div>
              <h3>{{ t(`aiToolLibrary.tool.${selectedTool.key}.title`) }}</h3>
              <p>{{ t(`aiToolLibrary.tool.${selectedTool.key}.summary`) }}</p>
            </div>
          </div>

          <label class="ai-tool-library-input">
            <span>{{ t('aiToolLibrary.inputLabel') }}</span>
            <t-textarea v-model="toolInput" :placeholder="t(`aiToolLibrary.tool.${selectedTool.key}.placeholder`)" :autosize="{ minRows: 12, maxRows: 18 }" />
          </label>

          <div class="ai-tool-library-inline-actions">
            <VtButton variant="outline" :disabled="!hasCurrentProject" @click="openCanvas">
              <template #icon><VideoIcon /></template>
              {{ t('aiToolLibrary.openCanvas') }}
            </VtButton>
          </div>
        </section>

        <section class="ai-tool-library-panel">
          <div class="ai-tool-library-panel-head compact">
            <div>
              <h3>{{ t('aiToolLibrary.result.title') }}</h3>
              <p>{{ resultDraft?.summary ?? t('aiToolLibrary.result.empty') }}</p>
            </div>
          </div>
          <div v-if="resultDraft" class="ai-tool-result">
            <strong>{{ resultDraft.title }}</strong>
            <pre>{{ resultDraft.content }}</pre>
            <div class="ai-tool-result-items">
              <span v-for="item in resultDraft.items" :key="item">{{ item }}</span>
            </div>
          </div>
          <VtEmptyState v-else class="ai-tool-result-empty" fill />
        </section>
      </main>

      <aside class="ai-tool-library-actions">
        <strong>{{ t('aiToolLibrary.result.actions') }}</strong>
        <VtButton variant="outline" :disabled="!resultDraft" @click="copyResult">
          <template #icon><CopyIcon /></template>
          {{ t('aiToolLibrary.result.copy') }}
        </VtButton>
        <VtButton variant="outline" :disabled="!resultDraft" @click="saveDraft">
          <template #icon><SaveIcon /></template>
          {{ t('aiToolLibrary.result.saveDraft') }}
        </VtButton>
        <VtButton theme="primary" variant="base" :loading="actionLoading" :disabled="!resultDraft" @click="createWorks(false)">
          <template #icon><AddIcon /></template>
          {{ t('aiToolLibrary.result.createWork') }}
        </VtButton>
        <VtButton variant="outline" :loading="actionLoading" :disabled="!resultDraft" @click="createWorks(true)">
          <template #icon><AddIcon /></template>
          {{ t('aiToolLibrary.result.batchCreateWorks') }}
        </VtButton>

        <div class="ai-tool-bind-list">
          <span>{{ t('aiToolLibrary.result.bindTo') }}</span>
          <VtButton v-for="target in selectedTool.bindTargets" :key="target" size="small" variant="outline" :loading="actionLoading" :disabled="!resultDraft || !hasCurrentProject" @click="requestBindToCurrentWork(target)">
            {{ t(`aiToolLibrary.bindTarget.${target}`) }}
          </VtButton>
        </div>

        <VtButton v-if="!hasCurrentProject" theme="primary" variant="base" @click="openProjects">
          {{ t('aiToolLibrary.openWork') }}
        </VtButton>
      </aside>
    </section>

    <VtDialog
      :visible="bindConfirmVisible"
      :title="t('aiToolLibrary.bindConfirm.title')"
      width="520px"
      :confirm-text="t('aiToolLibrary.bindConfirm.confirm')"
      :cancel-text="t('aiToolLibrary.bindConfirm.cancel')"
      :confirm-loading="actionLoading"
      @update:visible="updateBindConfirmVisible"
      @confirm="confirmBindToCurrentWork"
      @cancel="cancelBindConfirm">
      <div class="ai-tool-bind-confirm">
        <strong>{{ pendingBindTarget ? t(`aiToolLibrary.bindTarget.${pendingBindTarget}`) : t('aiToolLibrary.result.bindTo') }}</strong>
        <p>{{ bindConfirmImpact }}</p>
      </div>
    </VtDialog>
  </div>
</template>
