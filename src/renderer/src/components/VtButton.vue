<script setup lang="ts">
import { computed } from 'vue';
import type { ButtonProps } from 'tdesign-vue-next/es/button';

const props = withDefaults(defineProps<{
  theme?: ButtonProps['theme'];
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  type?: ButtonProps['type'];
  shape?: ButtonProps['shape'];
  iconOnly?: boolean;
  minWidth?: number | string;
  ariaLabel?: string;
}>(), {
  theme: 'default',
  variant: 'outline',
  size: 'medium',
  disabled: false,
  loading: false,
  block: false,
  type: 'button',
  shape: 'rectangle',
  iconOnly: false,
  minWidth: 72,
  ariaLabel: '',
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const buttonClass = computed(() => ({
  'vt-button--icon-only': props.iconOnly,
}));

const buttonStyle = computed(() => ({
  '--vt-button-min-width': typeof props.minWidth === 'number' ? `${props.minWidth}px` : props.minWidth,
}));

function handleClick(event: MouseEvent): void {
  if (props.disabled || props.loading) {
    event.preventDefault();
    return;
  }

  emit('click', event);
}
</script>

<template>
  <t-button
    class="vt-button"
    :class="buttonClass"
    :style="buttonStyle"
    :theme="theme"
    :variant="variant"
    :size="size"
    :disabled="disabled"
    :loading="loading"
    :block="block"
    :type="type"
    :shape="shape"
    :aria-label="ariaLabel || undefined"
    @click="handleClick"
  >
    <template v-if="$slots.icon" #icon>
      <slot name="icon" />
    </template>
    <slot />
  </t-button>
</template>

<style scoped>
.vt-button {
  min-width: var(--vt-button-min-width);
  font-weight: 650;
}

.vt-button--icon-only {
  min-width: 0;
}
</style>
