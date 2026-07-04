import type Database from 'better-sqlite3';
import { insertIfMissing } from './seed-helpers';

interface AgentConfigRow {
  key: string;
  name: string;
  description: string | null;
  temperature: number | null;
  maxOutputTokens: number | null;
  disabled: boolean;
}

const AGENT_CONFIGS: AgentConfigRow[] = [
  { key: 'scriptAgent', name: '剧本Agent', description: null, temperature: null, maxOutputTokens: null, disabled: false },
  { key: 'productionAgent', name: '生产Agent', description: null, temperature: null, maxOutputTokens: null, disabled: false },
  { key: 'universalAi', name: '通用AI', description: null, temperature: null, maxOutputTokens: null, disabled: false },
  { key: 'ttsDubbing', name: 'TTS配音', description: null, temperature: null, maxOutputTokens: null, disabled: true },
  { key: 'scriptAgent:decisionAgent', name: '剧本Agent:决策层', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'scriptAgent:supervisionAgent', name: '剧本Agent:监督层', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'scriptAgent:storySkeletonAgent', name: '剧本Agent:故事骨架', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'scriptAgent:adaptationStrategyAgent', name: '剧本Agent:改编策略', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'scriptAgent:scriptAgent', name: '剧本Agent:剧本生成', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'productionAgent:decisionAgent', name: '生产Agent:决策层', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'productionAgent:supervisionAgent', name: '生产Agent:监督层', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'productionAgent:deriveAssetsAgent', name: '生产Agent:衍生资产', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'productionAgent:generateAssetsAgent', name: '生产Agent:生成资产', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'productionAgent:directorPlanAgent', name: '生产Agent:导演规划', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'productionAgent:storyboardGenAgent', name: '生产Agent:分镜生成', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'productionAgent:storyboardPanelAgent', name: '生产Agent:分镜面板', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
  { key: 'productionAgent:storyboardTableAgent', name: '生产Agent:分镜表格', description: null, temperature: 1, maxOutputTokens: 0, disabled: false },
];

export function seedAgentConfigs(db: Database.Database, now: number): void {
  for (const cfg of AGENT_CONFIGS) {
    insertIfMissing(
      db,
      'agent_model_configs',
      'key',
      cfg.key,
      `INSERT INTO agent_model_configs
         (key, name, description, temperature, max_output_tokens, disabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cfg.key, cfg.name, cfg.description, cfg.temperature, cfg.maxOutputTokens, cfg.disabled ? 1 : 0, now, now],
    );
  }
}
