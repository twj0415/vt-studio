import type { Edge, Node } from '@vue-flow/core';
import { MarkerType, Position } from '@vue-flow/core';
import { PRODUCTION_NODE_TYPES, type ProductionFlowData, type ProductionFlowPosition, type ProductionFlowPositions, type ProductionNodeType } from '@shared/types/production';

export interface ProductionCanvasNodeData {
  nodeType: ProductionNodeType;
  handleIds: {
    target?: string;
    source?: string;
    assets?: string;
  };
}

export type ProductionCanvasNode = Node<ProductionCanvasNodeData>;
export type ProductionCanvasEdge = Edge;

const DEFAULT_POSITIONS: Record<ProductionNodeType, ProductionFlowPosition> = {
  script: { x: 0, y: 0 },
  scriptPlan: { x: 380, y: 0 },
  assets: { x: 0, y: 360 },
  storyboardTable: { x: 760, y: 0 },
  storyboard: { x: 1140, y: 0 },
  workbench: { x: 1520, y: 0 },
};

const EDGE_STYLE = {
  stroke: '#2f6f63',
  strokeWidth: 2.5,
};

export function createDefaultProductionPositions(): ProductionFlowPositions {
  return { ...DEFAULT_POSITIONS };
}

export function mergeProductionPositions(positions: ProductionFlowPositions | null | undefined): ProductionFlowPositions {
  return PRODUCTION_NODE_TYPES.reduce<ProductionFlowPositions>((merged, nodeType) => {
    const stored = positions?.[nodeType];
    merged[nodeType] = stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? stored : DEFAULT_POSITIONS[nodeType];
    return merged;
  }, {});
}

export function buildProductionNodes(flowData: ProductionFlowData | null, positions: ProductionFlowPositions): ProductionCanvasNode[] {
  if (!flowData) {
    return [];
  }

  return PRODUCTION_NODE_TYPES.map((nodeType) => ({
    id: nodeType,
    type: 'productionNode',
    dragHandle: '.production-node-drag-handle',
    position: positions[nodeType] ?? DEFAULT_POSITIONS[nodeType],
    sourcePosition: nodeType === 'assets' ? Position.Bottom : Position.Right,
    targetPosition: nodeType === 'script' ? Position.Left : Position.Left,
    data: {
      nodeType,
      handleIds: createHandleIds(nodeType),
    },
  }));
}

export function buildProductionEdges(flowData: ProductionFlowData | null): ProductionCanvasEdge[] {
  if (!flowData) {
    return [];
  }

  return [
    createEdge('script-assets', 'script', 'assets', 'script-assets', 'assets-target'),
    createEdge('script-scriptPlan', 'script', 'scriptPlan', 'script-source', 'scriptPlan-target'),
    createEdge('scriptPlan-storyboardTable', 'scriptPlan', 'storyboardTable', 'scriptPlan-source', 'storyboardTable-target'),
    createEdge('storyboardTable-storyboard', 'storyboardTable', 'storyboard', 'storyboardTable-source', 'storyboard-target'),
    createEdge('storyboard-workbench', 'storyboard', 'workbench', 'storyboard-source', 'workbench-target'),
  ];
}

export function collectProductionPositions(nodes: Array<{ id: string; position: ProductionFlowPosition }>): ProductionFlowPositions {
  return nodes.reduce<ProductionFlowPositions>((next, node) => {
    if (isProductionNodeType(node.id)) {
      next[node.id] = {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      };
    }
    return next;
  }, {});
}

export function layoutProductionPositions(nodes: Array<{ id: string; dimensions?: { width?: number; height?: number } }>): ProductionFlowPositions {
  const measured = new Map(nodes.map((node) => [node.id, node.dimensions ?? {}]));
  const gap = 84;
  const positions: ProductionFlowPositions = {};
  const mainChain: ProductionNodeType[] = ['script', 'scriptPlan', 'storyboardTable', 'storyboard', 'workbench'];
  let x = 0;

  for (const nodeType of mainChain) {
    positions[nodeType] = { x, y: 0 };
    const width = measured.get(nodeType)?.width ?? 300;
    x += width + gap;
  }

  const scriptHeight = measured.get('script')?.height ?? 260;
  positions.assets = {
    x: 0,
    y: scriptHeight + gap,
  };

  return mergeProductionPositions(positions);
}

function createEdge(id: string, source: ProductionNodeType, target: ProductionNodeType, sourceHandle: string, targetHandle: string): ProductionCanvasEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
    style: EDGE_STYLE,
  };
}

function createHandleIds(nodeType: ProductionNodeType): ProductionCanvasNodeData['handleIds'] {
  if (nodeType === 'script') {
    return {
      source: 'script-source',
      assets: 'script-assets',
    };
  }
  if (nodeType === 'assets' || nodeType === 'workbench') {
    return {
      target: `${nodeType}-target`,
    };
  }
  return {
    target: `${nodeType}-target`,
    source: `${nodeType}-source`,
  };
}

function isProductionNodeType(value: string): value is ProductionNodeType {
  return (PRODUCTION_NODE_TYPES as readonly string[]).includes(value);
}
