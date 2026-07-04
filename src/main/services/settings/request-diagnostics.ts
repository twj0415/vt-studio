import { getLocalServerInfo } from '../../app/server';
import type { RequestDiagnosticsResult } from '@shared/types/request-settings';
import { listLocalRequestDiagnostics } from '../local-request-diagnostics';
import { listMediaRoots } from '../media/path';
import { listModelRequestDiagnostics } from '../model/request-diagnostics';
import { getSocketDiagnostics } from '../socket';

function buildDiagnosticsResult(): RequestDiagnosticsResult {
  const localServerInfo = getLocalServerInfo();

  return {
    info: {
      running: Boolean(localServerInfo),
      localServerUrl: localServerInfo?.url ?? null,
      port: localServerInfo?.port ?? null,
      source: 'electron-local',
      editable: false,
    },
    socket: getSocketDiagnostics(),
    media: {
      enabled: Boolean(localServerInfo),
      routePrefix: '/media/',
      supportsRange: true,
      supportsThumbnail: true,
      roots: listMediaRoots(),
    },
    localRequests: listLocalRequestDiagnostics(),
    modelRequests: listModelRequestDiagnostics(),
  };
}

export function getRequestDiagnostics(): RequestDiagnosticsResult {
  return buildDiagnosticsResult();
}

export function refreshRequestDiagnostics(): RequestDiagnosticsResult {
  return buildDiagnosticsResult();
}
