import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PROJECT_TEMPLATE_TYPE_VALUES, PROJECT_TEMPLATE_TYPES, type ProjectManualKind, type ProjectTemplateType } from '@shared/constants/dictionaries';
import { VT_STATUS } from '@shared/constants/status';
import type {
  ManualContext,
  ModelPromptContext,
  ProductionResourceContext,
  ProductionResourceContextPayload,
  ProductionSkillBundle,
  PromptTemplateContext,
  SkillContext,
} from '@shared/types/production';
import { getDatabase } from '../database';
import { getRuntimeDirectories, safeJoin } from '../file-system';
import { createError } from '../result';

interface ProjectResourceRow {
  id: number;
  visual_manual_id: number;
  director_manual_id: number;
}

interface ManualRow {
  id: number;
  name: string;
  tabs_json: string;
  updated_at: number;
}

interface PromptRow {
  id: number;
  name: string;
  type: string;
  data: string;
  use_data: string;
}

interface ModelPromptRow {
  template_id: number;
  template_name: string;
  template_type: string;
  content: string;
  connection_id: string | null;
  model_name: string | null;
  model_type: string | null;
  model_mode: string | null;
}

interface SkillRow {
  path: string;
  name: string;
  description: string;
  type: 'main' | 'references';
}

const AI_SHORT_DRAMA_SKILL_PATHS = [
  'production_agent_decision.md',
  'production_agent_execution.md',
  'production_agent_supervision.md',
  'production_execution_derive_assets.md',
  'production_execution_director_plan.md',
  'production_execution_generate_assets.md',
  'production_execution_storyboard_gen.md',
  'production_execution_storyboard_panel.md',
  'production_execution_storyboard_split.md',
  'production_execution_storyboard_table.md',
  'references/derive_assets_extraction.md',
  'references/storyboard_generation.md',
  'references/video_dialogue_extract.md',
  'references/quality_criteria.md',
  'references/pipeline.md',
  'references/script_format.md',
] as const;

function normalizeProjectId(projectId: number): number {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw createError(VT_STATUS.INVALID_PARAMS, '项目 ID 无效');
  }

  return projectId;
}

function normalizeTemplateType(templateType: ProjectTemplateType): ProjectTemplateType {
  if (!PROJECT_TEMPLATE_TYPE_VALUES.includes(templateType)) {
    throw createError(VT_STATUS.INVALID_PARAMS, '作品类型无效');
  }
  if (templateType !== PROJECT_TEMPLATE_TYPES.AI_SHORT_DRAMA) {
    throw createError(VT_STATUS.INVALID_PARAMS, '当前仅支持 AI短剧生产上下文');
  }

  return templateType;
}

function getManualTableName(kind: ProjectManualKind): 'visual_manuals' | 'director_manuals' {
  return kind === 'visual' ? 'visual_manuals' : 'director_manuals';
}

function assertProject(projectId: number): ProjectResourceRow {
  const row = getDatabase()
    .prepare<[number], ProjectResourceRow>(
      'SELECT id, visual_manual_id, director_manual_id FROM projects WHERE id = ? LIMIT 1',
    )
    .get(projectId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, '项目不存在');
  }

  return row;
}

function parseManualContent(tabsJson: string): string {
  try {
    const tabs = JSON.parse(tabsJson) as Array<{ key?: unknown; content?: unknown }>;
    if (!Array.isArray(tabs)) {
      return '';
    }

    return tabs
      .map((tab) => {
        const key = typeof tab.key === 'string' ? tab.key : 'manual';
        const content = typeof tab.content === 'string' ? tab.content.trim() : '';
        return content ? `## ${key}\n\n${content}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
  } catch {
    throw createError(VT_STATUS.INVALID_PARAMS, '手册内容解析失败');
  }
}

function readManualContext(kind: ProjectManualKind, manualId: number): ManualContext {
  const tableName = getManualTableName(kind);
  const row = getDatabase()
    .prepare<[number], ManualRow>(`SELECT id, name, tabs_json, updated_at FROM ${tableName} WHERE id = ? LIMIT 1`)
    .get(manualId);
  if (!row) {
    throw createError(VT_STATUS.NOT_FOUND, kind === 'visual' ? '视觉手册不存在' : '导演手册不存在');
  }

  return {
    id: row.id,
    name: row.name,
    content: parseManualContent(row.tabs_json),
    updatedAt: row.updated_at,
  };
}

function getPromptContent(row: PromptRow): string {
  return (row.use_data?.trim() ? row.use_data : row.data).trim();
}

function listPromptTemplates(): PromptTemplateContext[] {
  return getDatabase()
    .prepare<[], PromptRow>('SELECT id, name, type, data, use_data FROM prompts ORDER BY id ASC')
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      content: getPromptContent(row),
    }));
}

function listModelPromptContexts(): ModelPromptContext[] {
  const rows = getDatabase()
    .prepare<[], ModelPromptRow>(
      `
      SELECT
        t.id AS template_id,
        t.name AS template_name,
        t.type AS template_type,
        t.content AS content,
        m.connection_id AS connection_id,
        m.model_name AS model_name,
        m.model_type AS model_type,
        m.model_mode AS model_mode
      FROM model_prompt_templates t
      LEFT JOIN model_prompt_mappings m ON m.template_id = t.id
      ORDER BY t.type ASC, t.id ASC, m.id ASC
      `,
    )
    .all();

  return rows.map((row) => {
    const modelId = row.connection_id && row.model_name ? `${row.connection_id}:${row.model_name}` : `template:${row.template_id}`;
    const mode = row.model_mode ? `/${row.model_mode}` : '';
    return {
      modelId,
      purpose: `${row.template_type}/${row.template_name}${mode}`,
      content: row.content,
    };
  });
}

function getSkillRows(paths: readonly string[]): Map<string, SkillRow> {
  const rows = getDatabase()
    .prepare<[], SkillRow>('SELECT path, name, description, type FROM skill_list ORDER BY name ASC')
    .all();
  const wanted = new Set(paths);
  return new Map(rows.filter((row) => wanted.has(row.path)).map((row) => [row.path, row]));
}

function parseFrontmatter(content: string): { name: string; description: string } | null {
  const match = content.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match?.[1]) {
    return null;
  }

  const values: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const lineMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!lineMatch) {
      continue;
    }

    values[lineMatch[1].trim()] = (lineMatch[2] ?? '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  }

  return values.name ? { name: values.name, description: values.description ?? '' } : null;
}

function readSkillContent(relativePath: string): string {
  const fullPath = safeJoin(getRuntimeDirectories().skills, relativePath);
  if (!existsSync(fullPath)) {
    throw createError(VT_STATUS.FILE_NOT_FOUND, `Skill 文件不存在：${relativePath}`);
  }

  return readFileSync(fullPath, 'utf8');
}

function readSkillContext(relativePath: string, rows: Map<string, SkillRow>): SkillContext {
  const content = readSkillContent(relativePath);
  const row = rows.get(relativePath);
  const frontmatter = parseFrontmatter(content);
  return {
    name: row?.name || frontmatter?.name || basename(relativePath, '.md'),
    description: row?.description || frontmatter?.description || '',
    content,
  };
}

function readScriptManualContext(rows: Map<string, SkillRow>): ManualContext {
  const content = readSkillContent('references/script_format.md');
  const row = rows.get('references/script_format.md');
  return {
    id: 0,
    name: row?.name || '剧本手册',
    content,
    updatedAt: 0,
  };
}

export function getProductionSkillBundle(payload: ProductionResourceContextPayload): ProductionSkillBundle {
  normalizeProjectId(payload.projectId);
  normalizeTemplateType(payload.templateType);

  const rows = getSkillRows(AI_SHORT_DRAMA_SKILL_PATHS);
  const skillEntries = AI_SHORT_DRAMA_SKILL_PATHS.map((path) => ({
    path,
    skill: readSkillContext(path, rows),
  }));
  const skills = skillEntries.map((entry) => entry.skill);
  const mainSkills = skillEntries.filter((entry) => !entry.path.startsWith('references/')).map((entry) => entry.skill);
  const referenceSkills = skillEntries.filter((entry) => entry.path.startsWith('references/')).map((entry) => entry.skill);

  return {
    skills,
    mainSkills,
    referenceSkills,
  };
}

export function getProductionResourceContext(payload: ProductionResourceContextPayload): ProductionResourceContext {
  const projectId = normalizeProjectId(payload.projectId);
  normalizeTemplateType(payload.templateType);
  const project = assertProject(projectId);
  const skillRows = getSkillRows(AI_SHORT_DRAMA_SKILL_PATHS);

  return {
    visualManual: readManualContext('visual', project.visual_manual_id),
    directorManual: readManualContext('director', project.director_manual_id),
    scriptManual: readScriptManualContext(skillRows),
    promptTemplates: listPromptTemplates(),
    modelPrompts: listModelPromptContexts(),
    skills: AI_SHORT_DRAMA_SKILL_PATHS.map((path) => readSkillContext(path, skillRows)),
  };
}
