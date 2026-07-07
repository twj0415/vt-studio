# AI短剧生产线重构需求书

## 1. 文档定位

本文档定义 VT Studio 的 AI短剧生产线重构方案。目标是把作品生产收口为一条干净、稳定、可扩展的正式生产线，并保留当前项目中有价值的资源体系。

本文档不是旧流程修补说明，也不是临时 UI 调整清单。它是后续实现、拆分任务、验收交付的依据。

核心原则：

- 作品画布是正式生产线。
- AI 工具库是辅助工具，不是正式生产入口。
- 删除旧用户流程和旧用户概念。
- 保留资源库、手册、Prompt、Skill、模型规则、API 配置、模型配置和系统基础配置。
- 旧作品生成数据可以清理，资源资产和基础配置不能删除。
- 数据保全不是保留旧链路。旧数据只能作为清理或必要转换来源，运行时不得保留历史分支。
- 稳定输出不能只靠 Prompt，必须靠工具协议、schema 校验、失败修复、审计和生成快照。

## 2. 产品目标

用户只理解一条正式流程：

```text
新建作品
-> 选择 AI短剧
-> 进入作品画布
-> 编辑内容
-> 提取资源
-> 生成导演计划
-> 生成分镜表
-> 生成分镜图
-> 视频工作台
-> 导出
```

v1 只开放一个作品类型：

```text
AI短剧
```

但新建和编辑作品时仍保留“作品类型”选择框，当前只有 `AI短剧` 一个选项，为后续口播、图生视频、产品广告等作品类型预留模板扩展能力。

## 3. 用户侧概念

正式用户侧只使用这些概念：

```text
作品
作品类型
内容
资源
导演计划
分镜表
分镜图
视频工作台
导出
视觉手册
导演手册
剧本手册
Prompt 模板
Skill / Agent 规则
```

禁用的内部历史概念只允许出现在数据升级、代码迁移和验收搜索中，不允许出现在正式用户界面。

说明：

- “内容”是作品生产的正文输入。
- “剧本手册”作为资源管理中的专业规则资产保留，用于约束短剧内容格式和台词结构。
- 主流程仍叫“内容”，不要让用户在正式生产线里理解内部旧字段或历史实现。

## 4. 资源保护边界

本次重构不删除资源体系，也不删除系统基础配置。以下内容必须保留并接入新生产线：

```text
资源库
角色资源
场景资源
道具资源
衍生资源
资源图
资源相关图片流
资源相关历史生成结果
视觉手册
导演手册
剧本手册
Prompt 模板
Skill / Agent 规则
模型专用 Prompt
默认资源文件
默认 Skill 文件
```

资源管理区保留：

```text
视觉手册
导演手册
剧本手册
Prompt 模板
Skill / Agent 规则
```

这些资源不是展示资料，而是生产执行上下文。Production Agent、资源提取、导演计划、分镜表、分镜图、视频提示词生成都必须读取相关资源上下文。

基础配置必须保留：

```text
API Key
模型供应商配置
模型配置
模型专用 Prompt
本地路径配置
图片生成服务配置
视频生成服务配置
导出服务配置
系统设置
默认资源目录
默认 Prompt / Skill 配置
```

旧作品生成数据可以清理：

```text
已创建作品
作品内容
旧剧本数据
旧分镜数据
旧视频工作台数据
旧视频候选
旧选中视频
旧任务记录
旧导出记录
旧画布流程数据
旧 AI 工具库生成草稿
```

判断规则：

```text
资源资产不能删。
基础配置不能删。
旧作品生产结果可以删。
旧运行时兼容逻辑可以删。
新生产线重新生成作品、分镜、视频和导出记录。
```

## 5. 开发约束

### 5.1 项目规则

```text
所有自然语言用简体中文
最终回复以“你好，安吉彭于晏 ”开头
不回退用户已有改动
手动改文件用 apply_patch
查找优先 rg
```

### 5.2 前端规则

涉及 Vue / TypeScript / 交互 / 样式必须遵守 Front Skill：

```text
先读现有组件
复用现有组件
不大改画布视觉
用户文案短
按钮动作明确
错误给下一步
loading/disabled/empty/error 状态完整
```

### 5.3 Node / pnpm

必须使用：

```text
D:\software\nodejs\pnpm.cmd
```

禁止：

```text
pnpm
npx pnpm
Codex 自带 pnpm/node
```

### 5.4 资源保护

不得删除：

```text
视觉手册
导演手册
剧本手册
Prompt 模板
Skill / Agent 规则
resources/default-data
src/main/services/default-assets
模型 Prompt
API 配置
模型配置
模型供应商配置
密钥配置
系统设置
本地路径配置
图片生成服务配置
视频生成服务配置
导出服务配置
资源库数据
资源图
衍生资源
资源相关图片流
```

## 6. 禁止出现的旧概念附录

正式 UI 禁止出现：

```text
scriptId
scriptIds
sourceType
剧本ID
剧本资产提取
脚本提取
同步分镜画面
画面任务
应用到当前作品
```

正式生产前端禁止调用：

```text
旧内容资产提取接口
旧内容提取轮询接口
```

任务中心禁止展示：

```text
scriptIds
sourceType
剧本资产提取
```

允许出现的位置：

```text
一次性数据清理代码
历史包导入升级代码
本需求书附录
```

## 7. 数据升级与清理附录

本节是旧生产数据清理和新生产数据初始化说明，不是运行时兼容方案。

### 7.1 原则

```text
数据保全不是旧逻辑兼容。
旧作品生成数据可以清理，不要求迁移为新作品。
资源资产和基础配置必须保留。
清理完成后，运行时不得保留旧逻辑分支。
```

### 7.2 清理对象

旧作品生产数据可以清理：

```text
旧作品
旧内容
旧剧本
旧内容资源关联
旧生产工作区
旧分镜
旧分镜图
旧视频轨道
旧视频候选
旧选中视频
旧任务记录
旧导出记录
旧 AI 工具库草稿
旧画布流程数据
```

不得清理：

```text
资源库
资源图
衍生资源
视觉手册
导演手册
剧本手册
Prompt 模板
Skill / Agent 规则
模型专用 Prompt
API Key
模型供应商配置
模型配置
系统设置
本地路径配置
图片生成服务配置
视频生成服务配置
导出服务配置
默认资源文件
默认 Skill 文件
```

### 7.3 方法

```ts
runProductionDataReset(): void

backupDatabaseBeforeProductionReset(): string

createProductionContentTables(): void

createProductionWorkflowTables(): void

clearLegacyProjectProductionData(): void

clearLegacyTaskRecords(): void

clearLegacyExportRecords(): void

removeLegacyProductionEntrypoints(): void

assertResourceAndConfigPreserved(): void

assertProductionResetComplete(): void
```

### 7.4 校验

必须校验：

```text
资源库数量不减少
资源图数量不减少
衍生资源数量不减少
视觉手册可读取
导演手册可读取
剧本手册可读取
Prompt 模板可读取
Skill / Agent 规则可读取
API 配置存在
模型配置存在
系统设置存在
新 production 表结构存在
新建作品可以创建默认内容
生产主链路不再读取旧来源字段
```

### 7.5 失败策略

- 清理前自动备份数据库。
- 清理失败时阻止进入生产模块。
- 错误提示明确为“生产数据初始化失败”。
- 不允许静默丢弃资源资产或基础配置。
- 旧作品、旧分镜、旧视频和旧导出记录属于可清理生产结果，不作为保留项。

### 7.6 清理完成定义

数据清理和新表初始化完成不等于工作完成。必须同时完成代码清理和入口清理。

清理完成标准：

```text
正式生产页面不再读取历史来源字段
正式生产 IPC 不再暴露历史提取入口
正式生产任务不再创建历史任务分类
任务中心格式化不再展示历史关联对象
AI 工具库不再绕过 production API 写主链路
Agent 不再输出或消费历史字段
新建作品不再创建历史内容来源
旧入口不可作为正式入口访问
```

允许保留的位置：

```text
一次性数据清理
历史包导入升级
测试夹具
本文档附录
```

不允许为了“打开旧作品”保留运行时双分支。旧作品生成数据可以清理，用户通过新建 AI短剧作品进入新生产线。

## 8. 资源基础层

### 8.1 职责

资源基础层负责聚合生产所需的规则和上下文：

```text
视觉手册 -> 画面风格、构图、色彩、角色一致性
导演手册 -> 镜头、节奏、表演、叙事、分镜原则
剧本手册 -> 内容格式、短剧结构、台词、卡点、时长规范
Prompt 模板 -> 不同能力和模型的提示词结构
模型专用 Prompt -> 不同模型的输入约束和输出风格
Skill / Agent 规则 -> 工具协议、执行标准、质量门
```

### 8.2 类型

```ts
type ProductionResourceContextKey =
  | 'visualManual'
  | 'directorManual'
  | 'scriptManual'
  | 'promptTemplates'
  | 'modelPrompts'
  | 'skills';

interface ProductionResourceContext {
  visualManual: ManualContext;
  directorManual: ManualContext;
  scriptManual: ManualContext;
  promptTemplates: PromptTemplateContext[];
  modelPrompts: ModelPromptContext[];
  skills: SkillContext[];
}

interface ManualContext {
  id: number;
  name: string;
  content: string;
  updatedAt: number;
}

interface PromptTemplateContext {
  id: number;
  name: string;
  type: string;
  content: string;
}

interface ModelPromptContext {
  modelId: string;
  purpose: string;
  content: string;
}

interface SkillContext {
  name: string;
  description: string;
  content: string;
}
```

### 8.3 方法

```ts
getProductionResourceContext(payload: {
  projectId: number;
  templateType: ProjectTemplateType;
}): ProductionResourceContext

getProductionSkillBundle(payload: {
  projectId: number;
  templateType: ProjectTemplateType;
}): ProductionSkillBundle
```

### 8.4 必读 Skill

AI短剧模板必须读取：

```text
derive_assets_extraction
storyboard_generation
video_dialogue_extract
quality_criteria
pipeline
script_format
production_agent_*
production_execution_*
```

## 9. 模板扩展设计

### 9.1 设计目标

后续新增口播、图生视频、产品广告时，不复制一套平行工作流，不新增一套画布主流程。扩展方式必须是新增模板配置、步骤配置、工具配置和输出 schema。

### 9.2 注册表

新增这些注册表：

```ts
ProjectTemplateRegistry
ProductionWorkflowStepRegistry
ProductionToolRegistry
ProductionResourceContextRegistry
ProductionAgentRoleRegistry
ProductionOutputSchemaRegistry
ProductionTaskCategoryRegistry
```

### 9.3 模板类型

v1：

```ts
export const PROJECT_TEMPLATE_TYPES = {
  AI_SHORT_DRAMA: 'aiShortDrama',
} as const;

export type ProjectTemplateType = 'aiShortDrama';
```

后续预留：

```ts
type FutureProjectTemplateType =
  | 'talkingHead'
  | 'imageToVideo'
  | 'productAd';
```

### 9.4 模板配置

```ts
type ProductionWorkflowStep =
  | 'content'
  | 'resources'
  | 'directorPlan'
  | 'storyboardTable'
  | 'storyboardImages'
  | 'videoWorkbench'
  | 'export';

interface ProjectTemplateConfig {
  type: ProjectTemplateType;
  label: string;
  defaultRoute: 'production';
  workflow: ProductionWorkflowStep[];
  enabledTools: ProductionToolName[];
  requiredResourceContexts: ProductionResourceContextKey[];
  outputSchemas: ProductionOutputSchemaKey[];
  taskCategories: ProductionTaskCategoryKey[];
}
```

AI短剧配置：

```ts
const AI_SHORT_DRAMA_TEMPLATE: ProjectTemplateConfig = {
  type: 'aiShortDrama',
  label: 'AI短剧',
  defaultRoute: 'production',
  workflow: [
    'content',
    'resources',
    'directorPlan',
    'storyboardTable',
    'storyboardImages',
    'videoWorkbench',
    'export',
  ],
  enabledTools: [
    'get_flowData',
    'save_content',
    'extract_resources',
    'save_director_plan',
    'save_storyboard_table',
    'add_derive_asset',
    'delete_derive_asset',
    'generate_derive_asset',
    'add_storyboard',
    'update_storyboard',
    'delete_storyboard',
    'generate_storyboard_images',
    'generate_video_prompt',
    'generate_video',
    'select_video',
    'validate_export',
  ],
  requiredResourceContexts: [
    'visualManual',
    'directorManual',
    'scriptManual',
    'promptTemplates',
    'modelPrompts',
    'skills',
  ],
  outputSchemas: [
    'resourceExtraction',
    'directorPlan',
    'storyboardTable',
    'storyboardItem',
    'videoPrompt',
  ],
  taskCategories: [
    'extractResources',
    'generateResourceImage',
    'generateDirectorPlan',
    'generateStoryboardTable',
    'generateStoryboardImage',
    'generateVideoPrompt',
    'generateVideo',
    'export',
    'productionAgent',
  ],
};
```

### 9.5 后续模板示例

口播模板可扩展为：

```text
内容
-> 口播稿
-> 音色/人设
-> 配音
-> 口播视频
-> 字幕
-> 导出
```

### 9.6 新模板接入合同

后续每新增一个作品类型，必须只新增配置和必要工具，不允许复制一套平行页面或平行链路。

新增模板必须提供：

```ts
interface ProjectTemplatePlugin {
  type: ProjectTemplateType;
  config: ProjectTemplateConfig;
  resourceContextResolver: ProductionResourceContextResolver;
  workflowGuard: ProductionWorkflowGuard;
  flowDataBuilder: ProductionFlowDataBuilder;
  tools: ProductionToolDescriptor[];
  outputSchemas: ProductionOutputSchemaDescriptor[];
  taskCategoryFormatter: ProductionTaskCategoryFormatter;
}
```

接入检查：

```text
模板能进入同一个作品画布
模板能使用同一个任务中心
模板能使用同一个 Agent 工具协议
模板能生成统一 FlowData
模板能复用资源管理里的手册、Prompt 和 Skill
模板不新增用户侧平行入口
```

AI短剧是第一个模板，不是特殊硬编码流程。所有实现必须按模板插件方式组织，避免后续口播、图生视频、产品广告再次重构。

图生视频模板可扩展为：

```text
图片素材
-> 镜头计划
-> 视频提示词
-> 视频候选
-> 导出
```

产品广告模板可扩展为：

```text
产品资料
-> 卖点提炼
-> 广告脚本
-> 分镜图
-> 视频工作台
-> 导出
```

## 10. 内容生产层

### 10.1 数据模型

新增生产内容模型：

```text
production_contents
```

字段：

```text
id
project_id
title
body
version
resource_status
resource_error_reason
dependency_status
dependency_reason
created_at
updated_at
```

新增内容资源关联：

```text
production_resource_links
```

字段：

```text
content_id
asset_id
created_at
```

### 10.2 类型

```ts
interface ProductionContentItem {
  id: number;
  projectId: number;
  title: string;
  body: string;
  version: number;
  resourceStatus: ProductionTaskStatus;
  resourceErrorReason: string | null;
  dependencyStatus: ProductionDependencyStatus;
  dependencyReason: string | null;
  createdAt: number;
  updatedAt: number;
}
```

### 10.3 方法

```ts
listProductionContents(payload: {
  projectId: number;
}): ProductionContentListResult

getProductionContent(payload: {
  projectId: number;
  contentId: number;
}): ProductionContentResult

saveProductionContent(payload: {
  projectId: number;
  contentId?: number | null;
  title: string;
  body: string;
}): ProductionContentSaveResult

deleteProductionContent(payload: {
  projectId: number;
  contentId: number;
}): ProductionDeleteResult
```

### 10.4 规则

- 正式生产 API 只使用 `contentId`。
- 用户侧只叫“内容”。
- 新建 AI短剧作品后默认创建一个空内容版本。
- 删除内容必须先检查资源、分镜、视频和导出依赖。

### 10.5 内容版本与依赖失效

内容是整条生产线的上游。内容更新后不能静默复用下游结果，必须明确标记依赖状态。

规则：

```text
内容正文修改 -> 资源、导演计划、分镜表、分镜图、视频提示词、视频候选进入“需更新”状态
只修改内容标题 -> 不触发下游失效
资源手动修改 -> 关联分镜图、视频提示词进入“需更新”状态
视觉手册修改 -> 分镜图、资源图、视频提示词进入“可重新生成”状态
导演手册修改 -> 导演计划、分镜表、视频提示词进入“可重新生成”状态
剧本手册修改 -> 内容校验、导演计划、分镜表进入“可重新生成”状态
```

建议字段：

```ts
interface ProductionDependencyState {
  contentVersion: number;
  resourceVersion: number;
  directorPlanVersion: number;
  storyboardTableVersion: number;
  visualManualHash: string;
  directorManualHash: string;
  scriptManualHash: string;
  status: 'current' | 'needsUpdate' | 'blocked';
  reason: string | null;
}
```

画布展示必须简洁，只显示：

```text
已更新
需更新
缺少前置内容
```

详细原因放任务详情或 tooltip。

## 11. 工作流编排层

### 11.1 职责

工作流编排层负责管理步骤状态、步骤守卫、下一步推荐和执行入口。画布按钮、Production Agent 和 AI 工具库写入都必须经过这一层。

### 11.2 编排器

```ts
class ProductionWorkflowOrchestrator {
  getState(input: ProductionWorkflowStateInput): ProductionWorkflowState;
  getNextStep(input: ProductionWorkflowStateInput): ProductionWorkflowStep;
  canRunStep(input: ProductionRunStepInput): ProductionStepGuardResult;
  runStep(input: ProductionRunStepInput): Promise<ProductionRunStepResult>;
}
```

输入：

```ts
interface ProductionWorkflowStateInput {
  projectId: number;
  contentId: number;
}

interface ProductionRunStepInput {
  projectId: number;
  contentId: number;
  step: ProductionWorkflowStep;
  mode?: 'normal' | 'force';
}
```

### 11.3 步骤映射

```text
content -> saveProductionContent
resources -> extractProductionResources
directorPlan -> generateProductionDirectorPlan
storyboardTable -> generateProductionStoryboardTable
storyboardImages -> generateProductionStoryboardImages
videoWorkbench -> getProductionWorkbench
export -> validateProductionExport
```

## 12. FlowData 层

### 12.1 标准结构

```ts
interface ProductionFlowData {
  content: ProductionContentItem;
  directorPlan: string;
  storyboardTable: string;
  positions: ProductionFlowPositions;
  assets: ProductionAssetSummary[];
  storyboards: ProductionStoryboardItem[];
  videoTracks: ProductionVideoTrackItem[];
}
```

### 12.2 方法

```ts
getProductionFlowData(payload: {
  projectId: number;
  contentId: number;
}): ProductionFlowData

saveProductionFlowPositions(payload: {
  projectId: number;
  contentId: number;
  positions: ProductionFlowPositions;
}): ProductionSaveWorkspaceResult

saveProductionDirectorPlan(payload: {
  projectId: number;
  contentId: number;
  directorPlan: string;
}): ProductionSaveWorkspaceResult

saveProductionStoryboardTable(payload: {
  projectId: number;
  contentId: number;
  storyboardTable: string;
}): ProductionSaveWorkspaceResult
```

## 13. Production Tools 层

### 13.1 工具注册表

```ts
createProductionToolRegistry(context: ProductionToolContext): ProductionToolRegistry
```

上下文：

```ts
interface ProductionToolContext {
  projectId: number;
  contentId: number;
  templateType: ProjectTemplateType;
  resourceContext: ProductionResourceContext;
  abortSignal?: AbortSignal;
}
```

工具描述：

```ts
interface ProductionToolDescriptor {
  name: ProductionToolName;
  description: string;
  inputSchema: JSONSchema7;
  permission: ProductionToolPermission;
  idempotency: ProductionToolIdempotencyPolicy;
  writes: string[];
  execute(input: unknown): Promise<unknown>;
}
```

### 13.2 工具权限

```ts
type ProductionToolPermission =
  | 'read'
  | 'writeContent'
  | 'writeResource'
  | 'writeStoryboard'
  | 'writeVideo'
  | 'export'
  | 'agent';
```

### 13.3 幂等策略

```ts
interface ProductionToolIdempotencyPolicy {
  required: boolean;
  keyFields: string[];
  duplicateBehavior: 'returnExisting' | 'replace' | 'reject';
}
```

所有写入工具必须支持幂等控制，避免 Agent 重试时重复创建资源、分镜或视频轨道。

### 13.4 工具名称

```ts
type ProductionToolName =
  | 'get_flowData'
  | 'save_content'
  | 'extract_resources'
  | 'save_director_plan'
  | 'save_storyboard_table'
  | 'add_derive_asset'
  | 'delete_derive_asset'
  | 'generate_derive_asset'
  | 'add_storyboard'
  | 'update_storyboard'
  | 'delete_storyboard'
  | 'generate_storyboard_images'
  | 'generate_video_prompt'
  | 'generate_video'
  | 'select_video'
  | 'validate_export'
  | 'run_sub_agent_director_plan'
  | 'run_sub_agent_storyboard_table'
  | 'run_sub_agent_storyboard_panel'
  | 'run_sub_agent_supervision';
```

### 13.5 工具映射

```text
get_flowData -> getProductionFlowData
save_content -> saveProductionContent
extract_resources -> extractProductionResources
save_director_plan -> saveProductionDirectorPlan
save_storyboard_table -> saveProductionStoryboardTable
add_derive_asset -> createProductionDerivedAsset
delete_derive_asset -> deleteProductionDerivedAsset
generate_derive_asset -> generateProductionDerivedAssetImages
add_storyboard -> createProductionStoryboard
update_storyboard -> updateProductionStoryboard
delete_storyboard -> deleteProductionStoryboard
generate_storyboard_images -> generateProductionStoryboardImages
generate_video_prompt -> generateProductionVideoPrompts
generate_video -> generateProductionVideos
select_video -> selectProductionVideo
validate_export -> validateProductionExport
run_sub_agent_* -> runProductionSubAgent
```

## 14. 生成快照与审计

### 14.1 生成快照

所有模型生成和 Agent 写入都必须记录生成快照。

```ts
interface ProductionGenerationSnapshot {
  projectId: number;
  contentId: number;
  taskId: number | null;
  operation: string;
  modelSnapshot: ModelSnapshot;
  promptSnapshot: PromptSnapshot;
  resourceContextSnapshot: ProductionResourceContextSnapshot;
  skillSnapshot: ProductionSkillSnapshot;
  inputHash: string;
  outputHash: string | null;
  createdAt: number;
}
```

用途：

- 追踪某次资源、分镜图、视频提示词使用了哪版手册、Prompt、Skill 和模型。
- 用户修改手册后，旧生成结果仍可解释。
- 失败诊断可以定位是模型、Prompt、资源上下文还是工具协议问题。

### 14.2 Agent 审计日志

```ts
interface ProductionAgentAuditLog {
  id: number;
  projectId: number;
  contentId: number;
  messageId: string;
  toolName: ProductionToolName;
  permission: ProductionToolPermission;
  idempotencyKey: string | null;
  inputSummary: string;
  resultSummary: string;
  status: 'succeeded' | 'failed' | 'repaired';
  errorReason: string | null;
  createdAt: number;
}
```

要求：

- 每次工具调用都必须有审计记录。
- 每次自动修复都必须记录修复前后的摘要。
- 用户可以在任务详情里看到关键诊断，但不暴露敏感信息。

### 14.3 AI 生产稳定性保障

本节定义 AI 回复和生产结果的稳定性要求。正式生产不能依赖模型“自觉按格式回复”，必须通过工具、结构化输出、校验、修复、写入控制和渲染控制保证结果稳定。

目标：

```text
聊天可以自由，生产必须严格。
模型可以生成，系统必须校验。
格式不靠模型，格式由程序渲染。
写入不靠文本，写入必须走工具。
```

#### 14.3.1 总体原则

| 原则 | 要求 |
|---|---|
| 模型只产草案 | 模型负责生成候选内容，不直接决定最终落库格式 |
| 系统负责约束 | 系统负责 schema、validator、tool、renderer |
| 写入必须受控 | 任何画布和数据库写入必须通过 Production Tool |
| 错误必须可诊断 | 失败必须指出步骤、字段、规则和修复建议 |

#### 14.3.2 Agent 对话

| 项目 | 要求 |
|---|---|
| 对话形式 | Production Agent 可以保留右侧聊天形式 |
| 用户输入 | 用户可以用自然语言要求生成资源、导演计划、分镜表、分镜图、视频提示词 |
| 聊天输出 | 普通解释、建议、状态说明可以用自然语言 |
| 禁止事项 | Agent 不能通过普通聊天文本直接修改画布 |
| 执行边界 | 一旦涉及保存、生成、删除、回写，必须调用工具 |

验收标准：

| 验收项 | 标准 |
|---|---|
| 聊天 | 能自然语言问答 |
| 执行 | 写入动作能看到工具调用记录 |
| 安全 | 普通文本不会被前端解析成生产数据 |

#### 14.3.3 Agent 执行

| 项目 | 要求 |
|---|---|
| 执行方式 | Agent 执行动作必须调用 `ProductionToolRegistry` |
| 工具权限 | 每个工具声明读写范围 |
| 输入校验 | 工具参数必须 schema 校验 |
| 输出校验 | 工具返回必须是标准结果 |
| 幂等 | 创建类工具必须支持幂等 key |
| 审计 | 每次工具调用记录工具名、参数摘要、结果、错误 |

建议方法：

```ts
executeProductionTool(input: {
  projectId: number;
  contentId: number;
  toolName: ProductionToolName;
  payload: unknown;
  idempotencyKey?: string;
}): Promise<ProductionToolExecuteResult>
```

#### 14.3.4 固定格式

| 项目 | 要求 |
|---|---|
| 原则 | 不让模型直接输出最终展示格式 |
| 模型输出 | 模型只输出结构化数据 |
| 程序渲染 | 页面表格、分镜表、资源列表由程序渲染 |
| 好处 | 固定格式不受模型发挥影响 |

禁止做法：

```text
让模型直接输出最终 Markdown 分镜表，然后前端直接展示或解析。
```

正确做法：

```text
模型输出 StoryboardItem[] 结构化数据。
系统校验通过后写入。
前端或服务端用 Renderer 渲染成固定分镜表。
```

建议方法：

```ts
renderProductionOutput(input: {
  schemaKey: ProductionOutputSchemaKey;
  data: unknown;
  target: 'canvas' | 'preview' | 'export';
}): string
```

#### 14.3.5 正式数据 Schema

所有正式生产结果必须定义 JSON Schema。

| 产物 | Schema |
|---|---|
| 资源提取 | `ResourceExtractionSchema` |
| 导演计划 | `DirectorPlanSchema` |
| 分镜表 | `StoryboardTableSchema` |
| 分镜图提示词 | `StoryboardImagePromptSchema` |
| 视频提示词 | `VideoPromptSchema` |
| 导出校验 | `ExportValidationSchema` |

要求：

| 项目 | 要求 |
|---|---|
| 必填字段 | 必须校验 |
| 字段类型 | 必须校验 |
| 枚举值 | 必须校验 |
| 资源引用 | 必须校验资源 ID 是否存在 |
| 分镜引用 | 必须校验分镜 ID 是否存在 |
| 业务规则 | 必须进入 Validator 校验 |

建议方法：

```ts
validateProductionOutput(input: {
  schemaKey: ProductionOutputSchemaKey;
  output: unknown;
  context: ProductionValidationContext;
}): ProductionValidationResult
```

#### 14.3.6 画布写入

| 项目 | 要求 |
|---|---|
| 写入入口 | 画布写入必须通过 Production Tool |
| 禁止事项 | 禁止前端解析 Agent 聊天文本后直接写入 |
| 写入对象 | 内容、资源、导演计划、分镜表、分镜图、视频轨道、导出配置 |
| 写入结果 | 写入后必须返回新的 FlowData 或变更摘要 |
| 刷新 | 画布根据工具结果刷新，不猜测状态 |

工具示例：

| 工具 | 作用 |
|---|---|
| `save_content` | 保存内容 |
| `extract_resources` | 提取资源 |
| `save_director_plan` | 保存导演计划 |
| `save_storyboard_table` | 保存分镜表 |
| `generate_storyboard_images` | 生成分镜图 |
| `generate_video_prompt` | 生成视频提示词 |
| `validate_export` | 导出校验 |

#### 14.3.7 Skill 强制加载

| 项目 | 要求 |
|---|---|
| 加载方式 | Skill 由步骤配置强制加载 |
| 禁止事项 | 不能只在 Prompt 中提醒 Agent “记得使用 Skill” |
| 缺失处理 | 必需 Skill 缺失时，步骤不能执行 |
| 快照 | 每次生成记录使用了哪些 Skill |

建议配置：

```ts
interface ProductionStepRule {
  step: ProductionWorkflowStep;
  requiredSkills: string[];
  requiredManuals: string[];
  outputSchema: ProductionOutputSchemaKey;
  validator: string;
}
```

#### 14.3.8 分镜稳定性

| 项目 | 要求 |
|---|---|
| 分镜表 | 必须绑定 `storyboard_generation`、`quality_criteria`、`pipeline` |
| 分镜图 | 必须读取分镜表、资源、视觉手册、导演手册、模型 Prompt |
| 资源引用 | 分镜表中的角色、场景、道具必须引用已有资源 ID |
| 提示词 | 分镜图提示词由系统根据结构化分镜和资源组合 |
| 校验 | 分镜数量、时长、资源引用、图片提示词不能为空 |

分镜表结构建议：

```ts
interface StoryboardItemDraft {
  index: number;
  scene: string;
  shotType: string;
  cameraMovement: string;
  characterAssetIds: number[];
  sceneAssetIds: number[];
  propAssetIds: number[];
  imagePrompt: string;
  videoPrompt: string;
  dialogue: string;
  duration: number;
}
```

#### 14.3.9 资源提取

| 项目 | 要求 |
|---|---|
| 独立工具 | 提取资源必须是正式生产工具 `extract_resources` |
| 输出结构 | 必须输出结构化资源列表 |
| 类型限制 | 资源类型只能是角色、场景、道具 |
| 去重 | 需要和已有资源做名称、描述、类型去重 |
| 关联 | 资源必须关联当前内容 |
| 兜底 | 工具调用失败后必须尝试 JSON 输出解析 |
| 失败 | 解析失败不能写入空资源 |

资源结构建议：

```ts
interface ResourceDraft {
  name: string;
  type: 'role' | 'scene' | 'tool';
  description: string;
  prompt: string;
}
```

#### 14.3.10 错误与诊断

| 项目 | 要求 |
|---|---|
| 错误定位 | 必须说明失败发生在哪个步骤 |
| 字段定位 | schema 错误必须指出字段 |
| 规则定位 | validator 错误必须指出违反了哪条规则 |
| 修复建议 | 错误信息必须给出下一步建议 |
| 原始输出 | 任务详情可查看脱敏后的模型原始输出 |
| 工具记录 | 任务详情可查看工具调用和结果摘要 |

错误格式建议：

```ts
interface ProductionErrorDetail {
  step: ProductionWorkflowStep;
  schemaKey?: ProductionOutputSchemaKey;
  fieldPath?: string;
  rule?: string;
  message: string;
  suggestion: string;
}
```

用户侧错误文案示例：

```text
分镜表生成失败：第 3 条分镜缺少角色资源引用。请先补充角色资源，或重新生成分镜表。
```

#### 14.3.11 稳定性执行链路

正式生成统一走下面链路：

```text
用户指令
-> 判断生产步骤
-> 读取 FlowData
-> 加载 requiredSkills / manuals / prompt
-> PromptCompiler 组装提示词
-> 模型输出结构化草案
-> JSON Schema 校验
-> Validator 业务校验
-> 校验失败 Repair 一次
-> 仍失败则阻断
-> Production Tool 写入
-> Renderer 渲染展示
-> 保存快照和审计
```

#### 14.3.12 验收标准

| 验收项 | 标准 |
|---|---|
| Agent 对话 | 可以自然语言指挥，但不会靠聊天文本写入 |
| 固定格式 | 分镜表、资源列表展示格式稳定 |
| Schema | 资源、导演计划、分镜表、视频提示词都有 schema |
| Skill | 分镜步骤缺少必需 Skill 时不能执行 |
| 写入 | 所有写入都有 Production Tool 记录 |
| 错误 | 失败能说明步骤、字段、规则 |
| 兜底 | 不支持工具调用的模型也能尝试 JSON 输出 |
| 阻断 | 校验失败不会写入脏数据 |
| 快照 | 可追踪使用的模型、Prompt、Skill、手册 |

## 15. 资源提取层

### 15.1 接口

```ts
extractProductionResources(payload: {
  projectId: number;
  contentId: number;
  mode?: 'replace' | 'merge';
}): ProductionExtractResourcesResult
```

返回：

```ts
interface ProductionExtractResourcesResult {
  accepted: true;
  taskId: number;
  contentIds: number[];
}
```

### 15.2 内部方法

```ts
runProductionResourceExtraction(input: {
  projectId: number;
  contentId: number;
  taskId: number;
  mode: 'replace' | 'merge';
}): Promise<void>

buildProductionResourceExtractionPrompt(input: {
  content: ProductionContentItem;
  existingAssets: ProductionAssetSummary[];
  resourceContext: ProductionResourceContext;
}): string

invokeResourceExtractionWithFallback(input: {
  requestId: string;
  prompt: string;
}): Promise<ProductionResourceExtractionModelResult>

parseResourceExtractionOutput(result: unknown): ProductionResourceExtractionDraft[]

normalizeExtractedProductionResources(input: {
  projectId: number;
  contentId: number;
  drafts: ProductionResourceExtractionDraft[];
}): ProductionAssetUpsertDraft[]

upsertProductionResources(input: {
  projectId: number;
  contentId: number;
  assets: ProductionAssetUpsertDraft[];
  mode: 'replace' | 'merge';
}): void
```

### 15.3 输出协议

优先工具调用：

```ts
resultTool({
  assetsList: [
    {
      name: string,
      description: string,
      prompt: string,
      type: 'role' | 'scene' | 'tool'
    }
  ]
})
```

不支持工具调用时输出纯 JSON：

```json
{
  "assetsList": [
    {
      "name": "",
      "description": "",
      "prompt": "",
      "type": "role"
    }
  ]
}
```

### 15.4 稳定策略

```text
第一次：带 resultTool
失败后：解析模型文本 JSON
仍失败：二次请求，不带 tools，强制纯 JSON
仍失败：任务失败
```

失败文案：

```text
模型没有返回可解析资源，已尝试结构化输出和 JSON 兜底。
```

### 15.5 模型能力适配

资源提取不能绑定“必须支持工具调用”的模型。模型能力由适配层判断，调用层只关心结构化结果。

新增能力识别：

```ts
interface ModelCapabilityProfile {
  modelKey: string;
  supportsTools: boolean;
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
  maxInputTokens: number | null;
  recommendedFor: ProductionToolName[];
}
```

调用策略：

```text
supportsTools = true -> 优先工具调用
supportsTools = false 且 supportsJsonMode = true -> 使用 JSON 模式
两者都不支持 -> 使用纯文本 JSON 协议，并进入严格解析
输出不完整 -> 自动 repair 一次
repair 失败 -> 任务失败，并记录模型能力和原始输出摘要
```

这能解决“模型没有返回可用资产”的根因：失败不能只归因于用户选错模型，系统必须提供工具调用和 JSON 输出两条可验证路径。

## 16. 导演计划层

### 16.1 方法

```ts
generateProductionDirectorPlan(payload: {
  projectId: number;
  contentId: number;
  instruction?: string;
}): Promise<ProductionDirectorPlanResult>
```

内部方法：

```ts
buildDirectorPlanPrompt()
invokeDirectorPlanAgent()
validateDirectorPlanOutput()
saveProductionDirectorPlan()
```

### 16.2 输入上下文

```text
内容
主资源
衍生资源
视觉手册
导演手册
剧本手册
quality_criteria
pipeline
```

### 16.3 输出

```ts
interface ProductionDirectorPlanResult {
  directorPlan: string;
  flowData: ProductionFlowData;
}
```

## 17. 分镜表层

### 17.1 方法

```ts
generateProductionStoryboardTable(payload: {
  projectId: number;
  contentId: number;
  instruction?: string;
}): Promise<ProductionStoryboardTableResult>
```

内部方法：

```ts
buildStoryboardTablePrompt()
invokeStoryboardTableAgent()
validateStoryboardTableOutput()
saveProductionStoryboardTable()
```

### 17.2 输入上下文

```text
内容
导演计划
资源列表
视觉手册
导演手册
剧本手册
storyboard_generation
quality_criteria
```

### 17.3 输出

```ts
interface ProductionStoryboardTableResult {
  storyboardTable: string;
  flowData: ProductionFlowData;
}
```

## 18. 分镜图层

### 18.1 用户侧名称

统一叫：

```text
生成分镜图
```

### 18.2 方法

```ts
generateProductionStoryboardImages(payload: {
  projectId: number;
  contentId: number;
  storyboardIds: number[];
  compulsory?: boolean;
}): ProductionGenerateAcceptedResult
```

内部方法：

```ts
buildStoryboardImagePrompt(input)
resolveStoryboardImageReferences(input)
generateStoryboardImageByModel(input)
saveStoryboardImageResult(input)
pollProductionStoryboardImages(input)
```

### 18.3 提示词生成逻辑

每条分镜图生成时组合：

```text
分镜描述
分镜表原文
关联资源
资源图
衍生资源图
视觉手册
导演手册
剧本手册
模型 Prompt
```

本质：

```text
根据分镜内容反推/优化图片提示词，然后生成图片。
```

## 19. 视频工作台层

### 19.1 方法

```ts
getProductionWorkbench(payload: {
  projectId: number;
  contentId: number;
}): ProductionWorkbenchResult

saveProductionVideoTrack(payload: {
  projectId: number;
  contentId: number;
  trackId?: number | null;
  storyboardIds: number[];
  prompt?: string;
  duration?: number;
  mode?: ProductionVideoModeValue;
}): ProductionVideoTrackSaveResult

generateProductionVideoPrompts(payload: {
  projectId: number;
  contentId: number;
  trackIds: number[];
}): ProductionGenerateAcceptedResult

generateProductionVideos(payload: {
  projectId: number;
  contentId: number;
  trackIds: number[];
  referencesByTrackId?: Record<number, ProductionReferenceInput[]>;
}): ProductionGenerateAcceptedResult
```

### 19.2 保留能力

```text
视频模式
参考素材
候选视频
选中视频
导出校验
剪映草稿导出
```

## 20. 导出层

### 20.1 参数

导出相关 API 统一使用：

```text
projectId
contentId
storyboardIds
trackIds
```

### 20.2 校验

导出校验必须检查：

```text
内容存在
资源图是否缺失
分镜图是否缺失
视频候选是否存在
是否已选择结果视频
文件路径是否有效
```

### 20.3 保留能力

```text
导出校验
剪映草稿导出
导出历史
导出详情
打开导出目录
```

## 21. Production Agent 层

### 21.1 目标

Production Agent 是右侧生产助手，必须真正读写画布，而不是只展示上下文或手动回写。

必须支持：

```text
聊天
读取 FlowData
读取资源上下文
调用 Production Tools
写回画布
刷新节点
记录任务
失败诊断
记忆历史
重连
思考层级
工具权限
幂等执行
操作审计
生成快照
```

### 21.2 运行上下文

```ts
createProductionAgentRunContext(input: {
  projectId: number;
  contentId: number;
  userContent: string;
  thinkConfig: AgentThinkConfig;
  abortSignal?: AbortSignal;
  onToolUpdate?: (update: ProductionAgentToolUpdate) => void;
  onFlowDataUpdated?: (flowData: ProductionFlowData) => void;
}): Promise<ProductionAgentRunContext>
```

返回：

```ts
interface ProductionAgentRunContext {
  modelKey: ProductionAgentModelKey;
  system: string;
  tools: Record<string, Tool>;
  resourceContext: ProductionResourceContext;
  flowData: ProductionFlowData;
}
```

### 21.3 System Prompt 构建

```ts
buildProductionAgentSystemPrompt(input: {
  project: ProjectItem;
  content: ProductionContentItem;
  flowData: ProductionFlowData;
  resourceContext: ProductionResourceContext;
  skillBundle: ProductionSkillBundle;
  toolDescriptors: ProductionToolDescriptor[];
}): string
```

System Prompt 必须写明：

```text
你是 AI短剧生产 Agent。
正式工作流是 内容 -> 资源 -> 导演计划 -> 分镜表 -> 分镜图 -> 视频工作台 -> 导出。
写入画布必须调用工具。
不允许靠自由文本让前端解析。
不允许输出旧内部字段给用户。
必须遵守视觉手册、导演手册、剧本手册、Prompt 模板、Skill 规则。
```

### 21.4 Socket 接入

新增或重构：

```ts
registerProductionAgentNamespace()
consumeProductionAgentStream()
```

必须支持：

```text
memory
history
reconnect
think level
tool call
XML tag
任务中心记录
画布刷新
```

### 21.5 稳定输出

规则：

```text
聊天可以自然语言。
落库必须工具调用。
工具参数必须 schema 校验。
子 Agent 输出必须 validate。
validate 失败自动 repair 一次。
repair 失败才任务失败。
```

方法：

```ts
validateProductionToolInput()
validateProductionAgentOutput()
repairProductionAgentOutput()
applyProductionAgentToolResult()
```

### 21.6 子 Agent 分工

Production Agent 是总控，子 Agent 只负责专业生成，不直接写库。

分工：

```text
decisionAgent -> 判断下一步和需要调用的工具
directorPlanAgent -> 生成导演计划草案
storyboardTableAgent -> 生成分镜表草案
storyboardPanelAgent -> 生成单条分镜图提示词草案
deriveAssetsAgent -> 生成衍生资源草案
generateAssetsAgent -> 生成资源图任务草案
supervisionAgent -> 校验输出质量、发现缺漏、给 repair 建议
```

写入规则：

```text
子 Agent 输出 -> schema validate -> supervisionAgent 校验 -> Production Tool 写入 -> 生成快照 -> 画布刷新
```

禁止：

```text
子 Agent 直接写数据库
子 Agent 自行决定任务分类
子 Agent 输出自由文本后由前端猜测解析
```

## 22. AI 工具库层

### 22.1 定位

AI 工具库保留，但只做辅助工具。

允许：

```text
试 Prompt
复制结果
保存草稿
新建 AI短剧作品
打开画布
```

禁止：

```text
正式生产入口
直接写入生产主链路之外的数据
显示模糊写入文案
```

### 22.2 方法

```ts
saveToolResultToProductionContent()
saveToolResultToDirectorPlan()
saveToolResultToStoryboardTable()
startProductionResourceExtraction()
openProductionCanvas()
```

写入只能走：

```ts
window.vtStudio.production.content.save()
window.vtStudio.production.resources.extract()
window.vtStudio.production.workspace.save()
window.vtStudio.production.storyboard.save()
window.vtStudio.production.storyboard.generateImages()
```

## 23. 画布交互层

### 23.1 保留样式

保留现有画布样式：

```text
顶部浮层
右侧详情
节点卡片
资源提取弹窗
VueFlow 操作方式
```

### 23.2 节点

```text
内容
资源
导演计划
分镜表
分镜图
视频工作台
导出
```

### 23.3 文案

```text
内容
提取资源
生成导演计划
生成分镜表
生成分镜图
视频工作台
导出
设为结果图
回写到分镜图
保存到资源
```

旧文案清理清单见第 6 节，正式界面只使用本节文案。

### 23.4 按钮

```text
编辑
保存
提取
生成
重新生成
打开
导出
回写
设为结果图
保存到资源
```

### 23.5 交互规则

- 操作区要大。
- 内容显示区要大。
- 节点内减少说明文字。
- 详情面板只保留统计和主操作。
- 资源、分镜、视频列表优先展示图、名称、状态、核心动作。
- 顶部工具栏继续 icon-only。

## 24. 任务诊断层

### 24.1 任务分类

```text
提取资源
生成资源图
生成导演计划
生成分镜表
生成分镜图
生成视频提示词
生成视频
导出
生产助手
```

### 24.2 关联对象

```text
作品
内容
资源
分镜
视频轨道
```

### 24.3 方法

```ts
createProductionTask(input: ProductionTaskCreateInput): TaskCreateResult

formatProductionRelatedObjects(input: ProductionTaskRelatedObjects): string

recordProductionModelDiagnostics(input: ProductionModelDiagnosticsInput): void
```

## 25. IPC / Preload 合同

```ts
window.vtStudio.production = {
  content: {
    list,
    get,
    save,
    delete,
  },
  resources: {
    extract,
    pollExtractStatus,
  },
  workspace: {
    get,
    save,
  },
  agent: {
    getTools,
    getContext,
  },
  storyboard: {
    save,
    delete,
    generateImages,
    pollImages,
  },
  derivedAsset: {
    save,
    delete,
    generateImages,
    pollImages,
  },
  videoTrack: {
    save,
    delete,
  },
  videoPrompt: {
    generate,
    poll,
  },
  video: {
    generate,
    poll,
    select,
    delete,
  },
  export: {
    validate,
    createDraft,
  },
}
```

## 26. 设置与资源管理

### 26.1 必须保留入口

```text
视觉手册
导演手册
剧本手册
Prompt 模板
Skill / Agent 规则
```

### 26.2 Prompt 设置

新增或统一为：

```text
提取资源
生成导演计划
生成分镜表
生成分镜图提示词
生成视频提示词
```

### 26.3 Agent 模型配置

保留：

```text
productionAgent
productionAgent:decisionAgent
productionAgent:supervisionAgent
productionAgent:deriveAssetsAgent
productionAgent:generateAssetsAgent
productionAgent:directorPlanAgent
productionAgent:storyboardGenAgent
productionAgent:storyboardPanelAgent
productionAgent:storyboardTableAgent
```

## 27. 系统分层

新系统分为十层：

```text
资源基础层
作品模板层
内容生产层
工作流编排层
FlowData 层
Production Tools 层
Production Agent 层
画布交互层
任务诊断层
导出层
```

页面、AI 工具库和 Agent 都不能绕过工作流编排层直接组织正式生产流程。

### 27.1 分层依赖规则

依赖方向必须单向：

```text
画布交互层
-> 工作流编排层
-> Production Tools 层
-> 内容生产层 / 资源基础层 / 分镜层 / 视频层 / 导出层
-> 数据存储层
```

约束：

- 画布只发起用户动作，不直接拼接模型 Prompt。
- AI 工具库只能调用 production API，不能直接写生产数据。
- Production Agent 只能通过 Production Tools 写入，不能让前端解析自由文本落库。
- 任务中心只展示生产任务，不决定生产流程。
- 资源基础层只提供上下文，不主动触发生成。
- 导出层只读取已确认结果，不反向修改资源、分镜或视频候选。

## 28. 实施顺序

实施必须按阶段交付，每阶段完成后才能进入下一阶段。任何阶段发现资源丢失风险，先停下修复数据保护，再继续功能开发。

### 阶段门禁

```text
第一阶段完成标准：资源上下文可读取，可被 Prompt 和 Agent 使用。
第二阶段完成标准：新内容模型可用，旧作品生产数据可清理，资源和基础配置不丢。
第三阶段完成标准：画布主链路全部走 production API。
第四阶段完成标准：资源提取对工具调用模型和非工具调用模型都可用。
第五阶段完成标准：所有写入工具有 schema、权限、幂等、审计。
第六阶段完成标准：Agent 能通过工具读写画布，失败可诊断。
第七阶段完成标准：正式 UI 只出现新生产语义。
第八阶段完成标准：AI 工具库只保留辅助能力。
第九阶段完成标准：任务中心只展示新任务分类。
第十阶段完成标准：自动验证和手动验收全部通过。
```

### 第一阶段：资源保护和上下文聚合

新增或整理：

```ts
getProductionResourceContext()
getProductionSkillBundle()
```

目标：

```text
视觉手册、导演手册、剧本手册、Prompt、Skill 都能被生产线读取。
```

### 第二阶段：数据模型与生产数据清理

新增：

```ts
runProductionDataReset()
createProductionContentTables()
createProductionWorkflowTables()
clearLegacyProjectProductionData()
clearLegacyTaskRecords()
clearLegacyExportRecords()
assertResourceAndConfigPreserved()
```

目标：

```text
生产主链路改为 contentId。
旧作品、旧分镜、旧视频、旧任务和旧导出记录可以清理。
资源库、Prompt、Skill、手册、API 配置、模型配置和系统设置必须保留。
```

### 第三阶段：production API 重构

新增或重构：

```ts
listProductionContents()
saveProductionContent()
getProductionFlowData()
saveProductionDirectorPlan()
saveProductionStoryboardTable()
extractProductionResources()
```

目标：

```text
画布不再依赖旧生产来源服务。
```

### 第四阶段：资源提取稳定化

新增或重构：

```ts
runProductionResourceExtraction()
invokeResourceExtractionWithFallback()
parseResourceExtractionOutput()
normalizeExtractedProductionResources()
upsertProductionResources()
```

目标：

```text
无工具调用模型也能 JSON 兜底。
```

### 第五阶段：Production Tools

新增：

```ts
createProductionToolRegistry()
validateProductionToolInput()
applyProductionAgentToolResult()
```

目标：

```text
Agent 所有写入都走工具，且支持权限、幂等和审计。
```

### 第六阶段：Production Agent

新增或重构：

```ts
createProductionAgentRunContext()
buildProductionAgentSystemPrompt()
consumeProductionAgentStream()
repairProductionAgentOutput()
```

目标：

```text
右侧生产助手能真正读写画布。
```

### 第七阶段：画布 UI 收口

目标：

```text
节点、按钮、文案、弹窗全部改成新生产语义。
```

### 第八阶段：AI 工具库降级

新增或重构：

```ts
saveToolResultToProductionContent()
startProductionResourceExtraction()
openProductionCanvas()
```

目标：

```text
AI 工具库只做辅助工具。
```

### 第九阶段：任务中心清理

新增或重构：

```ts
createProductionTask()
formatProductionRelatedObjects()
recordProductionModelDiagnostics()
```

目标：

```text
任务中心只展示新生产语义。
```

### 第十阶段：验证

必须执行：

```text
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run build
```

## 29. 验收标准

### 29.1 自动验证

必须通过：

```text
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run build
```

搜索验证：

```text
rg "scriptId|scriptIds|sourceType|剧本资产提取|同步分镜画面|应用到当前作品" src/renderer
```

要求：

- 正式 UI 不命中旧概念。
- 一次性升级代码、历史导入升级代码和文档附录可保留必要旧字段名。
- production 主链路不能依赖旧逻辑分支。

### 29.2 手动验收

必须完整验证：

```text
新建 AI短剧作品
进入作品画布
编辑内容
提取资源
任务中心显示“提取资源”
模型无工具调用时 JSON 兜底成功
生成导演计划
生成分镜表
生成分镜图
生成衍生资源图
打开视频工作台
生成视频提示词
生成视频候选
选择结果视频
导出校验
剪映草稿导出
```

资源保护验证：

```text
资源库数据不丢
资源图不丢
衍生资源不丢
视觉手册可读
导演手册可读
剧本手册可读
Prompt 模板可读
Skill / Agent 规则可读
资源相关图片流可用
API 配置可读
模型配置可读
模型供应商配置可读
系统设置可读
图片生成服务配置可读
视频生成服务配置可读
导出服务配置可读
```

冲突验证：

```text
画布不出现旧内部字段
任务中心不出现旧任务分类
AI 工具库不绕过 production 接口写入
Production Agent 写入必须走工具/schema
Production Tools 必须有权限、幂等和审计
生成结果必须有资源上下文快照
```

## 30. 最终判断

本次重构的最终取舍：

```text
删旧流程，不删资源能力。
删旧用户概念，不删有价值的数据和规则。
数据升级不是保留历史链路。
不靠 Prompt 保证稳定输出，而靠 tool / schema / validation / repair / audit / snapshot。
画布是正式生产线，AI 工具库只是辅助工具。
```

只有满足这些条件，AI短剧生产线才算真正收口。
