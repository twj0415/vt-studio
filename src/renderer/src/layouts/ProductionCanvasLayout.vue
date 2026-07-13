<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppTopBar from '@renderer/features/shell/AppTopBar.vue';

const { t } = useI18n();
</script>

<template>
  <div class="desktop-frame production-route-frame">
    <a
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1000] focus:rounded-md focus:border focus:border-line-strong focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-text-primary focus:shadow-panel"
      href="#vt-main-content"
    >
      {{ t('layout.skipToContent') }}
    </a>
    <AppTopBar />
    <main class="production-route-workspace">
      <section id="vt-main-content" class="production-route-content" tabindex="-1">
        <RouterView />
      </section>
    </main>
  </div>
</template>
