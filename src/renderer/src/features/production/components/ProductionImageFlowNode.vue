<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Handle, Position } from '@vue-flow/core';
import { DeleteIcon } from 'tdesign-icons-vue-next';
import type {
  ProductionImageFlowNodeData,
  ProductionImageFlowNodeKind,
  ProductionImageFlowSourceOption,
  ProductionImageFlowSourceType,
} from '../types';

const props = defineProps<{
  id: string;
  kind: ProductionImageFlowNodeKind;
  data: ProductionImageFlowNodeData;
  sourceTypeOptions: Array<{ label: string; value: ProductionImageFlowSourceType }>;
  sourceOptions: ProductionImageFlowSourceOption[];
  ratioOptions: Array<{ label: string; value: string }>;
  qualityOptions: Array<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  update: [nodeId: string, patch: Partial<ProductionImageFlowNodeData>];
  delete: [nodeId: string];
}>();

const { t } = useI18n();

const selectedSource = computed(() => props.sourceOptions.find((item) => item.value === props.data.sourceId) ?? null);
const hasSourceSelect = computed(() => props.data.source !== 'manual');
const nodeTitle = computed(() => (props.kind === 'upload' ? t('production.imageFlow.node.upload') : t('production.imageFlow.node.generated')));

function updateText(field: keyof ProductionImageFlowNodeData, value: unknown): void {
  emit('update', props.id, { [field]: String(value ?? '') } as Partial<ProductionImageFlowNodeData>);
}

function updateNullableText(field: keyof ProductionImageFlowNodeData, value: unknown): void {
  const text = String(value ?? '').trim();
  emit('update', props.id, { [field]: text || null } as Partial<ProductionImageFlowNodeData>);
}

function updateSource(value: unknown): void {
  const source = String(Array.isArray(value) ? value[0] : value) as ProductionImageFlowSourceType;
  emit('update', props.id, {
    source,
    sourceId: null,
    image: source === 'manual' ? props.data.image : null,
  });
}

function updateSourceId(value: unknown): void {
  const sourceId = Number(Array.isArray(value) ? value[0] : value);
  const source = props.sourceOptions.find((item) => item.value === sourceId) ?? null;
  if (!source) {
    emit('update', props.id, { sourceId: null, image: null });
    return;
  }

  emit('update', props.id, {
    sourceId: source.value,
    image: source.imageUrl,
    label: props.data.label.trim() ? props.data.label : source.label,
    prompt: props.kind === 'generated' && !props.data.prompt.trim() ? source.prompt : props.data.prompt,
  });
}
</script>

<template>
  <article class="production-image-flow-node" :class="`is-${kind}`">
    <Handle v-if="kind === 'generated'" type="target" :position="Position.Left" class="production-image-flow-handle target" />
    <Handle type="source" :position="Position.Right" class="production-image-flow-handle source" />

    <header>
      <div>
        <strong>{{ data.label || nodeTitle }}</strong>
        <span>{{ nodeTitle }}</span>
      </div>
      <t-tooltip :content="t('production.imageFlow.deleteNode')">
        <button type="button" :aria-label="t('production.imageFlow.deleteNode')" @click="emit('delete', id)">
          <DeleteIcon />
        </button>
      </t-tooltip>
    </header>

    <div class="production-image-flow-node-form">
      <label>
        <span>{{ t('production.imageFlow.node.label') }}</span>
        <t-input :model-value="data.label" :placeholder="nodeTitle" @update:model-value="(value) => updateText('label', value)" />
      </label>

      <div class="production-image-flow-node-grid">
        <label>
          <span>{{ kind === 'upload' ? t('production.imageFlow.node.source') : t('production.imageFlow.node.seedSource') }}</span>
          <t-select :model-value="data.source" :options="sourceTypeOptions" @change="updateSource" />
        </label>
        <label v-if="hasSourceSelect">
          <span>{{ t('production.imageFlow.node.sourceItem') }}</span>
          <t-select
            :model-value="data.sourceId"
            clearable
            filterable
            :options="sourceOptions"
            :placeholder="sourceOptions.length ? t('production.imageFlow.node.sourcePlaceholder') : t('production.imageFlow.node.noSource')"
            @change="updateSourceId" />
        </label>
      </div>

      <label>
        <span>{{ t('production.imageFlow.node.imageUrl') }}</span>
        <t-input
          :model-value="data.image || ''"
          :placeholder="selectedSource?.imageUrl || t('production.imageFlow.node.imageUrlPlaceholder')"
          @update:model-value="(value) => updateNullableText('image', value)" />
      </label>

      <div class="production-image-flow-preview" :class="{ empty: !data.image }">
        <img v-if="data.image" :src="data.image" :alt="data.label || nodeTitle" />
        <span v-else>{{ t('production.imageFlow.node.noImage') }}</span>
      </div>

      <template v-if="kind === 'generated'">
        <div class="production-image-flow-references">
          <span>{{ t('production.imageFlow.node.references', { count: data.references.length }) }}</span>
          <div v-if="data.references.length">
            <img v-for="reference in data.references" :key="reference" :src="reference" alt="" />
          </div>
        </div>

        <label>
          <span>{{ t('production.imageFlow.node.prompt') }}</span>
          <t-textarea :model-value="data.prompt" :placeholder="t('production.imageFlow.node.promptPlaceholder')" :autosize="{ minRows: 4, maxRows: 7 }" @update:model-value="(value) => updateText('prompt', value)" />
        </label>

        <div class="production-image-flow-node-grid thirds">
          <label>
            <span>{{ t('production.imageFlow.node.model') }}</span>
            <t-input :model-value="data.model" :placeholder="t('production.imageFlow.node.modelPlaceholder')" @update:model-value="(value) => updateText('model', value)" />
          </label>
          <label>
            <span>{{ t('production.imageFlow.node.ratio') }}</span>
            <t-select :model-value="data.ratio" :options="ratioOptions" @change="(value) => updateText('ratio', value)" />
          </label>
          <label>
            <span>{{ t('production.imageFlow.node.quality') }}</span>
            <t-select :model-value="data.quality" :options="qualityOptions" @change="(value) => updateText('quality', value)" />
          </label>
        </div>

        <label>
          <span>{{ t('production.imageFlow.node.resultUrl') }}</span>
          <t-input :model-value="data.generatedImage || ''" :placeholder="t('production.imageFlow.node.resultUrlPlaceholder')" @update:model-value="(value) => updateNullableText('generatedImage', value)" />
        </label>

        <div class="production-image-flow-preview result" :class="{ empty: !data.generatedImage }">
          <img v-if="data.generatedImage" :src="data.generatedImage" :alt="data.label || nodeTitle" />
          <span v-else>{{ t('production.imageFlow.node.noResult') }}</span>
        </div>
      </template>
    </div>
  </article>
</template>
