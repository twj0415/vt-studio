<script setup lang="ts">
import { computed } from 'vue';
import { CheckIcon, ErrorCircleIcon, FileIcon, ImageIcon, SoundIcon, VideoIcon } from 'tdesign-icons-vue-next';

type VtMediaKind = 'image' | 'video' | 'audio' | 'file' | 'empty';
type VtMediaStatus = 'idle' | 'running' | 'success' | 'warning' | 'error';

const props = withDefaults(defineProps<{
  title?: string;
  subtitle?: string;
  description?: string;
  mediaUrl?: string | null;
  mediaKind?: VtMediaKind;
  status?: VtMediaStatus;
  statusLabel?: string;
  emptyText?: string;
  aspectRatio?: string;
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  interactive?: boolean;
  controls?: boolean;
}>(), {
  title: '',
  subtitle: '',
  description: '',
  mediaUrl: null,
  mediaKind: 'empty',
  status: 'idle',
  statusLabel: '',
  emptyText: '',
  aspectRatio: '16 / 10',
  selected: false,
  disabled: false,
  loading: false,
  interactive: true,
  controls: false,
});

const emit = defineEmits<{
  click: [event: MouseEvent | KeyboardEvent];
}>();

const tileClass = computed(() => [
  'vt-media-tile',
  `vt-media-tile--${props.mediaKind}`,
  `vt-media-tile--status-${props.status}`,
  {
    'vt-media-tile--selected': props.selected,
    'vt-media-tile--disabled': props.disabled,
    'vt-media-tile--loading': props.loading,
    'vt-media-tile--interactive': props.interactive,
  },
]);
const previewStyle = computed(() => ({ aspectRatio: props.aspectRatio }));
const fallbackIcon = computed(() => {
  if (props.status === 'error') {
    return ErrorCircleIcon;
  }

  if (props.status === 'success') {
    return CheckIcon;
  }

  if (props.mediaKind === 'image') {
    return ImageIcon;
  }

  if (props.mediaKind === 'video') {
    return VideoIcon;
  }

  if (props.mediaKind === 'audio') {
    return SoundIcon;
  }

  return FileIcon;
});

function activate(event: MouseEvent | KeyboardEvent): void {
  if (!props.interactive || props.disabled || props.loading) {
    return;
  }

  emit('click', event);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  activate(event);
}
</script>

<template>
  <article
    :class="tileClass"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive && !disabled ? 0 : undefined"
    @click="activate"
    @keydown="handleKeydown"
  >
    <div class="vt-media-tile__preview" :style="previewStyle">
      <img v-if="mediaUrl && mediaKind === 'image'" :src="mediaUrl" :alt="title" />
      <video v-else-if="mediaUrl && mediaKind === 'video'" :src="mediaUrl" :controls="controls" muted playsinline preload="metadata" />
      <div v-else class="vt-media-tile__fallback">
        <component :is="fallbackIcon" />
        <span v-if="emptyText">{{ emptyText }}</span>
      </div>

      <div v-if="loading" class="vt-media-tile__loading" aria-hidden="true">
        <span />
      </div>

      <div v-if="statusLabel || $slots.badge" class="vt-media-tile__badge">
        <slot name="badge">
          <t-tag size="small" variant="light" :theme="status === 'error' ? 'danger' : status === 'warning' ? 'warning' : status === 'success' ? 'success' : 'default'">
            {{ statusLabel }}
          </t-tag>
        </slot>
      </div>

      <div v-if="$slots.overlay" class="vt-media-tile__overlay">
        <slot name="overlay" />
      </div>
    </div>

    <div v-if="title || subtitle || description || $slots.default || $slots.actions" class="vt-media-tile__main">
      <div class="vt-media-tile__text">
        <strong v-if="title">{{ title }}</strong>
        <span v-if="subtitle">{{ subtitle }}</span>
        <p v-if="description">{{ description }}</p>
        <slot />
      </div>
      <div v-if="$slots.actions" class="vt-media-tile__actions" @click.stop>
        <slot name="actions" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.vt-media-tile {
  position: relative;
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--vt-border-subtle);
  border-radius: 8px;
  color: var(--vt-text-primary);
  background: color-mix(in srgb, var(--vt-surface-raised) 86%, transparent);
  transition:
    border-color var(--vt-motion-fast) var(--vt-ease-standard),
    box-shadow var(--vt-motion-fast) var(--vt-ease-standard),
    transform var(--vt-motion-fast) var(--vt-ease-standard);
}

.vt-media-tile--interactive {
  cursor: pointer;
}

.vt-media-tile--interactive:hover,
.vt-media-tile:focus-visible {
  border-color: var(--vt-line-strong);
  transform: translateY(-1px);
}

.vt-media-tile:focus-visible {
  outline: none;
  box-shadow: var(--vt-focus-ring);
}

.vt-media-tile--selected {
  border-color: color-mix(in srgb, var(--vt-brand) 46%, var(--vt-line-strong));
  box-shadow: var(--vt-glow-brand);
}

.vt-media-tile--disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.vt-media-tile__preview {
  position: relative;
  display: grid;
  min-width: 0;
  overflow: hidden;
  place-items: center;
  border-bottom: 1px solid var(--vt-border-subtle);
  background:
    linear-gradient(color-mix(in srgb, var(--vt-line-soft) 42%, transparent) 1px, transparent 1px) 0 0 / 22px 22px,
    linear-gradient(90deg, color-mix(in srgb, var(--vt-line-soft) 38%, transparent) 1px, transparent 1px) 0 0 / 22px 22px,
    #0d1012;
}

.vt-media-tile__preview img,
.vt-media-tile__preview video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vt-media-tile__fallback {
  display: grid;
  min-width: 0;
  justify-items: center;
  gap: 8px;
  padding: 14px;
  color: color-mix(in srgb, var(--vt-text-secondary) 72%, transparent);
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
}

.vt-media-tile__fallback svg {
  width: 22px;
  height: 22px;
}

.vt-media-tile__fallback span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vt-media-tile__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, #050607 48%, transparent);
}

.vt-media-tile__loading span {
  width: 22px;
  height: 22px;
  border: 2px solid color-mix(in srgb, var(--vt-brand) 28%, transparent);
  border-top-color: var(--vt-brand-strong);
  border-radius: 50%;
  animation: vt-media-tile-spin 760ms linear infinite;
}

.vt-media-tile__badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  max-width: calc(100% - 16px);
  justify-content: flex-end;
}

.vt-media-tile__overlay {
  position: absolute;
  inset: auto 8px 8px 8px;
  display: flex;
  min-width: 0;
  justify-content: flex-end;
  gap: 6px;
}

.vt-media-tile__main {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 9px;
}

.vt-media-tile__text {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.vt-media-tile__text strong,
.vt-media-tile__text span,
.vt-media-tile__text p {
  overflow: hidden;
  text-overflow: ellipsis;
}

.vt-media-tile__text strong {
  color: var(--vt-text-primary);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.35;
  white-space: nowrap;
}

.vt-media-tile__text span {
  color: var(--vt-text-tertiary);
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}

.vt-media-tile__text p {
  display: -webkit-box;
  margin: 0;
  color: var(--vt-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.vt-media-tile__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

@keyframes vt-media-tile-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
