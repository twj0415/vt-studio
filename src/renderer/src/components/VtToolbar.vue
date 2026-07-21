<script setup lang="ts">
import { computed } from 'vue';

type VtToolbarDensity = 'compact' | 'normal';

const props = withDefaults(defineProps<{
  density?: VtToolbarDensity;
  sticky?: boolean;
  bordered?: boolean;
}>(), {
  density: 'normal',
  sticky: false,
  bordered: true,
});

const toolbarClass = computed(() => [
  'vt-toolbar',
  `vt-toolbar--${props.density}`,
  {
    'vt-toolbar--sticky': props.sticky,
    'vt-toolbar--bordered': props.bordered,
  },
]);
</script>

<template>
  <header :class="toolbarClass">
    <div v-if="$slots.leading" class="vt-toolbar__leading">
      <slot name="leading" />
    </div>

    <div v-if="$slots.default" class="vt-toolbar__main">
      <slot />
    </div>

    <div v-if="$slots.actions" class="vt-toolbar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.vt-toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--vt-surface-panel) 82%, transparent);
}

.vt-toolbar--compact {
  min-height: 38px;
  padding: 5px 6px;
}

.vt-toolbar--normal {
  min-height: 46px;
  padding: 8px 10px;
}

.vt-toolbar--bordered {
  border: 1px solid var(--vt-border-subtle);
}

.vt-toolbar--sticky {
  position: sticky;
  top: 0;
  z-index: 5;
  backdrop-filter: blur(12px);
}

.vt-toolbar__leading,
.vt-toolbar__main,
.vt-toolbar__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.vt-toolbar__main {
  flex: 1 1 auto;
}

.vt-toolbar__actions {
  flex: 0 0 auto;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .vt-toolbar {
    display: grid;
    align-items: stretch;
  }

  .vt-toolbar__leading,
  .vt-toolbar__main,
  .vt-toolbar__actions {
    justify-content: flex-start;
  }
}
</style>
