export interface DevSettingsResult {
  enabled: boolean;
  isDev: boolean;
}

export interface DevSettingsSavePayload {
  enabled: boolean;
}

export interface DevSettingsSaveResult {
  enabled: boolean;
  isDev: boolean;
}

export interface DevSettingsOpenDevToolsResult {
  opened: boolean;
}
