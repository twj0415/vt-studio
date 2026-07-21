<script setup lang="ts">
import { computed } from 'vue';

type VtActionBarAlign = 'start' | 'end' | 'between';
type VtActionBarDensity = 'compact' | 'normal';

const props = withDefaults(defineProps<{
  align?: VtActionBarAlign;
  density?: VtActionBarDensity;
  sticky?: boolean;
  bordered?: boolean;
}>(), {
  align: 'end',
  density: 'normal',
  sticky: false,
  bordered: false,
});

const actionBarClass = computed(() => [
  'vt-action-bar',
  `vt-action-bar--align-${props.align}`,
  `vt-action-bar--${props.density}`,
  {
    'vt-action-bar--sticky': props.sticky,
    'vt-action-bar--bordered': props.bordered,
  },
]);
</script>

<template>
  <footer :class="actionBarClass">
    <div v-if="$slots.secondary" class="vt-action-bar__secondary">
      <slot name="secondary" />
    </div>
    <div class="vt-action-bar__primary">
      <slot />
    </div>
  </footer>
</template>

<style scoped>
.vt-action-bar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
}

.vt-action-bar--compact {
  padding: 6px 0;
}

.vt-action-bar--normal {
  padding: 10px 0;
}

.vt-action-bar--bordered {
  padding-right: 10px;
  padding-left: 10px;
  border: 1px solid var(--vt-border-subtle);
  background: color-mix(in srgb, var(--vt-surface-panel) 86%, transparent);
}

.vt-action-bar--sticky {
  position: sticky;
  bottom: 0;
  z-index: 4;
  backdrop-filter: blur(12px);
}

.vt-action-bar--align-start {
  justify-content: flex-start;
}

.vt-action-bar--align-end {
  justify-content: flex-end;
}

.vt-action-bar--align-between {
  justify-content: space-between;
}

.vt-action-bar__secondary,
.vt-action-bar__primary {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.vt-action-bar__primary {
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .vt-action-bar {
    display: grid;
    justify-content: stretch;
  }

  .vt-action-bar__primary,
  .vt-action-bar__secondary {
    justify-content: stretch;
  }
}
</style>
