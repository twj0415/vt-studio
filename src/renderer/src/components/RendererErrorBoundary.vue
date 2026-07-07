<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { reportRendererError, type RendererErrorReport } from '@renderer/utils/renderer-error-boundary';

const router = useRouter();
const route = router.currentRoute;
const { t } = useI18n();
const hasError = ref(false);
const errorText = ref('');
const errorReport = ref<RendererErrorReport | null>(null);

function resetBoundary() {
  hasError.value = false;
  errorText.value = '';
  errorReport.value = null;
}

function goProjects() {
  resetBoundary();
  router.push({ name: 'projects' });
}

onErrorCaptured((error, _instance, info) => {
  hasError.value = true;
  const report = reportRendererError({
    source: 'boundary',
    error,
    info,
    showToast: false,
  });
  errorReport.value = report;
  errorText.value = t('rendererError.boundaryLogged');

  return false;
});

watch(
  () => route.value.fullPath,
  () => {
    resetBoundary();
  }
);
</script>

<template>
  <div v-if="hasError" class="flex min-h-screen items-center justify-center bg-[var(--vt-surface-app)] p-6 text-[var(--vt-text-primary)]">
    <div class="w-full max-w-xl rounded-lg border border-[var(--vt-line-soft)] bg-[var(--vt-surface-panel)] p-6 shadow-sm">
      <p class="text-sm font-medium text-[var(--vt-text-muted)]">{{ t('rendererError.boundaryEyebrow') }}</p>
      <h1 class="mt-2 text-xl font-semibold">{{ t('rendererError.boundaryTitle') }}</h1>
      <p class="mt-3 text-sm leading-6 text-[var(--vt-text-muted)]">{{ t('rendererError.boundaryHint') }}</p>
      <p v-if="errorText" class="mt-4 rounded-md border border-[var(--vt-line-soft)] bg-[var(--vt-surface-raised)] px-3 py-2 text-sm text-[var(--vt-text-muted)]">{{ errorText }}</p>
      <pre v-if="errorReport" class="mt-4 max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--vt-line-soft)] bg-[var(--vt-surface-raised)] p-3 font-mono text-xs leading-6 text-[var(--vt-text-primary)]">{{ JSON.stringify(errorReport, null, 2) }}</pre>
      <div class="mt-6 flex flex-wrap gap-3">
        <t-button theme="primary" @click="resetBoundary">{{ t('rendererError.retryPage') }}</t-button>
        <t-button variant="outline" @click="goProjects">{{ t('rendererError.goProjects') }}</t-button>
      </div>
    </div>
  </div>
  <slot v-else />
</template>
