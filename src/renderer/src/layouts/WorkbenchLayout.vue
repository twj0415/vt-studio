<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AppSideNav from '@renderer/features/shell/AppSideNav.vue';
import AppTopBar from '@renderer/features/shell/AppTopBar.vue';

const route = useRoute();
const { t } = useI18n();

const activeRoute = computed(() => String(route.name ?? 'projects'));
</script>

<template>
  <div class="desktop-frame">
    <a
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1000] focus:rounded-md focus:border focus:border-line-strong focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-text-primary focus:shadow-panel"
      href="#vt-main-content"
    >
      {{ t('layout.skipToContent') }}
    </a>
    <AppTopBar />
    <div class="app-shell has-side-nav">
      <AppSideNav mode="global" />
      <main class="workspace" :class="{ 'is-settings-workspace': activeRoute === 'settings' }">
        <section id="vt-main-content" class="content-frame" tabindex="-1">
          <RouterView />
        </section>
      </main>
    </div>
  </div>
</template>
