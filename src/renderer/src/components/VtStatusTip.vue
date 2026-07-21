<script setup lang="ts">
import { ErrorCircleIcon, InfoCircleIcon } from 'tdesign-icons-vue-next';

withDefaults(defineProps<{
  content: string;
  tone?: 'muted' | 'danger';
  size?: number;
}>(), {
  tone: 'muted',
  size: 15,
});
</script>

<template>
  <t-tooltip :content="content" placement="top" :show-arrow="true">
    <span
      class="vt-status-tip"
      :class="`vt-status-tip--${tone}`"
      role="img"
      tabindex="0"
      :aria-label="content"
      :style="{ '--vt-status-tip-size': `${size}px` }"
    >
      <ErrorCircleIcon v-if="tone === 'danger'" />
      <InfoCircleIcon v-else />
    </span>
  </t-tooltip>
</template>

<style scoped>
.vt-status-tip {
  display: inline-grid;
  width: var(--vt-status-tip-size);
  height: var(--vt-status-tip-size);
  flex: 0 0 var(--vt-status-tip-size);
  place-items: center;
  border-radius: 50%;
  outline: none;
  vertical-align: -2px;
}

.vt-status-tip :deep(svg) {
  width: 100%;
  height: 100%;
}

.vt-status-tip--muted {
  color: var(--vt-text-secondary);
}

.vt-status-tip--danger {
  color: var(--td-error-color);
}

.vt-status-tip:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 28%, transparent);
}
</style>
