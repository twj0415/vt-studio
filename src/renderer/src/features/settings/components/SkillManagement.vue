<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditIcon, RefreshIcon, SaveIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import type { SkillManagementItem, SkillManagementValidationWarning } from '@shared/types/skill-management';

const { t, locale } = useI18n();
const loading = ref(false);
const loadingContent = ref(false);
const saving = ref(false);
const rebuildingAll = ref(false);
const rebuildingSkillId = ref<string | null>(null);
const keyword = ref('');
const skills = ref<SkillManagementItem[]>([]);
const activeSkill = ref<SkillManagementItem | null>(null);
const activeContent = ref('');
const editorVisible = ref(false);
const editorText = ref('');

const activeContentLength = computed(() => activeContent.value.trim().length);
const editorContentLength = computed(() => editorText.value.trim().length);
const referenceSkillCount = computed(() => skills.value.filter((skill) => skill.type === 'references').length);
const activeCanRebuild = computed(() => activeSkill.value?.type === 'references');

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function formatUpdatedAt(value: number): string {
  if (!value) {
    return t('settings.skillManagement.notRecorded');
  }

  return new Date(value).toLocaleString(locale.value, { hour12: false });
}

function getFileTheme(status: SkillManagementItem['fileStatus']): 'success' | 'danger' {
  return status === 'ready' ? 'success' : 'danger';
}

function getEmbeddingTheme(status: SkillManagementItem['embeddingStatus']): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'ready') {
    return 'success';
  }

  if (status === 'failed') {
    return 'danger';
  }

  if (status === 'expired') {
    return 'warning';
  }

  return 'default';
}

function getEmbeddingText(status: SkillManagementItem['embeddingStatus']): string {
  if (status === 'ready') {
    return t('settings.skillManagement.embedding.ready');
  }

  if (status === 'expired') {
    return t('settings.skillManagement.embedding.expired');
  }

  if (status === 'failed') {
    return t('settings.skillManagement.embedding.failed');
  }

  return t('settings.skillManagement.embedding.main');
}

function getFileStatusText(status: SkillManagementItem['fileStatus']): string {
  return status === 'ready' ? t('settings.skillManagement.file.ready') : t('settings.skillManagement.file.missing');
}

function getSkillTypeText(type: SkillManagementItem['type']): string {
  return type === 'main' ? t('settings.skillManagement.type.main') : t('settings.skillManagement.type.reference');
}

function formatWarnings(warnings: SkillManagementValidationWarning[]): string {
  return warnings.map((item) => `- ${item.message}`).join('\n');
}

function syncSkill(nextSkill: SkillManagementItem): void {
  activeSkill.value = nextSkill;
  skills.value = skills.value.map((item) => (item.id === nextSkill.id ? nextSkill : item));
}

function formatRebuildResult(total: number, succeeded: number, failed: number): string {
  return t('settings.skillManagement.message.rebuildDone', { total, succeeded, failed });
}

async function loadSkills(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.skill.list({ keyword: keyword.value });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    skills.value = response.data.skills;
    if (activeSkill.value && !skills.value.some((item) => item.id === activeSkill.value?.id)) {
      activeSkill.value = null;
      activeContent.value = '';
    }
    if (activeSkill.value) {
      const nextActive = skills.value.find((item) => item.id === activeSkill.value?.id);
      if (nextActive) {
        activeSkill.value = nextActive;
      }
    }
  } finally {
    loading.value = false;
  }
}

async function selectSkill(skill: SkillManagementItem): Promise<void> {
  activeSkill.value = skill;
  activeContent.value = '';

  if (skill.fileStatus !== 'ready') {
    MessagePlugin.warning(t('settings.skillManagement.message.fileMissingView'));
    return;
  }

  loadingContent.value = true;
  try {
    const response = await window.vtStudio.settings.skill.getContent({ id: skill.id });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    syncSkill(response.data.skill);
    activeContent.value = response.data.content;
  } finally {
    loadingContent.value = false;
  }
}

function openEditor(): void {
  if (!activeSkill.value) {
    return;
  }

  if (activeSkill.value.fileStatus !== 'ready') {
    MessagePlugin.warning(t('settings.skillManagement.message.fileMissingEdit'));
    return;
  }

  editorText.value = activeContent.value;
  editorVisible.value = true;
}

async function saveSkill(force = false): Promise<void> {
  if (!activeSkill.value) {
    return;
  }

  if (!editorText.value.trim()) {
    MessagePlugin.warning(t('settings.skillManagement.message.contentRequired'));
    return;
  }

  saving.value = true;
  try {
    const response = await window.vtStudio.settings.skill.saveContent({
      id: activeSkill.value.id,
      content: editorText.value,
      force,
    });

    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    if (!response.data.saved) {
      const dialog = DialogPlugin.confirm({
        header: t('settings.skillManagement.riskDialog.title'),
        body: t('settings.skillManagement.riskDialog.body', { warnings: formatWarnings(response.data.warnings) }),
        confirmBtn: t('settings.skillManagement.riskDialog.confirm'),
        cancelBtn: t('settings.skillManagement.riskDialog.cancel'),
        theme: 'warning',
        async onConfirm() {
          dialog.destroy();
          await saveSkill(true);
        },
      });
      return;
    }

    if (response.data.skill) {
      syncSkill(response.data.skill);
    }
    activeContent.value = response.data.content ?? editorText.value;
    editorVisible.value = false;
    MessagePlugin.success(t('settings.skillManagement.message.saved'));
    await loadSkills();
  } finally {
    saving.value = false;
  }
}

async function rebuildEmbeddings(skill?: SkillManagementItem): Promise<void> {
  if (skill && skill.type !== 'references') {
    return;
  }

  if (skill) {
    rebuildingSkillId.value = skill.id;
  } else {
    rebuildingAll.value = true;
  }

  try {
    const response = await window.vtStudio.settings.skill.rebuildEmbeddings(skill ? { id: skill.id } : {});
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(formatRebuildResult(response.data.total, response.data.succeeded, response.data.failed));
    await loadSkills();
  } finally {
    if (skill) {
      rebuildingSkillId.value = null;
    } else {
      rebuildingAll.value = false;
    }
  }
}

defineExpose({ loadSkills });
onMounted(loadSkills);
</script>

<template>
  <section class="skill-management-section">
    <div class="skill-management-head">
      <div>
        <strong>{{ t('settings.skillManagement.title') }}</strong>
        <p>{{ t('settings.skillManagement.hint') }}</p>
      </div>
      <div class="settings-actions">
        <t-input v-model="keyword" class="skill-search" clearable :placeholder="t('settings.skillManagement.searchPlaceholder')" @enter="loadSkills" />
        <t-button variant="outline" :loading="rebuildingAll" :disabled="referenceSkillCount === 0" @click="rebuildEmbeddings()">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.skillManagement.rebuildAll') }}
        </t-button>
        <t-button variant="outline" :loading="loading" @click="loadSkills">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.skillManagement.refresh') }}
        </t-button>
      </div>
    </div>

    <div class="skill-management-layout">
      <div class="skill-list">
        <button
          v-for="skill in skills"
          :key="skill.id"
          type="button"
          class="skill-list-item"
          :class="{ active: activeSkill?.id === skill.id }"
          @click="selectSkill(skill)"
        >
          <span>{{ skill.name }}</span>
          <small>{{ skill.path }}</small>
          <div>
            <t-tag size="small" :theme="skill.type === 'main' ? 'primary' : 'default'" variant="light">{{ getSkillTypeText(skill.type) }}</t-tag>
            <t-tag size="small" :theme="getFileTheme(skill.fileStatus)" variant="light">{{ getFileStatusText(skill.fileStatus) }}</t-tag>
          </div>
        </button>
        <p v-if="skills.length === 0" class="model-empty">{{ loading ? t('settings.skillManagement.loadingList') : t('settings.skillManagement.emptyList') }}</p>
      </div>

      <div class="skill-detail">
        <template v-if="activeSkill">
          <div class="skill-detail-head">
            <div>
              <strong>{{ activeSkill.name }}</strong>
              <small>{{ activeSkill.path }}</small>
            </div>
            <div class="settings-actions">
              <t-button variant="outline" :disabled="!activeCanRebuild" :loading="rebuildingSkillId === activeSkill.id" @click="rebuildEmbeddings(activeSkill)">
                <template #icon><RefreshIcon /></template>
                {{ t('settings.skillManagement.rebuildCurrent') }}
              </t-button>
              <t-button variant="outline" :disabled="activeSkill.fileStatus !== 'ready'" @click="openEditor">
                <template #icon><EditIcon /></template>
                {{ t('settings.skillManagement.edit') }}
              </t-button>
            </div>
          </div>

          <div class="skill-meta-grid">
            <div>
              <span>{{ t('settings.skillManagement.meta.type') }}</span>
              <b>{{ getSkillTypeText(activeSkill.type) }}</b>
            </div>
            <div>
              <span>{{ t('settings.skillManagement.meta.file') }}</span>
              <b>{{ getFileStatusText(activeSkill.fileStatus) }}</b>
            </div>
            <div>
              <span>{{ t('settings.skillManagement.meta.embedding') }}</span>
              <t-tag :theme="getEmbeddingTheme(activeSkill.embeddingStatus)" variant="light">{{ getEmbeddingText(activeSkill.embeddingStatus) }}</t-tag>
            </div>
            <div>
              <span>{{ t('settings.skillManagement.meta.chars') }}</span>
              <b>{{ activeContentLength }}</b>
            </div>
          </div>

          <p class="skill-description">{{ activeSkill.description || t('settings.skillManagement.noDescription') }}</p>
          <p v-if="activeSkill.attributions.length > 0" class="skill-attributions">{{ t('settings.skillManagement.attributions', { attributions: activeSkill.attributions.join(t('settings.skillManagement.attributionSeparator')) }) }}</p>
          <p class="skill-updated">{{ t('settings.skillManagement.updatedAt', { time: formatUpdatedAt(activeSkill.updatedAt) }) }}</p>

          <pre v-if="activeContent" class="skill-content-preview">{{ activeContent }}</pre>
          <p v-else class="model-empty">{{ loadingContent ? t('settings.skillManagement.loadingContent') : t('settings.skillManagement.selectReadySkill') }}</p>
        </template>
        <p v-else class="model-empty">{{ t('settings.skillManagement.selectSkill') }}</p>
      </div>
    </div>

    <t-dialog v-model:visible="editorVisible" :header="activeSkill ? t('settings.skillManagement.editorTitleWithName', { name: activeSkill.name }) : t('settings.skillManagement.editorTitle')" width="920px" :confirm-btn="t('settings.skillManagement.save')" :confirm-loading="saving" @confirm="() => saveSkill(false)">
      <div class="skill-editor">
        <div class="skill-editor-meta">
          <div>
            <span>{{ t('settings.skillManagement.meta.path') }}</span>
            <b>{{ activeSkill?.path }}</b>
          </div>
          <div>
            <span>{{ t('settings.skillManagement.meta.chars') }}</span>
            <b>{{ editorContentLength }}</b>
          </div>
        </div>
        <t-textarea v-model="editorText" class="code-editor skill-textarea" :placeholder="t('settings.skillManagement.editorPlaceholder')" :autosize="{ minRows: 22, maxRows: 34 }" />
      </div>

      <template #footer>
        <div class="prompt-dialog-footer">
          <t-button variant="outline" @click="editorVisible = false">{{ t('settings.skillManagement.cancel') }}</t-button>
          <t-button theme="primary" :loading="saving" @click="saveSkill(false)">
            <template #icon><SaveIcon /></template>
            {{ t('settings.skillManagement.save') }}
          </t-button>
        </div>
      </template>
    </t-dialog>
  </section>
</template>
