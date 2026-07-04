<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
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
import ModelPromptConfig from './components/ModelPromptConfig.vue';
import PromptConfig from './components/PromptConfig.vue';
import RequestDiagnostics from './components/RequestDiagnostics.vue';
import SkillManagement from './components/SkillManagement.vue';
import VendorConfig from './components/VendorConfig.vue';

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
const authStore = useAuthStore();
const { t } = useI18n();
const { appInfo } = storeToRefs(appStore);
const { user } = storeToRefs(authStore);
const developerVisible = ref(false);
const activeSectionId = ref('settings-model-service');
const agentConfigRef = ref<InstanceType<typeof AgentConfig> | null>(null);
const SECTION_IDS: Record<string, string> = {
  appearance: 'settings-appearance',
  language: 'settings-language',
  'model-service': 'settings-model-service',
  agent: 'settings-agent-config',
  prompt: 'settings-prompt',
  files: 'settings-files',
  business: 'settings-business',
  about: 'settings-about',
  developer: 'settings-developer',
  user: 'settings-user',
};
interface SettingsQuickLink {
  id: string;
  label: string;
}

interface SettingsQuickGroup {
  key: string;
  title: string;
  description: string;
  items: SettingsQuickLink[];
}

const settingsQuickGroups = computed<SettingsQuickGroup[]>(() => {
  const groups: SettingsQuickGroup[] = [
    {
      key: 'generation',
      title: t('settings.guide.generation.title'),
      description: t('settings.guide.generation.description'),
      items: [
        { id: SECTION_IDS['model-service'], label: t('settings.actions.modelService') },
        { id: SECTION_IDS.agent, label: t('settings.actions.agent') },
        { id: SECTION_IDS.prompt, label: t('settings.actions.prompt') },
      ],
    },
    {
      key: 'workspace',
      title: t('settings.guide.workspace.title'),
      description: t('settings.guide.workspace.description'),
      items: [
        { id: SECTION_IDS.files, label: t('settings.actions.files') },
        { id: SECTION_IDS.appearance, label: t('settings.actions.appearance') },
        { id: SECTION_IDS.language, label: t('settings.actions.language') },
        { id: SECTION_IDS.business, label: t('settings.actions.business') },
      ],
    },
    {
      key: 'account',
      title: t('settings.guide.account.title'),
      description: t('settings.guide.account.description'),
      items: [
        { id: SECTION_IDS.user, label: t('settings.user.title') },
        { id: SECTION_IDS.about, label: t('settings.actions.about') },
      ],
    },
  ];

  if (appInfo.value?.isDev) {
    groups.push({
      key: 'advanced',
      title: t('settings.guide.advanced.title'),
      description: t('settings.guide.advanced.description'),
      items: [{ id: SECTION_IDS.developer, label: t('settings.actions.developer') }],
    });
  }

  return groups;
});

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

async function handleSectionQuery(section: unknown): Promise<void> {
  if (typeof section !== 'string') {
    return;
  }

  await nextTick();
  const targetId = SECTION_IDS[section];
  const element = targetId ? document.getElementById(targetId) : null;
  if (targetId) {
    activeSectionId.value = targetId;
  }
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function scrollToSection(targetId: string): Promise<void> {
  await nextTick();
  activeSectionId.value = targetId;
  document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleModelServiceUpdated(): void {
  void agentConfigRef.value?.loadConfig();
}

watch(
  () => route.query.section,
  (section) => {
    void handleSectionQuery(section);
  },
  { immediate: true },
);

</script>

<template>
  <div class="settings-page">
    <div class="settings-layout">
      <aside class="settings-nav-panel" :aria-label="t('settings.quickNavLabel')">
        <div class="settings-nav-intro">
          <p class="eyebrow">{{ t('settings.guide.eyebrow') }}</p>
          <strong>{{ t('settings.guide.title') }}</strong>
          <span>{{ t('settings.guide.summary') }}</span>
        </div>

        <div v-for="group in settingsQuickGroups" :key="group.key" class="settings-nav-group">
          <div class="settings-nav-group-head">
            <strong>{{ group.title }}</strong>
            <span>{{ group.description }}</span>
          </div>
          <div class="settings-nav-links">
            <t-button v-for="item in group.items" :key="item.id" class="settings-nav-link" :class="{ 'is-active': activeSectionId === item.id }" variant="text" @click="scrollToSection(item.id)">
              {{ item.label }}
            </t-button>
          </div>
        </div>
      </aside>

      <div class="settings-content">
        <div id="settings-model-service" class="settings-anchor-section">
          <ModelServiceConfig @model-service-updated="handleModelServiceUpdated" />
        </div>

        <div id="settings-agent-config" class="settings-anchor-section">
          <AgentConfig ref="agentConfigRef" />
        </div>

        <div id="settings-prompt" class="settings-anchor-section">
          <PromptConfig />
        </div>

        <div id="settings-files" class="settings-anchor-section">
          <FileManagement />
        </div>

        <div id="settings-appearance" class="settings-anchor-section">
          <AppearanceConfig />
        </div>

        <div id="settings-language" class="settings-anchor-section">
          <LanguageConfig />
        </div>

        <div id="settings-business" class="settings-anchor-section">
          <BusinessConfig />
        </div>

        <div id="settings-about" class="settings-anchor-section">
          <AboutConfig />
        </div>

        <section v-if="appInfo?.isDev" id="settings-developer" class="settings-section developer-section">
          <div class="settings-section-head">
            <div>
              <p class="eyebrow">{{ t('settings.actions.developer') }}</p>
              <h3>{{ t('settings.developer.title') }}</h3>
            </div>
            <t-button variant="outline" @click="developerVisible = !developerVisible">
              {{ developerVisible ? t('settings.developer.collapse') : t('settings.developer.expand') }}
            </t-button>
          </div>
          <p class="settings-hint">{{ t('settings.developer.hint') }}</p>
          <template v-if="developerVisible">
            <DeveloperConfig />
            <MemoryConfig />
            <DatabaseManagement />
            <RequestDiagnostics />
            <SkillManagement />
            <ModelPromptConfig />
            <VendorConfig />
          </template>
        </section>

        <section id="settings-user" class="settings-section">
          <div>
            <p class="eyebrow">{{ t('settings.user.eyebrow') }}</p>
            <h3>{{ t('settings.user.title') }}</h3>
          </div>

          <t-form class="settings-form" :data="userForm" layout="vertical">
            <t-form-item :label="t('settings.user.username')">
              <t-input v-model="userForm.name" :placeholder="t('settings.user.usernamePlaceholder')" />
            </t-form-item>
            <t-form-item :label="t('settings.user.password')">
              <t-input v-model="userForm.password" type="password" :placeholder="t('settings.user.passwordPlaceholder')" @enter="saveLocalUser" />
            </t-form-item>
            <t-button theme="primary" :loading="authStore.loading" @click="saveLocalUser">{{ t('settings.user.save') }}</t-button>
          </t-form>
        </section>

        <section class="settings-section">
          <div>
            <p class="eyebrow">{{ t('settings.logout.eyebrow') }}</p>
            <h3>{{ t('settings.logout.title') }}</h3>
          </div>
          <div class="logout-row">
            <div>
              <strong>{{ user?.name ?? t('settings.logout.currentUserFallback') }}</strong>
              <p>{{ t('settings.logout.description') }}</p>
            </div>
            <t-button theme="danger" variant="outline" @click="confirmLogout">{{ t('settings.logout.button') }}</t-button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
