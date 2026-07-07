<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { reportRendererError, type RendererErrorReport } from '@renderer/utils/renderer-error-boundary';

const props = defineProps<{
  scope: string;
}>();

const { t } = useI18n();
const hasError = ref(false);
const errorReport = ref<RendererErrorReport | null>(null);

function resetBoundary(): void {
  hasError.value = false;
  errorReport.value = null;
}

onErrorCaptured((error, _instance, info) => {
  hasError.value = true;
  errorReport.value = reportRendererError({
    source: 'boundary',
    error,
    info: `${props.scope}:${info}`,
    showToast: false,
  });

  return false;
});
</script>

<template>
  <div v-if="hasError" class="rounded-md border border-[var(--vt-line-soft)] bg-[var(--vt-surface-raised)] p-4 text-[var(--vt-text-primary)]">
    <p class="text-sm font-medium text-[var(--vt-text-muted)]">{{ t('rendererError.boundaryEyebrow') }}</p>
    <h4 class="mt-2 text-base font-semibold">{{ t('rendererError.boundaryTitle') }}</h4>
    <p class="mt-2 text-sm leading-6 text-[var(--vt-text-muted)]">{{ t('rendererError.boundaryLogged') }}</p>
    <pre v-if="errorReport" class="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--vt-line-soft)] bg-[var(--vt-surface-panel)] p-3 font-mono text-xs leading-6">{{ JSON.stringify(errorReport, null, 2) }}</pre>
    <t-button class="mt-4" theme="primary" variant="outline" @click="resetBoundary">{{ t('rendererError.retryPage') }}</t-button>
  </div>
  <slot v-else />
</template>
