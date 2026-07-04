export const COMFYUI_WORKFLOW_SCHEMA = 'vt.comfyui.workflow.v1' as const;

export interface ComfyUiNodeInputPointer {
  nodeId: string;
  input: string;
}

export interface ComfyUiReferenceImagePointer extends ComfyUiNodeInputPointer {
  index?: number;
}

export interface ComfyUiWorkflowNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ComfyUiWorkflowManifest {
  schema: typeof COMFYUI_WORKFLOW_SCHEMA;
  name?: string;
  description?: string;
  workflow: Record<string, ComfyUiWorkflowNode>;
  inputs: {
    prompt: ComfyUiNodeInputPointer;
    negativePrompt?: ComfyUiNodeInputPointer;
    seed?: ComfyUiNodeInputPointer;
    width?: ComfyUiNodeInputPointer;
    height?: ComfyUiNodeInputPointer;
    batchSize?: ComfyUiNodeInputPointer;
    referenceImages?: ComfyUiReferenceImagePointer[];
  };
  outputs: {
    images: Array<{
      nodeId: string;
    }>;
  };
  options?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  };
}

export interface ComfyUiWorkflowValidationResult {
  ok: boolean;
  reason: string;
  nodeCount: number;
  outputNodeIds: string[];
  referenceImageCount: number;
}
