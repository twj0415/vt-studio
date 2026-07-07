export interface RequestDiagnosticsInfo {
  running: boolean;
  localServerUrl: string | null;
  port: number | null;
  source: 'electron-local';
  editable: boolean;
}

export interface SocketNamespaceDiagnosticsInfo {
  name: 'scriptAgent' | 'productionAgent';
  path: string;
  connectedCount: number;
}

export interface SocketDiagnosticsInfo {
  running: boolean;
  url: string | null;
  namespaces: SocketNamespaceDiagnosticsInfo[];
}

export interface MediaRouteDiagnosticsInfo {
  enabled: boolean;
  routePrefix: '/media/';
  supportsRange: boolean;
  supportsThumbnail: boolean;
  roots: string[];
}

export type LocalRequestDiagnosticKind = 'media' | 'local-http';
export type LocalRequestDiagnosticStatus = 'failed';

export interface LocalRequestDiagnosticItem {
  id: string;
  kind: LocalRequestDiagnosticKind;
  method: string;
  path: string;
  status: LocalRequestDiagnosticStatus;
  statusCode: number;
  reason: string;
  msg: string;
  startedAt: string;
  durationMs: number;
}

export type ModelRequestDiagnosticStatus = 'running' | 'retrying' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';

export interface ModelRequestDiagnosticError {
  name: string;
  message: string;
  statusCode?: number;
  msgKey?: string;
}

export type ModelRequestTraceData =
  | null
  | boolean
  | number
  | string
  | ModelRequestTraceData[]
  | { [key: string]: ModelRequestTraceData };

export interface ModelRequestTraceSection {
  title: string;
  data: ModelRequestTraceData;
  recordedAt: string;
}

export interface ModelRequestHttpTrace {
  id: string;
  url: string;
  method: string;
  status: number | null;
  ok: boolean | null;
  durationMs: number | null;
  requestHeaders?: Record<string, string>;
  requestBody?: ModelRequestTraceData;
  responseHeaders?: Record<string, string>;
  responseBody?: ModelRequestTraceData;
  error?: ModelRequestDiagnosticError | null;
  recordedAt: string;
}

export interface ModelRequestDiagnosticTrace {
  input: ModelRequestTraceSection | null;
  normalizedInput: ModelRequestTraceSection | null;
  output: ModelRequestTraceSection | null;
  http: ModelRequestHttpTrace[];
}

export interface ModelRequestDiagnosticItem {
  requestId: string;
  taskId: number | null;
  vendorId: string;
  protocolVendorId: string;
  vendorName: string;
  modelName: string;
  modelType: string;
  protocol: string;
  status: ModelRequestDiagnosticStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  attempt: number;
  maxAttempts: number;
  timeoutMs: number;
  retryCount: number;
  lastRetryAt: string | null;
  lastRetryWaitMs: number | null;
  error: ModelRequestDiagnosticError | null;
  trace: ModelRequestDiagnosticTrace | null;
}

export interface RequestDiagnosticsResult {
  info: RequestDiagnosticsInfo;
  socket: SocketDiagnosticsInfo;
  media: MediaRouteDiagnosticsInfo;
  localRequests: LocalRequestDiagnosticItem[];
  modelRequests: ModelRequestDiagnosticItem[];
}
