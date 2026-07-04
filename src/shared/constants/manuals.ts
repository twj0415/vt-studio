import type { ProjectManualKind } from './dictionaries';

export interface ProjectManualTabDefinition {
  key: string;
  label: string;
  relativePath: string;
  legacyRelativePaths?: readonly string[];
}

export const PROJECT_MANUAL_ROOTS = {
  visual: 'art_skills',
  director: 'story_skills',
} as const satisfies Record<ProjectManualKind, string>;

export const PROJECT_MANUAL_TABS = {
  visual: [
    { key: 'README', label: 'README', relativePath: 'README.md' },
    { key: 'prefix', label: '前缀', relativePath: 'prefix.md' },
    { key: 'character', label: '角色', relativePath: 'art_prompt/art_character.md' },
    { key: 'characterDerivative', label: '角色衍生', relativePath: 'art_prompt/art_character_derivative.md' },
    { key: 'prop', label: '道具', relativePath: 'art_prompt/art_prop.md' },
    { key: 'propDerivative', label: '道具衍生', relativePath: 'art_prompt/art_prop_derivative.md' },
    { key: 'scene', label: '场景', relativePath: 'art_prompt/art_scene.md' },
    { key: 'sceneDerivative', label: '场景衍生', relativePath: 'art_prompt/art_scene_derivative.md' },
    {
      key: 'storyboard',
      label: '分镜',
      relativePath: 'director_skills/director_storyboard.md',
      legacyRelativePaths: ['driector_skills/director_storyboard.md'],
    },
    { key: 'storyboardVideo', label: '分镜视频', relativePath: 'art_prompt/art_storyboard_video.md' },
    {
      key: 'directorPlan',
      label: '技法-导演规划',
      relativePath: 'director_skills/director_planning_style.md',
      legacyRelativePaths: ['driector_skills/director_planning_style.md'],
    },
    {
      key: 'storyboardTable',
      label: '技法-分镜表设计',
      relativePath: 'director_skills/director_storyboard_table_style.md',
      legacyRelativePaths: ['driector_skills/director_storyboard_table_style.md'],
    },
  ],
  director: [
    { key: 'README', label: 'README', relativePath: 'README.md' },
    {
      key: 'planning',
      label: '导演规划',
      relativePath: 'director_skills/director_planning_narrative.md',
      legacyRelativePaths: ['driector_skills/director_planning_narrative.md'],
    },
    {
      key: 'storyboardTable',
      label: '分镜表',
      relativePath: 'director_skills/director_storyboard_table_narrative.md',
      legacyRelativePaths: ['driector_skills/director_storyboard_table_narrative.md'],
    },
  ],
} as const satisfies Record<ProjectManualKind, readonly ProjectManualTabDefinition[]>;

export function getProjectManualRootName(kind: ProjectManualKind): string {
  return PROJECT_MANUAL_ROOTS[kind];
}

export function getProjectManualTabs(kind: ProjectManualKind): readonly ProjectManualTabDefinition[] {
  return PROJECT_MANUAL_TABS[kind];
}
