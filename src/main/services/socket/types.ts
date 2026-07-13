import type { Socket } from 'socket.io';
import type {
  AgentContentAddPayload,
  AgentContentUpdatePayload,
  AgentMessage,
  AgentMessageUpdatePayload,
  AgentSocketErrorPayload,
  AgentThinkConfigPayload,
  AgentWorkspaceSocketUpdate,
} from '@shared/types/socket';

export interface AgentSocketData {
  token: string;
  isolationKey: string;
  projectId: string;
  contentId?: string;
}

export interface ServerToClientEvents {
  message: (message: AgentMessage) => void;
  'message:update': (payload: AgentMessageUpdatePayload) => void;
  'content:add': (payload: AgentContentAddPayload) => void;
  'content:update': (payload: AgentContentUpdatePayload) => void;
  'workspace:update': (payload: AgentWorkspaceSocketUpdate) => void;
  error: (error: AgentSocketErrorPayload) => void;
  getPlanData: (data: unknown) => void;
}

export interface ClientToServerEvents {
  chat: (payload: unknown) => void;
  updateThinkConfig: (payload: unknown) => void;
  updateContext: (payload: unknown) => void;
  regenerate: (payload: unknown) => void;
  stop: () => void;
}

export type AgentSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, AgentSocketData>;

export interface AgentSessionState {
  abortController: AbortController | null;
  thinkConfig: Required<AgentThinkConfigPayload>;
  context?: unknown;
}
