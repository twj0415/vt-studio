<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArticleIcon, FileIcon, ImageIcon, PaletteIcon, SearchIcon, SoundIcon, UserIcon, VideoIcon } from 'tdesign-icons-vue-next';
import type { VtResourceReference } from './vt-resource-reference';
import { getVtResourceKey } from './vt-resource-reference';

const props = withDefaults(defineProps<{
  resources: VtResourceReference[];
  visible?: boolean;
  searchValue?: string;
  selectedKeys?: string[];
  triggerLabel?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  maxHeight?: number;
}>(), {
  visible: undefined,
  searchValue: undefined,
  selectedKeys: () => [],
  triggerLabel: '',
  searchPlaceholder: '',
  emptyText: '',
  loading: false,
  disabled: false,
  searchable: true,
  maxHeight: 320,
});

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  'update:searchValue': [value: string];
  select: [resource: VtResourceReference];
}>();

const innerVisible = ref(false);
const innerSearch = ref('');

const mergedVisible = computed({
  get: () => props.visible ?? innerVisible.value,
  set: (value: boolean) => {
    innerVisible.value = value;
    emit('update:visible', value);
  },
});
const mergedSearch = computed({
  get: () => props.searchValue ?? innerSearch.value,
  set: (value: string) => {
    innerSearch.value = value;
    emit('update:searchValue', value);
  },
});
const selectedKeySet = computed(() => new Set(props.selectedKeys));
const listStyle = computed(() => ({
  maxHeight: `${props.maxHeight}px`,
}));
const filteredResources = computed(() => {
  const keyword = mergedSearch.value.trim().toLocaleLowerCase();
  if (!keyword) {
    return props.resources;
  }

  return props.resources.filter((resource) => [
    resource.name,
    resource.description,
    resource.meta,
    resource.statusLabel,
  ].some((value) => value?.toLocaleLowerCase().includes(keyword)));
});

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

function selectResource(resource: VtResourceReference): void {
  if (resource.disabled || props.disabled) {
    return;
  }

  emit('select', resource);
  mergedVisible.value = false;
}
</script>

<template>
  <t-popup v-model:visible="mergedVisible" trigger="click" placement="bottom-left" :show-arrow="true" :disabled="disabled">
    <template #content>
      <section class="vt-resource-picker" @click.stop>
        <t-input
          v-if="searchable"
          class="vt-resource-picker__search"
          :model-value="mergedSearch"
          :placeholder="searchPlaceholder"
          clearable
          size="small"
          @update:model-value="(value: string) => (mergedSearch = String(value ?? ''))"
        >
          <template #prefix-icon>
            <SearchIcon />
          </template>
        </t-input>

        <div class="vt-resource-picker__list" :style="listStyle">
          <div v-if="loading" class="vt-resource-picker__state" aria-hidden="true">
            <span />
          </div>

          <button
            v-for="resource in filteredResources"
            :key="getVtResourceKey(resource)"
            class="vt-resource-picker__item"
            :class="{
              'is-selected': selectedKeySet.has(getVtResourceKey(resource)),
              'is-disabled': resource.disabled,
            }"
            type="button"
            :disabled="resource.disabled"
            @click="selectResource(resource)"
          >
            <span class="vt-resource-picker__thumb">
              <img v-if="resource.thumbnailUrl" :src="resource.thumbnailUrl" :alt="resource.name" />
              <component v-else :is="getIcon(resource)" />
            </span>
            <span class="vt-resource-picker__content">
              <strong>{{ resource.name }}</strong>
              <small v-if="resource.meta || resource.statusLabel">{{ resource.meta || resource.statusLabel }}</small>
              <span v-if="resource.description">{{ resource.description }}</span>
            </span>
            <span v-if="resource.status" class="vt-resource-picker__dot" :class="`is-${resource.status}`" />
          </button>

          <p v-if="!loading && filteredResources.length === 0 && emptyText" class="vt-resource-picker__empty">
            {{ emptyText }}
          </p>
        </div>
      </section>
    </template>

    <slot name="trigger" :visible="mergedVisible">
      <t-button v-if="triggerLabel" size="small" variant="outline" :disabled="disabled">
        {{ triggerLabel }}
      </t-button>
      <span v-else class="vt-resource-picker__anchor" />
    </slot>
  </t-popup>
</template>

<style scoped>
.vt-resource-picker {
  display: grid;
  width: min(360px, calc(100vw - 32px));
  gap: 8px;
  padding: 8px;
}

.vt-resource-picker__search :deep(.t-input) {
  border-color: var(--vt-border-subtle);
  background: var(--vt-surface-raised);
}

.vt-resource-picker__list {
  display: grid;
  min-width: 0;
  gap: 6px;
  overflow: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
  scrollbar-gutter: stable;
}

.vt-resource-picker__item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--vt-text-primary);
  background: transparent;
  text-align: left;
  transition:
    border-color var(--vt-motion-fast) var(--vt-ease-standard),
    background var(--vt-motion-fast) var(--vt-ease-standard);
}

.vt-resource-picker__item:hover,
.vt-resource-picker__item:focus-visible,
.vt-resource-picker__item.is-selected {
  border-color: color-mix(in srgb, var(--vt-brand) 30%, var(--vt-line-strong));
  background: color-mix(in srgb, var(--vt-brand) 8%, var(--vt-surface-raised));
  outline: none;
}

.vt-resource-picker__item.is-disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.vt-resource-picker__thumb {
  display: grid;
  width: 38px;
  height: 38px;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--vt-border-subtle);
  border-radius: 8px;
  color: var(--vt-brand-strong);
  background: var(--vt-fill-subtle);
}

.vt-resource-picker__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vt-resource-picker__thumb svg {
  width: 18px;
  height: 18px;
}

.vt-resource-picker__content {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.vt-resource-picker__content strong,
.vt-resource-picker__content small,
.vt-resource-picker__content span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vt-resource-picker__content strong {
  color: var(--vt-text-primary);
  font-size: 13px;
  font-weight: 760;
}

.vt-resource-picker__content small,
.vt-resource-picker__content span {
  color: var(--vt-text-tertiary);
  font-size: 12px;
}

.vt-resource-picker__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--vt-text-tertiary);
}

.vt-resource-picker__dot.is-running,
.vt-resource-picker__dot.is-warning {
  background: var(--vt-warning);
}

.vt-resource-picker__dot.is-success {
  background: var(--vt-success);
}

.vt-resource-picker__dot.is-error,
.vt-resource-picker__dot.is-disabled {
  background: var(--vt-danger);
}

.vt-resource-picker__state {
  display: grid;
  min-height: 96px;
  place-items: center;
}

.vt-resource-picker__state span {
  width: 22px;
  height: 22px;
  border: 2px solid color-mix(in srgb, var(--vt-brand) 26%, transparent);
  border-top-color: var(--vt-brand-strong);
  border-radius: 50%;
  animation: vt-resource-picker-spin 760ms linear infinite;
}

.vt-resource-picker__empty {
  margin: 0;
  padding: 18px 10px;
  color: var(--vt-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

.vt-resource-picker__anchor {
  display: inline-flex;
}

@keyframes vt-resource-picker-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
