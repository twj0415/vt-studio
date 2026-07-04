<script setup lang="ts">
import { ref } from 'vue';
import { UploadIcon } from 'tdesign-icons-vue-next';

const props = withDefaults(defineProps<{
  label: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  loading?: boolean;
  theme?: 'default' | 'primary' | 'danger' | 'warning' | 'success';
  variant?: 'base' | 'outline' | 'dashed' | 'text';
  size?: 'small' | 'medium' | 'large';
  ariaLabel?: string;
}>(), {
  accept: '',
  multiple: false,
  disabled: false,
  loading: false,
  theme: 'default',
  variant: 'outline',
  size: 'medium',
  ariaLabel: '',
});

const emit = defineEmits<{
  change: [files: File[]];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

function openPicker(): void {
  if (props.disabled || props.loading) {
    return;
  }
  inputRef.value?.click();
}

function handleChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length > 0) {
    emit('change', files);
  }
}
</script>

<template>
  <span class="vt-file-picker">
    <input
      ref="inputRef"
      class="vt-file-picker__input"
      type="file"
      :accept="accept"
      :multiple="multiple"
      tabindex="-1"
      aria-hidden="true"
      @change="handleChange"
    />
    <t-button
      :theme="theme"
      :variant="variant"
      :size="size"
      :disabled="disabled"
      :loading="loading"
      :aria-label="ariaLabel || label"
      @click="openPicker"
    >
      <template #icon>
        <slot name="icon">
          <UploadIcon />
        </slot>
      </template>
      <slot>{{ label }}</slot>
    </t-button>
  </span>
</template>

<style scoped>
.vt-file-picker {
  display: inline-flex;
  min-width: 0;
}

.vt-file-picker__input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
