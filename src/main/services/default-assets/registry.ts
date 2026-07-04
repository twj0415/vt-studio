import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { app } from 'electron';
import { is } from '@electron-toolkit/utils';
import {
  PROJECT_MANUAL_ROOTS,
  PROJECT_MANUAL_TABS,
  type ProjectManualTabDefinition,
} from '@shared/constants/manuals';

export type DefaultResourceRuntimeKey = 'skills' | 'models' | 'vendors' | 'modelPrompt' | 'assets';
export type DefaultResourceKind = 'directory' | 'vendor' | 'vendorTemplate' | 'skill' | 'manual' | 'modelPrompt' | 'model' | 'asset';

export interface DefaultResourceTarget {
  id: DefaultResourceRuntimeKey;
  name: string;
  sourceRelativePath: string;
  runtimeKey: DefaultResourceRuntimeKey;
  seedTargetTable: string | null;
  pageVisible: boolean;
  chainUsed: boolean;
  required: boolean;
}

export interface DefaultManualDefinition {
  name: string;
  path: string;
  coverRelativePath: string | null;
}

export interface DefaultModelPromptDefinition {
  name: string;
  type: 'videoPrompt';
  relativePath: string;
}

export interface DefaultSkillDefinition {
  id: string;
  md5: string;
  path: string;
  name: string;
  description: string;
  type: 'main' | 'references';
}

export interface DefaultSkillAttributionDefinition {
  skillId: string;
  attribution: string;
}

export interface DefaultResourceRegistryItem {
  id: string;
  label: string;
  kind: DefaultResourceKind;
  sourceRelativePath: string;
  runtimeKey: DefaultResourceRuntimeKey;
  seedTargetTable: string | null;
  pageVisible: boolean;
  chainUsed: boolean;
  required: boolean;
}

export const DEFAULT_MODEL_ONNX_FILE = ['all-MiniLM-L6-v2', 'onnx', 'model_fp16.onnx'] as const;

export const DEFAULT_RESOURCE_TARGETS: DefaultResourceTarget[] = [
  {
    id: 'skills',
    name: 'Skill 和参考手册',
    sourceRelativePath: 'skills',
    runtimeKey: 'skills',
    seedTargetTable: 'skill_list / visual_manuals / director_manuals',
    pageVisible: true,
    chainUsed: true,
    required: true,
  },
  {
    id: 'models',
    name: '本地 ONNX 模型',
    sourceRelativePath: 'models',
    runtimeKey: 'models',
    seedTargetTable: 'app_settings.modelOnnxFile',
    pageVisible: true,
    chainUsed: true,
    required: true,
  },
  {
    id: 'vendors',
    name: '供应商 adapter',
    sourceRelativePath: 'vendors',
    runtimeKey: 'vendors',
    seedTargetTable: 'model_vendors',
    pageVisible: true,
    chainUsed: true,
    required: true,
  },
  {
    id: 'modelPrompt',
    name: '模型专用提示词',
    sourceRelativePath: 'modelPrompt',
    runtimeKey: 'modelPrompt',
    seedTargetTable: 'model_prompt_templates',
    pageVisible: true,
    chainUsed: true,
    required: true,
  },
  {
    id: 'assets',
    name: '默认素材',
    sourceRelativePath: 'assets',
    runtimeKey: 'assets',
    seedTargetTable: null,
    pageVisible: true,
    chainUsed: true,
    required: true,
  },
];

export const DEFAULT_VENDOR_IDS = [
  'toonflow',
  'deepseek',
  'anthropic',
  'gemini',
  'atlascloud',
  'volcengine',
  'volcengineSd2',
  'grsai',
  'minimax',
  'openai',
  'klingai',
  'vidu',
  'comfyui',
] as const;

export const DEFAULT_VENDOR_RESOURCE_IDS = [
  'toonflow',
  'deepseek',
  'atlascloud',
  'volcengine',
  'volcengineSd2',
  'grsai',
  'minimax',
  'openai',
  'klingai',
  'vidu',
] as const;

export const DEFAULT_VENDOR_TEMPLATE_IDS = ['null'] as const;

export const DEFAULT_VISUAL_MANUALS: DefaultManualDefinition[] = [
  { path: '2D_90s_japanese_anime', name: '90年代日式动画', coverRelativePath: 'images/1.png' },
  { path: '2D_chinese_guofeng', name: '国风二次元新国潮', coverRelativePath: 'images/1.png' },
  { path: '2D_flat_design', name: '2D扁平风', coverRelativePath: 'images/1.png' },
  { path: '2D_mature_urban_romance', name: '成熟都市言情二次元', coverRelativePath: 'images/1.png' },
  { path: '3D_anime_render', name: '3D动画渲染', coverRelativePath: 'images/1.png' },
  { path: '3D_chinese_traditional', name: '国风3D', coverRelativePath: 'images/1.png' },
  { path: '3D_clay_stopmotion', name: '定格动画黏土风', coverRelativePath: 'images/1.png' },
  { path: '3D_guofeng_cyber', name: '国风赛博3D', coverRelativePath: 'images/0d631a31-eb61-49ad-855f-396afb5fb48a.jpg' },
  { path: 'realpeople_ancient_chinese', name: '真人古风写实', coverRelativePath: 'images/1.png' },
  { path: 'realpeople_modern_city', name: '真人都市影像', coverRelativePath: 'images/120acd4a-e368-4e70-8060-dc4136a292f7.jpg' },
  { path: 'realpeople_urban_modern', name: '真人都市写实', coverRelativePath: 'images/1.png' },
];

export const DEFAULT_DIRECTOR_MANUALS: DefaultManualDefinition[] = [
  { path: 'Comedy_humor', name: '喜剧搞笑', coverRelativePath: 'images/title.png' },
  { path: 'Coming_of_age', name: '青春成长', coverRelativePath: 'images/title.png' },
  { path: 'Family_warmth', name: '家庭温情', coverRelativePath: 'images/title.png' },
  { path: 'Historical_epic', name: '历史史诗', coverRelativePath: 'images/title.png' },
  { path: 'Horror_supernatural', name: '恐怖灵异', coverRelativePath: 'images/title.png' },
  { path: 'Hot_blooded_action', name: '热血少年', coverRelativePath: 'images/title.png' },
  { path: 'Mystery_thriller', name: '悬疑推理', coverRelativePath: 'images/title.png' },
  { path: 'Psychological_drama', name: '心理博弈', coverRelativePath: 'images/title.png' },
  { path: 'Scifi_post_apocalypse', name: '科幻末世', coverRelativePath: 'images/title.png' },
  { path: 'Sweet_romance_novel', name: '甜宠言情', coverRelativePath: 'images/title.png' },
  { path: 'Urban_workplace_drama', name: '都市职场', coverRelativePath: 'images/title.png' },
  { path: 'Xianxia_fantasy', name: '古风仙侠', coverRelativePath: 'images/title.png' },
];

export const DEFAULT_MODEL_PROMPTS: DefaultModelPromptDefinition[] = [
  { name: 'Seedance 2.0 多参数模式', type: 'videoPrompt', relativePath: 'video/seedance2Multi-parameterMode.md' },
  { name: '通用首尾帧模式', type: 'videoPrompt', relativePath: 'video/universalFirstAndLastFrameMode.md' },
  { name: '通用多参数模式', type: 'videoPrompt', relativePath: 'video/universalMulti-parameterMode.md' },
  { name: 'Wan 2.6 单图首帧模式', type: 'videoPrompt', relativePath: 'video/wan2.6Single-imageFirstFrameMode.md' },
];

export const DEFAULT_MAIN_SKILLS: DefaultSkillDefinition[] = [
  { id: '4fb36012e56e395b425569987f5dab0e', md5: 'fca3c269c5f325a65dafa663c9bb9773', path: 'production_agent_decision.md', name: 'production_agent_decision', description: '', type: 'main' },
  { id: '017b6338d7aa227cd614ec1fb25fd83e', md5: '2610b80abe4bd048fe61c73adc7388ac', path: 'production_agent_execution.md', name: 'production_agent_execution', description: '', type: 'main' },
  { id: 'f03c8e67b61580de9ea5b9d166521b67', md5: 'd41d8cd98f00b204e9800998ecf8427e', path: 'production_agent_supervision.md', name: 'production_agent_supervision', description: '', type: 'main' },
  { id: '50b49d8af5d364665b463c23f6a4d8bb', md5: 'fbba66e0df2426996277b299710c3033', path: 'script_agent_decision.md', name: 'script_agent_decision', description: '', type: 'main' },
  { id: '427727727e1095c54b6840cd21382d82', md5: '7e5911242af7233854d533278c6a8ccb', path: 'script_agent_execution.md', name: 'script_agent_execution', description: '', type: 'main' },
  { id: '02848fb0dd582fd926502c77ecf9679c', md5: '7a8b6a311b015cd47bf17cc52b935348', path: 'script_agent_supervision.md', name: 'script_agent_supervision', description: '', type: 'main' },
  { id: 'a1e818cc03a0b355b239ac1fb0512969', md5: '1fd22029e8047aa30b0dfd703cb837ed', path: 'universal_agent.md', name: 'universal_agent', description: '', type: 'main' },
];

export const DEFAULT_REFERENCE_SKILLS: DefaultSkillDefinition[] = [
  { id: '3e5efec258c8d8e6a39bcef12f8ee058', md5: 'efccb0464cfd472861b49ebf737d4820', path: 'references/event_extract.md', name: 'event_extract', description: '专为小说改编短剧设计的文本分析助手，逐章提取涉及角色、核心事件、主线关系、信息密度、预估集长及情绪强度等结构化信息，以Markdown表格形式输出，并附汇总统计，辅助短剧制作的内容规划与时长估算。', type: 'references' },
  { id: '52c51fa8655f899a1b7aae9b6aad7251', md5: '783678aaab829b34e7c30a414c356bf6', path: 'references/novel_character_extract.md', name: 'novel_character_extract', description: '专为小说内容分析设计的角色提取助手，从原文中识别并结构化输出所有重要角色的视觉描述信息，包括外貌、服饰、体态、状态变体等字段，供美术制作和AI角色图生成使用。', type: 'references' },
  { id: '6d46cdca10b2f49e07e515885d1387a0', md5: '10544d12c4ef011e6b3b63a99b8c7fa8', path: 'references/novel_props_extract.md', name: 'novel_props_extract', description: '专注于从小说原文中提取道具物品信息的分析助手，能识别武器、法器、药物等各类道具，生成包含外观、材质、尺寸、功能及状态变体的结构化视觉描述表格，供美术制作和AI绘图使用。', type: 'references' },
  { id: '1864df75d1d65f76e275046649ecaef8', md5: '65603aa495a541f54c55b7f30e149f45', path: 'references/novel_scene_extract.md', name: 'novel_scene_extract', description: '专注于从小说原文中提取并结构化场景信息的分析助手，可识别各类场景地点，输出包含空间描述、光照氛围、关键陈设、色调基调等字段的标准化场景资产表，用于美术制作和AI绘图的场景概念图生成。', type: 'references' },
  { id: '7fbce6f90d7d85496ba9817e9622e640', md5: '830559e8f2cd5d0fa8e6df48a164fe2d', path: 'references/video_dialogue_extract.md', name: 'video_dialogue_extract', description: '这是一个专门从视频分镜提示词中提取结构化台词、旁白与音效信息的AI助手配置文档，定义了完整的输出格式（含镜号、角色、台词类型、表演指导等字段）、提取规则及处理流程，用于将视频分镜描述转化为标准化台词表。', type: 'references' },
  { id: '31fb5c5a1f514ec1e66b4eba9f22d4db', md5: '43e63450efe0c9af8a3a40b036d36cb4', path: 'references/pipeline.md', name: 'pipeline', description: '面向短剧改编项目的四阶段流水线说明文档，涵盖事件提取、故事骨架、改编策略、剧本编写的串行执行流程，定义了决策层、执行层、监督层的协作规范及派发、审核、修复的交互格式与质量门控标准。', type: 'references' },
  { id: '27dc2dfc901de2180227d0269217583a', md5: '7d353be4bab7a794436d9abff2b9c6ee', path: 'references/adaptation_format.md', name: 'adaptation_format', description: '本文档规定了改编策略输出的标准格式，包括核心改编原则、删除决策和世界观呈现策略三大模块的书写规范，明确各模块所需涵盖的维度与要素，用于指导竖屏短剧等载体的文学改编工作。', type: 'references' },
  { id: 'd49fa09504fe784a8e6eb102756c6d56', md5: '2ef08a7479f29d74986999ceb02092c8', path: 'references/event_format.md', name: 'event_format', description: '本文档规定了影视改编项目中事件表的标准输出格式，包括文件头、事件表格、各字段填写规范（章节、角色、核心事件、主线关系、情绪强度、预估时长）及汇总统计模板，用于指导从原著提取事件并评估改编集数与压缩比的第一阶段工作。', type: 'references' },
  { id: '797906c2ddf0750f050bcdeae23eae3d', md5: 'f5e7fe6db7e05db69d5dc327c4c538f2', path: 'references/script_format.md', name: 'script_format', description: '本文档为竖屏短剧剧本的输出格式规范，定义了文件头、节拍结构、分镜脚本、画面描述、台词、转场标注等标准格式要求，并附有时长控制参数与自查清单，供AI视频生成和导演制作使用。', type: 'references' },
  { id: '1abd8675c0c3e62b20c0b151d2ec0fb1', md5: 'a587532c737ce15022e1522021f099bb', path: 'references/skeleton_format.md', name: 'skeleton_format', description: '本文档定义了故事骨架文件（skeleton.md）的标准化输出格式，涵盖故事核、人物成长隐线、三幕结构、分集决策模板、全局删减记录、付费卡点设计及自查清单，用于指导编剧将章节事件列表转化为结构完整的剧集改编方案。', type: 'references' },
  { id: '0b7828d7a6ab458a4b201122f08d6c16', md5: '120b3c856f1b2a8a429e11319e8c95fe', path: 'references/quality_criteria.md', name: 'quality_criteria', description: '本文档为影视/短剧项目的质量审核标准手册，涵盖事件表、故事骨架、改编策略和剧本四大模块的详细审核规则，规定了格式规范、角色名称统一、时长合理性、画面可执行性及场景氛围一致性等审核要求，用于确保各阶段产出物的内容精确性与制作可行性。', type: 'references' },
  { id: '5c1772b5f9c420d9eae9ca02914ba087', md5: 'c710ab7d237e1f0c5aa3d208e0f5b484', path: 'references/plan.md', name: 'plan', description: '该文档定义了AI代理生成执行计划的规范，包括任务总览、步骤列表（含编号、名称、详细内容、预期输出及依赖关系）和执行顺序标注，并提供标准回复模板，用于将用户需求拆解为可直接传入子代理工具执行的具体步骤。', type: 'references' },
  { id: '75a45cf996015ca819582873887ec301', md5: '6045d76873fd58b8b87a914a21a38439', path: 'references/derive_assets_extraction.md', name: 'derive_assets_extraction', description: '本文档是一份技术操作指南，说明如何根据剧本内容和已有资产列表，提取每个资产在剧情中出现的不同视觉状态变体（derive），并通过工具函数读取和写入数据，用于后续图片生成参考。', type: 'references' },
  { id: 'fce75f69d704c19bebcb356bc1bd6e81', md5: 'a3b3432854970f22949ba47236a6532f', path: 'references/storyboard_generation.md', name: 'storyboard_generation', description: '根据剧本和资产列表生成结构化分镜面板的工具指南，涵盖分镜拆分原则、字段填写规范及工具调用流程，用于将剧本转化为含画面描述、镜头语言、台词和AI绘图提示词的分镜数据。', type: 'references' },
];

export const DEFAULT_SKILL_ATTRIBUTIONS: DefaultSkillAttributionDefinition[] = [
  { skillId: '52c51fa8655f899a1b7aae9b6aad7251', attribution: 'universal_agent.md' },
  { skillId: '6d46cdca10b2f49e07e515885d1387a0', attribution: 'universal_agent.md' },
  { skillId: '1864df75d1d65f76e275046649ecaef8', attribution: 'universal_agent.md' },
  { skillId: '3e5efec258c8d8e6a39bcef12f8ee058', attribution: 'universal_agent.md' },
  { skillId: '7fbce6f90d7d85496ba9817e9622e640', attribution: 'universal_agent.md' },
  { skillId: '31fb5c5a1f514ec1e66b4eba9f22d4db', attribution: 'script_agent_decision.md' },
  { skillId: '27dc2dfc901de2180227d0269217583a', attribution: 'script_agent_execution.md' },
  { skillId: 'd49fa09504fe784a8e6eb102756c6d56', attribution: 'script_agent_execution.md' },
  { skillId: '797906c2ddf0750f050bcdeae23eae3d', attribution: 'script_agent_execution.md' },
  { skillId: '1abd8675c0c3e62b20c0b151d2ec0fb1', attribution: 'script_agent_execution.md' },
  { skillId: '0b7828d7a6ab458a4b201122f08d6c16', attribution: 'script_agent_supervision.md' },
  { skillId: '5c1772b5f9c420d9eae9ca02914ba087', attribution: 'production_agent_decision.md' },
  { skillId: '75a45cf996015ca819582873887ec301', attribution: 'production_agent_execution.md' },
  { skillId: 'fce75f69d704c19bebcb356bc1bd6e81', attribution: 'production_agent_execution.md' },
];

export function getDefaultDataRoot(): string {
  if (process.env.VT_STUDIO_DEFAULT_DATA) {
    return process.env.VT_STUDIO_DEFAULT_DATA;
  }

  if (is.dev) {
    const candidates = [
      resolve(process.cwd(), 'resources', 'default-data'),
      resolve(app.getAppPath(), 'resources', 'default-data'),
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  }

  return resolve(process.resourcesPath, 'default-data');
}

export function getDefaultManualTabs(kind: 'visual' | 'director'): readonly ProjectManualTabDefinition[] {
  return PROJECT_MANUAL_TABS[kind];
}

export function getDefaultManualRoot(kind: 'visual' | 'director'): string {
  return PROJECT_MANUAL_ROOTS[kind];
}

export function buildDefaultResourceRegistry(): DefaultResourceRegistryItem[] {
  const directoryItems = DEFAULT_RESOURCE_TARGETS.map((target) => ({
    id: `directory:${target.id}`,
    label: target.name,
    kind: 'directory' as const,
    sourceRelativePath: target.sourceRelativePath,
    runtimeKey: target.runtimeKey,
    seedTargetTable: target.seedTargetTable,
    pageVisible: target.pageVisible,
    chainUsed: target.chainUsed,
    required: target.required,
  }));

  const vendorItems = DEFAULT_VENDOR_RESOURCE_IDS.map((vendorId) => ({
    id: `vendor:${vendorId}`,
    label: `供应商 ${vendorId}`,
    kind: 'vendor' as const,
    sourceRelativePath: `vendors/${vendorId}.ts`,
    runtimeKey: 'vendors' as const,
    seedTargetTable: 'model_vendors',
    pageVisible: true,
    chainUsed: true,
    required: true,
  }));

  const vendorTemplateItems = DEFAULT_VENDOR_TEMPLATE_IDS.map((vendorId) => ({
    id: `vendor-template:${vendorId}`,
    label: `供应商模板 ${vendorId}`,
    kind: 'vendorTemplate' as const,
    sourceRelativePath: `vendors/${vendorId}.ts`,
    runtimeKey: 'vendors' as const,
    seedTargetTable: null,
    pageVisible: true,
    chainUsed: false,
    required: true,
  }));

  const skillItems = [...DEFAULT_MAIN_SKILLS, ...DEFAULT_REFERENCE_SKILLS].map((skill) => ({
    id: `skill:${skill.path}`,
    label: `Skill ${skill.name}`,
    kind: 'skill' as const,
    sourceRelativePath: `skills/${skill.path}`,
    runtimeKey: 'skills' as const,
    seedTargetTable: 'skill_list',
    pageVisible: true,
    chainUsed: true,
    required: true,
  }));

  const modelPromptItems = DEFAULT_MODEL_PROMPTS.map((prompt) => ({
    id: `model-prompt:${prompt.relativePath}`,
    label: `模型提示词 ${prompt.name}`,
    kind: 'modelPrompt' as const,
    sourceRelativePath: `modelPrompt/${prompt.relativePath}`,
    runtimeKey: 'modelPrompt' as const,
    seedTargetTable: 'model_prompt_templates',
    pageVisible: true,
    chainUsed: true,
    required: true,
  }));

  const modelItems = [
    {
      id: 'model:all-MiniLM-L6-v2',
      label: 'ONNX 向量模型 all-MiniLM-L6-v2',
      kind: 'model' as const,
      sourceRelativePath: `models/${DEFAULT_MODEL_ONNX_FILE.join('/')}`,
      runtimeKey: 'models' as const,
      seedTargetTable: 'app_settings.modelOnnxFile',
      pageVisible: true,
      chainUsed: true,
      required: true,
    },
  ];

  const assetItems = [
    {
      id: 'asset:ending',
      label: '默认片尾素材',
      kind: 'asset' as const,
      sourceRelativePath: 'assets/ending.mp4',
      runtimeKey: 'assets' as const,
      seedTargetTable: null,
      pageVisible: true,
      chainUsed: true,
      required: true,
    },
  ];

  return [
    ...directoryItems,
    ...vendorItems,
    ...vendorTemplateItems,
    ...skillItems,
    ...modelPromptItems,
    ...modelItems,
    ...assetItems,
  ];
}
