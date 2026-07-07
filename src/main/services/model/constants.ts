export {
  MODEL_CAPABILITIES,
  MODEL_CAPABILITY_VALUES,
  MODEL_TYPES,
  MODEL_TYPE_VALUES,
} from '@shared/constants/dictionaries';

export const AGENT_USE_MODE = {
  SIMPLE: '0',
  ADVANCED: '1',
} as const;

export const MODEL_SETTING_KEYS = {
  agentUseMode: 'agentUseMode',
  switchAiDevTool: 'switchAiDevTool',
} as const;

export const MODEL_TEST_FILE_NAMES = {
  image: 'test-image.png',
  video: 'test-video.mp4',
  tts: 'test-audio.mp3',
} as const;

export const AGENT_MODEL_KEYS = [
  'scriptAgent',
  'productionAgent',
  'universalAi',
  'ttsDubbing',
  'scriptAgent:decisionAgent',
  'scriptAgent:supervisionAgent',
  'scriptAgent:storySkeletonAgent',
  'scriptAgent:adaptationStrategyAgent',
  'scriptAgent:scriptAgent',
  'productionAgent:decisionAgent',
  'productionAgent:supervisionAgent',
  'productionAgent:deriveAssetsAgent',
  'productionAgent:generateAssetsAgent',
  'productionAgent:directorPlanAgent',
  'productionAgent:storyboardGenAgent',
  'productionAgent:storyboardPanelAgent',
  'productionAgent:storyboardTableAgent',
] as const;

export type AgentModelKey = (typeof AGENT_MODEL_KEYS)[number];
export type { ModelType } from '@shared/constants/dictionaries';
