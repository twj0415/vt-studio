<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { RefreshIcon } from 'tdesign-icons-vue-next';
import { useI18n } from 'vue-i18n';
import { useVtRequest } from '@renderer/composables/useVtRequest';
import type {
  LocalRequestDiagnosticItem,
  MediaRouteDiagnosticsInfo,
  ModelRequestDiagnosticError,
  ModelRequestHttpTrace,
  ModelRequestDiagnosticItem,
  ModelRequestDiagnosticTrace,
  ModelRequestDiagnosticStatus,
  ModelRequestTraceData,
  ModelRequestTraceSection,
  RequestDiagnosticsInfo,
  RequestDiagnosticsResult,
  SocketDiagnosticsInfo,
  SocketNamespaceDiagnosticsInfo,
} from '@shared/types/request-settings';

const loading = ref(false);
const diagnostics = ref<RequestDiagnosticsInfo | null>(null);
const socket = ref<SocketDiagnosticsInfo | null>(null);
const media = ref<MediaRouteDiagnosticsInfo | null>(null);
const localRequests = ref<LocalRequestDiagnosticItem[]>([]);
const modelRequests = shallowRef<ModelRequestDiagnosticItem[]>([]);
const traceVisible = ref(false);
const selectedModelRequest = shallowRef<ModelRequestDiagnosticItem | null>(null);
const traceTab = ref('input');
const { t } = useI18n();
const request = useVtRequest({ loading });

const MODEL_REQUEST_STATUS_VALUES: ModelRequestDiagnosticStatus[] = ['running', 'retrying', 'succeeded', 'failed', 'cancelled', 'timeout'];

const selectedTrace = computed(() => selectedModelRequest.value?.trace ?? null);
const selectedHttpTraces = computed(() => selectedTrace.value?.http ?? []);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asArray<TValue>(value: unknown): TValue[] {
  return Array.isArray(value) ? value as TValue[] : [];
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asString(item)]));
}

function normalizeTraceData(value: unknown): ModelRequestTraceData {
  try {
    const serialized = JSON.stringify(value ?? null);
    return serialized ? JSON.parse(serialized) as ModelRequestTraceData : null;
  } catch {
    return '[unserializable trace data]';
  }
}

function normalizeDiagnosticError(value: unknown): ModelRequestDiagnosticError | null {
  if (!isRecord(value)) {
    return null;
  }

  const error: ModelRequestDiagnosticError = {
    name: asString(value.name, 'Error'),
    message: asString(value.message, '-'),
  };
  const statusCode = asNullableNumber(value.statusCode);
  const msgKey = asNullableString(value.msgKey);
  if (statusCode !== null) {
    error.statusCode = statusCode;
  }
  if (msgKey) {
    error.msgKey = msgKey;
  }

  return error;
}

function normalizeTraceSection(value: unknown): ModelRequestTraceSection | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    title: asString(value.title, '-'),
    data: normalizeTraceData(value.data),
    recordedAt: asString(value.recordedAt),
  };
}

function normalizeHttpTrace(value: unknown, index: number): ModelRequestHttpTrace {
  const record = isRecord(value) ? value : {};
  const trace: ModelRequestHttpTrace = {
    id: asString(record.id, `http_${index}`),
    url: asString(record.url, '-'),
    method: asString(record.method, 'GET'),
    status: asNullableNumber(record.status),
    ok: asBooleanOrNull(record.ok),
    durationMs: asNullableNumber(record.durationMs),
    error: normalizeDiagnosticError(record.error),
    recordedAt: asString(record.recordedAt),
  };
  const requestHeaders = normalizeStringRecord(record.requestHeaders);
  const responseHeaders = normalizeStringRecord(record.responseHeaders);
  if (requestHeaders) {
    trace.requestHeaders = requestHeaders;
  }
  if ('requestBody' in record) {
    trace.requestBody = normalizeTraceData(record.requestBody);
  }
  if (responseHeaders) {
    trace.responseHeaders = responseHeaders;
  }
  if ('responseBody' in record) {
    trace.responseBody = normalizeTraceData(record.responseBody);
  }

  return trace;
}

function normalizeTrace(value: unknown): ModelRequestDiagnosticTrace | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    input: normalizeTraceSection(value.input),
    normalizedInput: normalizeTraceSection(value.normalizedInput),
    output: normalizeTraceSection(value.output),
    http: asArray<unknown>(value.http).map(normalizeHttpTrace),
  };
}

function normalizeStatus(value: unknown): ModelRequestDiagnosticStatus {
  const status = asString(value);
  return MODEL_REQUEST_STATUS_VALUES.includes(status as ModelRequestDiagnosticStatus) ? status as ModelRequestDiagnosticStatus : 'failed';
}

function normalizeModelRequest(value: unknown, index: number): ModelRequestDiagnosticItem {
  const record = isRecord(value) ? value : {};
  return {
    requestId: asString(record.requestId, `request_${index}`),
    taskId: asNullableNumber(record.taskId),
    vendorId: asString(record.vendorId),
    protocolVendorId: asString(record.protocolVendorId),
    vendorName: asString(record.vendorName, '-'),
    modelName: asString(record.modelName, '-'),
    modelType: asString(record.modelType, 'unknown'),
    protocol: asString(record.protocol, '-'),
    status: normalizeStatus(record.status),
    startedAt: asString(record.startedAt),
    finishedAt: asNullableString(record.finishedAt),
    durationMs: asNullableNumber(record.durationMs),
    attempt: asNumber(record.attempt),
    maxAttempts: Math.max(1, asNumber(record.maxAttempts, 1)),
    timeoutMs: asNumber(record.timeoutMs),
    retryCount: asNumber(record.retryCount),
    lastRetryAt: asNullableString(record.lastRetryAt),
    lastRetryWaitMs: asNullableNumber(record.lastRetryWaitMs),
    error: normalizeDiagnosticError(record.error),
    trace: normalizeTrace(record.trace),
  };
}

function normalizeLocalRequest(value: unknown, index: number): LocalRequestDiagnosticItem {
  const record = isRecord(value) ? value : {};
  return {
    id: asString(record.id, `local_${index}`),
    kind: record.kind === 'media' ? 'media' : 'local-http',
    method: asString(record.method, '-'),
    path: asString(record.path, '-'),
    status: 'failed',
    statusCode: asNumber(record.statusCode, 0),
    reason: asString(record.reason, '-'),
    msg: asString(record.msg, '-'),
    startedAt: asString(record.startedAt),
    durationMs: asNumber(record.durationMs, 0),
  };
}

function normalizeSocketNamespace(value: unknown, index: number): SocketNamespaceDiagnosticsInfo {
  const record = isRecord(value) ? value : {};
  return {
    name: record.name === 'productionAgent' ? 'productionAgent' : 'scriptAgent',
    path: asString(record.path, `/${index}`),
    connectedCount: asNumber(record.connectedCount, 0),
  };
}

function normalizeDiagnosticsData(data: RequestDiagnosticsResult): RequestDiagnosticsResult {
  return {
    info: {
      running: Boolean(data.info?.running),
      localServerUrl: asNullableString(data.info?.localServerUrl),
      port: asNullableNumber(data.info?.port),
      source: 'electron-local',
      editable: Boolean(data.info?.editable),
    },
    socket: {
      running: Boolean(data.socket?.running),
      url: asNullableString(data.socket?.url),
      namespaces: asArray<unknown>(data.socket?.namespaces).map(normalizeSocketNamespace),
    },
    media: {
      enabled: Boolean(data.media?.enabled),
      routePrefix: '/media/',
      supportsRange: Boolean(data.media?.supportsRange),
      supportsThumbnail: Boolean(data.media?.supportsThumbnail),
      roots: asArray<unknown>(data.media?.roots).map((item) => asString(item)).filter(Boolean),
    },
    localRequests: asArray<unknown>(data.localRequests).map(normalizeLocalRequest),
    modelRequests: asArray<unknown>(data.modelRequests).map(normalizeModelRequest),
  };
}

async function loadDiagnostics(refresh = false): Promise<void> {
  const data = await request.run(() => (refresh ? window.vtStudio.settings.request.refreshLocalUrl() : window.vtStudio.settings.request.get()), {
    showSuccess: refresh,
    successMessageKey: 'settings.requestDiagnostics.refreshSuccess',
  });

  if (!data) {
    return;
  }

  const normalizedData = normalizeDiagnosticsData(data);
  diagnostics.value = normalizedData.info;
  socket.value = normalizedData.socket;
  media.value = normalizedData.media;
  localRequests.value = normalizedData.localRequests;
  modelRequests.value = normalizedData.modelRequests;

  if (selectedModelRequest.value) {
    selectedModelRequest.value = modelRequests.value.find((item) => item.requestId === selectedModelRequest.value?.requestId) ?? selectedModelRequest.value;
  }
}

function formatBoolean(value: boolean | undefined): string {
  return value ? t('settings.requestDiagnostics.yes') : t('settings.requestDiagnostics.no');
}

function formatTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
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
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }

  if (value < 1000) {
    return t('settings.requestDiagnostics.durationMs', { value });
  }

  return t('settings.requestDiagnostics.durationSeconds', { value: (value / 1000).toFixed(1) });
}

function formatTraceJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return JSON.stringify({ error: t('settings.requestDiagnostics.traceFormatFailed') }, null, 2);
  }
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

function hasTraceSection(section: unknown): boolean {
  return Boolean(section);
}

function getTraceEmptyDescription(): string {
  return t('settings.requestDiagnostics.traceEmpty');
}

function getHttpStatusTheme(item: ModelRequestHttpTrace): 'primary' | 'success' | 'danger' | 'warning' | 'default' {
  if (item.status === null) {
    return item.error ? 'danger' : 'default';
  }

  if (item.status >= 200 && item.status < 300) {
    return 'success';
  }

  if (item.status >= 400) {
    return 'danger';
  }

  if (item.status >= 300) {
    return 'warning';
  }

  return 'primary';
}

function getHttpBodyPayload(item: ModelRequestHttpTrace, side: 'request' | 'response'): Record<string, unknown> {
  if (side === 'request') {
    return {
      headers: item.requestHeaders ?? null,
      body: item.requestBody ?? null,
    };
  }

  return {
    headers: item.responseHeaders ?? null,
    body: item.responseBody ?? null,
    error: item.error ?? null,
  };
}

function resolveInitialTraceTab(item: ModelRequestDiagnosticItem): string {
  if (item.trace?.normalizedInput) {
    return 'normalizedInput';
  }

  if (item.trace?.input) {
    return 'input';
  }

  if (item.trace?.output) {
    return 'output';
  }

  if (item.trace?.http?.length) {
    return 'http';
  }

  return 'error';
}

function openTrace(item: ModelRequestDiagnosticItem): void {
  selectedModelRequest.value = item;
  traceTab.value = resolveInitialTraceTab(item);
  traceVisible.value = true;
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
              <th>{{ t('settings.requestDiagnostics.table.action') }}</th>
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
              <td>
                <t-button size="small" variant="text" @click="openTrace(item)">
                  {{ t('settings.requestDiagnostics.openTrace') }}
                </t-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <t-empty v-else :description="t('settings.requestDiagnostics.emptyModelRequests')" />
    </div>

    <t-drawer v-model:visible="traceVisible" :header="t('settings.requestDiagnostics.traceTitle')" size="min(92vw, 920px)">
      <div v-if="selectedModelRequest" class="grid gap-3">
        <div class="grid gap-2 rounded-lg border border-line-soft bg-surface-panel p-3 md:grid-cols-2">
          <div class="min-w-0">
            <span class="block text-xs text-text-muted">{{ t('settings.requestDiagnostics.traceModel') }}</span>
            <b class="block truncate text-sm text-text-primary">{{ selectedModelRequest.vendorName }} / {{ selectedModelRequest.modelName }}</b>
          </div>
          <div class="min-w-0">
            <span class="block text-xs text-text-muted">{{ t('settings.requestDiagnostics.traceRequestId') }}</span>
            <b class="block truncate font-mono text-xs text-text-primary">{{ selectedModelRequest.requestId }}</b>
          </div>
          <div>
            <span class="block text-xs text-text-muted">{{ t('settings.requestDiagnostics.traceStatus') }}</span>
            <t-tag size="small" :theme="getStatusTheme(selectedModelRequest.status)" variant="light">
              {{ t(`settings.requestDiagnostics.status.${selectedModelRequest.status}`) }}
            </t-tag>
          </div>
          <div>
            <span class="block text-xs text-text-muted">{{ t('settings.requestDiagnostics.traceDuration') }}</span>
            <b class="block text-sm text-text-primary">{{ formatDuration(selectedModelRequest.durationMs) }}</b>
          </div>
        </div>

        <div class="rounded-lg border border-line-soft bg-surface-raised p-3 text-xs leading-relaxed text-text-secondary">
          {{ t('settings.requestDiagnostics.traceSafeHint') }}
        </div>

        <t-tabs v-model="traceTab">
          <t-tab-panel value="input" :label="t('settings.requestDiagnostics.traceInput')">
            <div class="pt-3">
              <div v-if="hasTraceSection(selectedTrace?.input)" class="grid gap-2">
                <div class="flex items-center justify-between gap-3 text-xs text-text-muted">
                  <span>{{ selectedTrace?.input?.title }}</span>
                  <span>{{ formatTime(selectedTrace?.input?.recordedAt ?? null) }}</span>
                </div>
                <pre class="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">{{ formatTraceJson(selectedTrace?.input?.data) }}</pre>
              </div>
              <t-empty v-else :description="getTraceEmptyDescription()" />
            </div>
          </t-tab-panel>

          <t-tab-panel value="normalizedInput" :label="t('settings.requestDiagnostics.traceNormalizedInput')">
            <div class="pt-3">
              <div v-if="hasTraceSection(selectedTrace?.normalizedInput)" class="grid gap-2">
                <div class="flex items-center justify-between gap-3 text-xs text-text-muted">
                  <span>{{ selectedTrace?.normalizedInput?.title }}</span>
                  <span>{{ formatTime(selectedTrace?.normalizedInput?.recordedAt ?? null) }}</span>
                </div>
                <pre class="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">{{ formatTraceJson(selectedTrace?.normalizedInput?.data) }}</pre>
              </div>
              <t-empty v-else :description="getTraceEmptyDescription()" />
            </div>
          </t-tab-panel>

          <t-tab-panel value="output" :label="t('settings.requestDiagnostics.traceOutput')">
            <div class="pt-3">
              <div v-if="hasTraceSection(selectedTrace?.output)" class="grid gap-2">
                <div class="flex items-center justify-between gap-3 text-xs text-text-muted">
                  <span>{{ selectedTrace?.output?.title }}</span>
                  <span>{{ formatTime(selectedTrace?.output?.recordedAt ?? null) }}</span>
                </div>
                <pre class="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">{{ formatTraceJson(selectedTrace?.output?.data) }}</pre>
              </div>
              <t-empty v-else :description="getTraceEmptyDescription()" />
            </div>
          </t-tab-panel>

          <t-tab-panel value="http" :label="t('settings.requestDiagnostics.traceHttp', { count: selectedHttpTraces.length })">
            <div class="grid gap-3 pt-3">
              <div v-for="item in selectedHttpTraces" :key="item.id" class="grid gap-3 rounded-lg border border-line-soft bg-surface-panel p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <t-tag size="small" variant="light">{{ item.method }}</t-tag>
                      <t-tag size="small" :theme="getHttpStatusTheme(item)" variant="light">
                        {{ item.status ?? t('settings.requestDiagnostics.httpNoStatus') }}
                      </t-tag>
                    </div>
                    <p class="mt-2 truncate font-mono text-xs text-text-primary">{{ item.url }}</p>
                  </div>
                  <div class="shrink-0 text-right text-xs text-text-muted">
                    <div>{{ formatDuration(item.durationMs) }}</div>
                    <div>{{ formatTime(item.recordedAt) }}</div>
                  </div>
                </div>

                <div class="grid gap-3 lg:grid-cols-2">
                  <div class="grid gap-2">
                    <span class="text-xs font-medium text-text-muted">{{ t('settings.requestDiagnostics.httpRequest') }}</span>
                    <pre class="m-0 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">{{ formatTraceJson(getHttpBodyPayload(item, 'request')) }}</pre>
                  </div>
                  <div class="grid gap-2">
                    <span class="text-xs font-medium text-text-muted">{{ t('settings.requestDiagnostics.httpResponse') }}</span>
                    <pre class="m-0 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">{{ formatTraceJson(getHttpBodyPayload(item, 'response')) }}</pre>
                  </div>
                </div>
              </div>
              <t-empty v-if="selectedHttpTraces.length === 0" :description="getTraceEmptyDescription()" />
            </div>
          </t-tab-panel>

          <t-tab-panel value="error" :label="t('settings.requestDiagnostics.traceError')">
            <div class="pt-3">
              <pre v-if="selectedModelRequest.error" class="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">{{ formatTraceJson(selectedModelRequest.error) }}</pre>
              <t-empty v-else :description="getTraceEmptyDescription()" />
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </t-drawer>
  </section>
</template>
