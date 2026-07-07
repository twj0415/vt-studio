<script setup lang="ts">
defineProps<{
  heading: string;
}>();
</script>

<template>
  <section class="settings-section-card">
    <header class="settings-section-card-head">
      <h3>{{ heading }}</h3>
      <div v-if="$slots.actions" class="settings-section-card-actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="settings-section-card-body">
      <slot />
    </div>
  </section>
</template>
