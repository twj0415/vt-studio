# OPT-049 全页面交互 UI 整改清单

状态：已完成；第一批、第二批、第三批、第四批第一组、第四批第二组和最终收口均已完成，全页面交互 UI 整改清单已闭环

## 0. 快速理解

一句话：把所有页面按同一套交互规则排队整改，先改主链路早期入口，不一次性乱翻所有页面。

为什么现在做：`OPT-048` 已经收住全局工作台壳，但页面内部还是各写各的。继续往生产、导出堆功能之前，必须先把页面结构、主操作、空状态、失败状态、滚动和 i18n 的要求固定下来。

做完后有什么用：后续每改一个页面，都知道主按钮放哪、危险操作怎么处理、空状态怎么引导、失败怎么展示，不会越改越像拼起来的半成品。

这一步不碰什么：不改模型、数据库、任务队列、生成链路；不重做生产工作台和导出页深层业务，它们继续走 `OPT-050/051` 和后续业务任务。

## 1. 参考项目怎么做

| 范围 | 参考结论 | VT Studio 落地 |
|---|---|---|
| 菜单和页面 | Toonflow 更像 Web 管理后台，入口多，页面信息密度高 | VT Studio 是桌面工作台，要强调当前项目、当前步骤、下一步 |
| 设置类页面 | 配置多，依赖模型、提示词、Skill、记忆等底层能力 | 设置页必须分组和快速定位，不能把配置堆成一长页 |
| 内容生产链路 | 原文、剧本、资产、生产、导出是连续链路 | 每页都要告诉用户现在在哪一步、缺什么、下一步能做什么 |
| 任务和生成 | 参考项目有任务记录、失败状态、生成状态 | VT Studio 必须把任务状态、业务状态、失败原因、requestId 放到用户能看到的位置 |

不能照搬：

1. 不照搬 Web 后台的多层菜单。
2. 不照搬一页堆所有操作的方式。
3. 不用开发编号 `M-xxx/F-xxx` 当普通用户主要导航信息。

## 2. 本次做什么

本任务先做三件事：

1. 固化逐页整改清单。
2. 明确第一批页面：项目页、任务中心、原文页。
3. 增加文档校验，防止后续漏页面、漏验收、漏 i18n/Tailwind/滚动要求。

第一批已完成：

1. 项目页删除影响改成结构化风险摘要。
2. 任务中心补当前页状态汇总和失败详情弹窗。
3. 原文页补选中数量提示，表格和导入预览选择控件改成 TDesign checkbox。

第二批已完成：

第二批已完成：剧本页、资产页、角景页、全局工作台壳层视觉微调。

1. 剧本页补资产提取状态摘要、选择提示和独立批量操作栏。
2. 资产页补生成状态摘要、选择提示、TDesign checkbox 和空状态主操作。
3. 角景页补提示词/图片/音色绑定状态摘要、失败原因入口和选择范围提示。
4. 全局工作台壳层视觉微调：左侧改为 72px 图标导航，顶部项目区改为紧凑指挥条，默认 studio 主题从偏米色改为更冷静的雾白/石墨/青绿。

第三批已完成：

第三批已完成：登录页小窗口、错误提示和回车提交收口。

1. 登录页去掉 `min-width: 960px`，小窗口不再横向锁死。
2. 用户名输入框支持回车提交，和密码框保持一致。
3. 登录失败时除 toast 外，页面内保留可读错误提示，并用 `role="alert"` 标记。
4. 登录按钮 loading 时显式 disabled，避免重复点击。

第四批第一组已完成：

第四批不是只改设置页，也不是继续给单个页面补丁。目标是把全局桌面工作台 UI 重新定型：壳层顶部、页面头部、工具栏、设置页、弹窗/抽屉、图标按钮、表单控件、空状态和失败状态统一按一套组件化规则重写。本次先完成全局壳层顶部、设置页目录化、原生 `title` 清理、TDesign checkbox/tooltip 规则和生产工作台关键图标交互；弹窗/抽屉深层治理继续后置。

1. 已将全局右侧顶部从“大块项目卡 + 页面说明”改为低高度 command bar，只保留当前项目、页面信息 tooltip、快捷入口和必要全局动作。
2. 页面内部禁止再叠一层大 hero 或功能入口卡片；页面标题和说明必须紧凑，主内容优先露出。
3. 已将设置页移除 `ModuleScaffold` 和顶部大面积 quick cards，改成“左侧设置目录 + 右侧设置内容”的桌面配置布局。
4. 能用 TDesign 或已有封装组件的地方必须用组件：`t-button`、`t-tooltip`、`t-tag`、`t-dialog`、`t-drawer`、`t-form`、`t-tabs`、`t-dropdown`、`t-empty`、`t-table`、`t-alert` 等优先。
5. 禁止用原生 `title` 充当 tooltip；已清理 renderer 原生 `title` tooltip，图标按钮、窄导航、危险动作、复制/打开/刷新等必须用 `t-tooltip` 或组件自带 tooltip。
6. 裸 `input/checkbox/select/button` 默认不作为新 UI 方案；本组已将裸 checkbox/select/textarea 收口到 TDesign 组件，按钮优先 `t-button`。只有文件选择、布局语义、可访问性辅助或组件库没有合适能力时才允许原生元素，并必须补齐 focus、aria 和视觉状态。
7. 弹窗/抽屉统一治理：宽度、标题、footer、危险按钮、滚动、关闭确认、字段分组和错误提示按同一规则走。

第四批第二组已完成：

1. 文件上传入口组件化：新增共享 `VtFilePicker`，资产上传、资产参考图、原文导入、剧本导入、剧本正文导入和手册封面上传均改为组件入口。
2. 业务页面不再散落 `<input type="file">`；原生 file input 只保留在共享 `VtFilePicker` 内部，外层统一使用 `t-button` 外观和可访问标签。
3. 弹窗/抽屉深层治理：全局 TDesign 弹窗补 header/body/footer 分层、最大高度、滚动容器、footer 边界和按钮宽度；抽屉补 body/footer 滚动与边界。
4. 复杂表单治理：大表单继续使用 `t-form`、`t-input`、`t-select`、`t-textarea`、`t-checkbox`、`t-tabs` 等组件，弹窗体内滚动统一由 TDesign 容器承接，避免页面级滚动卡死。
5. 新增 `verify-opt-049-dialog-upload-ui.mjs`，检查文件上传入口组件化、业务页面 file input 清零、弹窗/抽屉全局治理样式和文档记录。

最终收口已完成：

1. 剧本 Agent 页已改为左侧对话、中间故事骨架/改编策略、右侧剧本结果三栏，窄屏回落为单列。
2. 登录错误态补重试登录和刷新应用入口，避免只给红字。
3. 原文事件失败项补单章重试分析入口，失败原因和恢复动作并列可见。
4. `ModuleScaffold` 补下一步提示和组件化状态标签，占位页不再只有静态待开发信息。
5. 新增 `verify-opt-049-final-ui.mjs`，检查最终收口项和文档状态。

## 3. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| 固化页面清单 | 在本文件列出登录、项目、设置、任务中心、原文、剧本 Agent、剧本、资产、角景、生产、导出、占位页、全局样式 |
| 固化页面共性规则 | 每页必须有主任务、一个主按钮、次要操作、危险操作、空/加载/失败状态、滚动检查 |
| 固化第一批 | 第一批只改项目页、任务中心、原文页；它们都是主链路前置页面，结构相似，风险可控 |
| 固化后置批次 | 设置页体验、剧本 Agent、资产/角景、生产/导出分别后置，不混在第一批 |
| 防回退 | 新增 `verify-opt-049-page-ui-checklist.mjs`，检查 task、TODO、03 是否记录清楚 |

## 4. 页面整改总清单

| 页面 | 当前问题 | 后续怎么改 | 批次 |
|---|---|---|---|
| 登录页 | 本地登录说明和失败恢复还不够产品化 | 已补回车提交、页面内错误提示、loading 禁用、小窗口检查、重试登录和刷新应用入口 | 第三批 + 最终收口 |
| 全局工作台 | 左侧窄栏方向正确，但右侧顶部仍占空间，项目卡、页面标题和设置入口重复 | 第四批压缩为低高度 command bar，顶部只放项目上下文、快捷入口和全局状态；页面标题下放到页面内容区的紧凑行 | 第四批 |
| 项目页 | 项目、手册、删除风险在同页，信息层级不够稳 | 重排标题/工具栏/项目卡片/手册区/删除风险摘要 | 第一批 |
| 设置页 | 顶部 `ModuleScaffold` + sticky quick cards 形成二次大头部，浪费空间且像功能堆叠 | 移除大头部，改为左侧设置目录 + 右侧配置内容；保留生成前配置优先级，但不用卡片堆入口 | 第四批 |
| 任务中心 | 表格能用，但失败原因、requestId、重试能力弱 | 补状态汇总、失败详情入口、requestId 复制、自动刷新状态 | 第一批 |
| 小说/原文页 | 工具栏、批量操作、状态提示还能更清楚 | 已统一搜索/批量栏，强化事件分析状态、失败原因和失败项重试入口 | 第一批 + 最终收口 |
| 剧本 Agent 页 | 对话、计划、上下文、结果编辑密度高 | 已按左侧对话、中间计划/上下文、右侧结果区整理；窄屏回落单列 | 最终收口 |
| 剧本页 | 导入、批量新增、AI 正则、资产提取混在一起 | 已补状态摘要、搜索和批量操作分层、选择提示、TDesign checkbox | 第二批 |
| 资产页 | 卡片按钮多，主操作不清楚 | 已补生成状态摘要、选择提示、空状态主操作、TDesign checkbox | 第二批 |
| 角景页 | 绑定关系和生成状态不够直观 | 已补提示词/图片/音色状态摘要、失败原因入口、选择范围提示 | 第二批 |
| 生产页 | Vue Flow 画布有了，但用户不一定知道第一步做什么 | 顶部补剧集/分集、流程完成度、右侧属性、底部任务/日志 | 走 `OPT-051` |
| 导出页 | 需要从占位式页面变成导出向导 | 选择范围、素材校验、导出类型、执行、结果五步向导 | 走 `OPT-050` |
| ModuleScaffold | 占位页不能只有“待开发” | 已补下一步入口和组件化状态标签；已开发模块不能继续占位 | 最终收口 |
| 全局样式 | `index.scss` 历史样式多 | 新增普通样式用 Tailwind，旧 SCSS 随页面批次逐步收敛 | 持续 |

## 5. 第一批怎么做

### 5.1 项目页

要做什么：

1. 页面顶部保持一个主按钮：新建项目。
2. 刷新是次要按钮，不抢主按钮。
3. 项目卡片突出项目名、类型、最近更新时间、模型/画质、手册绑定。
4. 打开项目是主动作；编辑、删除是次要/危险动作。
5. 空项目状态直接引导新建项目。
6. 删除项目弹窗不再只放原始 `pre` 文本，要用结构化风险摘要。

验收：

1. 用户一眼知道点“新建项目”还是“打开项目”。
2. 删除项目时能看懂会影响哪些数据。
3. 小窗口下按钮不挤压，卡片不横向溢出。

### 5.2 任务中心

要做什么：

1. 顶部补状态汇总：等待、进行中、成功、失败、取消。
2. 筛选区保持项目、分类、状态三类，不新增复杂筛选。
3. 失败任务不能只靠 tooltip，要有明显失败原因入口。
4. 能复制 requestId；没有 requestId 时不显示假内容。
5. 刷新按钮和刷新 loading 状态清楚。

验收：

1. 用户不用点每行也能知道当前任务健康状态。
2. 失败任务能看原因，并能定位 requestId。
3. 表格横向滚动只发生在表格内部，不锁死整页。

### 5.3 小说/原文页

要做什么：

1. 顶部主按钮保持导入原文。
2. 搜索、批量删除、事件分析放在稳定工具栏。
3. 批量按钮只在选中后强调，不选中时弱化。
4. 事件状态清楚区分未分析、分析中、成功、失败。
5. 失败事件能看原因，后续补重试入口。
6. 原生 checkbox 后续要替换成统一组件或统一样式。

验收：

1. 用户知道先导入，再选章节分析事件。
2. 批量删除会说明数量和影响范围。
3. 分析中不会允许编辑/删除造成状态混乱。

## 6. 不在第一批做的原因

| 内容 | 为什么不现在做 |
|---|---|
| 设置页内部重排 | 已有快速定位，内部组件多，单独做更稳 |
| 剧本 Agent 三栏/窄屏 tabs | 影响 Agent 事件流和工作区状态，不能和项目页混做 |
| 资产/角景生成体验 | 涉及模型生成、任务轮询、媒体预览，要和状态/文件生命周期一起做 |
| 生产页流程总览 | 应该和 `OPT-051` 一起做，否则会重复改工作台 |
| 导出向导 | 应该和 `OPT-050` 一起做，否则会重复改导出链路 |

## 7. 数据和状态

字段：本任务清单阶段不新增字段。

接口/能力：本任务清单阶段不新增 IPC。

数据读写：无。

任务状态：第一批页面只展示已有任务/业务状态，不新增任务状态。

轮询/Socket：无新增。

模型调用：无新增。

删除影响：项目页删除风险展示会复用现有删除影响接口，不新增删除逻辑。

## 8. 不能漏的收口点

依赖谁：`OPT-048` 工作台骨架、`OPT-047` i18n、`OPT-042` Tailwind/SCSS 边界、`OPT-040` renderer 请求封装。

被谁依赖：`OPT-050` 工作台导航和导出体验、`OPT-051` 项目流程总览、后续资产/生产/导出页面整改。

样式契约：新增普通布局优先 Tailwind；不把新页面样式继续塞进 `index.scss`。

组件契约：能用 TDesign 或项目已有组件就不用裸 HTML 控件；禁止用原生 `title` 充当说明，统一用 `t-tooltip` 或组件内建 tooltip；图标按钮必须有可访问名称。

多语言契约：新增可见文案必须同时补 `zh-CN` 和 `en`。

滚动契约：主页面滚动层不能被弹窗/表格/卡片锁死；横向滚动限制在表格或局部容器。

危险操作契约：删除、清空、覆盖、批量操作必须说明影响范围。

异常契约：失败状态必须给用户可理解原因；有 requestId 时展示或可复制。

## 9. 验收标准

1. 本 task 覆盖所有主要页面，不漏登录、项目、设置、任务中心、原文、剧本 Agent、剧本、资产、角景、生产、导出、占位页、全局样式。
2. 第一批明确为项目页、任务中心、原文页。
3. 每个第一批页面都有“要做什么”和“验收”。
4. 清楚写出哪些不在第一批做，以及原因。
5. 写清 i18n、Tailwind、滚动、危险操作、失败原因规则。
6. 新增 verify 能检查本任务文档、TODO 和 03 当前焦点。
7. 第一批 verify 能检查项目页、任务中心、原文页关键 UI 改动。
8. 第四批必须检查页面和弹窗是否仍有裸 `title`、裸 checkbox、裸 input/select/button 承担组件库已有能力。
9. 文件上传入口组件化，业务页面不能直接写 `<input type="file">`，统一走 `VtFilePicker`。

## 10. 验证方式

```txt
D:\software\nodejs\node.exe scripts\verify-opt-049-page-ui-checklist.mjs
D:\software\nodejs\node.exe scripts\verify-opt-049-first-batch-ui.mjs
D:\software\nodejs\node.exe scripts\verify-opt-049-dialog-upload-ui.mjs
D:\software\nodejs\pnpm.cmd run verify:docs
D:\software\nodejs\pnpm.cmd run verify:project
D:\software\nodejs\pnpm.cmd run verify:content
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run build
```

## 11. 确认点

无需停等确认。采用以下专业判断：

1. `OPT-049` 先作为总任务清单固化，不把所有页面一次性大改。
2. 第一批只做项目页、任务中心、原文页。
3. 生产和导出不抢跑，分别交给 `OPT-051` 和 `OPT-050`。

## 12. 第一批执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/project/ProjectHome.vue`、`src/renderer/src/features/task-center/TaskCenter.vue`、`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-049-page-ui-checklist.mjs`、`scripts/verify-opt-049-first-batch-ui.mjs`、`scripts/verify-opt-047-project-i18n.mjs`、`scripts/verify.mjs`、`docs/TODO-优化与缺口.md`、`docs/03-执行进度.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-049-page-ui-checklist.mjs`、`D:\software\nodejs\node.exe scripts\verify-opt-049-first-batch-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

## 13. 第二批执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/layouts/WorkbenchLayout.vue`、`src/renderer/src/styles/index.scss`、`src/renderer/src/styles/tokens.scss`、`src/renderer/src/features/script/ScriptHome.vue`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/corner-scape/CornerScapeHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-049-second-batch-ui.mjs`、`scripts/verify.mjs`、`docs/TODO-优化与缺口.md`、`docs/03-执行进度.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-049-second-batch-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run verify:assets` 通过。

## 14. 第三批执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/auth/LoginHome.vue`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-049-login-ui.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-049-全页面交互UI整改清单.md`、`docs/TODO-优化与缺口.md`、`docs/03-执行进度.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-049-login-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

## 15. 第四批执行方案

第四批优先级高于继续零散修页面。当前用户反馈已经证明前三批只解决了局部结构，仍没有形成成熟桌面工作台的整体质感。

### 15.1 先改全局壳层

1. 左侧 72px 图标栏保留，但所有图标按钮移除原生 `title`，统一包 `t-tooltip`。
2. 右侧顶部改为 40-48px 的低高度 command bar。
3. command bar 只保留：当前项目、任务运行状态、回项目列表、设置、必要快捷键/诊断入口。
4. 页面标题、说明、主操作不再挤在全局顶部；交给页面内部紧凑 header。
5. 顶部不展示大项目卡，不展示长说明，不重复左侧已有的设置入口。

### 15.2 再改页面骨架

1. 所有页面采用统一结构：紧凑页面 header、主操作区、筛选/工具栏、内容区、空/失败/加载状态。
2. 页面 header 高度要克制，第一屏必须露出真实内容。
3. 不做卡片套卡片，不再用大 hero 当功能页头部。
4. 已有流程提示保留，但改成轻量 inline hint 或右侧状态，不占据首屏主体。

### 15.3 设置页作为第一落点

1. 删除 `ModuleScaffold`。
2. 删除顶部 sticky 大卡片 quick nav。
3. 左侧设置目录按“生成、工作区、账号、开发诊断”分组。
4. 右侧配置内容滚动，当前分组清楚高亮。
5. 模型服务、Agent、提示词仍保持前置，但入口不再平铺成卡片。
6. 开发者配置继续折叠，不和普通用户配置抢首屏。

### 15.4 弹窗和组件规则

1. 所有 `t-dialog`、`t-drawer` 检查宽度、滚动、footer、危险操作和关闭行为。
2. 详情类优先抽屉；表单类用弹窗或抽屉，但同一模块内保持一致。
3. 图标按钮统一 `t-tooltip`，不再依赖原生 `title`。
4. checkbox、select、input、button 优先 TDesign 组件。
5. 删除、清空、覆盖等危险动作必须使用组件化确认弹窗，并显示影响范围。
6. 复制、打开目录、刷新、设置、详情、预览等图标动作必须有 tooltip 和 aria label。

### 15.5 验收

1. 设置页首屏不再出现两层大头部。
2. 右侧顶部不再浪费大面积空间。
3. 页面第一屏能直接看到主要内容或主要工作区。
4. 全局可交互图标不用原生 `title`。
5. 能用组件库的控件不再使用裸控件。
6. 弹窗/抽屉打开关闭后滚动、焦点、footer 都正常。
7. 中文/英文文案仍走 i18n。
8. 专项 verify 覆盖壳层、设置页、tooltip/组件化规则。

## 16. 最后大白话

前三批解决了局部问题，但还没有达到“成熟桌面工作台”的整体水准。第四批要先收全局顶部、设置页和弹窗组件规则，再继续逐页修。原则很明确：少占空间、少堆入口、组件优先、tooltip 优先、用户第一屏先看到真正要操作的内容。

## 17. 第四批第一组执行记录

- 完成时间：2026-07-04
- 涉及文件：`src/renderer/src/layouts/WorkbenchLayout.vue`、`src/renderer/src/features/settings/SettingsHome.vue`、`src/renderer/src/features/settings/components/ModelServiceConfig.vue`、`src/renderer/src/features/settings/components/AgentConfig.vue`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/renderer/src/features/settings/components/RequestDiagnostics.vue`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/production/components/ProductionFlowNode.vue`、`src/renderer/src/features/production/components/ProductionImageFlowNode.vue`、`src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-049-fourth-batch-ui.mjs`、`scripts/verify.mjs`
- 完成内容：全局顶部压缩为低高度 command bar；设置页改为左侧目录 + 右侧配置；模型服务内嵌 Agent 配置拆出，避免卡片套卡片；renderer 原生 `title` tooltip 清理，图标说明统一 `t-tooltip`；生产工作台关键 checkbox 改为 `t-checkbox`；新增第四批 UI 防回退校验。
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-049-fourth-batch-ui.mjs`、`D:\software\nodejs\node.exe scripts\verify-opt-049-fourth-batch-plan.mjs`、`D:\software\nodejs\node.exe scripts\verify-opt-049-page-ui-checklist.mjs`、`D:\software\nodejs\node.exe scripts\verify-opt-049-second-batch-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

## 18. 第四批第二组执行记录

- 完成时间：2026-07-04
- 涉及文件：`src/renderer/src/components/VtFilePicker.vue`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/features/script/ScriptHome.vue`、`src/renderer/src/features/project/components/ManualFormDialog.vue`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-049-dialog-upload-ui.mjs`、`scripts/verify.mjs`
- 完成内容：文件上传入口组件化，业务页面原生 file input 清零；资产、原文、剧本和手册封面上传统一走 `VtFilePicker`；全局 TDesign 弹窗/抽屉补 header/body/footer、滚动、边界和 footer 行为；新增文件上传和弹窗/抽屉治理防回退校验。
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-049-dialog-upload-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

## 19. 最终收口执行记录

- 完成时间：2026-07-04
- 涉及文件：`src/renderer/src/features/script-agent/ScriptAgentHome.vue`、`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/features/auth/LoginHome.vue`、`src/renderer/src/features/shared/ModuleScaffold.vue`、`src/renderer/src/i18n/messages.ts`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-049-final-ui.mjs`、`scripts/verify.mjs`
- 完成内容：剧本 Agent 页从两栏堆叠改为对话、计划、剧本结果三栏；原文失败事件补单项重试分析；登录错误态补重试和刷新应用恢复动作；共享占位页补下一步提示和组件化状态标签；新增最终收口防回退校验并接入 `docs/project/content` 分组。
- 当前剩余内容：无。真实 API 端到端生成验收、剪映原生 schema、WebAV mp4 和 ComfyUI 视频 workflow 不属于 OPT-049 交互 UI 整改口径，继续按对应业务任务处理。
- 验证结果：以本次最终执行的专项、分组回归、`typecheck` 和 `build` 结果为准。
