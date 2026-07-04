<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

interface ModuleAction {
  title: string;
  state: 'pending' | 'confirm' | 'ready';
}

const props = defineProps<{
  title: string;
  summary: string;
  actions: readonly ModuleAction[];
}>();

const { t } = useI18n();
const localizedActions = computed(() =>
  props.actions.map((action) => ({
    ...action,
    stateText: t(`scaffold.state.${action.state}`),
  })),
);
</script>

<template>
  <div class="module-page min-w-0">
    <section class="module-hero">
      <div>
        <p class="eyebrow">{{ t('scaffold.moduleEyebrow') }}</p>
        <h3>{{ title }}</h3>
        <p>{{ summary }}</p>
      </div>
      <div class="module-status">
        <span>{{ t('scaffold.stageLabel') }}</span>
        <strong>{{ t('scaffold.stageReady') }}</strong>
      </div>
    </section>

    <section class="module-grid">
      <article v-for="action in localizedActions" :key="action.title" class="module-card">
        <t-tag variant="light" :theme="action.state === 'pending' ? 'warning' : action.state === 'confirm' ? 'primary' : 'success'">{{ action.stateText }}</t-tag>
        <strong>{{ action.title }}</strong>
      </article>
    </section>

    <section class="module-next-step">
      <div>
        <strong>{{ t('scaffold.nextStepTitle') }}</strong>
        <p>{{ t('scaffold.nextStepSummary') }}</p>
      </div>
      <t-tag variant="light" theme="primary">{{ t('scaffold.stageReady') }}</t-tag>
    </section>
  </div>
</template>
