<script setup lang="ts">
import { computed } from 'vue';

type VtPanelTone = 'default' | 'brand' | 'success' | 'warning' | 'danger';
type VtPanelPadding = 'none' | 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  eyebrow?: string;
  title?: string;
  description?: string;
  tone?: VtPanelTone;
  padding?: VtPanelPadding;
  selected?: boolean;
  hoverable?: boolean;
  scrollable?: boolean;
}>(), {
  eyebrow: '',
  title: '',
  description: '',
  tone: 'default',
  padding: 'md',
  selected: false,
  hoverable: false,
  scrollable: false,
});

const panelClass = computed(() => [
  'vt-panel',
  `vt-panel--tone-${props.tone}`,
  `vt-panel--padding-${props.padding}`,
  {
    'vt-panel--selected': props.selected,
    'vt-panel--hoverable': props.hoverable,
    'vt-panel--scrollable': props.scrollable,
  },
]);
</script>

<template>
  <section :class="panelClass">
    <header v-if="$slots.header || eyebrow || title || description || $slots.actions" class="vt-panel__header">
      <slot name="header">
        <div class="vt-panel__title-block">
          <span v-if="eyebrow" class="vt-panel__eyebrow">{{ eyebrow }}</span>
          <strong v-if="title" class="vt-panel__title">{{ title }}</strong>
          <p v-if="description" class="vt-panel__description">{{ description }}</p>
        </div>
        <div v-if="$slots.actions" class="vt-panel__actions">
          <slot name="actions" />
        </div>
      </slot>
    </header>

    <div class="vt-panel__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="vt-panel__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.vt-panel {
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--vt-border-subtle);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vt-surface-panel) 88%, transparent);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--vt-text-primary) 5%, transparent);
  transition:
    border-color var(--vt-motion-fast) var(--vt-ease-standard),
    background var(--vt-motion-fast) var(--vt-ease-standard),
    box-shadow var(--vt-motion-fast) var(--vt-ease-standard),
    transform var(--vt-motion-fast) var(--vt-ease-standard);
}

.vt-panel--padding-none {
  padding: 0;
}

.vt-panel--padding-sm {
  padding: 10px;
}

.vt-panel--padding-md {
  padding: 12px;
}

.vt-panel--padding-lg {
  padding: 16px;
}

.vt-panel--hoverable:hover {
  border-color: var(--vt-line-strong);
  background: color-mix(in srgb, var(--vt-surface-raised) 82%, transparent);
  transform: translateY(-1px);
}

.vt-panel--selected {
  border-color: color-mix(in srgb, var(--vt-brand) 42%, var(--vt-line-strong));
  box-shadow: var(--vt-glow-brand);
}

.vt-panel--tone-brand {
  border-color: color-mix(in srgb, var(--vt-brand) 26%, var(--vt-line-soft));
}

.vt-panel--tone-success {
  border-color: color-mix(in srgb, var(--vt-success) 30%, var(--vt-line-soft));
}

.vt-panel--tone-warning {
  border-color: color-mix(in srgb, var(--vt-warning) 30%, var(--vt-line-soft));
}

.vt-panel--tone-danger {
  border-color: color-mix(in srgb, var(--vt-danger) 30%, var(--vt-line-soft));
}

.vt-panel--scrollable {
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.vt-panel__header,
.vt-panel__footer {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.vt-panel__header {
  padding-bottom: 10px;
}

.vt-panel__footer {
  padding-top: 10px;
  border-top: 1px solid var(--vt-border-subtle);
}

.vt-panel__title-block {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.vt-panel__eyebrow {
  color: var(--vt-text-tertiary);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0;
}

.vt-panel__title {
  overflow: hidden;
  color: var(--vt-text-primary);
  font-size: 14px;
  font-weight: 760;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vt-panel__description {
  margin: 0;
  color: var(--vt-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.vt-panel__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.vt-panel__body {
  display: grid;
  min-width: 0;
  min-height: 0;
  gap: 10px;
}

@media (max-width: 720px) {
  .vt-panel__header,
  .vt-panel__footer {
    display: grid;
    justify-content: stretch;
  }

  .vt-panel__actions {
    justify-content: flex-start;
  }
}
</style>
