import type { AssetTaskStatus } from '@shared/types/assets';
import type { ProductionImageFlowOwnerType, ProductionTaskStatus } from '@shared/types/production';

export type ProductionImageFlowEditableOwnerType = Exclude<ProductionImageFlowOwnerType, 'free'>;

export type ProductionImageFlowNodeKind = 'upload' | 'generated';

export type ProductionImageFlowSourceType = 'storyboard' | 'assets' | 'manual';

export interface ProductionImageFlowOwnerContext {
  ownerType: ProductionImageFlowEditableOwnerType;
  ownerId: number;
  flowId: string | null;
  title: string;
  imageUrl: string | null;
  prompt: string;
  status: ProductionTaskStatus | AssetTaskStatus;
}

export interface ProductionImageFlowSourceOption {
  label: string;
  value: number;
  imageUrl: string | null;
  prompt: string;
}

export interface ProductionImageFlowNodeData {
  kind: ProductionImageFlowNodeKind;
  label: string;
  source: ProductionImageFlowSourceType;
  sourceId: number | null;
  image: string | null;
  references: string[];
  prompt: string;
  model: string;
  ratio: string;
  quality: string;
  generatedImage: string | null;
}
