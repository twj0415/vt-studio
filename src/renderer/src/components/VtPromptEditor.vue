<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { ArticleIcon, FileIcon, ImageIcon, PaletteIcon, SearchIcon, SoundIcon, UserIcon, VideoIcon } from 'tdesign-icons-vue-next';
import VtResourceToken from './VtResourceToken.vue';
import type { VtResourceReference } from './vt-resource-reference';
import { getVtResourceKey } from './vt-resource-reference';

const props = withDefaults(defineProps<{
  modelValue: string;
  resources?: VtResourceReference[];
  selectedResourceKeys?: string[];
  label?: string;
  helper?: string;
  placeholder?: string;
  mentionPlaceholder?: string;
  emptyText?: string;
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
  readonly?: boolean;
  loading?: boolean;
  insertSuffix?: string;
}>(), {
  resources: () => [],
  selectedResourceKeys: () => [],
  label: '',
  helper: '',
  placeholder: '',
  mentionPlaceholder: '',
  emptyText: '',
  minRows: 6,
  maxRows: 12,
  disabled: false,
  readonly: false,
  loading: false,
  insertSuffix: ' ',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  selectResource: [resource: VtResourceReference];
  removeResource: [resource: VtResourceReference];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const rootRef = ref<HTMLElement | null>(null);
const mentionVisible = ref(false);
const mentionQuery = ref('');

const autosize = computed(() => ({ minRows: props.minRows, maxRows: props.maxRows }));
const selectedKeySet = computed(() => new Set(props.selectedResourceKeys));
const selectedResources = computed(() => {
  if (selectedKeySet.value.size > 0) {
    return props.resources.filter((resource) => selectedKeySet.value.has(getVtResourceKey(resource)));
  }

  return props.resources.filter((resource) => props.modelValue.includes(`@${resource.name}`));
});
const mentionResources = computed(() => {
  const keyword = mentionQuery.value.trim().toLocaleLowerCase();
  const candidates = props.resources.filter((resource) => !resource.disabled);

  if (!keyword) {
    return candidates;
  }

  return candidates.filter((resource) => [
    resource.name,
    resource.description,
    resource.meta,
    resource.statusLabel,
  ].some((value) => value?.toLocaleLowerCase().includes(keyword)));
});

function getTextarea(): HTMLTextAreaElement | null {
  return rootRef.value?.querySelector('textarea') ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMentionRange(textarea: HTMLTextAreaElement): { start: number; end: number; query: string } | null {
  const caret = textarea.selectionStart ?? props.modelValue.length;
  const beforeCaret = props.modelValue.slice(0, caret);
  const match = beforeCaret.match(/(^|[\s([{，。、“”])@([\w\u4e00-\u9fa5-]*)$/);

  if (!match || typeof match.index !== 'number') {
    return null;
  }

  return {
    start: match.index + match[1].length,
    end: caret,
    query: match[2] ?? '',
  };
}

function updateValue(value: string): void {
  if (props.readonly) {
    return;
  }

  emit('update:modelValue', value);
  nextTick(syncMentionState);
}

function syncMentionState(): void {
  const textarea = getTextarea();
  if (!textarea || props.disabled || props.readonly) {
    mentionVisible.value = false;
    return;
  }

  const range = getMentionRange(textarea);
  mentionVisible.value = Boolean(range);
  mentionQuery.value = range?.query ?? '';
}

function insertResource(resource: VtResourceReference): void {
  if (props.disabled || props.readonly || resource.disabled) {
    return;
  }

  const textarea = getTextarea();
  const token = `@${resource.name}`;
  let nextValue = props.modelValue;
  let nextCaret = nextValue.length;

  if (textarea) {
    const caret = textarea.selectionStart ?? props.modelValue.length;
    const range = getMentionRange(textarea);
    const start = range?.start ?? caret;
    const end = range?.end ?? caret;
    nextValue = `${props.modelValue.slice(0, start)}${token}${props.insertSuffix}${props.modelValue.slice(end)}`;
    nextCaret = start + token.length + props.insertSuffix.length;
  } else {
    const spacer = props.modelValue.trim().length > 0 && !props.modelValue.endsWith(' ') ? ' ' : '';
    nextValue = `${props.modelValue}${spacer}${token}${props.insertSuffix}`;
    nextCaret = nextValue.length;
  }

  emit('update:modelValue', nextValue);
  emit('selectResource', resource);
  mentionVisible.value = false;

  nextTick(() => {
    const nextTextarea = getTextarea();
    nextTextarea?.focus();
    nextTextarea?.setSelectionRange(nextCaret, nextCaret);
  });
}

function removeResource(resource: VtResourceReference): void {
  const pattern = new RegExp(`(^|\\s)@${escapeRegExp(resource.name)}\\s?`, 'g');
  const nextValue = props.modelValue.replace(pattern, (_match, prefix: string) => (prefix ? prefix : '')).trimStart();
  emit('update:modelValue', nextValue);
  emit('removeResource', resource);
}

function getIcon(resource: VtResourceReference) {
  if (resource.kind === 'character') {
    return UserIcon;
  }

  if (resource.kind === 'scene' || resource.kind === 'prop') {
    return PaletteIcon;
  }

  if (resource.kind === 'storyboard' || resource.kind === 'image') {
    return ImageIcon;
  }

  if (resource.kind === 'video') {
    return VideoIcon;
  }

  if (resource.kind === 'audio') {
    return SoundIcon;
  }

  if (resource.kind === 'file') {
    return FileIcon;
  }

  return ArticleIcon;
}

function handleFocus(event: FocusEvent): void {
  emit('focus', event);
  syncMentionState();
}

function handleBlur(event: FocusEvent): void {
  emit('blur', event);
  window.setTimeout(() => {
    mentionVisible.value = false;
  }, 120);
}
</script>

<template>
  <section ref="rootRef" class="vt-prompt-editor" :class="{ 'vt-prompt-editor--disabled': disabled, 'vt-prompt-editor--loading': loading }">
    <header v-if="label || helper || $slots.actions" class="vt-prompt-editor__header">
      <div class="vt-prompt-editor__title">
        <strong v-if="label">{{ label }}</strong>
        <p v-if="helper">{{ helper }}</p>
      </div>
      <div v-if="$slots.actions" class="vt-prompt-editor__actions">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="selectedResources.length > 0 || $slots.references" class="vt-prompt-editor__references">
      <slot name="references" :resources="selectedResources">
        <VtResourceToken
          v-for="resource in selectedResources"
          :key="getVtResourceKey(resource)"
          :resource="resource"
          removable
          dense
          @click="insertResource"
          @remove="removeResource"
        />
      </slot>
    </div>

    <div class="vt-prompt-editor__field">
      <t-textarea
        class="vt-prompt-editor__textarea"
        :model-value="modelValue"
        :autosize="autosize"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        @update:model-value="(value) => updateValue(String(value ?? ''))"
        @focus="handleFocus"
        @blur="handleBlur"
        @click="syncMentionState"
        @keyup="syncMentionState"
      />

      <div v-if="loading" class="vt-prompt-editor__loading" aria-hidden="true">
        <span />
      </div>

      <section v-if="mentionVisible" class="vt-prompt-editor__mention" @mousedown.prevent>
        <div v-if="mentionPlaceholder" class="vt-prompt-editor__mention-head">
          <SearchIcon />
          <span>{{ mentionPlaceholder }}</span>
        </div>
        <div class="vt-prompt-editor__mention-list">
          <button
            v-for="resource in mentionResources"
            :key="getVtResourceKey(resource)"
            class="vt-prompt-editor__mention-item"
            type="button"
            @click="insertResource(resource)"
          >
            <span class="vt-prompt-editor__mention-thumb">
              <img v-if="resource.thumbnailUrl" :src="resource.thumbnailUrl" :alt="resource.name" />
              <component v-else :is="getIcon(resource)" />
            </span>
            <span class="vt-prompt-editor__mention-text">
              <strong>{{ resource.name }}</strong>
              <small v-if="resource.meta || resource.statusLabel">{{ resource.meta || resource.statusLabel }}</small>
            </span>
          </button>
          <p v-if="mentionResources.length === 0 && emptyText" class="vt-prompt-editor__empty">{{ emptyText }}</p>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.vt-prompt-editor {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.vt-prompt-editor__header {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.vt-prompt-editor__title {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.vt-prompt-editor__title strong {
  color: var(--vt-text-primary);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.35;
}

.vt-prompt-editor__title p {
  margin: 0;
  color: var(--vt-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.vt-prompt-editor__actions,
.vt-prompt-editor__references {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.vt-prompt-editor__actions {
  justify-content: flex-end;
}

.vt-prompt-editor__field {
  position: relative;
  display: grid;
  min-width: 0;
}

.vt-prompt-editor__textarea :deep(.t-textarea__inner) {
  color: var(--vt-text-primary);
  background:
    linear-gradient(color-mix(in srgb, var(--vt-line-soft) 34%, transparent) 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(90deg, color-mix(in srgb, var(--vt-line-soft) 28%, transparent) 1px, transparent 1px) 0 0 / 24px 24px,
    color-mix(in srgb, var(--vt-surface-raised) 86%, transparent);
  border-color: var(--vt-border-subtle);
  border-radius: 8px;
  line-height: 1.7;
  resize: vertical;
  transition:
    border-color var(--vt-motion-fast) var(--vt-ease-standard),
    box-shadow var(--vt-motion-fast) var(--vt-ease-standard);
}

.vt-prompt-editor__textarea :deep(.t-textarea__inner:focus) {
  border-color: color-mix(in srgb, var(--vt-brand) 44%, var(--vt-line-strong));
  box-shadow: var(--vt-focus-ring);
}

.vt-prompt-editor--disabled {
  opacity: 0.72;
}

.vt-prompt-editor__loading {
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vt-surface-raised) 74%, transparent);
}

.vt-prompt-editor__loading span {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--vt-brand) 24%, transparent);
  border-top-color: var(--vt-brand-strong);
  border-radius: 50%;
  animation: vt-prompt-editor-spin 760ms linear infinite;
}

.vt-prompt-editor__mention {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 8;
  display: grid;
  width: min(340px, calc(100% - 20px));
  max-height: min(280px, 62dvh);
  overflow: hidden;
  border: 1px solid var(--vt-line-strong);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vt-surface-raised) 96%, transparent);
  box-shadow: var(--vt-shadow-panel);
}

.vt-prompt-editor__mention-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--vt-border-subtle);
  color: var(--vt-text-tertiary);
  font-size: 12px;
}

.vt-prompt-editor__mention-head svg {
  width: 14px;
  height: 14px;
}

.vt-prompt-editor__mention-list {
  display: grid;
  gap: 4px;
  min-width: 0;
  overflow: auto;
  padding: 6px;
  scrollbar-gutter: stable;
}

.vt-prompt-editor__mention-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--vt-text-primary);
  background: transparent;
  text-align: left;
}

.vt-prompt-editor__mention-item:hover,
.vt-prompt-editor__mention-item:focus-visible {
  border-color: color-mix(in srgb, var(--vt-brand) 30%, var(--vt-line-soft));
  background: color-mix(in srgb, var(--vt-brand) 8%, var(--vt-surface-raised));
  outline: none;
}

.vt-prompt-editor__mention-thumb {
  display: grid;
  width: 34px;
  height: 34px;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--vt-border-subtle);
  border-radius: 8px;
  color: var(--vt-brand-strong);
  background: var(--vt-fill-subtle);
}

.vt-prompt-editor__mention-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vt-prompt-editor__mention-thumb svg {
  width: 17px;
  height: 17px;
}

.vt-prompt-editor__mention-text {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.vt-prompt-editor__mention-text strong,
.vt-prompt-editor__mention-text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vt-prompt-editor__mention-text strong {
  color: var(--vt-text-primary);
  font-size: 13px;
  line-height: 1.35;
}

.vt-prompt-editor__mention-text small,
.vt-prompt-editor__empty {
  color: var(--vt-text-tertiary);
  font-size: 12px;
}

.vt-prompt-editor__empty {
  margin: 0;
  padding: 14px 8px;
  line-height: 1.6;
  text-align: center;
}

@keyframes vt-prompt-editor-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
