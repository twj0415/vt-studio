<script setup lang="ts">
import { computed } from 'vue';
import {
  ArticleIcon,
  CloseIcon,
  FileIcon,
  ImageIcon,
  PaletteIcon,
  SoundIcon,
  UserIcon,
  VideoIcon,
} from 'tdesign-icons-vue-next';
import type { VtResourceReference } from './vt-resource-reference';

const props = withDefaults(defineProps<{
  resource: VtResourceReference;
  active?: boolean;
  removable?: boolean;
  disabled?: boolean;
  dense?: boolean;
  removeLabel?: string;
}>(), {
  active: false,
  removable: false,
  disabled: false,
  dense: false,
  removeLabel: '',
});

const emit = defineEmits<{
  click: [resource: VtResourceReference];
  remove: [resource: VtResourceReference];
}>();

const tokenClass = computed(() => [
  'vt-resource-token',
  `vt-resource-token--${props.resource.kind}`,
  `vt-resource-token--status-${props.resource.status ?? 'idle'}`,
  {
    'vt-resource-token--active': props.active,
    'vt-resource-token--disabled': props.disabled || props.resource.disabled,
    'vt-resource-token--dense': props.dense,
  },
]);
const iconComponent = computed(() => {
  if (props.resource.kind === 'character') {
    return UserIcon;
  }

  if (props.resource.kind === 'scene' || props.resource.kind === 'prop') {
    return PaletteIcon;
  }

  if (props.resource.kind === 'storyboard' || props.resource.kind === 'image') {
    return ImageIcon;
  }

  if (props.resource.kind === 'video') {
    return VideoIcon;
  }

  if (props.resource.kind === 'audio') {
    return SoundIcon;
  }

  if (props.resource.kind === 'file') {
    return FileIcon;
  }

  return ArticleIcon;
});
const isDisabled = computed(() => props.disabled || Boolean(props.resource.disabled));
const removeAriaLabel = computed(() => props.removeLabel || props.resource.name);

function activate(): void {
  if (isDisabled.value) {
    return;
  }

  emit('click', props.resource);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  activate();
}

function removeResource(): void {
  if (isDisabled.value) {
    return;
  }

  emit('remove', props.resource);
}
</script>

<template>
  <t-popup trigger="hover" placement="top" :show-arrow="true">
    <template #content>
      <div class="vt-resource-token-popover">
        <img v-if="resource.thumbnailUrl" :src="resource.thumbnailUrl" :alt="resource.name" />
        <div class="vt-resource-token-popover__main">
          <strong>{{ resource.name }}</strong>
          <span v-if="resource.meta">{{ resource.meta }}</span>
          <p v-if="resource.description">{{ resource.description }}</p>
          <small v-if="resource.statusLabel">{{ resource.statusLabel }}</small>
        </div>
      </div>
    </template>

    <span
      :class="tokenClass"
      role="button"
      :tabindex="isDisabled ? undefined : 0"
      :aria-disabled="isDisabled"
      @click="activate"
      @keydown="handleKeydown"
    >
      <span class="vt-resource-token__icon">
        <img v-if="resource.thumbnailUrl" :src="resource.thumbnailUrl" :alt="resource.name" />
        <component v-else :is="iconComponent" />
      </span>
      <span class="vt-resource-token__name">{{ resource.name }}</span>
      <span v-if="resource.status" class="vt-resource-token__status" aria-hidden="true" />
      <button
        v-if="removable"
        class="vt-resource-token__remove"
        type="button"
        :aria-label="removeAriaLabel"
        :disabled="isDisabled"
        @click.stop="removeResource"
      >
        <CloseIcon />
      </button>
    </span>
  </t-popup>
</template>

<style scoped>
.vt-resource-token {
  display: inline-flex;
  max-width: 100%;
  min-width: 0;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 3px 8px 3px 4px;
  border: 1px solid var(--vt-border-subtle);
  border-radius: 999px;
  color: var(--vt-text-secondary);
  background: color-mix(in srgb, var(--vt-fill-subtle) 82%, transparent);
  cursor: pointer;
  transition:
    border-color var(--vt-motion-fast) var(--vt-ease-standard),
    background var(--vt-motion-fast) var(--vt-ease-standard),
    box-shadow var(--vt-motion-fast) var(--vt-ease-standard),
    color var(--vt-motion-fast) var(--vt-ease-standard);
}

.vt-resource-token:hover,
.vt-resource-token:focus-visible,
.vt-resource-token--active {
  border-color: color-mix(in srgb, var(--vt-brand) 34%, var(--vt-line-strong));
  color: var(--vt-brand-strong);
  background: color-mix(in srgb, var(--vt-brand) 10%, var(--vt-surface-raised));
}

.vt-resource-token:focus-visible {
  outline: none;
  box-shadow: var(--vt-focus-ring);
}

.vt-resource-token--dense {
  min-height: 24px;
  padding: 2px 7px 2px 3px;
}

.vt-resource-token--disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.vt-resource-token__icon {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  overflow: hidden;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--vt-line-soft) 74%, transparent);
  border-radius: 999px;
  color: var(--vt-brand-strong);
  background: var(--vt-surface-raised);
}

.vt-resource-token--dense .vt-resource-token__icon {
  width: 18px;
  height: 18px;
  flex-basis: 18px;
}

.vt-resource-token__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vt-resource-token__icon svg {
  width: 13px;
  height: 13px;
}

.vt-resource-token__name {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 720;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vt-resource-token__status {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 999px;
  background: var(--vt-text-tertiary);
}

.vt-resource-token--status-running .vt-resource-token__status {
  background: var(--vt-warning);
}

.vt-resource-token--status-success .vt-resource-token__status {
  background: var(--vt-success);
}

.vt-resource-token--status-warning .vt-resource-token__status {
  background: var(--vt-warning);
}

.vt-resource-token--status-error .vt-resource-token__status,
.vt-resource-token--status-disabled .vt-resource-token__status {
  background: var(--vt-danger);
}

.vt-resource-token__remove {
  display: grid;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: currentColor;
  background: transparent;
}

.vt-resource-token__remove:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.vt-resource-token__remove svg {
  width: 12px;
  height: 12px;
}

.vt-resource-token-popover {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  max-width: 320px;
  padding: 2px;
}

.vt-resource-token-popover img {
  width: 54px;
  height: 54px;
  border-radius: 7px;
  object-fit: cover;
}

.vt-resource-token-popover__main {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.vt-resource-token-popover__main strong,
.vt-resource-token-popover__main span,
.vt-resource-token-popover__main p,
.vt-resource-token-popover__main small {
  overflow: hidden;
  text-overflow: ellipsis;
}

.vt-resource-token-popover__main strong {
  color: var(--vt-text-primary);
  font-size: 13px;
  line-height: 1.35;
  white-space: nowrap;
}

.vt-resource-token-popover__main span,
.vt-resource-token-popover__main small {
  color: var(--vt-text-tertiary);
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
}

.vt-resource-token-popover__main p {
  display: -webkit-box;
  margin: 0;
  color: var(--vt-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
