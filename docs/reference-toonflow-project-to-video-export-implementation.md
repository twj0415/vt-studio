# Toonflow 参考项目：从项目创建到视频导出的实现逻辑详解

## 0. 范围和关键结论

本文分析主参考项目 `D:\project\短视频\Toonflow-web-master` 与 `D:\project\短视频\Toonflow-app-master` 从“项目创建”到“视频导出”的完整实现逻辑。

另一个参考项目 `D:\project\短视频\waoowaoo-main` 是另一套 Next.js / Prisma / 任务队列体系。它的页面、接口、数据库模型和任务运行时都不是 Toonflow 这一套，不能和 Toonflow 混成同一条链路。本文如无特别说明，所有“参考项目”均指 Toonflow。

核心结论：

1. Toonflow 的主流程是：项目配置 -> 剧本 -> 资源提取入库 -> 生产画布组织 -> 分镜入库 -> 分镜图生成 -> 视频轨道生成候选 -> 选择候选 -> 剪辑台 WebAV 合成 MP4 下载。
2. Toonflow 没有看到剪映草稿导出服务。最终导出是前端浏览器端 WebAV 合成 MP4，然后通过 `<a download>` 下载。
3. 资源提取不是在画布里弹出草稿确认面板，而是在剧本页勾选剧本后调用 `/script/extractAssets`，AI 结构化提取后直接写入 `o_assets` 和 `o_scriptAssets`。
4. 画布不是资源提取主入口。画布负责串联 `script -> scriptPlan -> assets -> storyboardTable -> storyboard -> workbench`，但资源、分镜、视频候选的真实数据主要在数据库表中。
5. 资产库不只有角色、场景、道具，还包含 `clip` 视频素材和 `audio` 音频素材。
6. 视频候选生成后不会自动合成最终片。用户需要在视频轨道里选择候选，再进入剪辑台拖拽/编排，最后导出 MP4。
7. Toonflow 大量使用 `scriptId`、`episodesId`、`scriptAssets` 等旧语义。如果 VT Studio 按需求文档重构，正式外部合同应转换为 `contentId/contentName`，不能照搬旧字段。

## 1. 总体数据流

```txt
项目创建
  -> 写入 o_project：模型、比例、视觉手册、导演手册、项目类型

剧本录入
  -> 写入 o_script：每集剧本内容

资源提取
  -> /script/extractAssets
  -> AI resultTool 输出 newAssets / existingAssetRefs
  -> 写入 o_assets
  -> 写入 o_scriptAssets

生产画布
  -> /production/getFlowData
  -> 从 o_script / o_scriptAssets / o_assets / o_storyboard 组装 FlowData
  -> 画布显示 script、assets、scriptPlan、storyboardTable、storyboard、workbench

Production Agent / 用户操作
  -> 生成导演计划 scriptPlan
  -> 生成分镜表 storyboardTable
  -> 新增分镜面板
  -> 生成衍生资源

分镜落库
  -> /production/storyboard/batchAddStoryboardInfo
  -> 写入 o_storyboard
  -> 写入 o_assets2Storyboard
  -> 创建或复用 o_videoTrack

分镜图生成
  -> /production/storyboard/batchGenerateImage
  -> 读取 o_storyboard + o_assets2Storyboard + o_image
  -> 调图像模型
  -> 保存 jpg
  -> 更新 o_storyboard.filePath/state

视频工作台
  -> /production/workbench/getGenerateData
  -> 读取分镜、资产、音频、轨道、视频候选
  -> 前端按 track 展示参考素材和候选视频

视频提示词生成
  -> /production/workbench/generateVideoPrompt
  -> 读取分镜、资产、视觉手册、模型专用 prompt
  -> 调文本模型
  -> 更新 o_videoTrack.prompt/state

视频候选生成
  -> /production/workbench/generateVideo 或 batchGenerateVideo
  -> 插入 o_video state=生成中
  -> 后台调视频模型
  -> 保存 mp4
  -> 更新 o_video.state=生成成功/生成失败

选择候选
  -> /production/workbench/selectVideo
  -> 更新 o_videoTrack.videoId

剪辑台
  -> /assets/getMaterialData
  -> 读取 clip 素材、片尾、轨道候选视频
  -> vue-clip-track 管理时间线
  -> WebAV 预览和渲染

最终导出
  -> videoPreview.exportVideo()
  -> avCanvas.createCombinator()
  -> 输出 Blob video/mp4
  -> 浏览器下载 WebAV-export-{timestamp}.mp4
```

## 2. 核心文件入口

项目入口：

- `D:\project\短视频\Toonflow-web-master\src\views\project\index.vue`
- `D:\project\短视频\Toonflow-web-master\src\views\project\components\projectDialog.vue`
- `D:\project\短视频\Toonflow-app-master\src\routes\project\addProject.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\project\editProject.ts`

剧本和资源提取：

- `D:\project\短视频\Toonflow-web-master\src\views\script\index.vue`
- `D:\project\短视频\Toonflow-app-master\src\routes\script\extractAssets.ts`

资产中心和衍生资源：

- `D:\project\短视频\Toonflow-web-master\src\views\assets\index.vue`
- `D:\project\短视频\Toonflow-web-master\src\views\production\node\assets.vue`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\assets\batchGenerateAssetsImage.ts`

生产画布：

- `D:\project\短视频\Toonflow-web-master\src\views\production\index.vue`
- `D:\project\短视频\Toonflow-web-master\src\views\production\utils\flowBuilder.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\getFlowData.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\saveFlowData.ts`

Production Agent：

- `D:\project\短视频\Toonflow-app-master\src\agents\productionAgent\index.ts`
- `D:\project\短视频\Toonflow-app-master\src\agents\productionAgent\tools.ts`

分镜：

- `D:\project\短视频\Toonflow-web-master\src\views\production\node\storyboard.vue`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\storyboard\batchAddStoryboardInfo.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\storyboard\batchGenerateImage.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\storyboard\getStoryboardData.ts`

视频工作台：

- `D:\project\短视频\Toonflow-web-master\src\views\production\components\workbench\index.vue`
- `D:\project\短视频\Toonflow-web-master\src\views\production\components\workbench\generate\index.vue`
- `D:\project\短视频\Toonflow-web-master\src\views\production\components\workbench\generate\components\track.vue`
- `D:\project\短视频\Toonflow-web-master\src\views\production\components\workbench\generate\components\imageSelect.vue`
- `D:\project\短视频\Toonflow-web-master\src\views\production\components\workbench\generate\components\video.vue`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\workbench\getGenerateData.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\workbench\generateVideoPrompt.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\workbench\generateVideo.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\workbench\batchGenerateVideo.ts`
- `D:\project\短视频\Toonflow-app-master\src\routes\production\workbench\selectVideo.ts`

剪辑和导出：

- `D:\project\短视频\Toonflow-web-master\src\views\production\components\workbench\editVideo\index.vue`
- `D:\project\短视频\Toonflow-web-master\src\views\production\components\workbench\editVideo\videoPreview.vue`
- `D:\project\短视频\Toonflow-app-master\src\routes\assets\getMaterialData.ts`

## 3. 项目创建和项目配置

### 3.1 项目列表页面

项目列表页面位于 `src/views/project/index.vue`。

页面职责：

1. `onMounted` 时清空当前项目 store，避免打开项目列表后仍残留旧项目上下文。
2. 调用 `/project/getProject` 获取全部项目，写入 `projectStore.allProject`。
3. 以卡片方式展示项目名称、简介、创建时间、项目类型和视觉手册标签。
4. 点击项目卡片时调用 `openProject(project.id)`。
5. 点击编辑按钮时打开项目编辑弹窗。
6. 点击删除按钮时弹确认框，再调用 `/project/delProject`。
7. 删除项目后会清理前端图片缓存 `imageListCacheStore.clearProjectCache(projectId)`。

打开项目不是无条件跳转，会先做模型可用性检查：

1. 从 `allProject` 里找到项目对象。
2. 如果项目不存在，提示 `notFound`。
3. 如果 `imageModel` 或 `videoModel` 缺失，提示模型 provider 不可用，并打开编辑弹窗。
4. 如果存在图像模型，调用 `/modelSelect/getModelDetail` 检查模型详情。
5. 如果存在视频模型，调用 `/modelSelect/getModelDetail` 检查模型详情。
6. 任一模型检查失败，提示模型 provider 不可用，并打开编辑弹窗。
7. 检查通过后，将当前项目写入 `projectStore.project`。
8. `projectType === novel` 时跳转 `/novel`。
9. `projectType === script` 时跳转 `/script`。

### 3.2 新建/编辑项目弹窗

项目弹窗位于 `src/views/project/components/projectDialog.vue`。

核心表单字段：

| 字段 | 说明 | 下游影响 |
| --- | --- | --- |
| `projectType` | 项目类型，`novel` 或 `script` | 决定打开项目后进入小说页还是剧本页 |
| `name` | 项目名称 | 项目卡片、任务和导出展示 |
| `intro` | 项目简介 | 资源 prompt、项目上下文、AI 参考 |
| `type` | 小说/作品类型 | 项目元信息和提示词上下文 |
| `artStyle` | 视觉手册路径 | 资产图、分镜图、视频提示词、Agent 技能加载 |
| `directorManual` | 导演手册路径 | 导演计划、分镜表、分镜面板生成 |
| `videoRatio` | 视频比例 | 分镜图生成比例、视频生成比例、剪辑台画布尺寸 |
| `imageModel` | 图像模型 | 资产图和分镜图生成 |
| `imageQuality` | 图像质量，`1K/2K/4K` | 图片模型 size 参数 |
| `videoModel` | 视频模型 | 视频候选生成 |
| `mode` | 视频模型模式 | 决定视频参考素材类型和数量 |

提交前校验：

1. 项目名称不能为空。
2. 项目类型不能为空。
3. 图像模型不能为空。
4. 视频模型不能为空。
5. 视觉手册不能为空。
6. 导演手册不能为空。
7. 视频比例不能为空。
8. 项目简介不能为空。
9. 图像质量不能为空。
10. 视频模式不能为空。

### 3.3 视觉手册

项目弹窗内可新建/编辑视觉手册。视觉手册不是简单名称，它是一组结构化 Markdown tab。

默认 tab：

- `README`
- `prefix`
- `art_character`
- `art_character_derivative`
- `art_prop`
- `art_prop_derivative`
- `art_scene`
- `art_scene_derivative`
- `director_storyboard`
- `art_storyboard_video`
- `director_planning_style`
- `director_storyboard_table_style`

这些 tab 的用途：

- `art_character`：主角色资产图风格。
- `art_character_derivative`：角色衍生资源图风格。
- `art_prop`：道具资产图风格。
- `art_prop_derivative`：道具衍生资源图风格。
- `art_scene`：场景资产图风格。
- `art_scene_derivative`：场景衍生资源图风格。
- `director_storyboard`：分镜图风格。
- `art_storyboard_video`：视频提示词生成时的视觉约束。
- `director_planning_style`：导演规划风格。
- `director_storyboard_table_style`：分镜表风格。

### 3.4 导演手册

项目弹窗内也可新建/编辑导演手册。默认 tab：

- `README`
- `director_planning_narrative`
- `director_storyboard_table_narrative`

导演手册主要给 Production Agent 的导演规划、分镜表、分镜面板生成使用。

### 3.5 后端新增项目

后端 `routes/project/addProject.ts` 接收：

```ts
{
  projectType: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  imageQuality: string;
  mode: string;
}
```

写入 `o_project`：

- `id` 使用 `Date.now()`。
- `userId` 固定为 `1`。
- `createTime` 使用 `Date.now()`。
- 其他字段直接来自请求体。

### 3.6 后端编辑项目

后端 `routes/project/editProject.ts` 接收项目 `id` 和同一组配置字段，然后更新 `o_project`。

编辑项目不会主动重算已有资源、分镜或视频。模型、比例、手册变化只会影响后续生成行为。已经生成的 `o_storyboard.filePath`、`o_video.filePath` 不会因为项目配置变化自动失效或重生成。

## 4. 剧本管理和资源提取

### 4.1 剧本页职责

剧本页位于 `src/views/script/index.vue`。

它承担这些职责：

1. 新增单集剧本。
2. 批量新增剧本。
3. 编辑剧本内容。
4. 删除剧本。
5. 搜索剧本。
6. 导出剧本。
7. 勾选一个或多个剧本。
8. 对选中剧本执行资源提取。
9. 展示资源提取状态。

资源提取按钮调用：

```ts
axios.post(/script/extractAssets, {
  scriptIds: selectedIds.value,
  projectId: project.value!.id,
  groupSize: otherSetting.value.assetsBatchGenereateSize,
})
```

这里的资源提取入口在剧本页，不在生产画布页。也就是说 Toonflow 的资源提取逻辑是“先从剧本中抽取项目资产，再进入生产画布使用这些资产”。

### 4.2 资源提取后端入参

后端 `routes/script/extractAssets.ts` 校验：

```ts
{
  scriptIds: number[];
  projectId: number;
  groupSize?: number;
}
```

如果 `scriptIds` 为空，直接返回“请先选择剧本”。

### 4.3 资源提取状态流

资源提取会修改 `o_script.extractState`：

| 状态值 | 含义 |
| --- | --- |
| `2` | 等待提取 |
| `0` | 正在提取 |
| `1` | 提取成功 |
| `-1` | 提取失败 |

流程：

1. 接口收到 `scriptIds` 后，先把选中剧本更新为 `extractState = 2`。
2. 真正进入 AI 提取前，再把本批有效剧本更新为 `extractState = 0`。
3. 提取成功后更新为 `extractState = 1`，并清空 `errorReason`。
4. 提取失败后更新为 `extractState = -1`，并写入 `errorReason`。

### 4.4 分组策略

`chunkArray` 的逻辑分两层：

1. 先把 `scriptIds` 每 5 个切成一个小块。
2. 再按 `groupSize` 把这些小块组合成大组。

这样做的目的是控制一次 AI 调用的剧本数量，避免单次 prompt 过长。

### 4.5 AI 提取输入

后端会读取：

1. 当前批次的 `o_script` 内容。
2. 当前项目已有资产 `o_assets.name/type`。
3. 提示词 `o_prompt.type = scriptAssetExtraction`。

然后拼出输入：

```txt
当前已有资产列表：角色A(role)、地点B(scene)、道具C(tool)

===== 【剧本ID: 123】第1集 =====
剧本内容...

===== 【剧本ID: 124】第2集 =====
剧本内容...
```

系统提示要求 AI 从剧本中提取角色、场景、道具，并且必须通过 `resultTool` 返回结构化结果。

### 4.6 AI 提取输出 schema

资源提取接口定义了两个结构：

新资产：

```ts
{
  name: string;
  desc: string;
  type: role | tool | scene;
  scriptIds: number[];
}
```

已有资产引用：

```ts
{
  name: string;
  scriptIds: number[];
}
```

AI 必须调用 `resultTool`，返回：

```ts
{
  newAssets: NewAsset[];
  existingAssetRefs: ExistingAssetRef[];
}
```

注意：这套提取输出没有给新资产返回 `prompt` 字段，只返回 `name/desc/type/scriptIds`。后续图片 prompt 可以在资产图生成前另行生成。

### 4.7 资源提取落库

`persistGroupResult` 的落库逻辑：

1. 查询当前项目已有资产 `o_assets`，建立 `name -> id` 映射。
2. `newAssets` 中如果名称不存在，插入 `o_assets`。
3. 插入字段包括：`name`、`type`、`describe`、`projectId`、`startTime`。
4. 重新查询项目全部资产，建立完整 `name -> id` 映射。
5. 把新资产和已有资产引用都转换成 `scriptId + assetId` 关系。
6. 对同一个 `scriptId + assetId` 去重。
7. 删除本批 `batchScriptIds` 的旧 `o_scriptAssets` 关联。
8. 插入新的 `o_scriptAssets` 关联。
9. 更新本批剧本状态为成功。

重要结论：Toonflow 不是“提取出草稿 -> 用户选择 -> 保存”。它是“AI 提取 -> 直接保存资产和关联”。

### 4.8 这套资源提取的优点和问题

优点：

1. 操作简单，用户只要勾选剧本点提取。
2. 能复用已有资产，减少同名资产重复创建。
3. 一次提取可覆盖多集剧本，资产和剧本关联能批量生成。
4. 后续画布打开时可直接显示当前剧本关联资产。

问题：

1. 没有提取草稿确认，AI 误提取会直接污染资产库。
2. 没有“选择性保存”，用户无法在保存前剔除不需要的角色/场景/道具。
3. 没有“单项重提取”，只能重新提取整批或重新编辑资产。
4. 新资产没有在提取阶段生成 prompt，下游还要补 prompt。
5. 删除本批剧本旧关联再插入新关联，如果 AI 漏掉旧资产，会导致该剧本和旧资产的关联被移除。

对 VT Studio 的启发：可以吸收 Toonflow 的“已有资产复用”和“剧本资产关联”思想，但不建议照搬“直接全部入库”。更稳的方案是增加资源提取草稿层：AI 输出候选资源 -> 用户按角色/场景/道具筛选/编辑/合并 -> 保存入库 -> 写资源关联。

## 5. 资产中心

### 5.1 资产类型

Toonflow 的资产库包含：

| type | 含义 | 用途 |
| --- | --- | --- |
| `role` | 角色 | 角色形象、角色参考图、角色绑定音频 |
| `scene` | 场景 | 场景图、分镜参考图 |
| `tool` | 道具 | 道具图、分镜参考图 |
| `clip` | 视频素材/片段 | 剪辑台可拖拽视频素材 |
| `audio` | 音频素材 | 视频生成音频参考、剪辑台音频素材、角色绑定音频 |

所以不能把资产库理解为只有角色、场景、道具。Toonflow 的资产库同时承担“生成参考资产”和“剪辑素材库”。

### 5.2 资产核心表

| 表 | 用途 |
| --- | --- |
| `o_assets` | 资产本体，保存名称、类型、描述、prompt、父资产 ID、项目 ID、imageId 等 |
| `o_image` | 图片/视频/音频文件记录，保存 filePath、state、model、resolution、errorReason 等 |
| `o_scriptAssets` | 剧本和资产的关联 |
| `o_assets2Storyboard` | 分镜和资产的关联 |
| `o_assetsRole2Audio` | 角色和音频资产绑定 |
| `o_imageFlow` | 图片工作流编辑数据 |

### 5.3 主资产和衍生资产

Toonflow 用 `o_assets.assetsId` 表示父子关系：

```txt
父资产：角色A / 场景B / 道具C
  -> 子资产：角色A-正面造型
  -> 子资产：角色A-战斗服
  -> 子资产：角色A-表情参考
```

父资产通常来自剧本资源提取或资产中心手动新增。子资产通常由 Production Agent 或用户在画布资源节点中新增，用于补齐不同造型、姿态、视角、状态。

### 5.4 资产中心能力

资产中心支持：

1. 按类型 Tab 查看资产。
2. 新增资产。
3. 编辑资产。
4. 删除资产。
5. 批量删除。
6. 单个资产 prompt 生成。
7. 批量资产 prompt 生成。
8. 单个资产图片生成。
9. 批量资产图片生成。
10. 生成状态轮询。
11. 上传 clip 视频素材。
12. 添加 audio 音频素材。
13. 查看和编辑子资源/衍生资源。
14. 角色绑定音频。

### 5.5 资产图生成

资产中心中的资产图生成和生产画布里的衍生资产图生成不是完全同一个入口，但思路相同：

1. 读取项目图像模型、图像质量、视觉手册。
2. 根据资产类型选择对应视觉 prompt。
3. 先生成或整理图片 prompt。
4. 插入 `o_image` 生成中记录。
5. 调用图像模型。
6. 保存图片文件。
7. 更新 `o_image.filePath/state` 和 `o_assets.imageId`。

## 6. 生产画布

### 6.1 画布入口

生产画布页面是 `src/views/production/index.vue`。

它使用 Vue Flow 展示生产节点，节点关系由 `flowBuilder.ts` 构建。

节点包括：

- `script`
- `scriptPlan`
- `assets`
- `storyboardTable`
- `storyboard`
- `workbench`
- `poster` 在代码中有痕迹，但实际被注释或未作为主链路使用。

节点边：

```txt
script -> assets
script -> scriptPlan
scriptPlan -> storyboardTable
storyboardTable -> storyboard
storyboard -> workbench
```

### 6.2 画布按单集工作

画布顶部会选择剧本/集数，内部变量叫 `episodesId`。这个 `episodesId` 实际对应 `o_script.id`，也就是一集剧本的 `scriptId`。

选择集数后调用：

```ts
productionAgentStore().getFlowData()
```

后端接口：

```txt
POST /production/getFlowData
```

入参：

```ts
{
  projectId: number;
  episodesId: number;
}
```

### 6.3 首次打开画布的数据构造

如果 `o_agentWorkData` 里没有该项目和该集的 FlowData，后端会构造默认数据：

```ts
{
  script: scriptData.content,
  scriptPlan: ",
  assets: [...],
  storyboardTable: ",
  storyboard: [],
  workbench: {
    videoList: [],
  }
}
```

其中：

- `script` 来自 `o_script.content`。
- `assets` 来自 `o_scriptAssets -> o_assets -> o_image`。
- `assets.derive` 来自 `o_assets.assetsId` 子资源。
- `storyboard` 初始为空。
- `workbench` 初始只有空视频列表。

### 6.4 已有 FlowData 的刷新规则

如果 `o_agentWorkData` 已有数据，后端不会完全信任 JSON，而是：

1. 解析 `o_agentWorkData.data`。
2. 重新读取 `o_script.content` 覆盖 `flowData.script`。
3. 重新读取当前剧本关联资产覆盖 `flowData.assets`。
4. 重新读取 `o_storyboard` 覆盖 `flowData.storyboard`。
5. 重新读取 `o_assets2Storyboard`，补回每条分镜的 `associateAssetsIds`。
6. 按 `o_storyboard.index` 排序分镜。

这说明 FlowData 不是唯一事实源。真实事实源分散在数据库表：

- 内容：`o_script`
- 资产：`o_assets`、`o_scriptAssets`、`o_image`
- 分镜：`o_storyboard`、`o_assets2Storyboard`
- 视频：`o_videoTrack`、`o_video`

### 6.5 保存画布

保存接口：

```txt
POST /production/saveFlowData
```

入参：

```ts
{
  projectId: number;
  episodesId: number;
  data: FlowData;
}
```

保存逻辑：

1. 如果 `data.storyboard` 中都是已有 id 的分镜，尝试按数组顺序更新 `o_storyboard.index`。
2. 如果没有 `o_agentWorkData`，插入一条：`key = productionAgent`。
3. 如果已有记录，更新 `data = JSON.stringify(data)`。

### 6.6 画布职责边界

Toonflow 的画布不是单纯的“生图/生视频按钮区”，但也不是所有数据的唯一编辑源。

画布负责：

1. 展示当前集剧本内容。
2. 展示当前集关联资源。
3. 管理衍生资源。
4. 展示/保存导演计划。
5. 展示/保存分镜表。
6. 管理分镜面板。
7. 打开视频工作台。
8. 给 Production Agent 提供上下文和写入入口。

画布不负责：

1. 剧本页资源提取的原始入口。
2. 项目级资产库的全部管理。
3. 最终视频文件合成导出。
4. 服务端剪辑或剪映草稿生成。

## 7. Production Agent

### 7.1 Agent 入口

Production Agent 位于：

- `src/agents/productionAgent/index.ts`
- `src/agents/productionAgent/tools.ts`

它会读取：

1. 当前项目 `o_project`。
2. 项目图像模型和视频模型。
3. 视频模型 mode。
4. 视觉手册。
5. 导演手册。
6. 长短期记忆。
7. Production Skills。
8. 当前画布 FlowData。

### 7.2 决策 Agent

`runDecisionAI` 使用模型 `productionAgent:decisionAgent`。

输入包含：

- 系统 prompt：`production_agent_decision.md`。
- Memory：相关记忆、历史摘要、近期对话。
- 模型信息：图像模型、视频模型、是否多参模式。
- 用户消息。

可用工具包含：

- 记忆工具。
- Production Tools。
- 子 Agent 调度工具。

### 7.3 子 Agent

Toonflow 定义了多个子 Agent：

| 工具名 | 作用 |
| --- | --- |
| `run_sub_agent_derive_assets` | 分析并写入衍生资产 |
| `run_sub_agent_generate_assets` | 生成衍生资产图片 |
| `run_sub_agent_director_plan` | 生成导演规划 |
| `run_sub_agent_storyboard_gen` | 生成分镜图 |
| `run_sub_agent_storyboard_panel` | 写入分镜面板 |
| `run_sub_agent_storyboard_table` | 构建分镜表 |
| `run_sub_agent_supervision` | 监制/监督层任务 |

### 7.4 Production Tools

`tools.ts` 提供的主要工具：

| 工具名 | 作用 | 写入目标 |
| --- | --- | --- |
| `get_flowData` | 读取工作区数据 | 不写库 |
| `add_deriveAsset` | 新增或更新衍生资产 | `o_assets`、`o_scriptAssets`、socket 更新前端 |
| `del_deriveAsset` | 删除衍生资产 | `o_assets`、`o_scriptAssets`、socket 更新前端 |
| `generate_deriveAsset` | 生成衍生资产图 | 通过 socket 触发前端/接口 |
| `generate_storyboard` | 生成分镜图 | 通过 socket 触发前端/接口 |
| `add_flowData_storyboard` | 新增分镜面板 | 通过 socket 触发 `addStoryboard` |

### 7.5 Agent 的实现缺口

Toonflow Agent 有可参考的调度思路，但不满足 VT Studio 当前需求文档里的严格要求：

1. 部分写入仍依赖 XML 或自由文本约束。
2. 工具描述不等于完整工具注册表。
3. 缺少统一 `{ ok, flowData?, summary?, error? }` 返回协议。
4. 缺少完整审计日志结构。
5. 缺少统一 idempotency key。
6. 写入动作有 socket 和数据库混合路径，不是全部通过正式 Production Tools。

对 VT Studio 的落地建议：可以参考 Toonflow 的“决策 Agent + 专项子 Agent + 技能加载 + 工具写入”分层，但正式实现必须走需求文档要求的 Production Tools 注册表、schema 校验、审计、快照和任务诊断。

## 8. 分镜面板和分镜入库

### 8.1 分镜节点能力

生产画布的分镜节点位于 `src/views/production/node/storyboard.vue`。

前端能力包括：

1. 展示分镜卡片网格。
2. 勾选分镜。
3. 全选/清空选择。
4. 批量删除分镜。
5. 批量生成分镜图。
6. 单张分镜图点开图片工作流编辑。
7. 支持在两张分镜之间插入新分镜。
8. 编辑分镜 prompt。
9. 编辑分镜 `videoDesc`。
10. 预览分镜宫格。
11. 下载预览图 zip 或合成预览图。

### 8.2 批量新增分镜接口

接口文件：`routes/production/storyboard/batchAddStoryboardInfo.ts`。

入参：

```ts
{
  data: Array<{
    prompt: string;
    duration: number;
    track: string;
    state: string;
    src: string | null;
    videoDesc: string;
    shouldGenerateImage: number;
    associateAssetsIds: number[];
  }>;
  scriptId: number;
  projectId: number;
}
```

### 8.3 分镜入库逻辑

每条分镜写入 `o_storyboard`：

- `prompt`
- `duration`，以字符串保存。
- `state`
- `scriptId`
- `projectId`
- `track`
- `videoDesc`
- `shouldGenerateImage`
- `createTime`

如果分镜有关联资产，则写入 `o_assets2Storyboard`：

```ts
{
  assetId,
  storyboardId,
}
```

### 8.4 分镜和视频轨道关系

Toonflow 在分镜入库阶段就会创建或复用视频轨道。

逻辑：

1. 查询当前 `scriptId` 下全部分镜。
2. 按 `track` 字段分组。
3. 对每个 `track` 计算该组全部分镜的 `duration` 总和。
4. 查询该 `scriptId + track` 是否已有分镜带 `trackId`。
5. 如果已有 `trackId`，复用这个 `o_videoTrack.id`，并更新该轨道 duration。
6. 如果没有，创建一条 `o_videoTrack`，`id` 使用 `Date.now()`。
7. 把该 track 下全部分镜的 `trackId` 更新为该视频轨道 id。

这意味着：

```txt
分镜 track 字段 -> o_videoTrack -> 后续视频生成轨道
```

视频轨道不是视频生成时才创建，而是分镜面板落库时已经创建。

### 8.5 返回数据

接口最后返回当前剧本的全部分镜，字段包括：

- `id`
- `trackId`
- `prompt`
- `duration`
- `state`
- `scriptId`
- `reason`
- `videoDesc`
- `associateAssetsIds`
- `src`

其中 `associateAssetsIds` 通过 `o_assets2Storyboard` 查询得到，`src` 通过 `o_storyboard.filePath` 转小图 URL 得到。

## 9. 分镜图生成

### 9.1 接口入参

接口文件：`routes/production/storyboard/batchGenerateImage.ts`。

入参：

```ts
{
  storyboardIds: number[];
  projectId: number;
  scriptId: number;
  concurrentCount?: number;
  compulsory?: boolean;
}
```

### 9.2 状态准备

后端先读取：

```txt
o_storyboard where scriptId/projectId/id in storyboardIds
```

如果 `compulsory = true`：

- 把这些分镜都更新为 `state = 生成中`。
- 同时设置 `shouldGenerateImage = 1`。

如果 `compulsory = false`：

- `shouldGenerateImage = 0` 的分镜更新为 `state = 未生成`。
- `shouldGenerateImage = 1` 的分镜更新为 `state = 生成中`。

### 9.3 读取项目生成配置

后端读取 `o_project`：

- `imageModel`
- `imageQuality`
- `artStyle`
- `videoRatio`

这些值会转成图像模型调用参数：

- `imageModel` -> `u.Ai.Image(model)`。
- `imageQuality` -> `size`。
- `videoRatio` -> `aspectRatio`。

### 9.4 读取分镜关联资产图

分镜图生成会使用关联资产图作为参考。

查询链路：

```txt
o_assets2Storyboard.storyboardId
  -> assetId
  -> o_assets.imageId
  -> o_image.filePath
  -> oss image base64
```

后端会按 `o_assets2Storyboard.rowid` 顺序恢复关联资产顺序。这样 prompt 中的关联资产顺序和生成参考图顺序尽量一致。

### 9.5 先返回，再后台生成

接口会先返回当前分镜状态数据：

```ts
{
  id,
  prompt,
  associateAssetsIds,
  src: null,
  state,
  videoDesc,
  shouldGenerateImage,
}
```

然后后台按 `concurrentCount` 分批并发生成。

### 9.6 图像模型调用

每条分镜调用：

```ts
u.Ai.Image(projectSettingData.imageModel).run(
  {
    referenceList: getAssetsImageBase64(assetRecord[item.id] || []),
    prompt: item.prompt,
    size: projectSettingData.imageQuality,
    aspectRatio: projectSettingData.videoRatio,
  },
  {
    taskClass: 生成分镜图片,
    describe: 分镜图片生成,
    relatedObjects: JSON.stringify(repeloadObj),
    projectId,
  }
)
```

保存路径：

```txt
/{projectId}/assets/{scriptId}/{uuid}.jpg
```

成功更新：

```ts
o_storyboard.filePath = savePath
o_storyboard.state = 已完成
```

失败更新：

```ts
o_storyboard.filePath = "
o_storyboard.reason = error.message
o_storyboard.state = 生成失败
```

## 10. 衍生资源图生成

### 10.1 入口

接口文件：`routes/production/assets/batchGenerateAssetsImage.ts`。

生产画布资源节点或 Production Agent 可以触发衍生资源图生成。

入参：

```ts
{
  assetIds: number[];
  projectId: number;
  scriptId: number;
  concurrentCount?: number;
}
```

### 10.2 读取数据

后端读取项目配置：

- `imageModel`
- `imageQuality`
- `artStyle`

读取要生成的资产：

- `o_assets.id`
- `o_assets.describe`
- `o_assets.name`
- `o_assets.type`
- `o_assets.assetsId`

如果是子资产，则继续读取父资产：

- 父资产 `describe`
- 父资产关联图片 `o_image.filePath`

### 10.3 按资产类型选择视觉手册 prompt

Toonflow 使用：

| 资产类型 | 视觉手册 key |
| --- | --- |
| `role` | `art_character_derivative` |
| `tool` | `art_prop_derivative` |
| `scene` | `art_scene_derivative` |

### 10.4 生成流程

每个资产先插入一条 `o_image` 占位记录：

```ts
{
  assetsId: item.id,
  type: item.type,
  state: 生成中,
  resolution: projectSettingData.imageQuality,
  model: projectSettingData.imageModel,
}
```

然后更新：

```ts
o_assets.imageId = imageId
```

再用文本模型生成图片 prompt：

```txt
父级资产描述: {parentDescribe || 无详细描述}
当前资产描述: {item.describe || 无详细描述}
```

生成出的文本写回：

```ts
o_assets.prompt = text
```

如果父资产有图，则把父资产图转成 base64，作为参考图。

图片模型调用参数：

```ts
{
  prompt: text,
  size: imageQuality,
  aspectRatio: '16:9',
  referenceList: parentImage ? [{ type: 'image', base64 }] : [],
}
```

保存路径：

```txt
/{projectId}/assets/{scriptId}/{type}/{uuid}.jpg
```

成功：

```ts
o_image.state = 已完成
o_image.filePath = savePath
```

失败：

```ts
o_image.state = 生成失败
o_image.errorReason = error.message
```

## 11. 视频工作台

### 11.1 工作台入口

工作台弹窗位于 `src/views/production/components/workbench/index.vue`。

顶部有三个模式：

| 模式 | 作用 |
| --- | --- |
| `preview` | 快速预览分镜图 |
| `generate` | 视频提示词和视频候选生成 |
| `editVideo` | 剪辑台，最终 WebAV 导出 MP4 |

打开弹窗后根据项目 `videoRatio` 设置画布尺寸：

| videoRatio | canvasWidth | canvasHeight |
| --- | --- | --- |
| `16:9` | 1920 | 1080 |
| `1:1` | 1080 | 1080 |
| `9:16` | 1080 | 1920 |

### 11.2 快速预览

快速预览调用：

```txt
POST /production/getStoryboardData
```

接口文件：`routes/production/storyboard/getStoryboardData.ts`。

入参：

```ts
{
  scriptId: number;
  projectId: number;
}
```

后端读取：

1. `o_storyboard where scriptId/projectId order by index asc`。
2. 把 `o_storyboard.filePath` 转小图 URL。
3. 查询 `o_assets2Storyboard -> o_assets -> o_image`。
4. 按 `storyboardId` 分组，把关联资产作为 `characters` 附到分镜上。

快速预览是分镜图预览，不是最终视频导出。

### 11.3 视频生成页加载数据

视频生成页调用：

```txt
POST /production/workbench/getGenerateData
```

接口文件：`routes/production/workbench/getGenerateData.ts`。

入参：

```ts
{
  projectId: number;
  scriptId: number;
}
```

后端读取 `o_project.videoModel/mode`。如果 `videoModel` 缺失，返回错误。

`mode` 可能是普通字符串，也可能是 JSON 字符串数组。例如：

```ts
singleImage
startEndRequired
text
["imageReference:2","audioReference:1"]
```

如果解析后是数组，就按多参考模式处理。

### 11.4 getGenerateData 的分镜聚合

后端查询当前剧本分镜：

```txt
o_storyboard where scriptId/projectId order by index asc
```

然后按 `trackId` 聚合：

```ts
storyboardTrackRecord[trackId].push({
  src: filePathSmallUrl,
  fileType: 'image',
  sources: 'storyboard',
  prompt: videoDesc,
  id: storyboard.id,
  index: storyboard.index,
})
```

这些就是视频轨道里的分镜参考素材。

### 11.5 getGenerateData 的资产参考聚合

如果视频模式是多参考数组，后端会进一步查询分镜关联资产：

```txt
o_assets2Storyboard
  -> o_assets
  -> o_image
```

形成资产参考项：

```ts
{
  id,
  name,
  describe,
  type,
  fileType: 'image',
  sources: 'assets',
  src,
}
```

如果模式包含 `audioReference:n`，还会查 `o_assetsRole2Audio`，把角色绑定的音频资产加进当前 track 的参考素材里：

```ts
{
  id,
  name,
  describe,
  type,
  fileType: 'audio',
  sources: 'assets',
  prompt,
  src,
}
```

### 11.6 getGenerateData 的轨道和候选视频

后端读取：

```txt
o_videoTrack where projectId/scriptId
o_video where videoTrackId in trackIds
```

每条 track 返回：

```ts
{
  id,
  duration,
  prompt,
  state,
  reason,
  selectVideoId,
  medias,
  videoList,
}
```

`medias` 组合顺序大致是：

1. 有图片 URL 的资产参考。
2. 分镜图参考。
3. 没有图片 URL 的资产参考。

`videoList` 来自 `o_video`，每条候选包含：

- `id`
- `src`
- `state`
- `errorReason`

### 11.7 视频参考素材来源

前端参考素材有两类来源：

| sources | 来源表 | 用途 |
| --- | --- | --- |
| `storyboard` | `o_storyboard.filePath` | 分镜图作为视频参考图 |
| `assets` | `o_assets + o_image` | 角色/场景/道具/clip/audio 作为参考素材 |

前端保存选择时只需要记录 `{ id, sources }`，后端根据 `sources` 决定去哪个表取文件。

## 12. 视频提示词生成

### 12.1 接口入参

接口文件：`routes/production/workbench/generateVideoPrompt.ts`。

入参：

```ts
{
  trackId: number;
  projectId: number;
  info: Array<{
    id: number;
    sources: string;
  }>;
  model: string;
  mode: string;
}
```

### 12.2 生成前状态

接口开始时更新：

```ts
o_videoTrack.state = 生成中
```

### 12.3 读取参考素材信息

对 `info` 中每个条目：

如果 `sources === storyboard`：

1. 查 `o_storyboard.id`。
2. 读取 `videoDesc`、`prompt`、`track`、`duration`、`shouldGenerateImage`。
3. 查 `o_assets2Storyboard` 获取该分镜关联资产 id。

如果 `sources === assets`：

1. 查 `o_assets`。
2. 联表 `o_image`。
3. 读取资产 `id/type/name/filePath`。

### 12.4 选择视频提示词模板

模板优先级：

1. 查询 `o_modelPrompt`，按 `vendorId + model` 找绑定模板。
2. 如果绑定模板存在，从本地 `modelPrompt` 目录读取文件内容。
3. 如果没有绑定模板，按模型名称和 mode 自动匹配：
   - `wan` 且 `2.6`：`wan2.6Single-imageFirstFrameMode.md`
   - `seedance2`：`seedance2Multi-parameterMode.md`
   - 首尾帧模式：`universalFirstAndLastFrameMode.md`
   - JSON 数组多参考模式：`universalMulti-parameterMode.md`
4. 如果仍无模板，fallback 到 `o_prompt.type = videoPromptGeneration`。

### 12.5 拼接 AI 输入

后端读取项目 `artStyle`，再通过：

```ts
u.getArtPrompt(artStyle, 'art_skills', 'art_storyboard_video')
```

拿到视觉手册中的分镜视频风格。

用户内容大致包含：

```txt
模型名称：{modelData}

资产信息（角色、场景、道具、音频）：
[id,type,name audio:id]

分镜信息：
<storyboardItem videoDesc='...' duration='...'></storyboardItem>
```

然后调用文本模型：

```ts
u.Ai.Text(universalAi).invoke({
  system: videoPromptGeneration,
  messages: [
    { role: assistant, content: visualManual },
    { role: user, content },
  ],
})
```

成功更新：

```ts
o_videoTrack.state = 已完成
o_videoTrack.prompt = text
```

失败更新：

```ts
o_videoTrack.state = 生成失败
o_videoTrack.reason = error.message
```

## 13. 视频候选生成

### 13.1 单条视频生成接口

接口文件：`routes/production/workbench/generateVideo.ts`。

入参：

```ts
{
  projectId: number;
  scriptId: number;
  uploadData: Array<{
    id: number;
    sources: string;
  }>;
  prompt: string;
  model: string;
  mode: string;
  resolution: string;
  duration: number;
  audio?: boolean;
  trackId: number;
}
```

### 13.2 读取参考素材文件

如果参考素材来源是 `storyboard`：

```txt
o_storyboard.id -> filePath
```

如果来源是 `assets`：

```txt
o_assets.id -> o_image.filePath / o_image.type
```

然后转为 base64 referenceList：

```ts
{
  base64: await u.oss.getImageBase64(item.path),
  type: item.sources == audio ? audio : image,
}
```

注意：代码里用 `item.sources == audio` 判断音频，但前面 `sources` 一般是 `assets` 或 `storyboard`，真正音频类型来自 `o_image.type`。这是参考项目实现里的一个不严谨点。

### 13.3 插入候选视频记录

视频保存路径：

```txt
/{projectId}/video/{uuid}.mp4
```

先插入 `o_video`：

```ts
{
  filePath: videoPath,
  time: Date.now(),
  state: 生成中,
  scriptId,
  projectId,
  videoTrackId: trackId,
}
```

接口马上返回 `videoId`，不等待视频模型完成。

### 13.4 后台调用视频模型

后台调用：

```ts
u.Ai.Video(model).run(
  {
    prompt,
    referenceList,
    mode,
    duration,
    aspectRatio: project.videoRatio || 16:9,
    resolution,
    audio,
  },
  {
    projectId,
    taskClass: 视频生成,
    describe: 根据提示词生成视频,
    relatedObjects: JSON.stringify({ projectId, videoId, scriptId, type: 视频 }),
  }
)
```

成功：

1. `aiVideo.save(videoPath)` 保存 MP4。
2. 更新 `o_video.state = 生成成功`。

失败：

```ts
o_video.state = 生成失败
o_video.errorReason = error.message
```

### 13.5 批量视频生成接口

接口文件：`routes/production/workbench/batchGenerateVideo.ts`。

入参和单条类似，但按 track 批量传：

```ts
{
  projectId: number;
  scriptId: number;
  trackData: Array<{
    uploadData: Array<{ id: number; sources: string }>;
    trackId: number;
    prompt: string;
    duration: number;
  }>;
  model: string;
  mode: string;
  resolution: string;
  audio?: boolean;
}
```

逻辑：

1. 为每个 track 查询参考素材。
2. 为每个 track 插入一条 `o_video state=生成中`。
3. 立即返回 `{ videoId, trackId }[]`。
4. 后台逐个调用视频模型。
5. 成功保存视频并更新状态。
6. 失败写入 `errorReason`。

### 13.6 状态检查和候选展示

前端会轮询视频状态。生成完成后，候选视频出现在当前 track 的 `videoList` 中。

状态字段存在不一致：

- 数据库里成功状态是 `生成成功`。
- 前端部分逻辑会映射为 `已完成`。
- 生成中和失败分别是 `生成中`、`生成失败`。

VT Studio 如果参考这套实现，应统一状态枚举，避免数据库、接口、前端三套状态互相映射。

### 13.7 选择候选视频

接口文件：`routes/production/workbench/selectVideo.ts`。

入参：

```ts
{
  trackId: number;
  videoId: number;
}
```

后端只更新：

```ts
o_videoTrack.videoId = videoId
```

这就是“选择当前轨道最终采用哪个视频候选”。它不会复制文件，也不会生成 timeline，更不会导出最终片。

### 13.8 候选视频下载

视频生成页支持候选视频单个下载和批量下载已选择视频 zip。这属于候选素材下载，不是最终合成导出。

## 14. 剪辑台素材加载

### 14.1 进入剪辑台

工作台切到 `editVideo` 时调用：

```txt
POST /assets/getMaterialData
```

接口文件：`routes/assets/getMaterialData.ts`。

入参：

```ts
{
  projectId: number;
  scriptId?: number;
}
```

### 14.2 加载 clip 素材

接口先查询项目内 `clip` 类型资产：

```txt
o_assets
  leftJoin o_image on o_assets.id = o_image.assetsId
  where o_assets.type = clip
  and o_assets.projectId = projectId
```

然后把每条素材的 `filePath` 转成可访问 URL。

接口还会额外加入本地片尾视频：

```ts
{
  id: 0,
  name: Toonflow片尾,
  filePath: await u.oss.getFileUrl(/ending.mp4, assets),
  type: clip,
}
```

### 14.3 加载轨道候选视频

接口查询当前剧本的视频轨道：

```txt
o_videoTrack where scriptId/projectId
```

对每条轨道查询成功候选：

```txt
o_video where videoTrackId = track.id and state = 生成成功
```

返回结构：

```ts
{
  data: clipAssetsAndEnding,
  video: Array<{
    id: trackId,
    videoId: selectedVideoId,
    video: Array<{
      id,
      filePath,
      videoTrackId,
    }>;
  }>;
}
```

### 14.4 前端素材分类

前端 `workbench/index.vue` 会按文件扩展名判断素材类型：

- 图片：`png/jpg/jpeg/gif/webp/bmp/svg`
- 视频：`mp4/webm/ogg/mov/avi/mkv`
- 音频：`mp3/wav/ogg/aac/flac/m4a`

然后拆成四类传给剪辑台：

| 前端变量 | 来源 | 说明 |
| --- | --- | --- |
| `initialVideoItems` | `data.video` | 轨道生成出的候选视频 |
| `mockMediaItems` | `data.data` 中视频扩展名 | clip 视频素材和片尾 |
| `mockAudioItems` | `data.data` 中音频扩展名 | 音频素材 |
| `mockImageItems` | `data.data` 中图片扩展名 | 图片素材 |

`initialVideoItems` 会标记 `selected: item.videoId == subItem.id`，用于表示该 track 当前选中的候选。

## 15. 剪辑台内部实现

### 15.1 技术栈

剪辑台核心文件：

- `src/views/production/components/workbench/editVideo/index.vue`
- `src/views/production/components/workbench/editVideo/videoPreview.vue`

使用库：

- `vue-clip-track`：时间线、轨道、clip 管理。
- `@webav/av-canvas`：画布预览和合成。
- `@webav/av-cliper`：MP4、音频、图片、文本渲染等 clip 能力。

### 15.2 默认轨道

剪辑台创建默认轨道：

```ts
[
  { type: video, name: 主轨道, order: 0, isMain: true },
  { type: audio, name: 音频, order: 2 },
  { type: subtitle, name: 字幕, order: 3 },
  { type: filter, name: 滤镜, order: 4 },
]
```

用户可以把左侧媒体库素材拖到轨道上。时间线状态由 `vue-clip-track` 的 store 管理。

### 15.3 支持的 clip 类型

`videoPreview.vue` 会把轨道中的 clip 同步成 WebAV sprite。支持类型：

- `video`
- `audio`
- `image`
- `sticker`
- `subtitle`
- `text`

### 15.4 video clip 处理

视频素材处理逻辑：

1. `fetch(mediaClip.sourceUrl)` 获取视频流。
2. 创建 `MP4Clip(response.body, { audio: { volume } })`。
3. 等待 `mp4Clip.ready`。
4. 处理 `trimStart` 和 `trimEnd`。
5. 如果需要裁剪，调用 `mp4Clip.split()`。
6. 设置滤镜或特效 `tickInterceptor`。
7. 创建 `VisibleSprite(mp4Clip)`。
8. 设置时间线位置：`offset = startTime * 1e6`，`duration = (endTime - startTime) * 1e6`，`playbackRate = playbackRate`。

### 15.5 audio clip 处理

音频素材处理逻辑：

1. `fetch(mediaClip.sourceUrl)` 获取音频流。
2. 创建 `AudioClip(response.body, { volume })`。
3. 等待 `audioClip.ready`。
4. 处理 `trimStart/trimEnd`。
5. 创建 `VisibleSprite(audioClip)`。
6. 设置 offset、duration、playbackRate。

虽然音频没有可视区域，但仍通过 sprite 参与 WebAV 合成。

### 15.6 image / sticker clip 处理

图片和贴纸处理逻辑：

1. `fetch(sourceUrl)`。
2. 转 `blob`。
3. `createImageBitmap(blob)`。
4. 创建 `ImgClip(imageBitmap)`。
5. 设置滤镜或特效 `tickInterceptor`。
6. 创建 `VisibleSprite(imgClip)`。
7. 设置时间线 offset 和 duration。
8. 根据原图尺寸计算默认显示 rect，居中放到画布里。

### 15.7 subtitle / text clip 处理

字幕和文本处理逻辑：

1. 读取文本内容、字号、字体、颜色、背景、对齐方式。
2. 拼出 CSS 文本。
3. 调用 `renderTxt2ImgBitmap(text, cssText)` 把文字渲染成图片 bitmap。
4. 创建 `ImgClip(imgBitmap)`。
5. 创建 `VisibleSprite(imgClip)`。
6. 如果没有保存 rect，则默认放在画布底部居中。
7. 设置 offset 和 duration。

### 15.8 空间属性同步

如果 clip 保存了 `rect`，会同步到 sprite：`x/y/w/h/angle/fixedAspectRatio/fixedScaleCenter`。

还会同步 `opacity`、`visible`、`flip`、`zIndex`。字幕轨道会被设置更高 zIndex，保证字幕在画面上方。

### 15.9 syncClipsToCanvas

`syncClipsToCanvas()` 的职责：

1. 检测转场关系。
2. 收集所有可渲染 clip。
3. 删除时间线里已经不存在的 sprite。
4. 判断已有 sprite 是否因裁剪、速度等变化需要重建。
5. 更新已有 sprite 的时间、rect、透明度、可见性、翻转、层级。
6. 为新 clip 创建 sprite 并加入 `AVCanvas`。
7. 建立 `clipId -> sprite`、`clipId -> track` 映射。
8. 更新调试数据。

这一步保证剪辑台时间线和 WebAV 预览画布一致。

## 16. 最终导出 MP4

### 16.1 导出按钮

导出按钮位于 `editVideo/index.vue` 的 `scale-append` 插槽中。

按钮点击调用 `handleExport()`。它会防止重复导出，调用 `videoPreviewRef.value.exportVideo()`，成功提示导出成功，失败提示导出失败。

### 16.2 exportVideo 实现

最终导出函数在 `videoPreview.vue`。

逻辑：

1. 如果 `avCanvas` 未初始化，抛出错误。
2. 如果 `clipSpriteMap.size === 0`，说明没有可导出内容，抛出错误。
3. 如果正在播放，先暂停 `avCanvas` 和 `playbackStore`。
4. 调用 `avCanvas.createCombinator()`。
5. 读取 `combinator.output().getReader()`。
6. 把 stream chunk 收集成 `Uint8Array[]`。
7. 创建 `Blob(chunks, { type: video/mp4 })`。
8. `URL.createObjectURL(blob)` 得到临时 URL。
9. 创建 `<a>` 标签并设置 `download = WebAV-export-{Date.now()}.mp4`。
10. 调用 `a.click()` 下载。
11. `URL.revokeObjectURL(url)` 释放临时 URL。

### 16.3 导出边界

这个导出有几个重要边界：

1. 它是浏览器端导出，不是服务端导出。
2. 它导出的是 MP4，不是剪映草稿。
3. 没有看到导出历史写库。
4. 没有看到导出任务记录。
5. 没有服务端 FFmpeg 合成。
6. 没有导出目录管理。
7. 没有导出快照。
8. 没有项目包或诊断包。

所以 Toonflow 可以参考“剪辑台时间线 + WebAV 前端合成”的实现思路，但不能作为 VT Studio 需求文档里“剪映草稿导出/导出历史/导出快照”的完整参考。

## 17. 核心数据库表总览

| 表名 | 作用 | 关键字段 |
| --- | --- | --- |
| `o_project` | 项目配置 | `id`、`projectType`、`name`、`intro`、`type`、`artStyle`、`directorManual`、`videoRatio`、`imageModel`、`videoModel`、`imageQuality`、`mode` |
| `o_script` | 剧本/单集内容 | `id`、`projectId`、`name`、`content`、`extractState`、`errorReason` |
| `o_assets` | 资产本体 | `id`、`projectId`、`name`、`type`、`describe`、`prompt`、`assetsId`、`imageId` |
| `o_image` | 媒体文件记录 | `id`、`assetsId`、`filePath`、`type`、`state`、`model`、`resolution`、`errorReason` |
| `o_scriptAssets` | 剧本和资产关系 | `scriptId`、`assetId` |
| `o_agentWorkData` | 画布 FlowData | `projectId`、`episodesId`、`key`、`data` |
| `o_storyboard` | 分镜 | `id`、`projectId`、`scriptId`、`prompt`、`videoDesc`、`duration`、`track`、`trackId`、`filePath`、`state`、`reason`、`shouldGenerateImage`、`index` |
| `o_assets2Storyboard` | 分镜和资产关系 | `storyboardId`、`assetId` |
| `o_videoTrack` | 视频轨道 | `id`、`projectId`、`scriptId`、`duration`、`prompt`、`state`、`reason`、`videoId` |
| `o_video` | 视频候选 | `id`、`projectId`、`scriptId`、`videoTrackId`、`filePath`、`state`、`errorReason`、`time` |
| `o_assetsRole2Audio` | 角色和音频绑定 | `assetsRoleId`、`assetsAudioId` |
| `o_imageFlow` | 图片编辑工作流 | `id`、工作流数据 |

## 18. 从用户操作角度还原完整路径

1. 用户进入项目页，点击新建项目，填写项目名称、简介、类型、图像模型、视频模型、视频模式、图像质量、视频比例、视觉手册和导演手册。
2. 前端校验通过后调用 `/project/addProject`，后端写入 `o_project`。
3. 用户点击项目卡片，前端检查图像模型和视频模型是否可用。
4. 模型可用后进入 `/script` 或 `/novel`。
5. 如果是剧本项目，用户在剧本页新增或导入多集剧本，剧本保存到 `o_script`。
6. 用户在剧本页勾选一集或多集，点击提取资产，前端调用 `/script/extractAssets`。
7. 后端把剧本置为等待/运行状态，读取已有资产和剧本内容，让 AI 通过 `resultTool` 返回新资产和已有资产引用。
8. 后端直接写入 `o_assets` 和 `o_scriptAssets`。
9. 用户进入 production 页面，选择具体剧本/集数，前端调用 `/production/getFlowData`。
10. 后端读取 `o_script`、`o_scriptAssets`、`o_assets`、`o_image`、`o_storyboard`、`o_assets2Storyboard`，组装 FlowData 返回。
11. 用户或 Production Agent 生成导演计划 `scriptPlan`，保存到 `o_agentWorkData.data`。
12. 用户或 Production Agent 生成分镜表 `storyboardTable`，保存到 `o_agentWorkData.data`。
13. Production Agent 或用户新增分镜面板，调用 `/production/storyboard/batchAddStoryboardInfo`。
14. 后端写入 `o_storyboard`，写入 `o_assets2Storyboard`，按 `track` 创建或复用 `o_videoTrack`。
15. 用户在资源节点选择衍生资源，触发 `/production/assets/batchGenerateAssetsImage`，生成衍生资源图。
16. 用户在分镜节点勾选分镜，点击批量生成，调用 `/production/storyboard/batchGenerateImage`。
17. 后端读取分镜、项目图像配置、分镜关联资产图，把资产图作为参考图调用图像模型，成功后更新 `o_storyboard.filePath/state`。
18. 用户打开工作台，切到视频生成，前端调用 `/production/workbench/getGenerateData`。
19. 后端返回分镜列表、视频轨道列表、每条轨道的参考素材和候选视频历史。
20. 用户选择分镜图或资产素材作为视频参考，前端保存参考项为 `{ id, sources }`。
21. 用户点击生成提示词，调用 `/production/workbench/generateVideoPrompt`。
22. 后端读取参考素材、分镜信息、资产信息、项目视觉手册、模型专用模板，用文本模型生成视频 prompt，写回 `o_videoTrack.prompt`。
23. 用户点击生成视频，调用 `/production/workbench/generateVideo` 或批量接口。
24. 后端先插入 `o_video state=生成中` 并立即返回 `videoId`，后台调用视频模型。
25. 视频生成成功后保存 mp4，更新 `o_video.state=生成成功`。
26. 用户在某条轨道的视频候选列表中点选择，前端调用 `/production/workbench/selectVideo`。
27. 后端更新 `o_videoTrack.videoId = videoId`。
28. 用户切到 `editVideo`，前端调用 `/assets/getMaterialData`。
29. 后端返回 clip 素材、本地片尾、各轨道生成成功的视频候选。
30. 前端拆成视频、音频、图片和候选视频素材。
31. 用户把候选视频、clip、音频、图片拖到时间线。
32. `vue-clip-track` 管理轨道和 clip 状态，`videoPreview.vue` 同步到 `AVCanvas` 做预览。
33. 用户点击导出视频，前端调用 `videoPreview.exportVideo()`。
34. WebAV 在浏览器端把当前 AVCanvas 合成为 MP4 Blob，并下载 `WebAV-export-{timestamp}.mp4`。

## 19. Toonflow 实现的主要缺口

这些缺口不是说 Toonflow 不能用，而是说明它不能直接作为 VT Studio 重构验收标准：

1. 资源提取直接入库，没有提取草稿、选择性保存、合并确认和单项重提取。
2. 画布 FlowData 和数据库表混合为事实源，边界不够清晰。
3. Agent 写入不是全部通过强注册表 Production Tools。
4. Agent 仍存在 XML/自由文本约束，不是全链路 schema 输出。
5. 工具调用缺少完整审计、快照、幂等和标准返回格式。
6. 状态枚举不统一，例如视频成功有 `生成成功` 和 `已完成` 的前后端映射。
7. 视频 referenceList 的音频类型判断存在不严谨点。
8. 最终导出只有浏览器 MP4 下载，没有服务端导出、剪映草稿、导出历史、导出快照和诊断包。
9. 仍使用 `scriptId`、`episodesId` 等旧语义，不符合 VT Studio 生产 API 对外统一 `contentId` 的要求。

## 20. VT Studio 落地建议

### 20.1 资源提取应比 Toonflow 更强

不建议照搬 Toonflow 的“全部提取、全部保存”。更适合 VT Studio 的流程：

```txt
点击提取资源
  -> 创建资源提取任务
  -> AI 输出 ResourceExtractionDraft
  -> 前端展示提取结果面板
  -> 用户按角色/场景/道具筛选、编辑、合并、删除
  -> 用户确认保存
  -> 写 production_resources / production_resource_links
  -> 画布资源节点刷新
```

面板应支持：

1. 按角色、场景、道具分组。
2. 展示“新资产”和“匹配已有资产”。
3. 对每个候选选择保存/不保存。
4. 对每个候选编辑名称、描述、prompt、类型。
5. 对候选资产合并到已有资产。
6. 支持单个资源重新提取。
7. 支持单个资源重新生成 prompt。
8. 支持保存后进入资产详情继续编辑。

### 20.2 画布职责建议

画布应该负责生产编排和确认，不应该承担所有资源提取细节。

建议职责：

1. 显示当前内容的生产状态。
2. 展示已确认资源。
3. 允许从画布打开资源提取面板。
4. 允许对单个资源生成/重生成图片。
5. 允许管理衍生资源。
6. 允许管理导演计划和分镜表。
7. 允许管理分镜和关联资产。
8. 允许进入视频工作台。
9. 所有写入都通过 Production Workflow Orchestrator 和 Production Tools。

### 20.3 视频链路建议

Toonflow 的视频链路可以参考：

```txt
分镜 -> track -> 视频提示词 -> 视频候选 -> 选择候选
```

但 VT Studio 应补强：

1. 轨道和候选视频用 `contentId` 对外，不暴露 `scriptId`。
2. 视频提示词生成要有 schema、快照和任务诊断。
3. 视频候选生成要记录 requestId、模型、prompt、参考素材、手册、skill 版本。
4. 选择候选要写审计。
5. 导出层只读取已选择候选，不反向修改资源、分镜或视频候选。

### 20.4 导出层建议

Toonflow 的 WebAV MP4 导出可作为前端预览或轻量导出参考，但 VT Studio 需求文档要求更正式的导出层。

VT Studio 应实现：

1. 导出前校验。
2. 从已选视频候选构建 timeline。
3. 导出快照。
4. 导出任务记录。
5. 导出历史。
6. 导出详情。
7. 打开导出目录。
8. 复制导出路径。
9. 剪映草稿包导出。
10. 失败原因和诊断记录。

### 20.5 不应照搬和建议吸收

不建议照搬：

1. 资源提取直接落库。
2. FlowData 和数据库互相覆盖但缺少明确主从关系。
3. Agent XML 写入。
4. 状态枚举混用。
5. 浏览器端导出作为唯一正式导出。
6. 对 renderer 暴露 `scriptId/scriptIds/episodesId`。

建议吸收：

1. 项目配置里绑定图像模型、视频模型、视频模式、视觉手册、导演手册。
2. 资产库包含角色、场景、道具、视频素材、音频素材。
3. 分镜和资产建立显式关联。
4. 分镜 track 自动形成视频轨道。
5. 视频工作台按 track 生成提示词和候选视频。
6. 候选视频可选择最终结果。
7. 剪辑台可复用已选候选和素材库。

## 21. 与 VT Studio 当前需求文档的映射

| 需求文档目标 | Toonflow 做法 | VT Studio 应做法 |
| --- | --- | --- |
| 生产 API 对外统一 `contentId` | 使用 `scriptId/episodesId` | 对 renderer/preload/shared 只暴露 `contentId`，内部兼容映射旧列 |
| 资源提取 | 剧本页直接提取并入库 | 提取草稿 -> 用户确认 -> 保存资源和关联 |
| 资产库 | role/scene/tool/clip/audio | 保留并强化，统一资源 schema 和资源链接表 |
| 画布 | FlowData + 数据库混合 | Orchestrator 统一工作流状态和写入口 |
| Production Agent | 决策 Agent + 子 Agent + 部分工具 | 全部写入必须走 Production Tools 注册表 |
| 分镜 | `o_storyboard` + `o_assets2Storyboard` | 正式 storyboards schema + validator + 快照 |
| 视频候选 | `o_videoTrack` + `o_video` | 视频轨道、候选、选择结果都要 schema、任务和审计 |
| 导出 | WebAV 前端 MP4 下载 | 剪映草稿导出、导出历史、导出快照、导出诊断 |
| 任务诊断 | 模型调用带部分 taskClass | 每个模型调用和 Agent 写入记录 requestId、模型、prompt、手册、skill、资源引用 |

## 22. 最终判断

Toonflow 的参考价值主要在生产链路拆分和视频工作台：它把“剧本 -> 资产 -> 分镜 -> 分镜图 -> 视频轨道 -> 候选视频 -> 剪辑台”串起来了，尤其是 `o_storyboard`、`o_videoTrack`、`o_video` 的关系值得参考。

但它不是一个可直接照搬的正式生产线实现。对 VT Studio 来说，必须在 Toonflow 的基础上补上三件事：

1. 资源提取从“直接入库”升级为“可审核、可选择、可单项重提取”的资源提取面板。
2. 所有画布、Agent、AI 工具库写入统一进入 Production Workflow Orchestrator 和 Production Tools。
3. 导出从“浏览器下载 MP4”升级为正式导出层：校验、timeline、剪映草稿、历史、快照、诊断。

## 23. 关键能力矩阵：资源、编辑、重生成和手册影响

这一章专门回答“用户到底能不能做某个具体操作”。前面章节写的是链路，这里写能力边界。

### 23.1 资源提取能提取什么

Toonflow 的剧本资源提取接口 `/script/extractAssets` 只提取三类生产资产：

| 类型 | type | 是否由剧本提取产生 | 说明 |
| --- | --- | --- | --- |
| 角色 | `role` | 是 | 有名字、有持续视觉意义的角色 |
| 场景 | `scene` | 是 | 剧本中出现的地点、空间、环境 |
| 道具 | `tool` | 是 | 有独立视觉意义或剧情功能的物件 |
| 视频素材 | `clip` | 否 | 资产库可管理，但不是剧本资源提取产物 |
| 音频素材 | `audio` | 否 | 资产库可管理，可绑定角色，但不是剧本资源提取产物 |

资源提取 AI 输出结构是：

```ts
{
  newAssets: Array<{
    name: string;
    desc: string;
    type: 'role' | 'scene' | 'tool';
    scriptIds: number[];
  }>;
  existingAssetRefs: Array<{
    name: string;
    scriptIds: number[];
  }>;
}
```

所以提取阶段不会产出图片，也不会产出音频、视频素材、衍生资源图、分镜图或视频候选。

### 23.2 资源提取能不能选择保存

不能。

Toonflow 的 `/script/extractAssets` 是直接保存型流程：

```txt
勾选剧本 -> 点击提取资产 -> AI 返回 newAssets/existingAssetRefs -> 直接写 o_assets 和 o_scriptAssets
```

用户不能在提取结果保存前：

1. 勾选哪些资源要保存。
2. 删除某个 AI 提取出的资源。
3. 合并某个新资源到已有资源。
4. 修改名称、描述、类型后再保存。

但保存后，用户可以在资产中心继续编辑和删除。

对 VT Studio 的建议：不要照搬这个点。更好的流程是“提取草稿 -> 用户确认/编辑/合并 -> 保存”。

### 23.3 资源能不能编辑

能。

资产中心后端 `/assets/updateAssets` 支持更新：

```ts
{
  id: number;
  name: string;
  describe: string;
  remark?: string | null;
  prompt?: string | null;
}
```

也就是说，资源保存后可以编辑：

1. 名称。
2. 描述。
3. 备注。
4. 图片生成 prompt。

资源图片也可以通过生成弹窗选择新的候选图，或上传自定义图片后保存到该资产。

### 23.4 能不能某一项重新提取

不能按“某一个资源项”重新提取。

Toonflow 的资源提取入口是按剧本选择的：`scriptIds`。它支持重新对某一集或多集剧本执行提取，但不是对某个资源项单独重新提取。

重新提取某集剧本时，后端会删除本批剧本旧的 `o_scriptAssets` 关联，再插入本次 AI 返回的新关联。这意味着：

1. 可以通过重新提取某集刷新该集的资源关联。
2. 不能只对“某个角色/某个场景/某个道具”重新跑资源识别。
3. 如果 AI 新结果漏掉某个旧关联，这个剧本和旧资产的关联可能被移除。

对 VT Studio 的建议：应支持“单项重新提取/重新识别/重新匹配已有资产”。

### 23.5 能不能单项生成或重新生成 prompt

能。

资产中心单项生成 prompt 调用 `/assetsGenerate/polishAssetsPrompt`。

批量生成 prompt 调用 `/assetsGenerate/batchPolishAssetsPrompt`。

生成 prompt 时会根据资产类型和是否衍生资源选择不同视觉手册 key：

| 资产 | 主资产 prompt | 衍生资产 prompt |
| --- | --- | --- |
| 角色 | `art_character` | `art_character_derivative` |
| 场景 | `art_scene` | `art_scene_derivative` |
| 道具 | `art_prop` | `art_prop_derivative` |

单项重新生成 prompt 的结果会写回 `o_assets.prompt`，并更新 `promptState`。

### 23.6 能不能单项出图或重新出图

能。

资产中心单项图片生成弹窗 `generateImage.vue` 支持：

1. 上传一张参考图，可选。
2. 手动编辑 prompt。
3. 点击“智能生成”重新生成 prompt。
4. 选择图像模型。
5. 选择分辨率 `1K/2K/4K`。
6. 点击生成图片。
7. 查看历史生成结果。
8. 从历史结果中选择一张作为当前资产图。
9. 删除某张历史结果图。
10. 自定义上传一张图片作为资产图。

单项生成调用 `/assetsGenerate/generateAssets`，每次点击生成会插入一条新的 `o_image` 记录。用户可以重复点击生成，因此可以积累多张候选图，但“一次点击”只生成一张。

保存选择调用 `/assets/saveAssets`，本质是把 `o_assets.imageId` 指向选中的 `o_image.id`，或把用户上传的 base64 写成一张新图再选中。

### 23.7 出图一次几张

Toonflow 不是“一次生成 4 张候选”的模式。它大多数生成动作都是“一次一个目标生成一张”。

| 场景 | 一次生成几张 | 说明 |
| --- | --- | --- |
| 资产中心单项生成 | 1 张 | 每点一次生成一个 `o_image` 候选 |
| 资产中心批量生成 | 每个选中资产 1 张 | 选 10 个资产就是生成 10 张，每个资产 1 张 |
| 生产画布衍生资源批量生成 | 每个选中衍生资源 1 张 | 并发数由 `assetsBatchGenereateSize` 控制 |
| 分镜图批量生成 | 每个选中分镜 1 张 | 选 20 个分镜就是 20 张 |
| 图片工作流生成节点 | 每点一次 1 张 | 可以新增多个生成节点或反复生成 |
| 视频单轨生成 | 每次 1 个视频候选 | 再点一次会多一个候选 |
| 视频批量生成 | 每个选中 track 1 个候选 | 选多个 track 时每个 track 生成 1 个视频 |

`assetsBatchGenereateSize` 控制的是并发/分组数量，不是“每个资产一次出几张”。

### 23.8 能不能选择图片保存

能，但不是在资源提取阶段。

资产中心图片生成弹窗会读取该资产所有 `o_image` 历史结果，用户可以点选其中一张，再点击确认保存。保存后 `o_assets.imageId` 指向这张图。

图片工作流里也能生成新图，点击“保留”后回写到对应分镜或衍生资源。

### 23.9 画布里资源图能不能编辑或重新生成

部分能。

画布资源节点展示两层：

1. 原始资产：来自 `o_scriptAssets -> o_assets`。
2. 衍生资源：挂在 `o_assets.assetsId` 下。

资源节点里：

1. 原始资产图主要展示和预览。
2. 衍生资源卡片可点击打开图片工作流 `editImage`。
3. 衍生资源可删除。
4. Production Agent 可以新增/更新/删除衍生资源。
5. Production Agent 或批量接口可以生成衍生资源图。

点击衍生资源图打开图片工作流后，可以改 prompt、换参考图、换模型、换质量、换比例并重新生成，最后点击保留回写该衍生资源。

### 23.10 分镜图能不能编辑或重新生成

能。

分镜节点支持：

1. 勾选一个或多个分镜批量生成图片。
2. 单张分镜点击图片或占位区域打开图片工作流。
3. 在图片工作流里修改 prompt、参考图、模型、质量、比例。
4. 生成新图后点击保留，回写 `o_storyboard.filePath` 和 `flowId`。
5. 分镜信息弹窗可编辑 `prompt` 和 `videoDesc`。
6. 可以删除单条分镜。
7. 可以批量删除分镜。
8. 可以在两张图之间插入新分镜图。

分镜批量生成调用 `/production/storyboard/batchGenerateImage`，每个分镜一次生成一张。单张重新生成可以通过图片工作流完成，也可以勾选该分镜重新跑批量生成。

### 23.11 视频能不能重新生成和选择

能。

视频生成页按 track 生成视频候选：

1. 单次生成调用 `/production/workbench/generateVideo`，给当前 track 新增一个 `o_video` 候选。
2. 批量生成调用 `/production/workbench/batchGenerateVideo`，给每个选中 track 各新增一个候选。
3. 同一个 track 可以重复生成，形成多个历史候选。
4. 用户可在候选列表里选择一个作为最终使用视频。
5. 选择时调用 `/production/workbench/selectVideo`，更新 `o_videoTrack.videoId`。

所以视频是“候选历史 + 选择其中一个”的模式。

### 23.12 视频参考素材能选什么

视频生成页的参考素材入口不是简单上传框，而是一个统一素材选择器 `assetsCheck()` 加分镜选择弹窗。它允许从两类来源选择素材：

| 来源 | sources | 可选内容 | 进入后端后如何读取 |
| --- | --- | --- | --- |
| 分镜 | `storyboard` | 当前集 `o_storyboard` 的分镜图 | 通过 `o_storyboard.id` 读取 `filePath`、`videoDesc`、`duration`、关联资产 |
| 资产库 | `assets` | `role/tool/scene/clip/audio` | 通过 `o_assets.id` 关联 `o_image.filePath`，再转成模型需要的参考文件 |

选择素材时有几个细节：

1. `singleImage` 模式只保留一个参考项。
2. 首尾帧模式有固定槽位：首帧、尾帧。
3. 混合参考模式可以多选资产，模式里声明了哪些参考类型，选择器就限制哪些素材媒体类型。
4. 选择分镜时，素材项会带 `sources: 'storyboard'`、`id: storyboardId`、`prompt: videoDesc`、`index`。
5. 选择资产时，素材项会带 `sources: 'assets'`、`id: assetsId`、`src`、`prompt`。
6. 选择角色、道具、场景等图片类资产后，如果它们绑定了音频，前端会调用 `/production/workbench/getAudioBindAssetsList` 自动补入关联音频。
7. 生成视频时，如果模式是 `text`，不会上传参考图；如果不是 `text`，会把当前轨道素材转成 `uploadData` 传给后端。

这里的关键是：Toonflow 的视频参考素材不是只来自分镜图。它允许混合使用分镜、角色图、场景图、道具图、clip 素材、音频素材。VT Studio 不能把视频生成简化成“每个分镜只拿一张分镜图生成视频”，否则参考能力会明显弱于参考项目。

### 23.13 视频 mode 对素材数量和类型的限制

视频模型的 mode 来自项目配置中的视频模型能力。前端会读取模型详情 `/modelSelect/getModelDetail`，再生成模式下拉和分辨率/时长选项。

Toonflow 已确认的 mode 形态：

| mode | 页面含义 | 参考素材规则 |
| --- | --- | --- |
| `text` | 文本生视频 | 不需要参考图，生成时 `uploadData` 为空 |
| `singleImage` | 单图生视频 | 只保留 1 个参考素材 |
| `startEndRequired` | 首尾帧必填 | 有首帧和尾帧槽位，生成前应有两张图 |
| `endFrameOptional` | 尾帧可选 | 首帧为主，尾帧可为空 |
| `startFrameOptional` | 首帧可选 | 尾帧为主，首帧可为空 |
| JSON 数组 | 混合参考 | 例如图片、视频、音频、文本参考的组合 |

混合参考数组的元素可以是：

1. `imageReference` 或 `imageReference:n`。
2. `videoReference` 或 `videoReference:n`。
3. `audioReference` 或 `audioReference:n`。
4. `textReference`。

其中 `:n` 的写法表示该参考类型的数量上限或数量要求。`getGenerateData` 里已经对 `audioReference:n` 做了处理：如果当前视频模式包含 `audioReference:3`，它会在自动聚合音频时最多保留 3 个音频参考。

需要注意：Toonflow 前端和后端对 mode 的校验并不完整。前端会根据模式限制展示和选择，但后端 `generateVideo` / `batchGenerateVideo` 只接收 `mode` 字符串和 `uploadData`，没有严格校验“首尾帧是否齐全”“参考数量是否超限”“素材类型是否匹配 mode”。VT Studio 如果要做正式生产线，应把这些规则放到 `ProductionWorkflowOrchestrator` 或 `Production Tools` 的 schema/validator 里。

### 23.14 视频提示词能不能编辑、保存、重生成

能。

视频提示词属于 `o_videoTrack.prompt`，不是 `o_video.prompt`。也就是说，一个轨道只有一个当前提示词，但可以生成多个视频候选。

具体能力：

1. 当前轨道提示词在编辑器里可直接修改。
2. 失焦时调用 `/production/workbench/updateVideoPrompt` 保存到 `o_videoTrack.prompt`。
3. 单轨生成提示词调用 `/production/workbench/generateVideoPrompt`。
4. 批量生成提示词调用 `/production/workbench/batchGeneratePrompt`。
5. 生成提示词时轨道状态先变成 `生成中`，成功后变 `已完成`，失败变 `生成失败` 并保存 `reason`。
6. 前端轮询 `/production/workbench/checkVideoPrompt`，只取状态已经到 `已完成` 或 `生成失败` 的轨道。
7. 用户可以再次生成提示词，新的文本会覆盖同一条 `o_videoTrack.prompt`。

所以它不是“提示词历史版本”模式，而是“轨道当前提示词可反复覆盖”。VT Studio 如果需要可追溯，应该在生成时额外记录 prompt 快照和历史版本。

### 23.15 视频候选能否预览、下载、删除、选择和重复生成

能，且候选视频和轨道是分离的。

视频候选存在 `o_video`，轨道当前选中候选存在 `o_videoTrack.videoId`。同一个 `o_videoTrack.id` 可以有多条 `o_video.videoTrackId = trackId` 的候选。

用户侧能力：

1. 预览：点击候选视频卡片，打开视频播放器预览。
2. 单个下载：候选不是生成中/失败时，可直接按 `src` 下载。
3. 批量下载：勾选多个轨道后，将每个轨道已选中的候选视频打包成 zip 下载。
4. 删除候选：调用 `/production/workbench/delVideo` 删除某条历史候选。
5. 选择候选：调用 `/production/workbench/selectVideo`，把 `o_videoTrack.videoId` 更新为该候选。
6. 重复生成：再次点击生成，新增一条 `o_video`，不会覆盖旧候选。
7. 失败展示：候选状态为 `生成失败` 时展示失败标记和错误原因。

生成流程是先插入 `o_video`，状态为 `生成中`，立即把 `videoId` 返回给前端；真正的视频模型调用在后台执行，成功后状态变 `生成成功`，失败后状态变 `生成失败` 并写 `errorReason`。

### 23.16 轨道能不能增删、改时长、自动绑定分镜

能。

视频工作台核心单位是 `track`，对应表是 `o_videoTrack`。分镜表 `o_storyboard` 通过 `trackId` 关联到视频轨道。

已确认能力：

1. 分镜批量入库时，会为每个分镜或分镜段创建/绑定视频轨道。
2. 视频工作台可以新增轨道，调用 `/production/workbench/addTrack`。
3. 视频工作台可以删除轨道，调用 `/production/workbench/deleteTrack`。
4. 删除轨道时，后端删除 `o_videoTrack`，并把关联分镜的 `trackId` 置空，而不是删除分镜。
5. 轨道时长可改，调用 `/production/workbench/updateVideoDuration`。
6. 轨道提示词可改，调用 `/production/workbench/updateVideoPrompt`。
7. 轨道列表会显示当前选中候选视频的首帧，用于快速辨认。

这个设计说明：Toonflow 的“视频段”不是强绑定某一条分镜不可变，它允许轨道层继续组织视频生成。VT Studio 在做导出时间线时，应以轨道/分镜/候选视频三者的关系生成 timeline，而不是只按分镜表线性拼接。

### 23.17 轮询和任务状态细节

Toonflow 没有统一任务中心式的强诊断闭环，但在视频工作台内有局部轮询。

视频提示词轮询：

1. 前端维护正在生成提示词的轨道 id 集合。
2. 定时调用 `/production/workbench/checkVideoPrompt`。
3. 后端返回 `o_videoTrack` 中状态为 `已完成` 或 `生成失败` 的记录。
4. 前端用返回结果更新对应轨道 prompt、state、reason。

视频候选轮询：

1. 前端维护正在生成的视频候选 id 集合。
2. 定时调用 `/production/workbench/checkVideoStateList`。
3. 后端返回 `o_video` 中状态为 `生成成功` 或 `生成失败` 的记录。
4. 成功时返回可访问 `src`，失败时返回 `errorReason`。
5. 前端更新候选卡片状态。

局限：

1. 轮询接口虽然收 `projectId/scriptId`，但 `checkVideoStateList` 实际主要按 `videoIds` 查。
2. 没有统一 requestId。
3. 没有保存完整模型入参快照。
4. 没有把 prompt、视觉手册、模型参数、参考资源形成可回放的诊断包。

VT Studio 要做正式版本，不能只复刻局部轮询。至少要补任务中心状态、模型调用快照、错误诊断、资源引用、导出前校验结果。

### 23.18 视觉手册影响哪些环节

视觉手册是 Toonflow 里影响出图和出视频的重要输入。读取方式统一通过 `getArtPrompt(styleName, 'art_skills', fileName)`，它会读取对应风格目录下的 `prefix.md`，再拼上目标手册文件。

已确认会使用视觉手册的环节：

| 环节 | 使用的视觉手册 key | 影响结果 |
| --- | --- | --- |
| 主角色 prompt 生成 | `art_character` | 影响角色资产 prompt |
| 衍生角色 prompt 生成 | `art_character_derivative` | 影响角色衍生图 prompt |
| 主场景 prompt 生成 | `art_scene` | 影响场景资产 prompt |
| 衍生场景 prompt 生成 | `art_scene_derivative` | 影响场景衍生图 prompt |
| 主道具 prompt 生成 | `art_prop` | 影响道具资产 prompt |
| 衍生道具 prompt 生成 | `art_prop_derivative` | 影响道具衍生图 prompt |
| 画布衍生资源图生成 | `art_character_derivative` / `art_scene_derivative` / `art_prop_derivative` | 影响衍生资源出图 |
| 视频提示词生成 | `art_storyboard_video` | 影响视频 prompt 的镜头、运动、风格表达 |
| Production Agent | 组合 `artStyle` 下的 art skills | 影响 Agent 生成导演计划、分镜、资源修改等文本 |

需要特别说明：视频真正调用视频模型时，后端传给视频模型的是已经生成好的 `prompt`、参考图/音频、mode、duration、ratio、resolution、audio 开关。视觉手册不会直接传给视频模型，而是在“生成视频提示词”这一步影响最终 prompt。

### 23.19 导演手册影响哪些环节

导演手册和视觉手册不是同一个东西。视觉手册更偏画面风格、角色/场景/道具视觉规则；导演手册更偏叙事、镜头组织、分镜表和导演计划。

项目配置里有两个入口：

1. 视觉手册：`addVisualManual`，会写入 `art_skills/{styleName}` 下的一组视觉/导演风格文件。
2. 导演手册：`addDirectorManual`，会写入导演叙事相关文件。

已确认的导演手册 key 包括：

| key | 用途 |
| --- | --- |
| `director_planning_narrative` | 生成导演计划时的叙事规则 |
| `director_storyboard_table_narrative` | 生成分镜表时的叙事规则 |

视觉手册目录里还包含与导演风格相关的 key：

| key | 用途 |
| --- | --- |
| `director_storyboard` | 分镜/镜头组织相关规则 |
| `director_planning_style` | 导演计划的风格规则 |
| `director_storyboard_table_style` | 分镜表风格规则 |

Production Agent 会读取项目的 `artStyle` 和 `directorManual`，再组合 production skills。也就是说，Agent 生成导演计划和分镜时会受视觉风格和导演叙事双重影响。

VT Studio 应明确区分：

1. 资源图/分镜图生成：主要受视觉手册影响。
2. 视频 prompt：主要受 `art_storyboard_video` 影响。
3. 导演计划/分镜表：受导演手册和视觉风格共同影响。
4. Agent 写入：必须把使用过的手册 key、版本、prompt、skill 记录到审计或快照里。

### 23.20 图片工作流能力

图片工作流 `editImage` 是 Toonflow 里单张图片精修和重新生成的核心，不只服务分镜图，也服务画布中的衍生资源图。

它的能力包括：

1. 读取当前图片工作流默认模型 `/production/editImage/getImageDefaultModle`。
2. 支持生成节点，节点里有 prompt、参考图、模型、质量、比例等参数。
3. 调用 `/production/editImage/generateFlowImage` 生成一张新图。
4. 生成图片保存到 `/{projectId}/workFlow/{uuid}.jpg`。
5. 工作流结构可保存 `/production/editImage/saveImageFlow`。
6. 已有工作流可更新 `/production/editImage/updateImageFlow`。
7. 用户点击“保留”后，回写到当前分镜或衍生资源。

这说明画布不应该只提供“批量生成一次”的按钮。正式体验至少应允许：单张打开、单张调 prompt、单张换参考、单张重生成、单张确认保留。

### 23.21 资产库 clip/audio 和角色音频绑定

Toonflow 资产库不是只有角色、场景、道具。资源库类型包括：

| 类型 | type | 来源 | 用途 |
| --- | --- | --- | --- |
| 角色 | `role` | 剧本提取或手动新增 | 视觉角色、可关联分镜、可参与视频参考 |
| 场景 | `scene` | 剧本提取或手动新增 | 场景视觉、可关联分镜、可参与视频参考 |
| 道具 | `tool` | 剧本提取或手动新增 | 道具视觉、可关联分镜、可参与视频参考 |
| 素材 | `clip` | 上传图片/音频/视频 | 剪辑台素材和视频参考素材 |
| 音频 | `audio` | 音频资产管理 | 角色配音、视频参考音频 |

`clip` 上传接口 `/assets/uploadClip` 支持图片、音频、视频三类 base64，根据 MIME 写入 `o_image`，再把 `o_assets.imageId` 指过去。

`audio` 资产是父子结构：

1. 父级 `o_assets.type = audio` 保存音色/声音资产名称和描述。
2. 子级 `o_assets.type = audio`、`assetsId = 父级 id` 保存具体音频条目。
3. 子级会有对应 `o_image.type = audio`，`filePath` 指向音频文件。
4. 角色和音频之间通过 `o_assetsRole2Audio` 绑定。
5. 视频素材选择里选到角色/资产后，会自动把绑定音频补入参考素材列表。

这里对 VT Studio 的启发是：如果要做完整生产线，资源库至少要区分“生产资产”和“媒体素材”。角色/场景/道具负责叙事和视觉一致性，clip/audio 负责视频生成参考和剪辑素材，不应被资源提取流程混为一类。

### 23.22 每个操作的“能/不能”总表

| 环节 | 用户能做什么 | 能否选择保存 | 能否编辑 | 能否单项重生成 | 一次生成数量 | 主要接口 | 主要表 | 手册影响 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 剧本资源提取 | 从剧本中提角色/场景/道具 | 否，直接入库 | 保存后去资产中心编辑 | 否，只能按剧本重新提取 | 一次返回多项资源 | `/script/extractAssets` | `o_assets`、`o_scriptAssets` | 主要受提取 prompt 影响，不是视觉手册出图链路 |
| 资产基础信息 | 改名称、描述、备注、prompt | 不涉及 | 能 | 不涉及 | 不生成 | `/assets/updateAssets` | `o_assets` | 无直接生成影响 |
| 资产 prompt | 单项或批量生成资产图 prompt | 生成后直接写回 | 能继续手改 | 能，重新生成覆盖 prompt | 每个资产 1 条 prompt | `/assetsGenerate/polishAssetsPrompt`、`/assetsGenerate/batchPolishAssetsPrompt` | `o_assets` | `art_character`、`art_scene`、`art_prop` 及衍生 key |
| 资产图 | 单项生成、批量生成、上传、选择历史图 | 能，从历史候选中选 | 能改 prompt 后再生成 | 能，重复生成产生新候选 | 每个资产每次 1 张 | `/assetsGenerate/generateAssets`、`/assetsGenerate/batchGenerateImageAssets`、`/assets/saveAssets` | `o_image`、`o_assets.imageId` | 通过资产 prompt 间接受视觉手册影响 |
| 资源候选图删除 | 删除某张历史资产图 | 不涉及 | 不涉及 | 不涉及 | 单张删除 | `/assets/delImage` | `o_image` | 无 |
| clip 素材 | 上传图片/音频/视频素材 | 上传即保存 | 可在资产库管理 | 不涉及 AI 重生成 | 单次上传一个文件记录 | `/assets/uploadClip` | `o_assets`、`o_image` | 无 |
| audio 音频资产 | 新增音色父资产和多条音频子项 | 上传即保存 | 可编辑音频信息 | 不涉及 AI 重生成 | 一次可保存多条子音频 | `/assets/addAudioAssets`、`/assets/updateAudioAssets` | `o_assets`、`o_image`、`o_assetsRole2Audio` | 视频 prompt 会读取音频资产信息 |
| 画布 FlowData | 保存节点布局和生产数据 | 保存即覆盖 FlowData | 能通过画布操作改 | 不涉及生成 | 一次保存当前画布 | `/production/saveFlowData` | flow data 存储 | Agent/手册可间接影响写入内容 |
| 画布衍生资源 | 新增、更新、删除衍生资源 | 保存即落库 | 能 | 能重新生成图 | 每个衍生资源每次 1 张 | Production Agent tools、`/production/assets/batchGenerateAssetsImage` | `o_assets`、`o_image` | 衍生资源视觉手册 key |
| 导演计划 | 生成/保存导演计划文本 | 保存即写 FlowData | 可继续修改 | 能重新生成覆盖 | 一次一份计划 | Production Agent / 生产工具 | FlowData / 审计 | 导演手册、视觉风格 skill |
| 分镜表 | 批量新增分镜、删除、插入 | 入库即保存 | 能编辑 prompt、videoDesc 等 | 能重新生成分镜表或单项调整 | 一次多条分镜 | `/production/storyboard/batchAddStoryboardInfo` | `o_storyboard`、`o_assets2Storyboard`、`o_videoTrack` | 导演手册、分镜风格 skill |
| 分镜图批量生成 | 勾选多条分镜生成图片 | 生成后写回分镜 | 能通过图片工作流再改 | 能，勾选单条或打开图片工作流 | 每条分镜 1 张 | `/production/storyboard/batchGenerateImage` | `o_storyboard`、`o_image` | 分镜 prompt 和视觉风格间接影响 |
| 图片工作流 | 单张图调 prompt、参考图、模型、质量、比例 | 能，点“保留”才回写 | 能 | 能 | 每次 1 张 | `/production/editImage/generateFlowImage`、`saveImageFlow`、`updateImageFlow` | 工作流数据、`o_storyboard` 或 `o_assets` | 取决于传入 prompt 和参考资源 |
| 视频参考素材 | 从分镜/资产库选参考图、视频、音频 | 选中即作为当前轨道参考 | 能清空/重选 | 不涉及生成 | 单图/首尾帧/混合多参考 | `assetsCheck()`、`/production/workbench/getAudioBindAssetsList` | `o_storyboard`、`o_assets`、`o_assetsRole2Audio` | 影响视频 prompt 和视频模型参考输入 |
| 视频提示词 | 单轨或批量生成、手动编辑 | 生成后覆盖轨道 prompt | 能 | 能，重新生成覆盖 | 每个轨道 1 条 | `/production/workbench/generateVideoPrompt`、`batchGeneratePrompt`、`updateVideoPrompt` | `o_videoTrack` | `art_storyboard_video`、模型 prompt 模板、全局 prompt |
| 视频候选 | 单轨或批量生成候选视频 | 能，从候选中选择 | 不能编辑视频本体，只能重生成 | 能，重复生成新增候选 | 每个轨道每次 1 个候选 | `/production/workbench/generateVideo`、`batchGenerateVideo`、`selectVideo` | `o_video`、`o_videoTrack.videoId` | 通过已生成视频 prompt 间接影响 |
| 视频轨道 | 新增、删除、改时长、改 prompt | 保存即更新轨道 | 能 | 不涉及生成 | 单轨操作 | `/production/workbench/addTrack`、`deleteTrack`、`updateVideoDuration` | `o_videoTrack`、`o_storyboard.trackId` | 无直接手册影响 |
| 剪辑台素材 | 加载 clip 和已选视频，拖拽到时间线 | 前端状态内保存 | 能移动、缩放、裁切、加文本等 | 不涉及 AI 重生成 | 多轨编辑 | `/assets/getMaterialData` 等 | 资产表 + 前端编辑状态 | 无直接手册影响 |
| WebAV 导出 | 浏览器端合成 MP4 下载 | 导出即下载 | 导出前可编辑时间线 | 不涉及 AI 重生成 | 一次导出 1 个 MP4 | `avCanvas.createCombinator()` | 无服务端导出表 | 无 |

这张表也暴露出参考项目的核心短板：资源提取没有审核面板，视频和图片没有完整快照，导出没有服务端历史，后端没有完整 schema 校验和审计闭环。VT Studio 的目标不应只是“照抄 Toonflow”，而是吸收它的生产拆分，再把正式生产线缺口补齐。

## 24. 手册和 Prompt 影响路径总表

| 环节 | 输入手册/Prompt | 读取方式 | 生效位置 | 输出结果 | 参考项目缺口 | VT Studio 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| 资源提取 | 资源提取 prompt | 后端 prompt 文件或内置 prompt | `/script/extractAssets` | `role/scene/tool` 文本资源 | 不可审核、不可选择保存 | 改为 `extract_resources` 工具，先生成草稿，再确认保存 |
| 主资产 prompt | `art_character`、`art_scene`、`art_prop` | `getArtPrompt(artStyle, 'art_skills', key)` | `/assetsGenerate/polishAssetsPrompt` | `o_assets.prompt` | 生成后直接覆盖 | 保存 prompt 版本和使用的手册 key |
| 衍生资产 prompt | `art_character_derivative`、`art_scene_derivative`、`art_prop_derivative` | 同上 | 批量/单项 prompt 生成 | 衍生资源 prompt | 和主资产链路混在一起 | 区分主资产和衍生资源 schema |
| 资产图生成 | 已保存资产 prompt、图像模型配置 | 读取 `o_assets.prompt` 和模型配置 | `/assetsGenerate/generateAssets` | `o_image` 候选 | 缺少完整 request 快照 | 记录模型、prompt、参考图、手册版本、任务 id |
| 衍生资源图生成 | 衍生视觉手册 key、衍生资源 prompt | `getArtPrompt` + 资源数据 | `/production/assets/batchGenerateAssetsImage` | 衍生资源图片 | 批量生成但审计弱 | 通过 Production Tool 写入并记录幂等 key |
| 导演计划 | `director_planning_narrative`、`director_planning_style`、Production skills | Agent 组合项目手册和 skill | Production Agent 子 Agent | 导演计划文本 | Agent 工具和写入审计不完整 | 禁止自由文本落库，必须走 `save_director_plan` 工具 |
| 分镜表 | `director_storyboard_table_narrative`、`director_storyboard_table_style` | Agent/生成接口读取 | 分镜表生成和入库 | `o_storyboard` | schema 和 repair 不强 | 生成 JSON schema，失败自动 repair，入库快照 |
| 分镜图 | 分镜 prompt、关联资产图、项目视觉风格 | 读取分镜和资产关联 | `/production/storyboard/batchGenerateImage` | `o_storyboard.filePath` | 缺少统一诊断 | 补 `generate_storyboard_image` 工具和快照 |
| 视频提示词 | 模型 prompt 模板、`art_storyboard_video`、全局 `videoPromptGeneration` | 优先模型绑定 prompt，其次模型/mode 模板，最后全局 prompt | `/production/workbench/generateVideoPrompt` | `o_videoTrack.prompt` | 覆盖式保存，无历史 | 保存 prompt 历史和输入素材引用 |
| 视频生成 | 已生成视频 prompt、参考图/音频、mode、duration、ratio、resolution、audio | 读取轨道、候选、项目视频配置 | `/production/workbench/generateVideo` | `o_video` 候选 | 后端校验弱，无导出联动 | 工具化 `generate_video_candidate`，强校验 mode 和素材数量 |
| 导出 | 时间线、已选候选视频、clip/audio/text | 前端 WebAV 读取编辑状态 | 浏览器端 `createCombinator` | MP4 Blob 下载 | 没有服务端导出历史和剪映草稿 | 建 `validate_export`、`create_export`、导出 history 和诊断 |

## 25. VT Studio 当前基础上的优化实现建议

### 25.1 资源提取应该改成“提取面板”，不是画布直接塞满

参考项目的资源提取虽然会直接保存，但这个体验不够好。VT Studio 现在如果“全部提取、全部保存、画布显示一堆”，会带来三个问题：

1. 画布变成资源垃圾场，用户不知道哪些是要用的。
2. AI 提取错的资源已经入库，后面还要清理。
3. 单项修改、单项重提取、合并已有资源都不好做。

建议流程：

```txt
点击提取资源
-> 后端生成 ResourceExtractionDraft
-> 前端展示提取面板
-> 用户逐项确认/删除/编辑/合并到已有资源/标记重提取
-> 点击保存选中项
-> Production Tool 写入资源库和资源-内容关联
-> 画布只展示已确认、和当前内容相关的资源摘要
```

提取面板至少要有这些能力：

1. 资源类型筛选：角色、场景、道具。
2. 逐项勾选保存。
3. 全选、反选、只保存新增、只保存高置信度。
4. 编辑名称、描述、类型。
5. 合并到已有资源。
6. 单项重新提取或重新匹配已有资源。
7. 查看 AI 提取依据：来自哪段内容、哪一集、哪句文本。
8. 保存前不污染正式资源库。

画布只应该负责“使用已确认资源继续生产”，不是负责审核所有原始提取结果。

### 25.2 画布的合理职责

参考项目里画布更像生产编排视图：看资源、做分镜、生成图、进入视频工作台、让 Agent 辅助生产。它不应该承担所有资源库管理功能。

VT Studio 画布建议职责：

1. 展示当前内容的生产状态：内容、资源、导演计划、分镜、分镜图、视频、导出。
2. 展示已确认资源的简洁摘要，不把所有候选资源全堆出来。
3. 对资源提供快捷动作：查看、编辑、打开资源库、生成/重生成图。
4. 对分镜提供快捷动作：生成分镜表、编辑分镜、生成/重生成分镜图。
5. 对视频提供快捷动作：生成 prompt、生成候选、选择候选、进入工作台。
6. 所有写入动作都交给编排层和 Production Tools。

画布不建议做：

1. 不建议直接自动保存所有提取结果。
2. 不建议在画布里展示未确认资源。
3. 不建议让画布组件直接写数据库或直接调用旧 script 资产提取接口。

### 25.3 出图体验应保留“候选历史 + 选择保存”

参考项目的优点是：资产图和视频候选都不是一次覆盖，而是候选历史加选择。

VT Studio 应保留并增强：

1. 资产图：一次生成 1 张或按模型支持生成多张，但都进入候选历史。
2. 用户选择一张作为当前资产图。
3. 分镜图：批量生成时每条分镜产生候选；单张精修时点“保留”才回写。
4. 视频：每个轨道可以有多个候选，用户选择其中一个用于导出。
5. 任何候选都要记录生成参数、模型、prompt、参考图、手册版本。

如果当前实现是“生成后直接覆盖当前图”，建议改掉。覆盖式生成会让用户无法比较候选，也很难排查为什么上一张更好。

### 25.4 视频生成不能只依赖分镜图

参考项目的视频工作台会聚合：

1. 分镜图。
2. 分镜 `videoDesc`。
3. 分镜关联的角色、场景、道具。
4. 资产图。
5. 角色绑定音频。
6. 用户额外选的 clip/audio/video/image 素材。
7. 视频模型 mode、时长、分辨率、比例、音频开关。

VT Studio 如果只把分镜图丢给视频模型，生成质量和可控性会弱。正确做法是先构建 `VideoTrackContext`，再生成 prompt 和候选视频。

建议 `VideoTrackContext` 包含：

```ts
type VideoTrackContext = {
  projectId: string;
  contentId: string;
  trackId: string;
  storyboardIds: string[];
  storyboardImages: ReferenceImage[];
  storyboardVideoDesc: string[];
  linkedAssets: Array<{ id: string; type: 'role' | 'scene' | 'tool'; imageId?: string; prompt?: string }>;
  linkedAudio: Array<{ id: string; roleAssetId?: string; fileId: string; text?: string }>;
  extraReferences: Array<{ source: 'asset' | 'clip' | 'upload'; type: 'image' | 'video' | 'audio'; id: string }>;
  model: string;
  mode: string | string[];
  duration: number;
  resolution: string;
  aspectRatio: '16:9' | '9:16';
  audio: boolean;
};
```

### 25.5 导出必须比 Toonflow 更正式

Toonflow 的最终导出只是浏览器端 WebAV 合成 MP4 下载，没有剪映草稿、导出历史、服务端导出记录，也没有导出诊断。

VT Studio 需求文档要的是正式生产线，所以建议导出链路是：

```txt
validate_export
-> 检查分镜、轨道、已选视频、素材可读性、时长、比例、字幕、音频
-> create_export
-> 生成 timeline payload
-> 生成剪映草稿或目标格式
-> 写 export history
-> 记录快照和诊断
```

导出前必须检查：

1. 当前内容是否有可导出的分镜/轨道。
2. 每个需要导出的 track 是否选择了视频候选。
3. 视频文件是否存在且可读取。
4. 音频/clip 素材是否存在且可读取。
5. 时间线时长是否和轨道时长一致或可解释。
6. 比例、分辨率、帧率是否符合导出目标。
7. 剪映草稿字段是否完整。
8. 所有对外 payload 都使用 `contentId/contentName`，不暴露旧 `scriptId`。

## 26. 从项目到导出的视频生产验收清单

这一节按用户实际操作顺序列出“做到什么才算完整”。

### 26.1 项目阶段

1. 用户创建项目，配置项目名、视频比例、视频模型、图像模型、视觉手册、导演手册。
2. 系统能读取视觉手册和导演手册，缺失时给出明确错误，而不是静默生成低质量结果。
3. 项目下的内容入口使用 `contentId`，不在正式 UI 暴露 `scriptId`。

### 26.2 内容和资源提取阶段

1. 用户创建或导入短剧内容。
2. 点击资源提取后，生成提取草稿。
3. 草稿至少区分角色、场景、道具。
4. 每个草稿项显示名称、描述、类型、来源文本、是否疑似已有资源。
5. 用户可以选择保存哪些项。
6. 用户可以编辑后保存。
7. 用户可以合并到已有资源。
8. 用户可以对单项重新提取或重新匹配。
9. 保存后才进入正式资源库和内容-资源关联。
10. 画布只展示已确认资源，不展示未确认草稿。

### 26.3 资产完善阶段

1. 用户可进入资源库查看角色、场景、道具、clip、audio。
2. 角色/场景/道具可生成 prompt。
3. 生成 prompt 时按资源类型读取视觉手册 key。
4. 用户可手动改 prompt。
5. 用户可单项出图、批量出图、上传图片。
6. 每次出图形成候选历史。
7. 用户选择候选作为当前资源图。
8. 用户可删除不需要的候选图。
9. 音频可作为独立资源，并可绑定到角色。

### 26.4 导演计划和分镜阶段

1. 用户生成导演计划，生成输入包含内容、资源、视觉手册、导演手册。
2. 导演计划保存必须经过 Production Tool。
3. 用户生成分镜表，输出必须符合 schema。
4. 分镜入库时要保存镜头描述、画面 prompt、视频描述、时长、关联资产。
5. 每条分镜关联到视频轨道或可生成视频轨道。
6. 用户可编辑分镜 prompt 和视频描述。
7. 用户可删除、批量删除、插入分镜。

### 26.5 分镜图和衍生资源图阶段

1. 用户可勾选多条分镜批量生成分镜图。
2. 每条分镜每次生成候选图或回写图时必须记录快照。
3. 用户可打开单张分镜图进入图片工作流。
4. 图片工作流支持 prompt、参考图、模型、比例、质量。
5. 用户点击保留后才回写分镜图。
6. 衍生资源也能进入图片工作流。
7. 衍生资源可新增、编辑、删除、重生成图。

### 26.6 视频生成阶段

1. 系统按轨道组织视频生产。
2. 每个轨道可聚合分镜图、分镜视频描述、关联资产图、绑定音频、额外素材。
3. 用户可根据模型 mode 选择参考素材。
4. 系统必须校验 mode 和素材数量/类型是否匹配。
5. 用户可生成视频提示词。
6. 视频提示词生成要读取 `art_storyboard_video` 和模型 prompt 模板。
7. 用户可手动编辑并保存视频提示词。
8. 用户可单轨生成视频候选。
9. 用户可批量生成视频候选。
10. 每次生成新增候选，不覆盖旧候选。
11. 用户可预览、删除、下载候选。
12. 用户必须选择一个候选作为当前轨道导出视频。

### 26.7 剪辑和导出阶段

1. 剪辑台能加载已选视频候选、clip 素材、audio 素材、图片、文本/字幕。
2. 用户可调整时间线、轨道、位置、缩放、音量、字幕等剪辑属性。
3. 导出前必须执行校验。
4. 校验通过后生成导出 payload。
5. VT Studio 应生成剪映草稿或目标导出格式，而不是只做浏览器 MP4 下载。
6. 导出记录写入 history。
7. 导出快照记录内容、资源、分镜、轨道、候选视频、素材引用、模型和 prompt 版本。
8. 导出失败时任务中心能看到失败原因和可操作修复建议。

## 27. 不能照搬参考项目的点

1. 不能照搬“资源提取后直接入库”。VT Studio 应该有提取草稿和确认保存。
2. 不能照搬旧字段对外暴露。参考项目大量使用 `scriptId`，VT Studio 正式 API 应使用 `contentId`。
3. 不能照搬弱校验。视频 mode、参考素材数量、分镜 schema、导出 payload 都要强校验。
4. 不能照搬覆盖式 prompt 保存。重要生成要有历史和快照。
5. 不能照搬无审计 Agent 写入。Agent 只能调用 Production Tools，不能自由文本直接落库。
6. 不能照搬 WebAV 单点下载作为最终导出。VT Studio 要有导出历史、剪映草稿、任务诊断。
7. 不能把画布做成所有资源的堆叠页。画布应是生产状态和编排入口，资源审核放在资源提取面板。

## 28. 最终落地判断

参考项目最值得吸收的是生产对象关系：资源库、资源和分镜关联、分镜和视频轨道关联、轨道和视频候选关联、候选选择后进入剪辑/导出。这套对象关系能支撑完整生产线。

但参考项目的体验和工程闭环不够正式。VT Studio 要在当前基础上优化，核心不是简单复刻页面，而是补齐这些正式能力：

1. 资源提取面板：可选择、可编辑、可合并、可单项重提取。
2. 画布编排层：画布只发起动作，写入走 workflow 和 tools。
3. 候选历史：资产图、分镜图、视频都保留候选和选择动作。
4. 手册可追溯：每次生成记录使用的视觉手册、导演手册、prompt 和 skill。
5. 视频上下文：生成视频 prompt 和候选时聚合分镜、资产、音频、参考素材、模型 mode。
6. 导出闭环：导出校验、剪映草稿、导出历史、快照、诊断。

这样做后，画布就不是“提取一堆资源然后堵住页面”，而是从确认资源开始，把导演计划、分镜、出图、视频候选和导出串成一条可控、可回溯、可修复的生产线。
