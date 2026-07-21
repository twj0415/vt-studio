<script setup lang="ts">
import { computed } from 'vue';
import type { DialogProps } from 'tdesign-vue-next/es/dialog';

type VtDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'screen';
type VtDialogTone = 'default' | 'danger' | 'warning' | 'success';

const SIZE_WIDTH_MAP: Record<VtDialogSize, DialogProps['width']> = {
  sm: '520px',
  md: '720px',
  lg: '960px',
  xl: '1180px',
  screen: 'calc(100dvw - 24px)',
};

const props = withDefaults(defineProps<{
  visible: boolean;
  title?: string;
  description?: string;
  size?: VtDialogSize;
  tone?: VtDialogTone;
  width?: DialogProps['width'];
  top?: DialogProps['top'];
  dialogClassName?: DialogProps['dialogClassName'];
  dialogStyle?: DialogProps['dialogStyle'];
  bodyClassName?: string;
  contentClassName?: string;
  confirmText?: string;
  cancelText?: string;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  footer?: DialogProps['footer'];
  closeOnOverlayClick?: boolean;
  destroyOnClose?: boolean;
}>(), {
  title: '',
  description: '',
  size: 'md',
  tone: 'default',
  width: undefined,
  top: '5dvh',
  dialogClassName: '',
  bodyClassName: '',
  contentClassName: '',
  confirmText: '',
  cancelText: '',
  confirmLoading: false,
  confirmDisabled: false,
  cancelDisabled: false,
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

const mergedDialogClassName = computed(() => [
  'vt-dialog',
  `vt-dialog--size-${props.size}`,
  `vt-dialog--tone-${props.tone}`,
  props.dialogClassName,
].filter(Boolean).join(' '));
const mergedBodyClassName = computed(() => ['vt-dialog__body', props.bodyClassName].filter(Boolean).join(' '));
const mergedContentClassName = computed(() => ['vt-dialog__content', props.contentClassName].filter(Boolean).join(' '));
const mergedWidth = computed(() => props.width ?? SIZE_WIDTH_MAP[props.size]);
const mergedDialogStyle = computed<DialogProps['dialogStyle']>(() => ({
  maxHeight: 'calc(100dvh - 32px)',
  ...(typeof props.dialogStyle === 'object' && props.dialogStyle ? props.dialogStyle : {}),
}));
const confirmButton = computed<DialogProps['confirmBtn']>(() => {
  if (!props.confirmText) {
    return undefined;
  }

  return {
    content: props.confirmText,
    disabled: props.confirmDisabled,
  };
});
const cancelButton = computed<DialogProps['cancelBtn']>(() => {
  if (!props.cancelText) {
    return undefined;
  }

  return {
    content: props.cancelText,
    disabled: props.cancelDisabled,
  };
});

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
    :width="mergedWidth"
    :top="top"
    :dialog-class-name="mergedDialogClassName"
    :dialog-style="mergedDialogStyle"
    :confirm-btn="confirmButton"
    :cancel-btn="cancelButton"
    :confirm-loading="confirmLoading"
    :footer="footer"
    :close-on-overlay-click="closeOnOverlayClick"
    :destroy-on-close="destroyOnClose"
    @update:visible="(value: boolean) => emit('update:visible', value)"
    @confirm="emit('confirm')"
    @cancel="cancelDialog"
    @close="closeDialog"
  >
    <template v-if="$slots.header || description" #header>
      <slot name="header">
        <div class="vt-dialog__header-content">
          <strong v-if="title">{{ title }}</strong>
          <p v-if="description">{{ description }}</p>
        </div>
      </slot>
    </template>

    <div :class="mergedBodyClassName">
      <div :class="mergedContentClassName">
        <slot />
      </div>
    </div>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </t-dialog>
</template>
