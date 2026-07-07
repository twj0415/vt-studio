<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { useAppStore } from '@renderer/stores/app';
import { useAuthStore } from '@renderer/stores/auth';
import AgentConfig from './components/AgentConfig.vue';
import AppearanceConfig from './components/AppearanceConfig.vue';
import AboutConfig from './components/AboutConfig.vue';
import BusinessConfig from './components/BusinessConfig.vue';
import DeveloperConfig from './components/DeveloperConfig.vue';
import LanguageConfig from './components/LanguageConfig.vue';
import ModelServiceConfig from './components/ModelServiceConfig.vue';
import DatabaseManagement from './components/DatabaseManagement.vue';
import FileManagement from './components/FileManagement.vue';
import MemoryConfig from './components/MemoryConfig.vue';
import RequestDiagnostics from './components/RequestDiagnostics.vue';
import SettingsSectionErrorBoundary from './components/SettingsSectionErrorBoundary.vue';
import SettingsSectionCard from './components/SettingsSectionCard.vue';
import VendorConfig from './components/VendorConfig.vue';

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
const authStore = useAuthStore();
const { t } = useI18n();
const { appInfo } = storeToRefs(appStore);
const { user } = storeToRefs(authStore);
const agentConfigRef = ref<InstanceType<typeof AgentConfig> | null>(null);

type SettingsCategoryKey = 'basic' | 'account' | 'generation' | 'workspace' | 'creation' | 'about' | 'advanced';

interface SettingsQuickGroup {
  key: SettingsCategoryKey;
  title: string;
}

const activeCategoryKey = ref<SettingsCategoryKey>('basic');

const categoryBySection: Record<string, SettingsCategoryKey> = {
  basic: 'basic',
  appearance: 'basic',
  language: 'basic',
  user: 'account',
  account: 'account',
  about: 'about',
  update: 'about',
  version: 'about',
  generation: 'generation',
  'model-service': 'generation',
  agent: 'generation',
  workspace: 'workspace',
  files: 'workspace',
  creation: 'creation',
  business: 'creation',
  advanced: 'advanced',
  developer: 'advanced',
  memory: 'advanced',
  database: 'advanced',
  diagnostics: 'advanced',
  vendor: 'advanced',
};

const settingsQuickGroups = computed<SettingsQuickGroup[]>(() => {
  const groups: SettingsQuickGroup[] = [
    {
      key: 'basic',
      title: t('settings.guide.basic.title'),
    },
    {
      key: 'account',
      title: t('settings.guide.account.title'),
    },
    {
      key: 'generation',
      title: t('settings.guide.generation.title'),
    },
    {
      key: 'workspace',
      title: t('settings.guide.workspace.title'),
    },
    {
      key: 'creation',
      title: t('settings.guide.creation.title'),
    },
    {
      key: 'about',
      title: t('settings.guide.about.title'),
    },
  ];

  if (appInfo.value?.isDev) {
    groups.push({
      key: 'advanced',
      title: t('settings.guide.advanced.title'),
    });
  }

  return groups;
});

const activeCategory = computed(() => settingsQuickGroups.value.find((group) => group.key === activeCategoryKey.value) ?? settingsQuickGroups.value[0]);

const userForm = reactive({
  name: user.value?.name ?? '',
  password: '',
});

watch(
  user,
  (nextUser) => {
    userForm.name = nextUser?.name ?? '';
    userForm.password = '';
  },
  { immediate: true },
);

async function saveLocalUser(): Promise<void> {
  if (!userForm.name.trim() || !userForm.password.trim()) {
    MessagePlugin.warning(t('settings.user.emptyError'));
    return;
  }

  const ok = await authStore.updateLocalUser(userForm.name, userForm.password);
  if (!ok) {
    MessagePlugin.error(authStore.error ?? t('settings.user.saveFailed'));
    return;
  }

  userForm.password = '';
  MessagePlugin.success(t('settings.user.saveSuccess'));
}

function confirmLogout(): void {
  const dialog = DialogPlugin.confirm({
    header: t('settings.logout.dialogTitle'),
    body: t('settings.logout.dialogBody'),
    confirmBtn: t('settings.logout.confirm'),
    cancelBtn: t('settings.logout.cancel'),
    theme: 'warning',
    async onConfirm() {
      await authStore.logout();
      MessagePlugin.success(t('settings.logout.success'));
      dialog.destroy();
      await router.replace({ name: 'login' });
    },
  });
}

function handleSectionQuery(section: unknown): void {
  if (typeof section !== 'string') {
    return;
  }

  const targetCategory = categoryBySection[section];
  if (targetCategory) {
    selectCategory(targetCategory, false);
  }
}

function selectCategory(key: SettingsCategoryKey, syncQuery = true): void {
  if (!settingsQuickGroups.value.some((group) => group.key === key)) {
    return;
  }

  activeCategoryKey.value = key;

  if (syncQuery) {
    void router.replace({ query: { ...route.query, section: key } });
  }
}

function handleModelServiceUpdated(): void {
  void agentConfigRef.value?.loadConfig();
}

watch(
  () => route.query.section,
  (section) => {
    handleSectionQuery(section);
  },
  { immediate: true },
);

watch(
  settingsQuickGroups,
  (groups) => {
    if (!groups.some((group) => group.key === activeCategoryKey.value)) {
      activeCategoryKey.value = 'basic';
    }
  },
  { immediate: true },
);

</script>

<template>
  <div class="settings-page">
    <div class="settings-layout">
      <aside class="settings-nav-panel" :aria-label="t('settings.quickNavLabel')">
        <div class="settings-nav-group">
          <div class="settings-nav-links">
            <t-button v-for="group in settingsQuickGroups" :key="group.key" class="settings-nav-link" :class="{ 'is-active': activeCategoryKey === group.key }" variant="text" @click="selectCategory(group.key)">
              <span class="settings-nav-link-title">{{ group.title }}</span>
            </t-button>
          </div>
        </div>
      </aside>

      <div class="settings-content">
        <section v-if="activeCategory?.key === 'basic'" class="settings-category-section">
          <SettingsSectionCard id="settings-appearance" class="settings-list-section" :heading="t('appearance.title')">
            <AppearanceConfig />
          </SettingsSectionCard>

          <SettingsSectionCard id="settings-language" class="settings-list-section" :heading="t('language.title')">
            <LanguageConfig />
          </SettingsSectionCard>
        </section>

        <section v-if="activeCategory?.key === 'account'" class="settings-category-section">
          <SettingsSectionCard id="settings-user" class="settings-list-section" :heading="t('settings.user.title')">
            <section class="settings-account-panel settings-row-list">
              <t-form class="settings-form settings-row-form" :data="userForm" layout="vertical">
                <div class="settings-row">
                  <div>
                    <span class="settings-row-title">{{ t('settings.user.username') }}</span>
                  </div>
                  <div class="settings-row-control">
                    <t-input v-model="userForm.name" :placeholder="t('settings.user.usernamePlaceholder')" />
                  </div>
                </div>

                <div class="settings-row">
                  <div>
                    <span class="settings-row-title">{{ t('settings.user.password') }}</span>
                  </div>
                  <div class="settings-row-control settings-row-actions">
                    <t-input v-model="userForm.password" type="password" :placeholder="t('settings.user.passwordPlaceholder')" @enter="saveLocalUser" />
                    <t-button theme="primary" :loading="authStore.loading" @click="saveLocalUser">{{ t('settings.user.save') }}</t-button>
                  </div>
                </div>
              </t-form>

              <div class="settings-row settings-logout-row">
                <div>
                  <span class="settings-row-title">{{ user?.name ?? t('settings.logout.currentUserFallback') }}</span>
                  <span class="settings-row-note">{{ t('settings.logout.description') }}</span>
                </div>
                <div class="settings-row-control">
                  <t-button theme="danger" variant="outline" @click="confirmLogout">{{ t('settings.logout.button') }}</t-button>
                </div>
              </div>
            </section>
          </SettingsSectionCard>
        </section>

        <section v-if="activeCategory?.key === 'about'" class="settings-category-section">
          <SettingsSectionCard id="settings-about" class="settings-list-section" :heading="t('settings.about.title')">
            <AboutConfig />
          </SettingsSectionCard>
        </section>

        <section v-if="activeCategory?.key === 'generation'" class="settings-category-section">
          <SettingsSectionCard id="settings-model-service" class="settings-list-section" :heading="t('settings.modelService.title')">
            <ModelServiceConfig @model-service-updated="handleModelServiceUpdated" />
          </SettingsSectionCard>

          <SettingsSectionCard id="settings-agent-config" class="settings-list-section" :heading="t('settings.agentConfig.title')">
            <AgentConfig ref="agentConfigRef" />
          </SettingsSectionCard>
        </section>

        <section v-if="activeCategory?.key === 'workspace'" class="settings-category-section">
          <SettingsSectionCard id="settings-files" class="settings-list-section" :heading="t('files.title')">
            <FileManagement />
          </SettingsSectionCard>
        </section>

        <section v-if="activeCategory?.key === 'creation'" class="settings-category-section">
          <SettingsSectionCard id="settings-business" class="settings-list-section" :heading="t('settings.businessConfig.title')">
            <BusinessConfig />
          </SettingsSectionCard>
        </section>

        <section v-if="activeCategory?.key === 'advanced' && appInfo?.isDev" class="settings-category-section developer-section">
          <SettingsSectionCard id="settings-developer" class="settings-list-section" :heading="t('settings.devConfig.title')">
            <SettingsSectionErrorBoundary scope="settings-developer">
              <DeveloperConfig />
            </SettingsSectionErrorBoundary>
          </SettingsSectionCard>

          <SettingsSectionCard class="settings-list-section" :heading="t('settings.memoryConfig.title')">
            <SettingsSectionErrorBoundary scope="settings-memory">
              <MemoryConfig />
            </SettingsSectionErrorBoundary>
          </SettingsSectionCard>

          <SettingsSectionCard class="settings-list-section" :heading="t('settings.databaseManagement.title')">
            <SettingsSectionErrorBoundary scope="settings-database">
              <DatabaseManagement />
            </SettingsSectionErrorBoundary>
          </SettingsSectionCard>

          <SettingsSectionCard class="settings-list-section" :heading="t('settings.requestDiagnostics.title')">
            <SettingsSectionErrorBoundary scope="settings-request-diagnostics">
              <RequestDiagnostics />
            </SettingsSectionErrorBoundary>
          </SettingsSectionCard>

          <SettingsSectionCard class="settings-list-section" :heading="t('settings.vendorConfig.title')">
            <SettingsSectionErrorBoundary scope="settings-vendor">
              <VendorConfig />
            </SettingsSectionErrorBoundary>
          </SettingsSectionCard>
        </section>
      </div>
    </div>
  </div>
</template>
