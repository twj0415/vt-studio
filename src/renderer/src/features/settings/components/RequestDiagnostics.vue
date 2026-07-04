<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RefreshIcon } from 'tdesign-icons-vue-next';
import { useI18n } from 'vue-i18n';
import { useVtRequest } from '@renderer/composables/useVtRequest';
import type {
  LocalRequestDiagnosticItem,
  MediaRouteDiagnosticsInfo,
  ModelRequestDiagnosticItem,
  ModelRequestDiagnosticStatus,
  RequestDiagnosticsInfo,
  SocketDiagnosticsInfo,
} from '@shared/types/request-settings';

const loading = ref(false);
const diagnostics = ref<RequestDiagnosticsInfo | null>(null);
const socket = ref<SocketDiagnosticsInfo | null>(null);
const media = ref<MediaRouteDiagnosticsInfo | null>(null);
const localRequests = ref<LocalRequestDiagnosticItem[]>([]);
const modelRequests = ref<ModelRequestDiagnosticItem[]>([]);
const { t } = useI18n();
const request = useVtRequest({ loading });

async function loadDiagnostics(refresh = false): Promise<void> {
  const data = await request.run(() => (refresh ? window.vtStudio.settings.request.refreshLocalUrl() : window.vtStudio.settings.request.get()), {
    showSuccess: refresh,
    successMessageKey: 'settings.requestDiagnostics.refreshSuccess',
  });

  if (!data) {
    return;
  }

  diagnostics.value = data.info;
  socket.value = data.socket;
  media.value = data.media;
  localRequests.value = data.localRequests;
  modelRequests.value = data.modelRequests;
}

function formatBoolean(value: boolean | undefined): string {
  return value ? t('settings.requestDiagnostics.yes') : t('settings.requestDiagnostics.no');
}

function formatTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatNamespaces(): string {
  if (!socket.value?.namespaces.length) {
    return '-';
  }

  return socket.value.namespaces.map((item) => `${item.name}:${item.connectedCount}`).join(' / ');
}

function formatMediaRoots(): string {
  return media.value?.roots.length ? media.value.roots.join(' / ') : '-';
}

function getLocalRequestKindLabel(kind: LocalRequestDiagnosticItem['kind']): string {
  return t(`settings.requestDiagnostics.localKind.${kind}`);
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return '-';
  }

  if (value < 1000) {
    return t('settings.requestDiagnostics.durationMs', { value });
  }

  return t('settings.requestDiagnostics.durationSeconds', { value: (value / 1000).toFixed(1) });
}

function formatAttempts(item: ModelRequestDiagnosticItem): string {
  return `${item.attempt || 1}/${item.maxAttempts}`;
}

function getStatusTheme(status: ModelRequestDiagnosticStatus): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (status === 'running' || status === 'retrying') {
    return 'primary';
  }

  if (status === 'succeeded') {
    return 'success';
  }

  if (status === 'cancelled') {
    return 'warning';
  }

  if (status === 'failed' || status === 'timeout') {
    return 'danger';
  }

  return 'default';
}

function getModelTypeLabel(type: string): string {
  if (['text', 'image', 'video', 'tts'].includes(type)) {
    return t(`settings.requestDiagnostics.modelType.${type}`);
  }

  return t('settings.requestDiagnostics.modelType.unknown', { type });
}

defineExpose({ loadDiagnostics });
onMounted(() => loadDiagnostics(false));
</script>

<template>
  <section class="request-diagnostics-section">
    <div class="request-diagnostics-head">
      <div>
        <strong>{{ t('settings.requestDiagnostics.title') }}</strong>
        <p>{{ t('settings.requestDiagnostics.hint') }}</p>
      </div>
      <div class="settings-actions">
        <t-button variant="outline" :loading="loading" @click="loadDiagnostics(true)">
          <template #icon><RefreshIcon /></template>
          {{ t('settings.requestDiagnostics.refresh') }}
        </t-button>
      </div>
    </div>

    <div class="request-diagnostics-warning">
      {{ t('settings.requestDiagnostics.warning') }}
    </div>

    <div class="request-diagnostics-grid">
      <div>
        <span>{{ t('settings.requestDiagnostics.serverStatus') }}</span>
        <b>{{ diagnostics?.running ? t('settings.requestDiagnostics.running') : t('settings.requestDiagnostics.stopped') }}</b>
      </div>
      <div>
        <span>{{ t('settings.requestDiagnostics.source') }}</span>
        <b>{{ diagnostics?.source ?? '-' }}</b>
      </div>
      <div>
        <span>{{ t('settings.requestDiagnostics.port') }}</span>
        <b>{{ diagnostics?.port ?? '-' }}</b>
      </div>
      <div>
        <span>{{ t('settings.requestDiagnostics.editable') }}</span>
        <b>{{ diagnostics?.editable ? t('settings.requestDiagnostics.yes') : t('settings.requestDiagnostics.no') }}</b>
      </div>
    </div>

    <div class="request-diagnostics-url">
      <span>{{ t('settings.requestDiagnostics.currentUrl') }}</span>
      <b>{{ diagnostics?.localServerUrl ?? '-' }}</b>
    </div>

    <div class="request-diagnostics-runtime-grid">
      <div>
        <span>{{ t('settings.requestDiagnostics.socketStatus') }}</span>
        <b>{{ socket?.running ? t('settings.requestDiagnostics.running') : t('settings.requestDiagnostics.stopped') }}</b>
        <small>{{ formatNamespaces() }}</small>
      </div>
      <div>
        <span>{{ t('settings.requestDiagnostics.socketUrl') }}</span>
        <b>{{ socket?.url ?? '-' }}</b>
        <small>{{ t('settings.requestDiagnostics.socketTokenHidden') }}</small>
      </div>
      <div>
        <span>{{ t('settings.requestDiagnostics.mediaRoute') }}</span>
        <b>{{ media?.routePrefix ?? '-' }}</b>
        <small>{{ t('settings.requestDiagnostics.mediaRoots', { roots: formatMediaRoots() }) }}</small>
      </div>
      <div>
        <span>{{ t('settings.requestDiagnostics.mediaAbility') }}</span>
        <b>{{ t('settings.requestDiagnostics.rangeAndThumbnail', { range: formatBoolean(media?.supportsRange), thumbnail: formatBoolean(media?.supportsThumbnail) }) }}</b>
        <small>{{ media?.enabled ? t('settings.requestDiagnostics.enabled') : t('settings.requestDiagnostics.disabled') }}</small>
      </div>
    </div>

    <div class="request-diagnostics-models">
      <div class="request-diagnostics-models-head">
        <div>
          <strong>{{ t('settings.requestDiagnostics.localFailuresTitle') }}</strong>
          <p>{{ t('settings.requestDiagnostics.localFailuresHint') }}</p>
        </div>
        <t-tag variant="light">{{ t('settings.requestDiagnostics.localFailuresCount', { count: localRequests.length }) }}</t-tag>
      </div>

      <div v-if="localRequests.length > 0" class="request-diagnostics-table-wrap">
        <table class="request-diagnostics-table">
          <thead>
            <tr>
              <th>{{ t('settings.requestDiagnostics.localTable.time') }}</th>
              <th>{{ t('settings.requestDiagnostics.localTable.kind') }}</th>
              <th>{{ t('settings.requestDiagnostics.localTable.method') }}</th>
              <th>{{ t('settings.requestDiagnostics.localTable.path') }}</th>
              <th>{{ t('settings.requestDiagnostics.localTable.status') }}</th>
              <th>{{ t('settings.requestDiagnostics.localTable.duration') }}</th>
              <th>{{ t('settings.requestDiagnostics.localTable.reason') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in localRequests" :key="item.id">
              <td>{{ formatTime(item.startedAt) }}</td>
              <td>{{ getLocalRequestKindLabel(item.kind) }}</td>
              <td>{{ item.method }}</td>
              <td class="request-diagnostics-error">
                <t-tooltip :content="item.path">
                  <span>{{ item.path }}</span>
                </t-tooltip>
              </td>
              <td>
                <t-tag size="small" theme="danger" variant="light">{{ item.statusCode }}</t-tag>
              </td>
              <td>{{ formatDuration(item.durationMs) }}</td>
              <td class="request-diagnostics-error">
                <t-tooltip :content="item.msg">
                  <span>{{ item.msg }}</span>
                </t-tooltip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <t-empty v-else :description="t('settings.requestDiagnostics.emptyLocalFailures')" />
    </div>

    <div class="request-diagnostics-models">
      <div class="request-diagnostics-models-head">
        <div>
          <strong>{{ t('settings.requestDiagnostics.modelRequestsTitle') }}</strong>
          <p>{{ t('settings.requestDiagnostics.modelRequestsHint') }}</p>
        </div>
        <t-tag variant="light">{{ t('settings.requestDiagnostics.modelRequestsCount', { count: modelRequests.length }) }}</t-tag>
      </div>

      <div v-if="modelRequests.length > 0" class="request-diagnostics-table-wrap">
        <table class="request-diagnostics-table">
          <thead>
            <tr>
              <th>{{ t('settings.requestDiagnostics.table.time') }}</th>
              <th>{{ t('settings.requestDiagnostics.table.model') }}</th>
              <th>{{ t('settings.requestDiagnostics.table.type') }}</th>
              <th>{{ t('settings.requestDiagnostics.table.protocol') }}</th>
              <th>{{ t('settings.requestDiagnostics.table.status') }}</th>
              <th>{{ t('settings.requestDiagnostics.table.attempts') }}</th>
              <th>{{ t('settings.requestDiagnostics.table.duration') }}</th>
              <th>{{ t('settings.requestDiagnostics.table.task') }}</th>
              <th>{{ t('settings.requestDiagnostics.table.error') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in modelRequests" :key="item.requestId">
              <td>{{ formatTime(item.startedAt) }}</td>
              <td>
                <b>{{ item.modelName }}</b>
                <small>{{ item.vendorName }} / {{ item.requestId }}</small>
              </td>
              <td>{{ getModelTypeLabel(item.modelType) }}</td>
              <td>{{ item.protocol }}</td>
              <td>
                <t-tag size="small" :theme="getStatusTheme(item.status)" variant="light">
                  {{ t(`settings.requestDiagnostics.status.${item.status}`) }}
                </t-tag>
              </td>
              <td>{{ formatAttempts(item) }}</td>
              <td>{{ formatDuration(item.durationMs) }}</td>
              <td>{{ item.taskId ?? '-' }}</td>
              <td class="request-diagnostics-error">
                <t-tooltip :content="item.error?.message ?? '-'">
                  <span>{{ item.error?.message ?? '-' }}</span>
                </t-tooltip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <t-empty v-else :description="t('settings.requestDiagnostics.emptyModelRequests')" />
    </div>
  </section>
</template>
