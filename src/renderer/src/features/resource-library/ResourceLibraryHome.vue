<script setup lang='ts'>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AddIcon, ArticleIcon, CodeIcon, DeleteIcon, EditIcon, FileCodeIcon, ImageIcon, PaletteIcon, RefreshIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import ManualFormDialog from '@renderer/features/project/components/ManualFormDialog.vue';
import ModelPromptConfig from '@renderer/features/settings/components/ModelPromptConfig.vue';
import PromptConfig from '@renderer/features/settings/components/PromptConfig.vue';
import SkillManagement from '@renderer/features/settings/components/SkillManagement.vue';
import { PROJECT_IMAGE_QUALITY_VALUES, PROJECT_VIDEO_RATIO_VALUES } from '@shared/constants/dictionaries';
import type { ProjectManualDetail, ProjectManualKind, ProjectManualSavePayload, ProjectManualSummary, ProjectPageStateResult } from '@shared/types/project';

type ResourceLibraryTab = 'visual' | 'director' | 'script' | 'prompt' | 'skill';

const { t, locale } = useI18n();
const loading = ref(false);
const savingManual = ref(false);
const activeLibrary = ref<ResourceLibraryTab>('visual');
const manualDialogVisible = ref(false);
const manualKind = ref<ProjectManualKind>('visual');
const activeManual = ref<ProjectManualDetail | null>(null);
const pageState = ref<ProjectPageStateResult>({
  projects: [],
  imageModels: [],
  videoModels: [],
  visualManuals: [],
  directorManuals: [],
  imageQualityOptions: [...PROJECT_IMAGE_QUALITY_VALUES],
  videoRatioOptions: [...PROJECT_VIDEO_RATIO_VALUES],
  defaultImageModelId: '',
  defaultVideoModelId: '',
});

const activeManualKind = computed<ProjectManualKind | null>(() => (activeLibrary.value === 'visual' || activeLibrary.value === 'director' ? activeLibrary.value : null));

const currentManuals = computed<ProjectManualSummary[]>(() => {
  if (activeLibrary.value === 'visual') return pageState.value.visualManuals;
  if (activeLibrary.value === 'director') return pageState.value.directorManuals;
  return [];
});

const libraryTabs = computed(() => [
  { value: 'visual' as const, icon: PaletteIcon, label: t('resourceLibrary.tab.visual'), description: t('resourceLibrary.tab.visualDesc'), count: pageState.value.visualManuals.length },
  { value: 'director' as const, icon: ImageIcon, label: t('resourceLibrary.tab.director'), description: t('resourceLibrary.tab.directorDesc'), count: pageState.value.directorManuals.length },
  { value: 'script' as const, icon: ArticleIcon, label: t('resourceLibrary.tab.script'), description: t('resourceLibrary.tab.scriptDesc'), count: null },
  { value: 'prompt' as const, icon: FileCodeIcon, label: t('resourceLibrary.tab.prompt'), description: t('resourceLibrary.tab.promptDesc'), count: null },
  { value: 'skill' as const, icon: CodeIcon, label: t('resourceLibrary.tab.skill'), description: t('resourceLibrary.tab.skillDesc'), count: null },
]);

const resourceLibraryNavLabel = computed(() => t('resourceLibrary.navLabel'));
const manualCoverAlt = computed(() => t('project.manual.coverAlt'));
const activeLibraryMeta = computed(() => libraryTabs.value.find((tab) => tab.value === activeLibrary.value) ?? libraryTabs.value[0]);

function getActiveTabClass(value: ResourceLibraryTab): string | undefined {
  return activeLibrary.value === value ? 'is-active' : undefined;
}

function getManualHint(kind: ProjectManualKind | null): string {
  return t(kind === 'visual' ? 'resourceLibrary.manual.visualHint' : 'resourceLibrary.manual.directorHint');
}

function getManualAddText(kind: ProjectManualKind | null): string {
  return t(kind === 'visual' ? 'project.manual.addVisual' : 'project.manual.addDirector');
}

function getManualEmptyText(kind: ProjectManualKind | null): string {
  return t(kind === 'visual' ? 'resourceLibrary.manual.emptyVisual' : 'resourceLibrary.manual.emptyDirector');
}

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

async function loadPageState(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.project.getPageState();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    pageState.value = response.data;
  } finally {
    loading.value = false;
  }
}

function formatUpdatedAt(updatedAt: number): string {
  return new Date(updatedAt).toLocaleString(locale.value, { hour12: false });
}

function selectLibrary(value: ResourceLibraryTab): void {
  activeLibrary.value = value;
}

function openCreateManual(kind: ProjectManualKind | null): void {
  if (!kind) {
    return;
  }

  manualKind.value = kind;
  activeManual.value = null;
  manualDialogVisible.value = true;
}

async function openEditManual(kind: ProjectManualKind | null, id: number): Promise<void> {
  if (!kind) {
    return;
  }

  const response = await window.vtStudio.project.getManual({ kind, id });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }
  manualKind.value = kind;
  activeManual.value = response.data.manual;
  manualDialogVisible.value = true;
}

async function submitManual(payload: ProjectManualSavePayload): Promise<void> {
  savingManual.value = true;
  try {
    const response = await window.vtStudio.project.saveManual(payload);
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t(payload.kind === 'visual' ? 'project.message.visualManualSaved' : 'project.message.directorManualSaved'));
    manualDialogVisible.value = false;
    await loadPageState();
  } finally {
    savingManual.value = false;
  }
}

async function deleteManual(kind: ProjectManualKind | null, id: number): Promise<void> {
  if (!kind) {
    return;
  }

  const dialog = DialogPlugin.confirm({
    header: t(kind === 'visual' ? 'project.delete.visualManualTitle' : 'project.delete.directorManualTitle'),
    body: t('project.delete.manualBody'),
    confirmBtn: t('project.delete.confirmManual'),
    cancelBtn: t('project.cancel'),
    theme: 'danger',
    async onConfirm() {
      const response = await window.vtStudio.project.deleteManual({ kind, id });
      if (!isOk(response)) {
        MessagePlugin.error(response.msg);
        return;
      }

      MessagePlugin.success(t(kind === 'visual' ? 'project.message.visualManualDeleted' : 'project.message.directorManualDeleted'));
      dialog.destroy();
      await loadPageState();
    },
  });
}

onMounted(() => {
  void loadPageState();
});

</script>

<template>
  <div class='resource-library-page'>
    <section class='resource-library-layout'>
      <aside class='resource-library-nav' :aria-label='resourceLibraryNavLabel'>
        <t-button v-for='tab in libraryTabs' :key='tab.value' class='resource-library-tab' :class='getActiveTabClass(tab.value)' variant='text' @click='selectLibrary(tab.value)'>
          <template #icon><component :is='tab.icon' /></template>
          <span>{{ tab.label }}</span>
          <t-tag v-if='tab.count !== null' size='small' variant='light'>{{ tab.count }}</t-tag>
        </t-button>
      </aside>
      <section class='resource-library-panel'>
        <template v-if='activeManualKind'>
          <div class='resource-library-panel-head'>
            <div>
              <strong>{{ activeLibraryMeta.label }}</strong>
              <p>{{ getManualHint(activeManualKind) }}</p>
            </div>
            <div class='resource-library-panel-actions'>
              <t-tag variant='light'>{{ t('resourceLibrary.manual.count', { count: currentManuals.length }) }}</t-tag>
              <t-tooltip :content='t("resourceLibrary.refresh")'>
                <t-button shape='square' variant='outline' :loading='loading' :aria-label='t("resourceLibrary.refresh")' @click='loadPageState'>
                  <RefreshIcon />
                </t-button>
              </t-tooltip>
              <t-button theme='primary' @click='openCreateManual(activeManualKind)'>
                <template #icon><AddIcon /></template>
                {{ t(activeManualKind === 'visual' ? 'project.manual.addVisual' : 'project.manual.addDirector') }}
              </t-button>
            </div>
          </div>

          <div class='resource-library-grid'>
            <article v-for='manual in currentManuals' :key='`${manual.kind}-${manual.id}`' class='resource-library-card'>
              <div class='resource-library-card-cover'>
                <img v-if='manual.coverUrl' :src='manual.coverUrl' :alt='manualCoverAlt' />
                <span v-else>{{ t('resourceLibrary.manual.noCover') }}</span>
              </div>
              <div class='resource-library-card-body'>
                <div class='resource-library-card-title'>
                  <strong>{{ manual.name }}</strong>
                  <small>{{ manual.path }}</small>
                </div>
                <div class='resource-library-card-meta'>
                  <t-tag variant='light'>{{ t('project.manual.referenceCount', { count: manual.referenceCount }) }}</t-tag>
                  <span>{{ formatUpdatedAt(manual.updatedAt) }}</span>
                </div>
              </div>
              <div class='resource-library-card-actions'>
                <t-tooltip :content='t("project.edit")'>
                  <t-button shape='square' size='small' variant='outline' @click='openEditManual(activeManualKind, manual.id)'>
                    <EditIcon />
                  </t-button>
                </t-tooltip>
                <t-tooltip :content='t("project.delete.action")'>
                  <t-button shape='square' size='small' variant='outline' theme='danger' @click='deleteManual(activeManualKind, manual.id)'>
                    <DeleteIcon />
                  </t-button>
                </t-tooltip>
              </div>
            </article>
          </div>
          <t-empty v-if='!loading && currentManuals.length === 0' :description='getManualEmptyText(activeManualKind)'>
            <template #action>
              <t-button theme='primary' @click='openCreateManual(activeManualKind)'>{{ getManualAddText(activeManualKind) }}</t-button>
            </template>
          </t-empty>
        </template>
        <div v-else-if='activeLibrary === `script`' class='resource-library-empty-panel'>
          <ArticleIcon />
          <strong>{{ t('resourceLibrary.script.title') }}</strong>
          <p>{{ t('resourceLibrary.script.summary') }}</p>
          <t-tag variant='light'>{{ t('resourceLibrary.script.status') }}</t-tag>
        </div>
        <div v-else-if='activeLibrary === `prompt`' class='resource-library-stack'>
          <section class='resource-library-panel-head'>
            <div>
              <strong>{{ t('resourceLibrary.prompt.title') }}</strong>
              <p>{{ activeLibraryMeta.description }}</p>
            </div>
            <div class='resource-library-panel-actions'>
              <t-tooltip :content='t("resourceLibrary.refresh")'>
                <t-button shape='square' variant='outline' :loading='loading' :aria-label='t("resourceLibrary.refresh")' @click='loadPageState'>
                  <RefreshIcon />
                </t-button>
              </t-tooltip>
            </div>
          </section>
          <PromptConfig />
          <ModelPromptConfig />
        </div>
        <div v-else class='resource-library-stack'>
          <section class='resource-library-panel-head'>
            <div>
              <strong>{{ t('resourceLibrary.skill.title') }}</strong>
              <p>{{ activeLibraryMeta.description }}</p>
            </div>
            <div class='resource-library-panel-actions'>
              <t-tooltip :content='t("resourceLibrary.refresh")'>
                <t-button shape='square' variant='outline' :loading='loading' :aria-label='t("resourceLibrary.refresh")' @click='loadPageState'>
                  <RefreshIcon />
                </t-button>
              </t-tooltip>
            </div>
          </section>
          <SkillManagement />
        </div>
      </section>
    </section>
    <ManualFormDialog v-model:visible='manualDialogVisible' :saving='savingManual' :kind='manualKind' :manual='activeManual' @submit='submitManual' />
  </div>
</template>
