<script setup lang="ts">
import { computed } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { useLanguageStore } from '@renderer/stores/language';
import type { AppLocale } from '@renderer/i18n';

const languageStore = useLanguageStore();
const { t } = useI18n();

const options = computed(() =>
  languageStore.languageOptions.map((option) => ({
    ...option,
    label: t(option.labelKey),
    tips: t(option.tipsKey),
  })),
);

const currentOption = computed(() => options.value.find((option) => option.value === languageStore.locale) ?? options.value[0]);

function switchLocale(locale: string | number): void {
  if (!languageStore.languageOptions.some((option) => option.value === locale)) {
    return;
  }

  if (languageStore.locale === locale) {
    return;
  }

  languageStore.setLocale(locale as AppLocale);
  MessagePlugin.success(t('language.saved'));
}
</script>

<template>
  <section class="language-section settings-row-list">
    <div class="settings-row">
      <div>
        <span class="settings-row-title">{{ t('language.title') }}</span>
        <span class="settings-row-note">{{ currentOption?.label }}</span>
      </div>
      <div class="settings-row-control">
        <t-radio-group class="language-segmented" :model-value="languageStore.locale" variant="default-filled" @update:model-value="switchLocale">
          <t-radio-button
            v-for="option in options"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </t-radio-button>
        </t-radio-group>
      </div>
    </div>
  </section>
</template>
