export type VtResourceKind =
  | 'character'
  | 'scene'
  | 'prop'
  | 'storyboard'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'custom';

export type VtResourceStatus = 'idle' | 'running' | 'success' | 'warning' | 'error' | 'disabled';

export interface VtResourceReference {
  id: string | number;
  kind: VtResourceKind;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  status?: VtResourceStatus;
  statusLabel?: string;
  meta?: string;
  disabled?: boolean;
}

export function getVtResourceKey(resource: Pick<VtResourceReference, 'kind' | 'id'>): string {
  return `${resource.kind}:${String(resource.id)}`;
}
