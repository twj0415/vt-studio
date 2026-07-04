export type ExternalLinkKey = 'feedback' | 'github';

export interface ExternalLinkInfo {
  key: ExternalLinkKey;
  label: string;
  configured: boolean;
}

export interface ExternalLinkListResult {
  links: ExternalLinkInfo[];
}

export interface ExternalLinkOpenPayload {
  key: ExternalLinkKey;
}

export interface ExternalLinkOpenResult {
  key: ExternalLinkKey;
  url: string;
}

export interface WindowState {
  isMaximized: boolean;
  isMinimized: boolean;
}

export interface WindowStateResult {
  state: WindowState;
}
