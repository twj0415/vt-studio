<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import { RefreshIcon, SaveIcon, SystemCodeIcon } from 'tdesign-icons-vue-next';
import VtButton from '@renderer/components/VtButton.vue';
import VtDialog from '@renderer/components/VtDialog.vue';
import type { ProductionAgentContextResult, ProductionAgentWorkspacePatchField } from '@shared/types/production';

const props = defineProps<{
  visible: boolean;
  projectId: number;
  scriptId: number | null;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  applied: [];
}>();

const { t } = useI18n();

const loading = ref(false);
const applying = ref(false);
const context = ref<ProductionAgentContextResult | null>(null);
const patchForm = reactive({
  field: 'scriptPlan' as ProductionAgentWorkspacePatchField,
  content: '',
});

const contextStats = computed(() => {
  const flowData = context.value?.flowData;
  return [
    { label: t('production.agent.stats.assets'), value: flowData?.assets.length ?? 0 },
    { label: t('production.agent.stats.storyboards'), value: flowData?.storyboards.length ?? 0 },
    { label: t('production.agent.stats.tracks'), value: flowData?.videoTracks.length ?? 0 },
    { label: t('production.agent.stats.videos'), value: flowData?.videoTracks.reduce((total, track) => total + track.videos.length, 0) ?? 0 },
  ];
});
const actionCards = computed(() => [
  { key: 'assets', title: t('production.agent.action.assets.title'), desc: t('production.agent.action.assets.desc'), target: t('production.node.assets.title') },
  { key: 'director', title: t('production.agent.action.director.title'), desc: t('production.agent.action.director.desc'), target: t('production.node.scriptPlan.title') },
  { key: 'storyboardTable', title: t('production.agent.action.storyboardTable.title'), desc: t('production.agent.action.storyboardTable.desc'), target: t('production.node.storyboardTable.title') },
  { key: 'storyboard', title: t('production.agent.action.storyboard.title'), desc: t('production.agent.action.storyboard.desc'), target: t('production.node.storyboard.title') },
  { key: 'video', title: t('production.agent.action.video.title'), desc: t('production.agent.action.video.desc'), target: t('production.node.workbench.title') },
]);

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function close(): void {
  emit('update:visible', false);
}

function syncPatchContent(): void {
  const flowData = context.value?.flowData;
  if (!flowData) {
    patchForm.content = '';
    return;
  }
  if (patchForm.field === 'script') {
    patchForm.content = flowData.script;
  } else if (patchForm.field === 'scriptPlan') {
    patchForm.content = flowData.scriptPlan;
  } else {
    patchForm.content = flowData.storyboardTable;
  }
}

async function loadContext(): Promise<void> {
  if (!props.projectId || !props.scriptId) {
    context.value = null;
    patchForm.content = '';
    return;
  }

  loading.value = true;
  try {
    const response = await window.vtStudio.production.agent.getContext({
      projectId: props.projectId,
      scriptId: props.scriptId,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    context.value = response.data;
    syncPatchContent();
  } finally {
    loading.value = false;
  }
}

async function applyPatch(): Promise<void> {
  if (!props.projectId || !props.scriptId) {
    MessagePlugin.warning(t('production.noScript'));
    return;
  }

  applying.value = true;
  try {
    const response = await window.vtStudio.production.agent.applyWorkspacePatch({
      projectId: props.projectId,
      scriptId: props.scriptId,
      source: 'manual',
      patches: [
        {
          field: patchForm.field,
          content: patchForm.content,
        },
      ],
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }
    MessagePlugin.success(t('production.agent.applied', { count: response.data.appliedCount }));
    await loadContext();
    emit('applied');
  } finally {
    applying.value = false;
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void loadContext();
    }
  }
);

watch(
  () => patchForm.field,
  () => syncPatchContent()
);
</script>

<template>
  <VtDialog :visible="visible" :title="t('production.agent.title')" width="1180px" :footer="false" @update:visible="(value) => emit('update:visible', value)">
    <div class="production-agent-shell">
      <aside class="production-agent-side">
        <div>
          <p class="eyebrow">{{ t('production.agent.eyebrow') }}</p>
          <h4>{{ t('production.agent.contextTitle') }}</h4>
          <span>{{ context?.scriptName || t('production.emptyText') }}</span>
        </div>
        <div class="production-agent-stat-grid">
          <div v-for="item in contextStats" :key="item.label">
            <b>{{ item.value }}</b>
            <span>{{ item.label }}</span>
          </div>
        </div>
        <div class="production-agent-note">
          <SystemCodeIcon />
          <span>{{ t('production.agent.boundary') }}</span>
        </div>
        <div class="production-agent-actions">
          <VtButton variant="outline" :loading="loading" @click="loadContext">
            <template #icon><RefreshIcon /></template>
            {{ t('production.refresh') }}
          </VtButton>
          <VtButton variant="outline" @click="close">
            {{ t('production.cancel') }}
          </VtButton>
        </div>
      </aside>

      <main class="production-agent-main">
        <t-loading :loading="loading">
          <section class="production-agent-section">
            <header>
              <div>
                <h4>{{ t('production.agent.actionsTitle') }}</h4>
                <span>{{ t('production.agent.actionsHint') }}</span>
              </div>
            </header>
            <div class="production-agent-action-grid">
              <article v-for="card in actionCards" :key="card.key" class="production-agent-action-card">
                <strong>{{ card.title }}</strong>
                <p>{{ card.desc }}</p>
                <t-tag size="small" variant="light">{{ card.target }}</t-tag>
              </article>
            </div>
          </section>

          <section class="production-agent-section">
            <header>
              <div>
                <h4>{{ t('production.agent.patchTitle') }}</h4>
                <span>{{ t('production.agent.patchHint') }}</span>
              </div>
              <VtButton theme="primary" variant="base" :loading="applying" :disabled="!context" @click="applyPatch">
                <template #icon><SaveIcon /></template>
                {{ t('production.agent.applyPatch') }}
              </VtButton>
            </header>
            <div class="production-agent-patch-grid">
              <label>
                <span>{{ t('production.agent.patchField') }}</span>
                <t-radio-group v-model="patchForm.field">
                  <t-radio-button value="scriptPlan">{{ t('production.node.scriptPlan.title') }}</t-radio-button>
                  <t-radio-button value="storyboardTable">{{ t('production.node.storyboardTable.title') }}</t-radio-button>
                  <t-radio-button value="script">{{ t('production.node.script.title') }}</t-radio-button>
                </t-radio-group>
              </label>
              <label>
                <span>{{ t('production.agent.patchContent') }}</span>
                <t-textarea v-model="patchForm.content" :placeholder="t('production.agent.patchPlaceholder')" :autosize="{ minRows: 9, maxRows: 16 }" />
              </label>
            </div>
          </section>
        </t-loading>
      </main>
    </div>
  </VtDialog>
</template>
