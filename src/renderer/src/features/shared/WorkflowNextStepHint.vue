<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

withDefaults(
  defineProps<{
    hintKey: string;
    nextRouteName?: string;
  }>(),
  {
    nextRouteName: 'project-overview',
  },
);

const router = useRouter();
const { t } = useI18n();

function openRoute(routeName: string): void {
  void router.push({ name: routeName });
}
</script>

<template>
  <section class="rounded-lg border border-[var(--vt-border-subtle)] bg-[var(--vt-surface-panel)] p-4 shadow-sm">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0">
        <p class="m-0 text-xs font-medium uppercase text-[var(--vt-text-tertiary)]">{{ t(`workflowHint.${hintKey}.eyebrow`) }}</p>
        <h3 class="m-0 mt-1 text-base font-semibold text-[var(--vt-text-primary)]">{{ t(`workflowHint.${hintKey}.title`) }}</h3>
        <p class="m-0 mt-1 max-w-4xl text-sm leading-6 text-[var(--vt-text-secondary)]">{{ t(`workflowHint.${hintKey}.summary`) }}</p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <t-button variant="outline" @click="openRoute('project-overview')">
          {{ t('workflowHint.overviewAction') }}
        </t-button>
        <t-button theme="primary" @click="openRoute(nextRouteName)">
          {{ t(`workflowHint.${hintKey}.action`) }}
        </t-button>
      </div>
    </div>
  </section>
</template>
