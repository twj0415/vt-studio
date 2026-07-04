<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t, locale } = useI18n();
const visible = ref(window.localStorage.getItem('vtStudio.welcomeGuideDone') !== '1');
const step = ref(0);

const title = computed(() => {
  if (step.value === 0) {
    return t('welcome.title');
  }
  if (step.value === 1) {
    return t('welcome.modelTitle');
  }

  return t('welcome.agentTitle');
});

const description = computed(() => {
  if (step.value === 0) {
    return t('welcome.description');
  }
  if (step.value === 1) {
    return t('welcome.modelDescription');
  }

  return t('welcome.agentDescription');
});

function finishGuide(): void {
  window.localStorage.setItem('vtStudio.welcomeGuideDone', '1');
  visible.value = false;
}

function openSettingsSection(section: 'model-service' | 'agent'): void {
  router.push({
    name: 'settings',
    query: { section },
  });
}

function nextStep(): void {
  step.value = Math.min(step.value + 1, 2);
}

function prevStep(): void {
  step.value = Math.max(step.value - 1, 0);
}
</script>

<template>
  <t-dialog v-model:visible="visible" :header="title" width="720px" :footer="false" close-on-overlay-click="false">
    <div class="welcome-guide">
      <div class="welcome-guide-content">
        <p>{{ description }}</p>
        <t-radio-group v-if="step === 0" v-model="locale" variant="default-filled" class="welcome-guide-language">
          <t-radio-button value="zh-CN">{{ t('language.options.zh-CN.label') }}</t-radio-button>
          <t-radio-button value="en">{{ t('language.options.en.label') }}</t-radio-button>
        </t-radio-group>
      </div>

      <div class="welcome-guide-actions">
        <t-button variant="text" @click="finishGuide">{{ t('welcome.skip') }}</t-button>
        <div class="welcome-guide-actions-right">
          <t-button v-if="step > 0" variant="outline" @click="prevStep">{{ t('welcome.back') }}</t-button>
          <t-button v-if="step === 0" theme="primary" @click="nextStep">{{ t('welcome.start') }}</t-button>
          <t-button v-else-if="step === 1" theme="primary" @click="openSettingsSection('model-service')">{{ t('welcome.openModelService') }}</t-button>
          <t-button v-else theme="primary" @click="openSettingsSection('agent')">{{ t('welcome.openAgentConfig') }}</t-button>
          <t-button v-if="step < 2" variant="outline" @click="nextStep">{{ t('welcome.next') }}</t-button>
          <t-button v-if="step === 2" variant="outline" @click="finishGuide">{{ t('welcome.finish') }}</t-button>
        </div>
      </div>
    </div>
  </t-dialog>
</template>
