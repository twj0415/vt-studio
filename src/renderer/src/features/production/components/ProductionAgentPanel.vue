<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import { CodeIcon, RefreshIcon, SaveIcon, SystemCodeIcon } from 'tdesign-icons-vue-next';
import type { ProductionAgentContextResult, ProductionAgentToolDescriptor, ProductionAgentWorkspacePatchField } from '@shared/types/production';

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

const readyTools = computed(() => context.value?.tools.filter((tool) => tool.status === 'ready') ?? []);
const reservedTools = computed(() => context.value?.tools.filter((tool) => tool.status === 'reserved') ?? []);
const contextStats = computed(() => {
  const flowData = context.value?.flowData;
  return [
    { label: t('production.agent.stats.assets'), value: flowData?.assets.length ?? 0 },
    { label: t('production.agent.stats.storyboards'), value: flowData?.storyboards.length ?? 0 },
    { label: t('production.agent.stats.tracks'), value: flowData?.videoTracks.length ?? 0 },
    { label: t('production.agent.stats.videos'), value: flowData?.videoTracks.reduce((total, track) => total + track.videos.length, 0) ?? 0 },
  ];
});

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

function close(): void {
  emit('update:visible', false);
}

function getToolTitle(tool: ProductionAgentToolDescriptor): string {
  return t(`production.agent.tool.${tool.name}`);
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
  <t-dialog :visible="visible" :header="t('production.agent.title')" width="1180px" :footer="false" @update:visible="(value) => emit('update:visible', value)">
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
          <t-button variant="outline" :loading="loading" @click="loadContext">
            <template #icon><RefreshIcon /></template>
            {{ t('production.refresh') }}
          </t-button>
          <t-button variant="outline" @click="close">
            {{ t('production.cancel') }}
          </t-button>
        </div>
      </aside>

      <main class="production-agent-main">
        <t-loading :loading="loading">
          <section class="production-agent-section">
            <header>
              <div>
                <h4>{{ t('production.agent.toolsTitle') }}</h4>
                <span>{{ t('production.agent.toolsHint') }}</span>
              </div>
              <t-tag theme="success" variant="light">{{ t('production.agent.readyCount', { count: readyTools.length }) }}</t-tag>
            </header>
            <div class="production-agent-tool-grid">
              <article v-for="tool in readyTools" :key="tool.name" class="production-agent-tool-card">
                <strong>{{ getToolTitle(tool) }}</strong>
                <small>{{ tool.name }}</small>
                <p>{{ t('production.agent.writes') }}：{{ tool.writes.length ? tool.writes.join(', ') : t('production.agent.readonly') }}</p>
                <p>{{ t('production.agent.inputs') }}：{{ tool.inputKeys.join(', ') }}</p>
              </article>
            </div>
          </section>

          <section class="production-agent-section">
            <header>
              <div>
                <h4>{{ t('production.agent.reservedTitle') }}</h4>
                <span>{{ t('production.agent.reservedHint') }}</span>
              </div>
              <t-tag theme="warning" variant="light">{{ t('production.agent.reservedCount', { count: reservedTools.length }) }}</t-tag>
            </header>
            <div class="production-agent-reserved-list">
              <t-tag v-for="tool in reservedTools" :key="tool.name" variant="light">{{ getToolTitle(tool) }}</t-tag>
            </div>
          </section>

          <section class="production-agent-section">
            <header>
              <div>
                <h4>{{ t('production.agent.xmlTitle') }}</h4>
                <span>{{ t('production.agent.xmlHint') }}</span>
              </div>
              <CodeIcon />
            </header>
            <div class="production-agent-xml-grid">
              <article v-for="tag in context?.xmlTags ?? []" :key="tag.tag">
                <code>&lt;{{ tag.tag }}&gt;</code>
                <span>{{ t('production.agent.xmlWrites') }}：{{ tag.writes }}</span>
              </article>
            </div>
          </section>

          <section class="production-agent-section">
            <header>
              <div>
                <h4>{{ t('production.agent.patchTitle') }}</h4>
                <span>{{ t('production.agent.patchHint') }}</span>
              </div>
              <t-button theme="primary" :loading="applying" :disabled="!context" @click="applyPatch">
                <template #icon><SaveIcon /></template>
                {{ t('production.agent.applyPatch') }}
              </t-button>
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
  </t-dialog>
</template>
