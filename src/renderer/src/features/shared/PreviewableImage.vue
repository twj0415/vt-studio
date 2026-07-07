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
    imageClass?: string;
    previewClass?: string;
    disabled?: boolean;
  }>(),
  {
    alt: '',
    heading: '',
    frameClass: '',
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
    <div class="group relative grid min-h-[180px] place-items-center overflow-hidden bg-[#111316]">
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

  <t-dialog v-model:visible="previewVisible" :header="previewTitle" width="min(96vw, 1280px)" :footer="false">
    <div :class="['grid min-h-[70vh] place-items-center overflow-hidden rounded-lg bg-[#08090a] p-3', previewClass]">
      <img class="block max-h-[82vh] max-w-full object-contain" :src="src" :alt="alt" />
    </div>
  </t-dialog>
</template>
