<script setup lang="ts">
import type { DialogProps } from 'tdesign-vue-next/es/dialog';

withDefaults(defineProps<{
  visible: boolean;
  title?: string;
  width?: DialogProps['width'];
  confirmText?: string;
  cancelText?: string;
  confirmLoading?: boolean;
  footer?: DialogProps['footer'];
  closeOnOverlayClick?: boolean;
  destroyOnClose?: boolean;
}>(), {
  title: '',
  width: '720px',
  confirmText: '',
  cancelText: '',
  confirmLoading: false,
  footer: true,
  closeOnOverlayClick: false,
  destroyOnClose: false,
});

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  confirm: [];
  cancel: [];
  close: [];
}>();

function closeDialog(): void {
  emit('update:visible', false);
  emit('close');
}

function cancelDialog(): void {
  emit('cancel');
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="title"
    :width="width"
    :confirm-btn="confirmText || undefined"
    :cancel-btn="cancelText || undefined"
    :confirm-loading="confirmLoading"
    :footer="footer"
    :close-on-overlay-click="closeOnOverlayClick"
    :destroy-on-close="destroyOnClose"
    @update:visible="(value: boolean) => emit('update:visible', value)"
    @confirm="emit('confirm')"
    @cancel="cancelDialog"
    @close="closeDialog"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </t-dialog>
</template>
