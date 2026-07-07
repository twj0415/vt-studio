<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { DownloadIcon, LinkIcon, RefreshIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAppStore } from '@renderer/stores/app';
import { useI18n } from 'vue-i18n';
import type { AboutCheckUpdateResult, AboutExternalLinkItem, AboutInfo, AboutUpdateSourceKey } from '@shared/types/about-settings';

const appStore = useAppStore();
const { t } = useI18n();
const loading = ref(false);
const checking = ref(false);
const downloading = ref(false);
const advancedVisible = ref(false);
const info = ref<AboutInfo | null>(null);
const selectedSource = ref<AboutUpdateSourceKey>('custom');
const customUrl = ref('');
const lastCheck = ref<AboutCheckUpdateResult | null>(null);

const sourceOptions = computed(() => info.value?.updateSources.filter((item) => item.key !== 'custom') ?? []);
const advancedSourceOptions = computed(() => info.value?.updateSources.filter((item) => item.key === 'custom') ?? []);
const externalLinks = computed<AboutExternalLinkItem[]>(() => info.value?.externalLinks ?? []);
const selectedSourceInfo = computed(() => [...sourceOptions.value, ...advancedSourceOptions.value].find((item) => item.key === selectedSource.value) ?? null);
const showCustomUrl = computed(() => selectedSource.value === 'custom');
const canDownload = computed(() => Boolean(lastCheck.value?.hasUpdate && lastCheck.value.downloadUrl));

function isOk(response: { code: number; msg: string }): boolean {
  return response.code === 200;
}

async function loadInfo(): Promise<void> {
  loading.value = true;
  try {
    const response = await window.vtStudio.settings.about.get();
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    info.value = response.data.info;
    const firstConfigured = response.data.info.updateSources.find((item) => item.configured && item.key !== 'custom');
    selectedSource.value = firstConfigured?.key ?? 'github';
  } finally {
    loading.value = false;
  }
}

async function checkUpdate(): Promise<void> {
  checking.value = true;
  try {
    const response = await window.vtStudio.settings.about.checkUpdate({
      source: selectedSource.value,
      url: customUrl.value,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    lastCheck.value = response.data;
    appStore.setNeedUpdate(response.data.hasUpdate);
    MessagePlugin.success(response.data.hasUpdate ? t('settings.about.updateAvailable') : t('settings.about.upToDate'));
  } finally {
    checking.value = false;
  }
}

async function downloadUpdate(): Promise<void> {
  if (!lastCheck.value?.downloadUrl || !lastCheck.value.latestVersion) {
    MessagePlugin.warning(t('settings.about.downloadMissing'));
    return;
  }

  downloading.value = true;
  try {
    const response = await window.vtStudio.settings.about.download({
      url: lastCheck.value.downloadUrl,
      version: lastCheck.value.latestVersion,
      reinstall: false,
    });
    if (!isOk(response)) {
      MessagePlugin.error(response.msg);
      return;
    }

    MessagePlugin.success(t('settings.about.downloaded', { path: response.data.filePath }));
  } finally {
    downloading.value = false;
  }
}

async function openLink(key: AboutExternalLinkItem['key']): Promise<void> {
  const response = await window.vtStudio.settings.about.openLink({ key });
  if (!isOk(response)) {
    MessagePlugin.error(response.msg);
    return;
  }

  MessagePlugin.success(t('settings.about.linkOpened'));
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

defineExpose({ loadInfo });
onMounted(loadInfo);
</script>

<template>
  <section class="about-config-section">
    <div class="settings-inline-toolbar">
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadInfo">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.about.refresh') }}
        </t-button>
      </div>
    </div>

    <div class="about-version-grid settings-row-list">
      <div class="settings-row">
        <span class="settings-row-title">{{ t('settings.about.appName') }}</span>
        <b class="settings-row-value">{{ info?.appName ?? '-' }}</b>
      </div>
      <div class="settings-row">
        <span class="settings-row-title">{{ t('settings.about.version') }}</span>
        <b class="settings-row-value">{{ info?.version ?? '-' }}</b>
      </div>
      <div class="settings-row">
        <span class="settings-row-title">{{ t('settings.about.platform') }}</span>
        <b class="settings-row-value">{{ info?.platform ?? '-' }}</b>
      </div>
      <div class="settings-row">
        <span class="settings-row-title">{{ t('settings.about.environment') }}</span>
        <b class="settings-row-value">{{ info?.isDev ? t('settings.about.devEnvironment') : t('settings.about.productionEnvironment') }}</b>
      </div>
    </div>

    <div class="settings-row-list">
      <div class="settings-row about-download-directory">
        <span class="settings-row-title">{{ t('settings.about.downloadDirectory') }}</span>
        <b class="settings-row-value">{{ info?.downloadDirectory ?? '-' }}</b>
      </div>
    </div>

    <div class="about-link-section">
      <div class="settings-list-title">{{ t('settings.about.linksTitle') }}</div>
      <div class="about-link-grid settings-row-list">
        <div v-for="link in externalLinks" :key="link.key" class="settings-row about-link-card">
          <div>
            <span class="settings-row-title">{{ link.label }}</span>
            <span class="settings-row-note">{{ link.configured ? t('settings.about.linkConfigured') : t('settings.about.linkMissing') }}</span>
          </div>
          <div class="settings-row-control">
            <t-button variant="outline" :disabled="!link.configured" @click="openLink(link.key)">
              <template #icon><LinkIcon /></template>
              {{ t('settings.about.openLink') }}
            </t-button>
          </div>
        </div>
      </div>
    </div>

    <div class="about-update-section">
      <div class="settings-list-title">{{ t('settings.about.updateTitle') }}</div>

      <div class="about-update-warning">
        {{ t('settings.about.updateWarning') }}
      </div>

      <t-form layout="vertical" class="about-update-form">
        <t-form-item :label="t('settings.about.updateSource')">
          <t-radio-group v-model="selectedSource" variant="default-filled">
            <t-radio-button v-for="source in sourceOptions" :key="source.key" :value="source.key">
              {{ source.label }}
            </t-radio-button>
          </t-radio-group>
        </t-form-item>

        <div class="about-source-status">
          <span>{{ t('settings.about.sourceStatus') }}</span>
          <b>
            {{
              selectedSourceInfo?.configured
                ? t('settings.about.sourceConfigured')
                : showCustomUrl
                  ? t('settings.about.sourceNeedsInput')
                  : t('settings.about.sourceMissing')
            }}
          </b>
        </div>

        <div class="about-advanced-panel">
          <t-button variant="outline" @click="advancedVisible = !advancedVisible">
            {{ advancedVisible ? t('settings.about.advancedCollapse') : t('settings.about.advancedExpand') }}
          </t-button>
          <div v-if="advancedVisible" class="about-advanced-body">
            <p>{{ t('settings.about.advancedHint') }}</p>
            <t-radio-group v-model="selectedSource" variant="default-filled">
              <t-radio-button v-for="source in advancedSourceOptions" :key="source.key" :value="source.key">
                {{ source.label }}
              </t-radio-button>
            </t-radio-group>

            <t-form-item v-if="showCustomUrl" :label="t('settings.about.customUrl')">
              <t-input v-model="customUrl" :placeholder="t('settings.about.customUrlPlaceholder')" />
            </t-form-item>
          </div>
        </div>
      </t-form>

      <div class="settings-actions">
        <t-button theme="primary" :loading="checking" @click="checkUpdate">{{ t('settings.about.checkUpdate') }}</t-button>
        <t-button variant="outline" :disabled="!canDownload" :loading="downloading" @click="downloadUpdate">
          <template #icon><DownloadIcon /></template>
          {{ t('settings.about.downloadUpdate') }}
        </t-button>
      </div>

      <div v-if="lastCheck" class="about-update-result">
        <div class="about-version-grid">
          <div>
            <span>{{ t('settings.about.currentVersion') }}</span>
            <b>{{ lastCheck.currentVersion }}</b>
          </div>
          <div>
            <span>{{ t('settings.about.latestVersion') }}</span>
            <b>{{ lastCheck.latestVersion ?? '-' }}</b>
          </div>
          <div>
            <span>{{ t('settings.about.checkedAt') }}</span>
            <b>{{ formatTime(lastCheck.checkedAt) }}</b>
          </div>
          <div>
            <span>{{ t('settings.about.updateResult') }}</span>
            <b>{{ lastCheck.hasUpdate ? t('settings.about.updateAvailable') : t('settings.about.upToDate') }}</b>
          </div>
        </div>

        <div v-if="lastCheck.releaseNotes" class="about-release-notes">
          <span>{{ t('settings.about.releaseNotes') }}</span>
          <pre>{{ lastCheck.releaseNotes }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>
