<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { RollbackIcon } from 'tdesign-icons-vue-next';
import { useI18n } from 'vue-i18n';
import { useAppearanceStore } from '@renderer/stores/appearance';
import {
  APPEARANCE_PRESETS,
  type AppearanceFontSize,
  type AppearanceMode,
} from '../appearance/theme';

const appearanceStore = useAppearanceStore();
const { t } = useI18n();
const { mode, themePresetId, fontSize } = storeToRefs(appearanceStore);

const modeOptions: Array<{ value: AppearanceMode; label: string }> = [
  { value: 'auto', label: 'appearance.modeAuto' },
  { value: 'light', label: 'appearance.modeLight' },
  { value: 'dark', label: 'appearance.modeDark' },
];

const fontSizeOptions: AppearanceFontSize[] = [12, 13, 14, 16, 18, 20, 22];
const resolvedModeText = computed(() => (appearanceStore.resolvedMode === 'dark' ? t('appearance.modeResolvedDark') : t('appearance.modeResolvedLight')));
const activePreset = computed(() => APPEARANCE_PRESETS.find((preset) => preset.id === themePresetId.value) ?? APPEARANCE_PRESETS[0]);

function updateMode(nextMode: string | number): void {
  if (nextMode !== 'auto' && nextMode !== 'light' && nextMode !== 'dark') {
    return;
  }
  appearanceStore.setMode(nextMode);
}

function updatePreset(nextPresetId: string | number): void {
  const preset = APPEARANCE_PRESETS.find((item) => item.id === nextPresetId);
  if (!preset) {
    return;
  }

  appearanceStore.setThemePresetId(preset.id);
}

function updateFontSize(nextFontSize: string | number): void {
  if (!fontSizeOptions.includes(Number(nextFontSize) as AppearanceFontSize)) {
    return;
  }

  appearanceStore.setFontSize(Number(nextFontSize) as AppearanceFontSize);
}
</script>

<template>
  <section class="appearance-section settings-row-list">
      <div class="settings-row appearance-setting-row">
        <div>
          <span class="settings-row-title">{{ t('appearance.modeLabel') }}</span>
          <span class="settings-row-note">{{ resolvedModeText }}</span>
        </div>
        <div class="settings-row-control">
          <t-radio-group :model-value="mode" variant="default-filled" @update:model-value="updateMode">
            <t-radio-button v-for="option in modeOptions" :key="option.value" :value="option.value">{{ t(option.label) }}</t-radio-button>
          </t-radio-group>
        </div>
      </div>

      <div class="settings-row appearance-setting-row">
        <div>
          <span class="settings-row-title">{{ t('appearance.presetLabel') }}</span>
          <span class="settings-row-note">{{ t(`appearance.presets.${activePreset.id}.name`) }}</span>
        </div>
        <div class="settings-row-control appearance-theme-control">
          <t-radio-group :model-value="themePresetId" variant="default-filled" @update:model-value="updatePreset">
            <t-radio-button v-for="preset in APPEARANCE_PRESETS" :key="preset.id" :value="preset.id">{{ t(`appearance.presets.${preset.id}.name`) }}</t-radio-button>
          </t-radio-group>
          <div class="appearance-theme-swatches" aria-hidden="true">
            <span v-for="color in activePreset.preview" :key="color" :style="{ background: color }" />
          </div>
        </div>
      </div>

      <div class="settings-row appearance-setting-row">
        <div>
          <span class="settings-row-title">{{ t('appearance.fontSizeLabel') }}</span>
          <span class="settings-row-note">{{ fontSize }}</span>
        </div>
        <div class="settings-row-control">
          <t-radio-group :model-value="fontSize" variant="default-filled" @update:model-value="updateFontSize">
            <t-radio-button v-for="size in fontSizeOptions" :key="size" :value="size">{{ size }}</t-radio-button>
          </t-radio-group>
        </div>
      </div>

      <div class="settings-row appearance-setting-row">
        <div>
          <span class="settings-row-title">{{ t('appearance.restore') }}</span>
        </div>
        <div class="settings-row-control">
          <t-tooltip :content="t('appearance.restore')">
            <t-button shape="square" variant="outline" theme="warning" :aria-label="t('appearance.restore')" @click="appearanceStore.restoreDefault()">
              <RollbackIcon />
            </t-button>
          </t-tooltip>
        </div>
      </div>
  </section>
</template>
