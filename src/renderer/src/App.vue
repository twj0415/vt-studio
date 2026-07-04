<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import RendererErrorBoundary from '@renderer/components/RendererErrorBoundary.vue';
import { useAppStore } from '@renderer/stores/app';
import { useLanguageStore } from '@renderer/stores/language';

const appStore = useAppStore();
const languageStore = useLanguageStore();
const { t } = useI18n();
const { initializing, initError } = storeToRefs(appStore);
const { tdesignGlobalConfig } = storeToRefs(languageStore);
const showError = computed(() => Boolean(initError.value));

onMounted(() => {
  appStore.bootstrap();
});
</script>

<template>
  <t-config-provider :global-config="tdesignGlobalConfig">
    <div v-if="initializing" class="app-bootstrap-screen">
      <div class="app-bootstrap-panel">
        <strong>VT Studio</strong>
        <p>{{ t('app.bootstrapLoading') }}</p>
      </div>
    </div>
    <div v-else-if="showError" class="app-bootstrap-error">
      <strong>{{ t('app.bootstrapFailed') }}</strong>
      <p>{{ initError }}</p>
    </div>
    <RendererErrorBoundary>
      <RouterView />
    </RendererErrorBoundary>
  </t-config-provider>
</template>
