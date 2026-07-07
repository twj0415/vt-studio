<script setup lang="ts">
import VtDialog from '@renderer/components/VtDialog.vue';

defineProps<{
  visible: boolean;
  title: string;
  content: string;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
}>();
</script>

<template>
  <VtDialog :visible="visible" :title="title" width="760px" :footer="false" @update:visible="(value) => emit('update:visible', value)">
    <pre class="source-detail-content">{{ content }}</pre>
  </VtDialog>
</template>
