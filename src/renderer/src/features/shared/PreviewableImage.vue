<script setup lang="ts">
import { computed, ref, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { FullscreenIcon } from 'tdesign-icons-vue-next';

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    heading?: string;
    frameClass?: string;
    viewportClass?: string;
    aspectRatio?: string;
    imageClass?: string;
    previewClass?: string;
    disabled?: boolean;
  }>(),
  {
    alt: '',
    heading: '',
    frameClass: '',
    viewportClass: '',
    aspectRatio: '',
    imageClass: '',
    previewClass: '',
    disabled: false,
  },
);

const { t } = useI18n();
const slots = useSlots();
const previewVisible = ref(false);

const previewTitle = computed(() => props.heading || props.alt || t('common.imagePreview.title'));
const openLabel = computed(() => t('common.imagePreview.open'));
const hasCaption = computed(() => Boolean(slots.caption));

function openPreview(): void {
  if (props.disabled || !props.src) {
    return;
  }

  previewVisible.value = true;
}
</script>

<template>
  <figure :class="['grid min-w-0 overflow-hidden rounded-lg border border-line-soft bg-surface-raised', frameClass]">
    <div
      :class="['group relative grid min-h-[180px] place-items-center overflow-hidden bg-[#111316]', viewportClass]"
      :style="aspectRatio ? { aspectRatio } : undefined"
    >
      <img :class="['block max-h-[320px] w-full object-contain', imageClass]" :src="src" :alt="alt" />
      <button
        type="button"
        class="absolute inset-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        :aria-label="openLabel"
        :disabled="disabled || !src"
        @click="openPreview"
      />
      <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-end gap-2 p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <slot name="toolbar" />
        <t-tooltip :content="openLabel">
          <t-button class="pointer-events-auto" shape="square" size="small" variant="outline" :aria-label="openLabel" :disabled="disabled || !src" @click="openPreview">
            <FullscreenIcon />
          </t-button>
        </t-tooltip>
      </div>
    </div>

    <figcaption v-if="hasCaption" class="grid min-w-0 gap-1 border-t border-line-soft bg-surface-panel px-3 py-2.5">
      <slot name="caption" />
    </figcaption>
  </figure>

  <t-dialog
    v-model:visible="previewVisible"
    :header="previewTitle"
    width="min(96vw, 1280px)"
    top="16px"
    dialog-class-name="previewable-image-dialog"
    :footer="false"
  >
    <div :class="['previewable-image-dialog-body', previewClass]">
      <img class="previewable-image-dialog-media" :src="src" :alt="alt" />
    </div>
  </t-dialog>
</template>

<style scoped>
.previewable-image-dialog-body {
  display: grid;
  height: min(72dvh, calc(100dvh - 124px));
  min-height: 240px;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: #08090a;
  padding: 12px;
}

.previewable-image-dialog-media {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

@media (max-height: 640px) {
  .previewable-image-dialog-body {
    height: calc(100dvh - 108px);
    min-height: 180px;
    padding: 8px;
  }
}
</style>
