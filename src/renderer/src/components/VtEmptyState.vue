<script setup lang="ts">
import { computed } from 'vue';
import type { EmptyProps } from 'tdesign-vue-next/es/empty';

const props = withDefaults(defineProps<{
  title?: EmptyProps['title'];
  description?: EmptyProps['description'];
  image?: EmptyProps['image'];
  imageStyle?: EmptyProps['imageStyle'];
  size?: EmptyProps['size'];
  type?: EmptyProps['type'];
  fill?: boolean;
}>(), {
  title: '',
  description: '',
  image: undefined,
  imageStyle: undefined,
  size: 'medium',
  type: 'empty',
  fill: false,
});

const emptyClass = computed(() => ({
  'vt-empty-state--fill': props.fill,
  'vt-empty-state--hide-title': !props.title,
  'vt-empty-state--hide-description': !props.description,
}));
</script>

<template>
  <section class="vt-empty-state" :class="emptyClass" role="status">
    <t-empty
      class="vt-empty-state__content"
      :title="title || ' '"
      :description="description || ' '"
      :image="image"
      :image-style="imageStyle"
      :size="size"
      :type="type"
    >
      <template v-if="$slots.image" #image>
        <slot name="image" />
      </template>
      <template v-if="$slots.action" #action>
        <div class="vt-empty-state__action">
          <slot name="action" />
        </div>
      </template>
    </t-empty>
  </section>
</template>

<style scoped>
.vt-empty-state {
  display: grid;
  min-width: 0;
  min-height: 220px;
  place-items: center;
  padding: 24px;
}

.vt-empty-state--fill {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.vt-empty-state__content {
  max-width: min(420px, 100%);
}

.vt-empty-state__action {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

.vt-empty-state__content :deep(.t-empty__title) {
  color: var(--vt-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.vt-empty-state--hide-title .vt-empty-state__content :deep(.t-empty__title) {
  display: none;
}

.vt-empty-state--hide-description .vt-empty-state__content :deep(.t-empty__description) {
  display: none;
}

.vt-empty-state__content :deep(.t-empty__description) {
  color: var(--vt-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}
</style>
