<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import VtDialog from '@renderer/components/VtDialog.vue';
import VtEmptyState from '@renderer/components/VtEmptyState.vue';
import type {
  ProductionAgentContextResult,
  ProductionStepRuleReference,
  ProductionWorkflowStep,
} from '@shared/types/production';

interface RuleItem {
  key: string;
  title: string;
  source: 'builtin' | 'manual' | 'prompt' | 'skill';
  summary: string;
  content: string;
}

const props = defineProps<{
  visible: boolean;
  step: ProductionWorkflowStep;
  context: ProductionAgentContextResult | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
}>();

const { t } = useI18n();

function compact(value: string, maxLength = 120): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function toRuleItem(reference: ProductionStepRuleReference): RuleItem {
  if (reference.source === 'manual') {
    return {
      key: reference.key,
      title: reference.manualKind === 'director'
        ? t('production.flow.rules.directorManual', { name: reference.name })
        : t('production.flow.rules.visualManual', { name: reference.name }),
      source: reference.source,
      summary: t('production.flow.rules.manualKeys', { keys: reference.manualKeys?.join(' / ') || '-' }),
      content: reference.content,
    };
  }
  if (reference.source === 'skill') {
    return {
      key: reference.key,
      title: reference.name,
      source: reference.source,
      summary: reference.description || compact(reference.content),
      content: reference.content,
    };
  }
  return {
    key: reference.key,
    title: reference.modelId
      ? t('production.flow.rules.modelPrompt', { name: reference.name })
      : reference.name,
    source: reference.source,
    summary: reference.modelId
      ? t('production.flow.rules.modelPromptDetails', { model: reference.modelId, type: reference.promptType || '-' })
      : t('production.flow.rules.promptType', { type: reference.promptType || '-' }),
    content: reference.content,
  };
}

const ruleItems = computed<RuleItem[]>(() => {
  const context = props.context;
  const items: RuleItem[] = [{
    key: `builtin-${props.step}`,
    title: t(`production.flow.rules.builtin.${props.step}.title`),
    source: 'builtin',
    summary: t(`production.flow.rules.builtin.${props.step}.summary`),
    content: t(`production.flow.rules.builtin.${props.step}.content`),
  }];
  if (!context) return items;
  items.push(...(context.stepRules?.[props.step] ?? []).map(toRuleItem));
  return items;
});

const stepTitle = computed(() => t(`production.flow.step.${props.step}.label`));
</script>

<template>
  <VtDialog
    :visible="visible"
    :title="t('production.flow.rules.title', { step: stepTitle })"
    width="820px"
    :footer="false"
    @update:visible="(value) => emit('update:visible', value)"
  >
    <t-loading :loading="loading">
      <div class="production-step-rules">
        <div class="production-step-rules-summary">
          <strong>{{ stepTitle }}</strong>
          <span>{{ t('production.flow.rules.count', { count: ruleItems.length }) }}</span>
        </div>
        <div v-if="ruleItems.length" class="production-step-rule-list">
          <details v-for="item in ruleItems" :key="item.key">
            <summary>
              <span>
                <strong>{{ item.title }}</strong>
                <small>{{ item.summary }}</small>
              </span>
              <t-tag size="small" variant="light">{{ t(`production.flow.rules.source.${item.source}`) }}</t-tag>
            </summary>
            <pre>{{ item.content }}</pre>
          </details>
        </div>
        <VtEmptyState v-else size="small" :description="t('production.flow.rules.empty')" />
      </div>
    </t-loading>
  </VtDialog>
</template>

<style scoped>
.production-step-rules {
  display: grid;
  max-height: min(72vh, 720px);
  min-height: 260px;
  gap: 10px;
  overflow: hidden;
}

.production-step-rules-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--vt-line-soft);
}

.production-step-rules-summary strong { font-size: 14px; }
.production-step-rules-summary span { color: var(--vt-text-muted); font-size: 12px; }

.production-step-rule-list {
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}

.production-step-rule-list details { border-bottom: 1px solid var(--vt-line-soft); }
.production-step-rule-list summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 2px;
  cursor: pointer;
  list-style: none;
}

.production-step-rule-list summary::-webkit-details-marker { display: none; }
.production-step-rule-list summary > span { display: grid; min-width: 0; gap: 3px; }
.production-step-rule-list summary strong { font-size: 13px; }
.production-step-rule-list summary small {
  overflow: hidden;
  color: var(--vt-text-muted);
  font-size: 11px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-step-rule-list pre {
  max-height: 360px;
  margin: 0 0 12px;
  padding: 10px;
  overflow: auto;
  border: 1px solid var(--vt-line-soft);
  border-radius: 6px;
  color: var(--vt-text-secondary);
  background: var(--vt-surface-app);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
