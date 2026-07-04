# TODO 优化与缺口

这个文件是全项目优化总账。

它不替代 `docs/tasks/*.md`。`tasks` 负责“某个功能怎么实现”，这里负责记录“全局缺口、后期优化、跨模块风险、已经发现但还没有闭环的问题”。

## 1. 使用规则

- `【 】` 表示没做。
- `【√】` 表示已经做完，并且有验证结果。
- `处理状态` 用来说明这一项怎么进入开发，避免重复开任务。
- 每一项必须写清楚：问题、为什么要做、怎么做、完成标准、验证方式。
- 发现新问题，先记到这里，再决定是否拆成 task。
- 如果某项要正式开发，必须创建或关联 `docs/tasks/xxx.md`。
- task 做完以后，回到这里把状态改成 `【√】`，并补完成时间、验证结果、涉及文件。
- 不能只因为“代码看起来有”就标完成，必须有验证方式。
- 已完成项的完成记录必须写具体文件、验证命令或手动验证结果，不能只写“相关文件”。
- 内容不随意删除；如果某项被并入或覆盖，正文保留，但必须在 `处理状态` 和推荐顺序里写清归属。

处理状态取值：

- 独立处理：后续单独做一个 task 或批次处理。
- 并入：不单独开 task，跟随指定任务一起做。
- 覆盖：被另一个更完整的 TODO 覆盖，不再按原项单独实现。
- 已完成：已经实现并有验证记录。
- 持续规则：不是一次性任务，每个批次都要检查。
- 暂不做：明确暂缓，必须写原因。

## 2. 优先级

- P0：不做会影响后续所有业务，必须优先处理。
- P1：会影响稳定性、可维护性或用户理解，尽快处理。
- P2：体验优化或工程整理，可以排在业务主线之后。

注意：

- 优先级表示影响等级。
- 推荐处理顺序表示实际执行顺序。
- 二者不是一回事；例如 `.gitignore`、verify、文档联动虽然是 P2，但为了让后续开发不乱，可以排在前面先收稳。

---

## 3. 推荐处理顺序

编号不重排，避免 `OPT-xxx` 引用失效；后续真正处理时按下面顺序走。原则是：**先做全局规则和底层治理，再做模型和默认资源，再做前端治理，最后做业务链路和工程整理。**

### 3.1 第一批：工程入口和文档状态先收稳

这些先做，目的是让后续执行不再因为环境、脚本、文档状态混乱而返工。

| 顺序 | TODO | 处理方式 | 说明 |
|---|---|---|---|
| 1 | `OPT-026` 固定使用用户本机 pnpm | 已完成 | 继续遵守，不再重复实现 |
| 2 | `OPT-044` `.gitignore` 异常内容清理 | 已完成 | 已删除误粘贴残留，保留必要忽略规则 |
| 3 | `OPT-043` verify 脚本分组入口和 package scripts 规范 | 已完成 | 已新增分组入口，`build` 不再嵌套调用 pnpm，并同步覆盖 `OPT-025` |
| 4 | `OPT-045` docs、tasks、TODO 三套文档状态联动 | 已完成 | 已新增文档状态校验脚本和工程治理批次文档 |
| 5 | `OPT-046` 参考项目差异和 VT Studio 增强边界复核 | 已完成本轮复核 | 后续每个批次完成后继续回查 |

### 3.2 第二批：接口、错误、状态、字典

这些是所有模块都要复用的基础契约，必须早于资产、生产、导出。

| 顺序 | TODO | 处理方式 | 说明 |
|---|---|---|---|
| 6 | `OPT-027` 响应格式细化和错误追踪 | 已完成 | 保留 `{ code, data, msg }`，失败 `data` 已补 `errorCode/msgKey/requestId` |
| 7 | `OPT-012` `{ code, data, msg }` 与多语言闭环 | 已完成 | 已由 `OPT-027` 覆盖，补 `status.xxx` 中英文文案 |
| 8 | `OPT-028` 默认字典集中管理 | 已完成 | 已建立 shared 字典入口，状态、类型、mode、主题、语言等从统一字典派生 |
| 9 | `OPT-011` 全局字典值统一 | 已完成 | 已由 `OPT-028` 覆盖，不再分散做 |
| 10 | `OPT-013` 任务状态和业务状态分层 | 已完成 | 已建立状态分层规则和校验，防止任务状态和业务状态混用 |
| 11 | `OPT-038` 任务并发和业务锁统一 | 已完成 | 已建立统一业务锁 service，删除项目和数据库危险操作统一查锁 |

### 3.3 第三批：默认资源、seed、runtime

这些决定参考项目资源能不能真正“文件有、数据库有、页面可见、链路可用”。

| 顺序 | TODO | 处理方式 | 说明 |
|---|---|---|---|
| 12 | `OPT-029` 默认资源 registry 统一 | 已完成 | 已由 `CORE-014` 建立默认资源 registry |
| 13 | `OPT-030` seed 模块化和幂等 helper | 已完成 | 已拆分 seed 入口和领域文件，并统一 seed helper |
| 14 | `OPT-001` 默认资源诊断与恢复 | 已完成 | 已由 `CORE-014` 增加诊断和恢复 |
| 15 | `OPT-002` 默认资源清单统一 | 已完成 | 已由 `OPT-029/CORE-014` 覆盖 |
| 16 | `OPT-010` 默认模板和参考资料可直接使用 | 已完成 | 已验证默认资料进入文件、数据库和业务入口 |
| 17 | `OPT-039` 参考项目资源对账表 | 已完成 | `diagnoseDefaultAssets()` 已输出文件、数据库、页面、链路状态 |
| 18 | `OPT-017` runtime 诊断和恢复策略 | 已完成 | 文件管理已显示 userData 来源、是否在项目目录、可清理/可恢复/保护目录 |
| 19 | `OPT-018` `director_skills` 与 `driector_skills` 旧痕迹清理 | 已完成 | 新写入用正确目录；旧拼写只兼容读取；默认资源旧目录已删除 |
| 20 | `OPT-003` Skill embedding 重建闭环 | 已完成 | Skill 管理已补重建全部/当前 references Skill 向量入口 |

### 3.4 第四批：模型能力和请求可观测

模型先打通，后面资产图片、视频、TTS、ComfyUI 才能跑通。

| 顺序 | TODO | 处理方式 | 说明 |
|---|---|---|---|
| 21 | `OPT-031` 模型能力矩阵统一 | 已完成 | 所有模型能力已统一表达 |
| 22 | `OPT-005` 供应商模型模式改成受控值 | 已完成 | 已由 `OPT-031` 覆盖，mode 改为受控多选和统一解析 |
| 23 | `OPT-004` 视频模型 mode 与提示词模板映射闭环 | 已完成 | 真实视频提示词生成已按模型和 mode 读取模板 |
| 24 | `OPT-053` 模型连接和 vendor 双写一致性 | 已完成 | 普通模型连接、默认绑定、底层 vendor 已建立主数据和运行投影一致性 |
| 25 | `OPT-006` 多协议模型调用统一 | 已完成 | 文本、图片、视频、TTS 已统一经过模型调用网关 |
| 26 | `OPT-052` 自定义 adapter 安全边界 | 已完成 | adapter 初始化、网络、轮询、日志和诊断边界已收口 |
| 27 | `OPT-032` 模型调用取消、超时、重试和落盘规范 | 已完成 | 模型调用运行治理已完成；文件生命周期第一版已由 `OPT-BATCH-002` 收口，历史媒体元数据深补后置 |
| 28 | `OPT-014` 大模型请求可观测 | 已完成 | 最近模型请求摘要、requestId、耗时、失败原因、脱敏诊断已完成 |
| 29 | `OPT-015` HTTP 和本地服务请求诊断 | 已完成 | 本地服务、Socket、media 路由、最近本地请求失败和模型请求摘要已接入请求诊断 |
| 30 | `OPT-035` 密钥存储、脱敏、备份和导出规范 | 已完成 | 页面不回传明文密钥，日志/诊断/任务失败原因统一脱敏，完整数据库备份明确标记含密钥 |
| 31 | `OPT-033` ComfyUI workflow 规范 | 已完成 | 图片 workflow manifest、节点映射、队列轮询、输出读取已接入；视频 workflow 不伪装支持 |
| 32 | `OPT-007` ComfyUI 能力边界确认和接入 | 已由 `OPT-033` 覆盖 | 第一版只支持图片 workflow，边界已写入任务和偏差 |

### 3.5 第五批：前端契约、样式、多语言

这些不挡底层，但会影响所有后续页面质量；P8 开始前最好收一轮。

| 顺序 | TODO | 处理方式 | 说明 |
|---|---|---|---|
| 33 | `OPT-040` renderer 请求封装和提示统一 | 已完成 | 已新增 `useVtRequest`，并完成设置页和任务中心样板迁移 |
| 34 | `OPT-041` renderer 全局错误边界 | 已完成 | Vue/window/Promise/router 兜底和 RouterView 错误边界已完成；Socket/media 细节归后续专项 |
| 35 | `OPT-047` 可见文案 i18n 全量治理 | 已完成 | 第一批到第十六批和收尾复扫已完成；除语言包和允许的中文解析正则外，renderer 无中文硬编码；全局 sweep 已接入验证 |
| 36 | `OPT-042` Tailwind 优先和 SCSS 边界治理 | 已完成 | 已固定样式边界和防回退校验；旧 SCSS 后续按页面逐步收敛 |
| 37 | `OPT-048` 全局菜单和页面布局治理 | 已完成第一批 | 已收口工作台骨架、菜单去重、设置快速定位；逐页体验继续走 OPT-049/050/051 |
| 38 | `OPT-049` 全页面交互 UI 整改清单 | 已完成 | 第一批到第四批第二组和最终收口均已完成；剧本 Agent 三栏、原文失败重试、登录恢复动作、ModuleScaffold 下一步提示和最终防回退校验已闭环 |
| 39 | `OPT-051` 项目流程总览和流程驱动交互 | 已完成 | 第四批已补任务中心失败原因联动，流程总览、下一步提示、真实统计和失败任务跳转均已闭环 |
| 40 | `OPT-055` 最近打开项目和项目上下文恢复 | 已完成 | 最近项目保存、刷新恢复、启动恢复、路由同步和删除清理已完成 |
| 41 | `OPT-050` 工作台导航和导出体验治理 | 已完成 | 独立导出中心、生产工作台快捷导出检查、普通用户编号显示治理、菜单顺序和复制任务 ID 已完成 |
| 42 | `OPT-024` 页面卡住和滚动锁死专项检查 | 已完成 | 已补应用外壳、主滚动区、侧栏、TDesign 弹窗和生产大弹窗滚动兜底 |
| 43 | `OPT-022` 设置页不再拆成用户理解不了的配置孤岛 | 已完成 | 已改成按“生成前配置 / 本地工作区 / 账号版本 / 开发诊断”分组导航 |
| 44 | `OPT-023` 多主题不是只做浅色深色 | 已完成 | 继续保留完成记录 |

### 3.6 第六批：资产、生产、导出业务链路

底层和模型稳住以后，再进入业务链路补强。

| 顺序 | TODO | 处理方式 | 说明 |
|---|---|---|---|
| 45 | `OPT-008` 角色图和资产生成规则统一 | 已完成 | 资产图片用途、视图模式、生成 prompt 和追溯元数据已统一 |
| 46 | `OPT-009` 视觉手册和导演手册真正参与生成链路 | 已完成 | 资产、分镜、衍生资产、视频提示词和 Production Agent 已接入手册 |
| 47 | `OPT-034` 生成链路记录提示词和手册快照 | 已完成 | 生成结果快照、requestId、手册/模板记录和页面查看入口已完成 |
| 48 | `OPT-054` 上游变更与下游失效规则 | 已完成 | 依赖状态字段、失效 helper、服务接入、页面提示、导出阻断和专项 verify 已完成 |
| 49 | `OPT-036` 资产文件生命周期和孤儿文件清理 | 已完成 | 已并入 `OPT-BATCH-002`，完成文件生命周期诊断、安全清理和缓存/临时目录治理 |
| 50 | `OPT-020` 图片生成到视频生成的素材规范 | 已完成 | 已并入 `OPT-BATCH-002`，资产图、分镜图、视频候选和轨道导出引用已统一 |
| 51 | `OPT-021` 导出结构提前定死 | 已完成 | 已并入 `OPT-BATCH-002`，导出目录和 VT Studio 草稿结构已固定；真实剪映原生 schema 后置 |
| 52 | `OPT-056` 导出历史和可复现记录 | 已完成 | 导出历史、可复现快照、页面详情和专项 verify 已完成 |
| 53 | `OPT-037` 项目整体导入导出包规范 | 已完成 | 第一版目录型 `.vtproject` 项目包已完成 |

### 3.7 第七批：收尾整理

这些可以在主业务推进中穿插，不应该挡住 P8/P9/P10。

| 顺序 | TODO | 处理方式 | 说明 |
|---|---|---|---|
| 54 | `OPT-016` 终端日志可读性优化 | 已完成 | 保留完成记录 |
| 55 | `OPT-019` out、dist、缓存产物清理规范 | 已完成 | 已明确源码、构建产物、依赖缓存、runtime 数据边界，并补防回退校验 |
| 56 | `OPT-025` verify 脚本统一入口 | 已完成 | 已由 `OPT-043` 覆盖并回填验证记录 |

---

## P0 底层必须补

### 【√】OPT-001 默认资源诊断与恢复

优先级：P0

处理状态：已完成；由 `CORE-014` 落地。

关联任务：`docs/tasks/CORE-014-默认资源治理.md`

问题：

当前默认资源同步只做“缺文件复制”，不检查文件是否为空、是否损坏、md5 是否一致、数据库是否已经正确 seed。

为什么要做：

后续 Skill、视觉手册、导演手册、模型提示词、供应商 adapter 都依赖这些默认资源。只要资源和数据库不同步，就会出现“文件有，但页面空”“数据库有，但业务用不上”“模型配置看得到，但实际调用失败”。

怎么做：

1. 新增默认资源诊断 service。
2. 检查 `resources/default-data` 是否包含必须分类：
   - `skills`
   - `vendors`
   - `modelPrompt`
   - `models`
   - `assets`
3. 检查 runtime 目录是否已经同步这些分类。
4. 检查文件是否存在、是否为空、md5 是否变化。
5. 检查 `skill_list` 是否能对应到真实 Skill 文件。
6. 检查 `visual_manuals`、`director_manuals` 的 tabs 是否为空。
7. 检查 `model_prompt_templates` 是否包含默认视频模板。
8. 检查 `model_vendors` 是否和默认 vendor 文件一致。
9. 检查 ONNX embedding 模型文件是否存在。
10. 提供可修复项的恢复能力：
    - 缺文件从默认资源补。
    - 空 tabs 重新写入默认内容。
    - 缺默认模板重新 seed。
    - 缺 vendor 重新补数据库。
    - Skill md5 不一致时更新状态。

完成标准：

1. 能输出统一诊断结果。
2. 结果能区分 `ok`、`warning`、`error`。
3. 每条异常都能说明是否可自动修复。
4. 新装环境运行诊断不能出现 P0 错误。
5. 删除一个默认资源文件后，诊断能发现并恢复。

验证方式：

1. 增加专项 verify 脚本。
2. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。
3. 跑 `D:\software\nodejs\pnpm.cmd run build`。
4. 手动删一个 runtime 默认文件，验证能补回。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/default-assets/registry.ts`、`src/main/services/default-assets/diagnostics.ts`、`src/main/services/default-assets/index.ts`、`src/main/services/database/seed.ts`、`src/main/services/database/seed-default-assets.ts`、`scripts/verify-core-014-default-assets.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-core-014-default-assets.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run build` 通过。验证覆盖删除 runtime 默认提示词文件后恢复、删除默认 Skill 记录后恢复。

### 【√】OPT-002 默认资源清单统一

优先级：P0

处理状态：已完成；由 `OPT-029/CORE-014` 默认资源 registry 覆盖。

关联任务：`docs/tasks/CORE-014-默认资源治理.md`

问题：

默认供应商、默认手册、默认提示词、默认 Skill 现在散落在不同文件里，容易出现两套清单不一致。

为什么要做：

后续新增供应商、模型模板、手册风格时，如果要改多个地方，迟早会漏。

怎么做：

1. 抽出统一默认资源清单。
2. seed、诊断、恢复都从这份清单读取。
3. 供应商 id 只维护一份。
4. 视觉手册和导演手册的目录、tab、封面也只维护一份。
5. 默认模型提示词模板只维护一份。

完成标准：

1. 新增一个默认 vendor 时，不需要同时改两套 vendor id。
2. seed 和 diagnostics 使用同一份清单。
3. 不再出现“文件有，数据库没注册”的默认项。

验证方式：

1. verify 检查清单和 `resources/default-data` 一致。
2. verify 检查清单和数据库 seed 结果一致。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/default-assets/registry.ts`、`src/shared/constants/manuals.ts`、`src/main/services/database/seed.ts`、`src/main/services/database/seed-default-assets.ts`
- 验证结果：默认供应商、默认手册、默认模型提示词、默认 Skill、默认 ONNX 路径均从 registry 或 shared 手册页签配置派生；`verify-core-014-default-assets.mjs` 通过。

### 【√】OPT-003 Skill embedding 重建闭环

优先级：P0

处理状态：已完成；在 Skill 管理里补齐一键重建入口。

关联任务：`docs/tasks/OPT-003-Skill embedding重建闭环.md`

问题：

底层已经有 `rebuildSkillEmbeddings()`，但 Skill 管理没有完整的 IPC、preload、页面操作入口。保存 references Skill 后会变成过期状态，但用户没有明确的一键重建闭环。

为什么要做：

剧本 Agent、生产 Agent 后续需要按语义检索 references Skill。如果 embedding 没生成，Agent 质量会明显下降。

怎么做：

1. 增加 Skill embedding 重建 IPC。
2. preload 暴露：
   - 重建全部 references Skill。
   - 重建单个 Skill。
3. Skill 管理页面显示：
   - ready
   - expired
   - failed
4. 保存 references Skill 后保留 expired 状态。
5. 重建成功后改成 ready。
6. 重建失败时记录失败原因，不吞错误。
7. ONNX 模型缺失时作为重建请求失败提示，不写假成功。

完成标准：

1. Skill 页面可以看到哪些 Skill 需要重建。
2. 点击重建后，references Skill 能从 expired 变 ready。
3. ONNX 模型缺失时给出可理解提示。
4. 重建失败不会破坏原 Skill 文件。

验证方式：

1. 修改一个 references Skill。
2. 保存后确认状态 expired。
3. 执行重建。
4. 查询数据库确认 `embedding` 非空、`state=1`。
5. 跑 `verify-core-011` 和 Skill 管理相关 verify。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/skill-management.ts`、`src/main/services/settings/skill-management.ts`、`src/main/services/skill-retrieval/index.ts`、`src/main/ipc/settings.ts`、`src/shared/contracts/preload.ts`、`src/preload/index.ts`、`src/renderer/src/features/settings/components/SkillManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-f-002-007.mjs`、`docs/tasks/OPT-003-Skill embedding重建闭环.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-f-002-007.mjs`、`D:\software\nodejs\node.exe scripts\verify-core-011.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-004 视频模型 mode 与提示词模板映射闭环

优先级：P0

处理状态：已完成；`OPT-031` 已完成 mode 展示、绑定和清除，本任务补齐真实生成时按 mode 读取模板。

关联任务：`docs/tasks/OPT-004-视频模型mode与提示词模板映射闭环.md`

问题：

数据表支持 `model_mode`，页面也传 `modelMode`，但模型提示词配置服务构建模型列表时，视频模型 mode 没有按实际模式展开。

为什么要做：

视频生成不是一个固定协议。首帧、首尾帧、多参数、单图首帧等模式需要不同提示词模板。如果 mode 不闭环，绑定模板会失真。

怎么做：

1. 从 vendor model 的 `mode` 读取真实模式。
2. 图片模型保持现有模式。
3. 视频模型按 mode 展开成多条绑定项。
4. `model_prompt_mappings` 使用 `connection_id + model_name + model_type + model_mode` 唯一定位。
5. 默认 fallback 根据 mode 选择最接近的默认视频模板。
6. 清理无效映射时必须包含 mode。

完成标准：

1. 同一个视频模型的不同 mode 能分别显示。
2. 每个 mode 能单独绑定模板。
3. 清除一个 mode 的绑定，不影响其他 mode。
4. 项目里选择的视频 mode 能拿到对应模板。

验证方式：

1. 准备一个有多个 video mode 的 vendor。
2. 分别绑定两个不同模板。
3. 查询数据库确认写入不同 `model_mode`。
4. 调用视频提示词生成时确认使用正确模板。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/settings/model-prompt.ts`、`src/main/services/production/service.ts`、`scripts/verify-opt-004-model-prompt-mode.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-004-model-prompt-mode.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 已完成部分：`OPT-031` 已让 `model-prompt` 按 `capabilityMatrix` 展开 image/video mode，绑定和清除使用 `connection_id + model_name + model_type + model_mode`；本任务已让生产视频提示词真实生成时读取 mode 专用模板、默认模型模板和 `videoPromptGeneration` fallback。

### 【√】OPT-005 供应商模型模式改成受控值

优先级：P0

处理状态：已完成；由 `OPT-031` 模型能力矩阵覆盖。

关联任务：`docs/tasks/OPT-031-模型能力矩阵统一.md`

问题：

视频模型 mode 目前容易变成手填字符串。只要填错，项目配置、提示词模板、实际调用都会错。

为什么要做：

模型协议是底层能力，不应该靠用户手填模糊字符串维护。

怎么做：

1. 从参考项目 vendor manifest 中提取已有 mode。
2. 建立统一 mode 字典。
3. UI 中视频 mode 使用可选择项，不使用随意手填。
4. 仍保留高级自定义入口，但必须验证格式。
5. 支持数组 mode，但存储前要规范化。

完成标准：

1. 普通用户不能填出非法 mode。
2. 高级用户填错 mode 时保存失败并提示原因。
3. 项目视频 mode、提示词映射、模型测试使用同一套 mode 值。

验证方式：

1. 保存非法 mode，必须失败。
2. 保存合法 mode，项目配置能选择。
3. 模型测试能带正确 mode。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/model-capabilities.ts`、`src/main/services/model/capability-matrix.ts`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue`
- 验证结果：`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\node.exe scripts\verify-opt-031-model-capabilities.mjs`、`D:\software\nodejs\pnpm.cmd run verify:core` 通过。

### 【√】OPT-006 多协议模型调用统一

优先级：P0

处理状态：已完成；模型调用已收口到 main 侧统一网关，adapter 安全、取消、超时、重试仍由后续 OPT-052/OPT-032 承接。

关联任务：补充 `CORE-007-模型适配层.md`

问题：

项目同时存在 SDK 模型、OpenAI compatible、参考项目自定义 adapter、ComfyUI workflow。后续如果没有统一协议，会越写越乱。

为什么要做：

文本、图片、视频、TTS 都要走同一个模型服务入口，任务中心、日志、错误码、取消、超时才能统一。

怎么做：

1. 保持 main service 作为唯一调用入口。
2. renderer 不允许直接接触 SDK、文件系统、SQLite。
3. 标准化能力：
   - text
   - image
   - video
   - tts
4. 标准化入参：
   - vendorId
   - modelName
   - mode
   - prompt
   - input assets
   - output directory
   - timeout
5. 标准化出参：
   - taskId
   - status
   - output files
   - raw metadata
   - fail reason
6. SDK 类模型走 SDK。
7. 参考项目 adapter 和 ComfyUI 走 adapter runner。
8. 所有密钥和路径只写日志 detail，不直接返回页面。

完成标准：

1. 所有模型调用都能进入统一日志和任务中心。
2. 文本、图片、视频、TTS 至少各有一个测试入口。
3. 失败时返回统一 `{ code, data, msg }`。
4. 不在页面层出现模型 SDK import。

验证方式：

1. 全局搜索 renderer，不能出现模型 SDK。
2. 跑模型测试 verify。
3. 故意填错 key，确认错误码、任务失败原因、日志都正确。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/model/gateway.ts`、`src/main/services/model/text.ts`、`src/main/services/model/media.ts`、`src/main/services/model/test.ts`、`scripts/verify-opt-006-model-gateway.mjs`、`scripts/verify.mjs`、`scripts/verify-p13-model-adapters.mjs`、`docs/tasks/OPT-006-多协议模型调用统一.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-006-model-gateway.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:production` 通过。

---

## P0 业务链路缺口

### 【√】OPT-007 ComfyUI 能力边界确认和接入

优先级：P0

处理状态：已完成；由 `OPT-033` ComfyUI workflow 规范覆盖，不单独做第二套边界文档。

关联任务：`docs/tasks/OPT-033-ComfyUI-workflow规范.md`

问题：

项目需要明确 ComfyUI 到底支持哪些能力：文生图、图生图、视频、工作流参数、队列轮询、输出文件回收。

为什么要做：

如果不先定边界，后面资产生成和视频生成会写成两套逻辑。

怎么做：

1. 先看参考项目 ComfyUI adapter 怎么定义。
2. 明确第一版支持：
   - 图片工作流
   - 是否支持视频工作流
   - workflow JSON 来源
   - 输入节点映射
   - 输出节点读取
3. 抽象 workflow 配置。
4. 生成任务统一写任务中心。
5. 输出文件统一进入项目素材目录。

完成标准：

1. ComfyUI 可以作为普通供应商启用。
2. 图片生成能通过任务中心看到等待、运行、成功、失败。
3. 如果暂不支持视频，页面和文档必须明确说明，不允许假装支持。

验证方式：

1. 用本地 ComfyUI 地址跑一次测试。
2. 检查输出文件落在受控目录。
3. 检查任务状态和失败原因。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`docs/tasks/OPT-033-ComfyUI-workflow规范.md`、`src/main/services/model/comfyui-workflow.ts`、`src/main/services/model/builtin-vendors.ts`、`src/main/services/settings/model-config.ts`
- 验证结果：由 `OPT-033` 统一验证；第一版只支持图片 workflow，视频 workflow 明确不作为已完成能力。

### 【√】OPT-008 角色图和资产生成规则统一

优先级：P0

处理状态：已完成；资产格式会影响资产中心、角景、分镜和视频生成，必须先定。

关联任务：`docs/tasks/OPT-008-角色图和资产生成规则统一.md`

问题：

角色图到底是单张形象图、方位图、状态图、衍生图，当前需要统一规则。否则后面资产中心、角景、分镜生成会各写各的。

为什么要做：

角色、场景、道具是生产工作台的底层资产。资产格式不统一，视频生成时引用会混乱。

怎么做：

1. 参考 Toonflow 的资产结构和视觉手册 prompt。
2. 定义资产类型：
   - character
   - scene
   - prop
   - segment
   - audio
3. 定义角色图类型：
   - 原始主图
   - 衍生状态图
   - 可选方位图
4. 定义图片历史：
   - 当前选中图
   - 历史候选图
   - 生成参数
   - 使用的模型和提示词
5. 定义提示词来源：
   - 原文提取信息
   - 视觉手册
   - 项目画质配置
   - 用户补充描述
6. 定义生成结果存储目录。

完成标准：

1. 每个资产都能知道主图是哪张。
2. 每张生成图都能追溯模型、prompt、mode、任务。
3. 分镜生成引用资产时不会拿错图。

验证方式：

1. 创建角色资产。
2. 生成主图。
3. 生成衍生图。
4. 切换选中图。
5. 生产工作台读取到正确资产图。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/dictionaries.ts`、`src/shared/types/assets.ts`、`src/main/services/assets/migrations.ts`、`src/main/services/assets/service.ts`、`src/main/services/production/service.ts`、`scripts/verify-opt-008-asset-image-rules.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-008-角色图和资产生成规则统一.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-008-asset-image-rules.mjs`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-009 视觉手册和导演手册真正参与生成链路

优先级：P0

处理状态：已完成；手册已进入资产、生产和视频提示词生成链路，并记录手册版本摘要。

关联任务：`docs/tasks/OPT-009-视觉手册和导演手册真正参与生成链路.md`

问题：

现在默认手册已经能 seed，但后续生成提示词时必须确认它们真的参与，而不是只在项目表里选一下。

为什么要做：

视觉手册决定画风，导演手册决定叙事和分镜。如果生成链路没用到，最终效果会和参考项目偏离。

怎么做：

1. 项目创建和编辑继续强制选择视觉手册和导演手册。
2. 新增统一手册读取 helper，读取 `visual_manuals` / `director_manuals` 的 `tabs_json`。
3. 资产提示词和资产图片生成读取视觉手册：
   - `prefix`
   - `character`
   - `characterDerivative`
   - `scene`
   - `sceneDerivative`
   - `prop`
   - `propDerivative`
4. 分镜图和生产衍生资产图读取：
   - 视觉手册 `prefix + storyboard`
   - 导演手册 `planning + storyboardTable`
5. 视频提示词生成读取：
   - 视觉手册 `prefix + storyboardVideo`
   - 导演手册 `planning + storyboardTable`
6. Production Agent 上下文返回视觉手册和导演手册内容。
7. 任务 `relatedObjects` 和生成媒体 `metadata` 记录实际使用的手册版本摘要。
8. 手册为空或关键 tab 缺失时阻止生成，不静默降级。

完成标准：

1. 资产图片生成 prompt 中能看到视觉手册内容参与。
2. 分镜图生成 prompt 中能看到视觉手册和导演手册内容参与。
3. 视频提示词生成时能看到视觉手册和导演手册内容参与。
4. Production Agent 上下文能返回手册内容。
5. 手册内容为空时不会静默生成。
6. 任务和生成媒体能记录手册 ID、路径、更新时间、内容 hash。

验证方式：

1. 跑 `D:\software\nodejs\node.exe scripts\verify-opt-009-manual-generation-chain.mjs`。
2. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。
3. 跑 `D:\software\nodejs\pnpm.cmd run verify:assets`。
4. 跑 `D:\software\nodejs\pnpm.cmd run verify:production`。
5. 跑 `D:\software\nodejs\pnpm.cmd run verify:docs`。
6. 跑 `D:\software\nodejs\pnpm.cmd run build`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/project/manual-prompt.ts`、`src/main/services/assets/service.ts`、`src/main/services/production/service.ts`、`src/shared/types/production.ts`、`scripts/verify-opt-009-manual-generation-chain.mjs`、`scripts/verify-opt-008-asset-image-rules.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-009-视觉手册和导演手册真正参与生成链路.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-009-manual-generation-chain.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-010 默认模板和参考资料可直接使用

优先级：P0

处理状态：已完成；由 `CORE-014` 验证“文件有、库里有、页面可见、链路可用”。

关联任务：`docs/tasks/CORE-014-默认资源治理.md`

问题：

默认模板、Skill、手册已经有文件，但必须保证用户打开项目后能直接用，而不是还要手工拷贝或手工初始化。

为什么要做：

用户目标是“参考项目怎么做，这里就能直接用”。默认资料如果只是躺在 resources 里，没有进入业务链路，等于没搬过来。

怎么做：

1. 新装启动自动同步默认资源。
2. 数据库自动 seed 默认资料。
3. 设置页能查看这些默认资料。
4. 项目创建能选择默认视觉手册和导演手册。
5. 生成链路能读取默认模板。
6. 缺失时诊断能提示并恢复。

完成标准：

1. 全新 runtime 启动后，不手工操作也能看到默认供应商、默认 Skill、默认手册、默认视频模板。
2. 创建项目时可以直接选择手册。
3. 生成链路能直接使用默认内容。

验证方式：

1. 使用干净 runtime 启动。
2. 打开设置和项目创建。
3. 检查默认资料可见。
4. 执行一次最小生成链路。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`resources/default-data/skills`、`resources/default-data/modelPrompt`、`resources/default-data/vendors`、`src/main/services/default-assets/registry.ts`、`src/main/services/default-assets/diagnostics.ts`、`src/main/services/database/seed-default-assets.ts`
- 验证结果：`verify-core-014-default-assets.mjs` 已验证默认文件同步、默认模型提示词入库、视觉/导演手册入库、默认 Skill 入库、供应商入库和缺失恢复。

---

## P1 数据、字典、状态

### 【√】OPT-011 全局字典值统一

优先级：P1

处理状态：已完成；由 `OPT-028` 默认字典集中管理承接。

关联任务：`docs/tasks/OPT-028-默认字典集中管理.md`

问题：

项目里会出现大量状态和枚举：任务状态、资产类型、模型类型、视频 mode、图片 mode、项目 sourceType、画质、比例、时长、分辨率。如果不统一，后期会出现同一个意思多个值。

为什么要做：

字典不统一会直接导致筛选失败、状态显示错误、业务判断漏分支。

怎么做：

1. 建立 shared constants。
2. main 和 renderer 共用同一套类型。
3. 数据库存储值使用稳定英文 key。
4. 页面展示走 i18n。
5. 禁止页面自己随手写散落字符串。

完成标准：

1. 关键状态都能在 shared constants 找到。
2. 全局搜索同类状态，不再有明显重复写法。
3. 数据库值和页面展示分离。

验证方式：

1. 增加类型检查。
2. 增加状态映射 verify。
3. 手动切换语言，确认展示不影响数据库值。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/dictionaries.ts`、`src/shared/types/assets.ts`、`src/shared/types/project.ts`、`src/shared/types/task.ts`、`src/shared/types/source.ts`、`src/shared/types/script-agent.ts`、`src/shared/types/production.ts`、`src/shared/types/vendor.ts`、`src/main/services/model/validation.ts`、`src/main/services/project.ts`、`src/main/services/assets/service.ts`、`src/main/services/production/service.ts`、`src/renderer/src/i18n/index.ts`、`src/renderer/src/features/settings/appearance/theme.ts`、`src/renderer/src/features/project/ProjectHome.vue`、`src/renderer/src/features/project/components/ProjectFormDialog.vue`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue`、`src/renderer/src/features/production/components/ProductionImageFlowDialog.vue`、`scripts/verify-opt-028-dictionaries.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-028-默认字典集中管理.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-028-dictionaries.mjs` 通过；`D:\software\nodejs\pnpm.cmd run typecheck` 通过；`D:\software\nodejs\pnpm.cmd run verify:core` 通过；`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-012 `{ code, data, msg }` 与多语言闭环

优先级：P1

处理状态：已完成；由 `OPT-027` 响应格式细化和错误追踪承接。

关联任务：`docs/tasks/OPT-027-响应格式细化和错误追踪.md`、`CORE-002-IPC契约层.md`、`CORE-005-Result和错误.md`

问题：

当前固定返回 `{ code, data, msg }` 是对的，但多语言场景下，msg 如果全部由 main 写中文，后续英文界面会不一致。

为什么要做：

用户要多语言。底层返回格式不能破坏，但前端展示需要可翻译。

怎么做：

1. 保持返回格式不变：`{ code, data, msg }`。
2. main 返回中文 fallback msg。
3. data 里允许带 `msgKey` 和 `msgParams`，但不强制每个接口都有。
4. renderer 优先用 `msgKey` 翻译，没有则显示 `msg`。
5. 错误码文案维护在 shared 状态码表。

完成标准：

1. 不出现 `message` 替代 `msg`。
2. 中文界面正常显示。
3. 英文界面优先显示英文翻译。
4. 老接口不需要一次性全部改，但新接口必须遵守。

验证方式：

1. 搜索接口返回结构。
2. 切换语言触发一个错误提示。
3. 确认返回仍是 `{ code, data, msg }`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/response.ts`、`src/shared/constants/status.ts`、`src/main/services/result.ts`、`src/renderer/src/i18n/messages.ts`、`docs/tasks/OPT-027-响应格式细化和错误追踪.md`
- 验证结果：返回格式仍保留 `{ code, data, msg }`；失败 `data` 带 `msgKey/requestId/errorCode`；`status.xxx` 中英文文案已补；`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-013 任务状态和业务状态分层

优先级：P1

处理状态：已完成；这是任务中心和所有异步业务的状态规则。

关联任务：`docs/tasks/OPT-013-任务状态和业务状态分层.md`

问题：

任务中心状态和业务表状态不能混成一套。比如原文事件分析，章节有章节状态，任务有任务状态。

为什么要做：

如果混用，任务成功但部分章节失败、用户取消但部分文件已生成，这些情况会说不清。

怎么做：

1. 任务表只记录一次异步工作的总体状态：
   - `tasks.status`
   - 状态值：`waiting/running/succeeded/failed/cancelled`
   - 只允许 `src/main/services/task/service.ts` 通过 `createTask/succeedTask/failTask/cancelTask` 写入。
2. 业务表记录业务对象自己的状态：
   - `source_chapters.event_status`：`stale/running/succeeded/failed`
   - `scripts.extract_status`：`idle/waiting/running/succeeded/failed`
   - `assets.prompt_status/image_status/audio_bind_status`：`idle/running/succeeded/failed/cancelled`
   - `asset_media.status`：`idle/running/succeeded/failed/cancelled`
   - `production_storyboards.image_status`：`idle/running/succeeded/failed/cancelled`
   - `production_video_tracks.status`、`production_videos.status`：`idle/running/succeeded/failed/cancelled`
   - `export_summary.status`：`validating/running/succeeded/failed`
3. 任务完成不等于所有业务对象成功：
   - 批量任务全部成功，任务写 `succeeded`。
   - 批量任务有任意对象失败，失败对象写自己的 `failed/error_reason`，任务写 `failed` 和整体失败原因。
   - 已成功对象不能因为同批其他对象失败被回滚成失败。
4. 失败原因分两层：
   - task fail reason：给任务中心看，用来解释这一批为什么失败。
   - item fail reason：给业务页面看，用来解释某个章节、剧本、图片、视频为什么失败。
5. 页面展示时同时说明整体和明细：
   - 任务中心显示总体状态、失败原因、项目、分类、模型。
   - 业务页面显示每个对象自己的状态和失败原因。
6. 后续新增异步功能时，先把字段登记到 `src/shared/constants/status-layers.ts`，再写 service。

完成标准：

1. 任何异步批量任务都能表达部分成功。
2. 取消任务不会误标业务对象成功。
3. 任务中心能看到总体失败原因。

验证方式：

1. 批量任务中故意让部分项失败。
2. 检查 task 状态。
3. 检查业务表状态。
4. 页面展示不误导。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/status-layers.ts`、`src/shared/constants/dictionaries.ts`、`src/shared/types/export.ts`、`src/main/services/export/index.ts`、`scripts/verify-opt-013-status-layers.mjs`、`scripts/verify-opt-028-dictionaries.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-013-任务状态和业务状态分层.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-013-status-layers.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run build`、`D:\software\nodejs\pnpm.cmd run verify:docs` 通过。

---

## P1 请求、日志、诊断

### 【√】OPT-014 大模型请求可观测

优先级：P1

处理状态：已完成；随 `OPT-006/OPT-032` 的模型网关补齐最近请求摘要、耗时、重试、失败原因和设置页诊断入口。

关联任务：`docs/tasks/OPT-014-大模型请求可观测.md`

问题：

桌面程序里看不到浏览器 network。大模型请求如果失败，用户需要知道是哪个供应商、哪个模型、哪个任务、耗时多久、失败原因是什么。

为什么要做：

后期排查模型问题会非常频繁，不能每次都翻杂乱日志。

怎么做：

1. 每次模型调用生成 requestId。
2. 模型调用网关记录最近 80 条请求摘要：
   - requestId
   - taskId
   - vendorId
   - protocolVendorId
   - vendorName
   - modelName
   - modelType
   - protocol
   - duration
   - status
   - attempt/maxAttempts/retryCount
   - sanitized error
3. 设置页请求诊断显示最近模型请求表格。
4. 敏感字段脱敏：
   - apiKey
   - token
   - 本机绝对路径
   - stack detail
5. 任务中心失败原因继续保留 requestId。
6. 不保存完整请求体、响应体和 stack。

完成标准：

1. 模型失败时，用户能看到可理解失败原因。
2. 开发者能通过 requestId 找到详细日志。
3. 日志不泄露密钥。

验证方式：

1. 故意填错 API key。
2. 运行模型测试。
3. 检查任务中心和日志。
4. 搜索日志确认没有明文 key。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/model/request-diagnostics.ts`、`src/main/services/model/gateway.ts`、`src/main/services/settings/request-diagnostics.ts`、`src/shared/types/request-settings.ts`、`src/renderer/src/features/settings/components/RequestDiagnostics.vue`、`src/renderer/src/i18n/messages.ts`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-014-model-observability.mjs`、`scripts/verify-f-002-013.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-014-大模型请求可观测.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-014-model-observability.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-015 HTTP 和本地服务请求诊断

优先级：P1

处理状态：已完成；本地服务状态、Socket 状态、media 路由、最近本地请求失败和最近模型请求摘要已统一进请求诊断。

关联任务：`docs/tasks/OPT-015-HTTP和本地服务请求诊断.md`

问题：

本地 HTTP 服务、Socket、media URL、更新检查、模型请求都属于“请求”，但用户需要一个统一位置看运行状态。

为什么要做：

桌面程序没有浏览器 network 面板，诊断入口必须产品内置。

怎么做：

1. 设置里增加请求诊断摘要。
2. 显示本地服务：
   - local server url
   - port
   - source
3. 显示 Socket 状态：
   - running
   - url
   - scriptAgent / productionAgent namespace
   - connectedCount
4. 显示 media 路由状态：
   - `/media/`
   - Range
   - thumbnail
   - roots
5. 显示最近模型请求摘要。
6. 显示最近本地 HTTP/media 失败摘要。
7. 提供刷新按钮。

完成标准：

1. 用户不用看终端，也能知道本地服务是否活着。
2. 模型请求失败能定位到供应商和模型。
3. media 资源 404/401/416/415/400 能看到脱敏原因。
4. Socket 和 media 路由状态不暴露 token、签名 query 和完整路径。

验证方式：

1. 打开开发者诊断。
2. 手动触发模型测试。
3. 手动访问一个不存在的 media。
4. 确认诊断有记录。
5. 搜索页面返回数据，确认没有 token 和完整签名 URL。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/local-request-diagnostics.ts`、`src/main/app/server.ts`、`src/main/services/media/request-handler.ts`、`src/main/services/media/path.ts`、`src/main/services/socket/index.ts`、`src/main/services/settings/request-diagnostics.ts`、`src/shared/types/request-settings.ts`、`src/renderer/src/features/settings/components/RequestDiagnostics.vue`、`src/renderer/src/i18n/messages.ts`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-015-local-request-diagnostics.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-015-HTTP和本地服务请求诊断.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-015-local-request-diagnostics.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-016 终端日志可读性优化

优先级：P1

处理状态：已完成；保留完成记录，后续只做回归检查。

关联任务：`CORE-013-日志与诊断层.md`

问题：

早期 dev 终端日志中文乱码、列宽不齐、重点不明显。

怎么做：

1. main 侧统一 logger。
2. 日志中文短句。
3. 固定列宽。
4. 级别颜色。
5. 行间距。
6. detail 写入日志文件。

完成标准：

1. `pnpm run dev` 启动日志普通人能看懂。
2. 控制台重点信息清晰。
3. 详细信息进入文件。

完成记录：

- 完成时间：2026-07-01
- 涉及文件：`src/main/services/logger.ts` 等
- 验证结果：`CORE-013` 已完成并记录在 `docs/03-执行进度.md`

---

## P1 文件、runtime、清理

### 【√】OPT-017 runtime 诊断和恢复策略

优先级：P1

处理状态：已完成；`CORE-014` 已完成默认资源 runtime 诊断与恢复，本任务补齐文件管理页 runtime 来源和清理边界。

关联任务：`docs/tasks/OPT-017-runtime诊断和恢复策略.md`

问题：

dev runtime、用户 runtime、默认资源、cache、temp、exports 都存在不同目录。用户需要知道哪些能删、哪些不能删、哪些能恢复。

为什么要做：

之前已经出现过用户对 `.runtime/user-data`、temp runtime、out 目录困惑的问题。目录策略不清楚会让项目显得不专业。

怎么做：

1. 文档说明 runtime 不放项目源码目录。
2. dev 环境使用临时或明确的 dev userData。
3. 生产环境使用 Electron app userData。
4. 设置页文件管理显示：
   - 项目目录
   - cache
   - temp
   - exports
   - logs
5. 诊断里说明可清理项。
6. 清理动作只处理受控目录。

完成标准：

1. 项目目录不再出现不该提交的 runtime 数据。
2. 用户能在设置页看到运行目录。
3. 清理 cache/temp 不影响项目数据。

验证方式：

1. dev 启动检查 userData 位置。
2. 清理 cache。
3. 重新打开项目确认数据仍在。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/file-management.ts`、`src/main/services/settings/file-management.ts`、`src/renderer/src/features/settings/components/FileManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-017-runtime-diagnostics.mjs`、`docs/tasks/OPT-017-runtime诊断和恢复策略.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-017-runtime-diagnostics.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs` 通过。
- 已完成部分：`diagnoseDefaultAssets()` 已能诊断默认资源 runtime 文件缺失并恢复；完整 runtime 清理策略未完成，不能标为已完成。

### 【√】OPT-018 `director_skills` 与 `driector_skills` 旧痕迹清理

优先级：P1

处理状态：已完成；由 `CORE-014` 处理。

关联任务：`docs/tasks/CORE-014-默认资源治理.md`

问题：

参考项目里存在 `driector_skills` 拼写，VT Studio 已决定新目录使用 `director_skills`。旧目录已从默认资源中删除，只保留 legacy 读取兼容。

为什么要做：

短期兼容没问题，但长期保留两份目录会让人误以为两套都应该维护。

怎么做：

1. 新写入只使用 `director_skills`。
2. 读取旧项目时兼容 `driector_skills`。
3. 默认资源诊断识别旧拼写。
4. 确认两份内容一致后，决定是否删除旧拼写资源。
5. README 里的旧拼写也要更新。

完成标准：

1. 新项目不再写入 `driector_skills`。
2. 旧资源可读。
3. 文档里只把 `driector_skills` 当兼容项，不当正式规范。

验证方式：

1. 新建手册，检查目录名。
2. 放入旧拼写目录，确认可兼容读取。
3. 运行默认资源诊断。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/manuals.ts`、`src/main/services/database/seed-default-assets.ts`、`src/main/services/project.ts`、`src/renderer/src/features/project/components/ManualFormDialog.vue`、`resources/default-data/skills`
- 验证结果：已删除 23 个默认资源旧 `driector_skills` 目录；`rg --files resources\default-data\skills | rg "driector_skills"` 无结果；`verify-core-014-default-assets.mjs` 和 `verify:core` 通过。

### 【√】OPT-019 out、dist、缓存产物清理规范

优先级：P2

处理状态：已完成；属于工程整理，不阻塞业务主链路。

关联任务：`docs/tasks/OPT-019-out-dist缓存产物清理规范.md`

问题：

构建产物、缓存、runtime 数据容易和源码混在一起，让项目看起来很乱。

为什么要做：

用户需要一个专业、干净、可维护的项目结构。

怎么做：

1. 明确哪些目录是源码。
2. 明确哪些目录是构建产物。
3. 明确哪些目录是 runtime 数据。
4. 检查 `.gitignore`。
5. 文档说明是否可以删除。

完成标准：

1. 项目根目录没有不明来源目录。
2. 构建产物不被误当源码。
3. git status 不出现 runtime 垃圾文件。

验证方式：

1. 跑 build。
2. 查看新增目录。
3. 查看 git status。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`.gitignore`、`docs/00-项目规范.md`、`docs/tasks/OPT-019-out-dist缓存产物清理规范.md`、`scripts/verify-opt-019-build-artifacts.mjs`、`scripts/verify.mjs`、`l.includes('OPT-050`、`l.includes('settings`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-019-build-artifacts.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs` 通过；本项只改工程规范、忽略规则和验证脚本，未跑 build，避免被并行 `OPT-037` 线程的未完成业务代码影响。

---

## P1 生产和导出链路

### 【√】OPT-020 图片生成到视频生成的素材规范

优先级：P1

处理状态：已完成；并入 `OPT-BATCH-002`，图片、分镜、视频候选和轨道导出引用已按当前业务链路统一。

关联任务：`docs/tasks/OPT-BATCH-002-素材生命周期和导出结构治理.md`

问题：

图片生成、视频生成、分镜、轨道需要统一素材结构。否则图片生成出来以后，视频工作台不知道该拿哪张图。

为什么要做：

完整流程是小说原文 -> 剧本 -> 资产 -> 分镜图 -> 视频 -> 导出。中间任何一环数据结构不统一，后续都要返工。

怎么做：

1. 明确资产图片表和文件路径。
2. 明确当前选中图和历史图。
3. 明确分镜图和资产图的区别。
4. 明确视频生成输入：
   - prompt
   - first frame
   - last frame
   - reference images
   - audio
5. 明确视频输出文件存储目录。

完成标准：

1. 资产图能被分镜引用。
2. 分镜图能被视频生成引用。
3. 视频输出能被轨道引用。

验证方式：

1. 生成角色图。
2. 生成分镜图。
3. 用分镜图生成视频。
4. 在视频工作台看到视频素材。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/export.ts`、`src/main/services/export/index.ts`、`src/main/services/production/service.ts`、`src/shared/types/file-management.ts`、`src/main/services/media/lifecycle.ts`、`src/main/services/settings/file-management.ts`、`src/renderer/src/features/settings/components/FileManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-036-020-021-media-export-foundation.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-036-020-021-media-export-foundation.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:export`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-021 导出结构提前定死

优先级：P1

处理状态：已完成；并入 `OPT-BATCH-002`，第一版固定 VT Studio 可验证草稿结构，不伪称已完成剪映原生 schema。

关联任务：`docs/tasks/OPT-BATCH-002-素材生命周期和导出结构治理.md`

问题：

导出到底输出什么文件、放在哪里、剪映草稿结构怎么生成，需要提前定清楚。否则最后导出一定返工。

为什么要做：

导出是最后一环，但它会反向要求前面的素材命名、路径、时间线结构。

怎么做：

1. 定义导出目录：
   - project exports
   - preview zip
   - mp4
   - Jianying draft
2. 定义时间线结构：
   - tracks
   - clips
   - audio
   - subtitle
   - duration
3. 定义 VT Studio 第一版草稿生成规则。
4. 导出前做素材校验。
5. 缺素材时不能生成半成品。
6. 真实剪映专业版原生 schema 后置，不在本项假完成。

完成标准：

1. 导出前能列出所有缺失素材。
2. 分镜图片 zip 可打开。
3. 时间线结构固定为 `vt_timeline.json`。
4. 第一版草稿结构固定为 `draft_meta_info.json`、`draft_content.json`、`export_summary.json` 和可选 `assets/`。
5. 真实剪映草稿 schema、WebAV mp4 后置，不作为本项完成口径。

验证方式：

1. 缺素材时导出失败并提示。
2. 素材完整时导出成功。
3. 检查导出目录包含固定 JSON 结构。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/export.ts`、`src/main/services/export/index.ts`、`src/main/services/production/service.ts`、`scripts/verify-opt-036-020-021-media-export-foundation.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-BATCH-002-素材生命周期和导出结构治理.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-036-020-021-media-export-foundation.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:export`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

---

## P2 UI 和体验优化

### 【√】OPT-022 设置页不再拆成用户理解不了的配置孤岛

优先级：P2

处理状态：已完成；设置页已从平铺按钮改为分组导航，普通配置和开发诊断分开。

关联任务：`docs/tasks/OPT-022-设置页体验治理.md`

问题：

设置项很多，如果按技术概念堆叠，用户不知道哪些会影响生成结果。

为什么要做：

用户最终关心的是“模型能不能跑、生成效果受什么影响、出错怎么修”。

怎么做：

1. 普通设置只显示常用项。
2. 开发者设置显示高级项。
3. 模型、提示词、Skill、记忆之间加状态提示。
4. 对生成结果有影响的设置要说明影响范围。

完成标准：

1. 普通用户不需要理解数据库表也能配置模型。
2. 高级用户能找到底层诊断。
3. 设置项不会互相冲突。

验证方式：

1. 从空项目开始配置模型。
2. 只看设置页能完成最小可用配置。
3. 开发者入口能看到高级诊断。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/settings/SettingsHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-022-settings-experience.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-022-设置页体验治理.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-022-settings-experience.mjs`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-023 多主题不是只做浅色深色

优先级：P2

处理状态：已完成；后续 UI 治理只做回归，不重复实现。

关联任务：`F-002-001-外观设置.md`

问题：

用户要求多主题配色系列，不只是浅色/深色切换。

怎么做：

1. 支持主题系列。
2. 支持 auto/light/dark。
3. 支持字号设置。

完成标准：

1. 有多个主题系列。
2. 主题切换能持久化。

完成记录：

- 完成时间：2026-07-02
- 涉及文件：`src/renderer/src/features/settings/components/AppearanceConfig.vue`、`src/renderer/src/features/settings/appearance/theme.ts`、`src/renderer/src/stores/appearance.ts`、`src/renderer/src/App.vue`、`src/renderer/src/i18n/messages.ts`、`docs/tasks/F-002-001-外观设置.md`、`docs/03-执行进度.md`
- 验证结果：`docs/03-执行进度.md` 已记录 F-002-001 完成；第一版支持 `studio/warm/work` 主题系列、`auto/light/dark` 模式和字号；verify-f-002-001、verify-f-002-011、verify-f-002-010、build 通过

### 【√】OPT-024 页面卡住和滚动锁死专项检查

优先级：P1

处理状态：已完成；已独立补滚动兜底和专项验证。

关联任务：`docs/tasks/OPT-024-页面滚动锁死专项检查.md`

问题：

曾出现页面弹窗或滚动区域卡住，页面无法滚动。

为什么要做：

这种问题不一定属于某个业务功能，但会严重影响使用。

怎么做：

1. 检查全局 `overflow`。
2. 检查弹窗打开后 body scroll lock。
3. 检查工作区高度计算。
4. 检查固定布局嵌套滚动。
5. 对主要页面做滚动回归。

完成标准：

1. 设置页、项目页、原文页、剧本 Agent 页都能正常滚动。
2. 打开/关闭弹窗后滚动不丢失。
3. 页面内容不会被固定区域挡住。

验证方式：

1. 手动打开主要页面。
2. 打开弹窗再关闭。
3. 滚动到页面底部。
4. 用不同窗口尺寸验证。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/styles/index.scss`、`scripts/verify-opt-024-scroll-stability.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-024-页面滚动锁死专项检查.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-024-scroll-stability.mjs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

---

## P2 工程质量

### 【√】OPT-025 verify 脚本统一入口

优先级：P2

处理状态：已完成；由 `OPT-043` verify 脚本分组入口和 package scripts 规范承接并完成。

关联任务：`docs/tasks/OPT-BATCH-001-工程入口和文档治理.md`

问题：

现在 verify 脚本很多，后续容易不知道该跑哪个。

为什么要做：

每个阶段完成后都需要稳定验证，不应该靠记忆。

怎么做：

1. 保留单项 verify。
2. 新增分组 verify：
   - settings
   - project
   - content
   - assets
   - production
   - export
   - acceptance
   - docs
3. 新增 all verify，但耗时可控。
4. 文档写明每个阶段要跑哪些。

完成标准：

1. `package.json` 有清晰 verify 命令。
2. 每个批次能找到对应 verify。
3. build 前能跑必要回归。

验证方式：

1. 跑分组 verify。
2. 跑 typecheck。
3. 跑 build。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`package.json`、`scripts/verify.mjs`、`scripts/verify-core-011.mjs`
- 验证结果：`D:\software\nodejs\pnpm.cmd run verify:core` 通过；`D:\software\nodejs\pnpm.cmd run typecheck` 通过；`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-026 固定使用用户本机 pnpm

优先级：P1

处理状态：已完成；后续所有 Node/pnpm 命令继续遵守，不重复实现。

关联规则：用户级 AGENTS 规则

问题：

Codex 自带 pnpm 和用户本机 pnpm 版本不同，混用会导致 store、node_modules、Electron、better-sqlite3 原生依赖出问题。

怎么做：

1. 固定使用 `D:\software\nodejs\pnpm.cmd`。
2. 禁止 `pnpm install`、`pnpm run dev`、`npx pnpm`。
3. 所有 Node/pnpm 命令都使用用户本机环境。

完成标准：

1. 后续命令都使用 `D:\software\nodejs\pnpm.cmd`。
2. 不再因为 pnpm 11.x 和 10.24.0 混用破坏依赖。

完成记录：

- 完成时间：已写入用户级规则
- 涉及文件：AGENTS 用户规则
- 验证结果：后续执行遵守

---

## P0 专业治理补口

### 【√】OPT-027 响应格式细化和错误追踪

优先级：P0

处理状态：已完成；所有 IPC、service、renderer 请求都要遵守这个响应契约。

关联任务：`docs/tasks/OPT-027-响应格式细化和错误追踪.md`、`CORE-002-IPC契约层.md`、`CORE-005-Result和错误.md`

问题：

项目已经定了顶层返回 `{ code, data, msg }`，但 `src/shared/types/response.ts` 目前只允许 `code: 200 | 400`。同时 `src/shared/constants/status.ts` 已经有 `40001`、`70000`、`80000` 等细分状态码。现在失败响应会丢掉细分错误语义，后期页面、日志、任务中心和多语言很难统一定位问题。

为什么要做：

用户看到的格式要简单，但开发和排查必须知道真实错误类型。否则模型调用失败、文件失败、数据库失败都会只剩 `400`，后期只能翻日志猜。

怎么做：

1. 顶层仍固定 `{ code, data, msg }`，不改成 `message`。
2. 成功仍返回 `code: 200`。
3. 普通失败顶层仍返回 `code: 400`，保持用户之前确认过的格式。
4. 失败时 `data` 里统一允许：
   - `errorCode`：细分状态码，例如 `MODEL_API_KEY_MISSING` 对应的数字。
   - `msgKey`：前端多语言 key。
   - `msgParams`：翻译参数。
   - `requestId`：日志追踪用。
   - `detailVisible`：是否允许页面显示详情。
5. `VtError` 必须保留 `statusCode/detail/requestId/msgKey`。
6. `errorToResponse` 负责把内部错误转成安全响应。
7. detail、stack、本机路径、密钥只写日志，不直接返回页面。

完成标准：

1. 所有 IPC 返回仍是 `{ code, data, msg }`。
2. 失败响应能拿到 `data.errorCode`。
3. renderer 可以优先用 `msgKey` 翻译，没有时显示 `msg`。
4. 任务中心失败原因能关联 `requestId`。
5. 不再因为 `VtResponse` 类型限制导致细分状态码无法表达。

验证方式：

1. 故意触发模型 key 缺失，确认顶层 `code=400`，`data.errorCode` 是模型类错误。
2. 故意触发文件不存在，确认 `data.errorCode` 是文件类错误。
3. 搜索接口返回，确认没有新增 `message` 字段替代 `msg`。
4. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/response.ts`、`src/shared/constants/status.ts`、`src/shared/errors/vt-error.ts`、`src/shared/errors/normalize.ts`、`src/main/services/result.ts`、`src/main/ipc/handle.ts`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-027-response.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-027-响应格式细化和错误追踪.md`
- 验证结果：`D:\software\nodejs\pnpm.cmd run verify:core` 通过；`D:\software\nodejs\pnpm.cmd run typecheck` 通过；`D:\software\nodejs\pnpm.cmd run build` 通过。失败响应顶层仍是 `code=400`，细分错误进入 `data.errorCode`，多语言 key 进入 `data.msgKey`，日志追踪进入 `data.requestId`。

### 【√】OPT-028 默认字典集中管理

优先级：P0

处理状态：已完成；作为状态、类型、mode、主题、语言等字典的统一入口。

关联任务：`docs/tasks/OPT-028-默认字典集中管理.md`

问题：

资产类型、模型类型、图片 mode、视频 mode、任务状态、业务状态、项目类型、分辨率、时长、主题、语言等值现在分散在 shared types、main validation、renderer 页面和设置里。后期会出现同一个含义多个字符串。

为什么要做：

字典值不统一会直接导致筛选失败、绑定失败、生成模式不匹配、页面显示错、数据库值无法迁移。

怎么做：

1. 在 `src/shared/constants` 下建立统一字典入口。
2. 至少集中这些字典：
   - 项目类型：novel 等。
   - 资产类型：role、scene、tool、clip、audio。
   - 模型类型：text、image、video、tts。
   - 图片 mode：text、singleImage、multiReference。
   - 视频 mode：text、singleImage、startEndRequired、endFrameOptional、startFrameOptional、reference 数组模式。
   - 任务状态：waiting、running、succeeded、failed、cancelled。
   - 原文事件状态、剧本资产提取状态、素材生成状态。
   - 主题 preset、语言 locale。
   - 常用 duration、resolution、aspect ratio。
3. 数据库存英文稳定 key。
4. 页面展示走 i18n，不把中文写进数据库值。
5. main validation 和 renderer 选项都从同一套 constants 派生。

完成标准：

1. 新增一个 mode 或资产类型，只改一处字典。
2. 全局搜索没有明显重复散落的同类字符串数组。
3. 页面选择项、服务校验、数据库存储使用同一套 key。
4. 多语言切换不影响数据库值。

验证方式：

1. 跑字典一致性 verify。
2. 保存非法 mode 必须失败。
3. 保存合法 mode 后，项目配置、提示词映射、模型测试读取一致。
4. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/dictionaries.ts`、`src/shared/types/assets.ts`、`src/shared/types/project.ts`、`src/shared/types/task.ts`、`src/shared/types/source.ts`、`src/shared/types/script-agent.ts`、`src/shared/types/production.ts`、`src/shared/types/vendor.ts`、`src/main/services/model/constants.ts`、`src/main/services/model/types.ts`、`src/main/services/model/validation.ts`、`src/main/services/project.ts`、`src/main/services/assets/service.ts`、`src/main/services/production/service.ts`、`src/renderer/src/i18n/index.ts`、`src/renderer/src/i18n/messages.ts`、`src/renderer/src/features/settings/appearance/theme.ts`、`src/renderer/src/features/project/ProjectHome.vue`、`src/renderer/src/features/project/components/ProjectFormDialog.vue`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue`、`src/renderer/src/features/production/components/ProductionImageFlowDialog.vue`、`scripts/verify-opt-028-dictionaries.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-028-默认字典集中管理.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-028-dictionaries.mjs` 通过；`D:\software\nodejs\pnpm.cmd run typecheck` 通过；`D:\software\nodejs\pnpm.cmd run verify:core` 通过；`D:\software\nodejs\pnpm.cmd run build` 通过。当前正式完成态固定为 `succeeded`，不使用 `success`；`verify:core` 默认资源缺文件警告仍归后续 `CORE-014/默认资源治理`。

### 【√】OPT-029 默认资源 registry 统一

优先级：P0

处理状态：已完成；作为 `CORE-014` 主入口落地，seed、诊断、恢复都依赖它。

关联任务：`docs/tasks/CORE-014-默认资源治理.md`

问题：

默认供应商、默认 Skill、默认提示词、默认视觉手册、默认导演手册、默认模型模板、默认素材现在散在 `seed.ts`、`seed-default-assets.ts`、`builtin-vendors.ts` 和 `resources/default-data`。文件有、数据库有、业务能用，这三件事目前没有统一对账入口。

为什么要做：

默认资源是参考项目能力落地的基础。只要清单分散，就会继续出现“资源文件有了，页面打开是空的”“数据库有记录，业务链路没使用”“诊断和 seed 结果不一致”。

怎么做：

1. 新建默认资源 registry，例如 `src/main/defaults` 或 `src/main/services/defaults`。
2. registry 统一描述：
   - 默认供应商 id、代码文件、是否内置、是否启用。
   - 默认 Skill 路径、类型、归属、是否需要 embedding。
   - 默认提示词 type、名称、来源文件。
   - 默认视觉手册目录、tabs、封面。
   - 默认导演手册目录、tabs、封面。
   - 默认模型提示词模板、适用模型类型、适用 mode。
   - 默认素材文件。
3. seed 只读 registry，不自己维护第二套清单。
4. 诊断和恢复也只读 registry。
5. verify 检查 registry、resources 文件、数据库 seed 结果三者一致。

完成标准：

1. 新增一个默认视觉手册，不需要同时改多个清单。
2. seed、诊断、恢复使用同一份 registry。
3. 能列出“文件存在但未入库”“数据库有但文件缺失”“文件和 md5 不一致”。
4. 全新 runtime 启动后默认资源可直接使用。

验证方式：

1. 删除一个 runtime 默认文件，诊断能发现并恢复。
2. 删除一条默认数据库记录，诊断能发现并恢复。
3. 修改一个默认 Skill 文件，诊断能发现 md5 变化。
4. 跑默认资源 verify。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/default-assets/registry.ts`、`src/main/services/default-assets/diagnostics.ts`、`src/main/services/default-assets/index.ts`、`src/main/services/database/seed.ts`、`src/main/services/database/seed-default-assets.ts`、`src/shared/constants/manuals.ts`
- 验证结果：新增 `verify-core-014-default-assets.mjs`，覆盖 registry 数量、内置供应商覆盖、默认资源同步、默认数据库记录、删除 runtime 文件恢复、删除 Skill 记录恢复；`verify:core` 通过。

### 【√】OPT-030 seed 模块化和幂等 helper

优先级：P0

处理状态：已完成；`CORE-014` 已把默认资源 seed 改成 registry 来源，本任务补齐通用 seed helper 和领域拆分。

关联任务：`docs/tasks/OPT-030-seed模块化和幂等helper.md`

问题：

`src/main/services/database/seed.ts` 同时维护 users、settings、vendors、Agent、prompts、skills、attributions。`seed-default-assets.ts` 又维护手册、模型模板、供应商模型和 md5 同步。职责过重，后期新增默认数据很容易改漏或破坏幂等。

为什么要做：

seed 是新装环境、数据库恢复、默认资源恢复的基础。它必须可读、可拆、可重复执行，不应该成为一个越来越大的文件。

怎么做：

1. 按领域拆 seed：
   - `seed-users`
   - `seed-settings`
   - `seed-vendors`
   - `seed-agent-configs`
   - `seed-prompts`
   - `seed-skills`
   - `seed-manuals`
   - `seed-model-prompts`
2. 提供公共 helper：
   - `tableExists`
   - `insertIfMissing`
   - `upsertByKey`
   - `readJsonColumn`
   - `writeJsonColumn`
   - `safeReadDefaultText`
   - `createMd5`
3. 所有 seed 都必须幂等，不覆盖用户主动修改的数据。
4. 恢复默认只恢复明确允许恢复的字段。
5. seed 日志必须能看出做了什么、跳过了什么、失败在哪。

完成标准：

1. seed 入口只负责组织，不堆业务数据。
2. 每类默认数据有独立文件。
3. 重复运行 seed 不产生重复记录。
4. 清空数据库后重新 seed 能恢复默认数据。
5. 用户编辑过的提示词、供应商 key 不被启动 seed 覆盖。

验证方式：

1. 连续运行 seed 两次，记录数量不变。
2. 修改一个用户配置，再运行 seed，配置不被覆盖。
3. 清空测试库后运行 seed，默认数据完整。
4. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/database/seed.ts`、`src/main/services/database/seed-helpers.ts`、`src/main/services/database/seed-users.ts`、`src/main/services/database/seed-settings.ts`、`src/main/services/database/seed-vendors.ts`、`src/main/services/database/seed-agent-configs.ts`、`src/main/services/database/seed-prompts.ts`、`src/main/services/database/seed-skills.ts`、`src/main/services/database/seed-manuals.ts`、`src/main/services/database/seed-model-prompts.ts`、`src/main/services/database/seed-default-assets.ts`、`scripts/verify-opt-030-seed-modules.mjs`、`docs/tasks/OPT-030-seed模块化和幂等helper.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-030-seed-modules.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core` 通过。
- 已完成部分：`runSeed()` 已收缩为编排入口；用户、设置、供应商、Agent、Prompt、Skill、手册、模型提示词已拆到独立 seed 文件；默认资源记录继续由 `seed-default-assets.ts` 做编排。

### 【√】OPT-031 模型能力矩阵统一

优先级：P0

处理状态：已完成；所有模型配置、测试、提示词映射和生产工作台先以它为准。

关联任务：`docs/tasks/OPT-031-模型能力矩阵统一.md`

问题：

项目已经有文本、图片、视频、TTS、ComfyUI、OpenAI compatible、自定义 vendor adapter。每种模型支持的 mode、输入、输出、duration、resolution、audio、reference 规则不同。如果没有统一能力矩阵，项目配置、模型测试、提示词映射、生成任务会各写各的。

为什么要做：

图片/视频生成是后续主链路。模型能力不统一，页面就会允许用户选择实际上跑不通的组合。

怎么做：

1. 建立模型能力矩阵：
   - vendorId
   - modelName
   - modelType
   - mode
   - inputTypes
   - outputType
   - durationOptions
   - resolutionOptions
   - aspectRatioOptions
   - audioSupport
   - referenceLimits
   - promptTemplateType
2. 项目模型配置只允许选择能力矩阵中存在的组合。
3. 模型提示词映射按 `connectionId + modelName + modelType + mode` 绑定。
4. 模型测试读取同一能力矩阵。
5. 生产工作台生成任务读取同一能力矩阵。

完成标准：

1. 同一个视频模型不同 mode 可以独立配置和测试。
2. 不支持首尾帧的模型，页面不能发首尾帧参数。
3. 不支持 audio 的模型，页面不能强行传 audio。
4. ComfyUI workflow 也能表达为能力矩阵的一种来源。

验证方式：

1. 准备一个多 mode 视频模型，分别测试。
2. 故意传非法 mode，服务拒绝并返回明确错误。
3. 项目配置、模型测试、提示词映射看到的 mode 一致。
4. 跑模型配置 verify。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/model-capabilities.ts`、`src/shared/types/model-capability.ts`、`src/shared/types/model-config.ts`、`src/main/services/model/capability-matrix.ts`、`src/main/services/settings/model-config.ts`、`src/main/services/settings/model-prompt.ts`、`src/main/services/model/media.ts`、`src/main/services/project.ts`、`src/main/services/production/service.ts`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/renderer/src/features/settings/components/ModelPromptConfig.vue`、`src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue`、`scripts/verify-opt-031-model-capabilities.mjs`
- 验证结果：`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\node.exe scripts\verify-opt-031-model-capabilities.mjs`、`D:\software\nodejs\pnpm.cmd run verify:core` 通过；`OPT-004` 的真实生成模板读取仍保留为单独 TODO。

### 【√】OPT-032 模型调用取消、超时、重试和落盘规范

优先级：P0

处理状态：已完成；模型调用的 requestId、超时、有限重试、取消检查、媒体大小/MIME 校验和迟到结果防覆盖已收口；文件生命周期第一版已由 `OPT-BATCH-002` 收口，历史媒体 md5/尺寸/duration 深补后置。

关联任务：`tasks/OPT-032-模型调用取消超时重试和落盘规范.md`

问题：

模型调用不仅是发请求。图片、视频、音频还涉及长耗时、取消、超时、下载结果、保存文件、失败重试、任务状态和日志追踪。当前 TODO 里有模型适配层，但这些运行期规则还不够细。

当前媒体模型可能返回 URL，也可能返回 base64。已经有基础格式校验，但还缺统一的最大下载大小、最大上传大小、content-length 预算、响应 MIME 校验和超大结果处理。否则模型返回一个错误网页、超大视频或异常 base64 时，容易占内存、写坏文件，页面还不知道真实失败原因。

为什么要做：

后续批量生图、视频生成、TTS、ComfyUI 都是长任务。如果取消和落盘不规范，会出现任务显示失败但文件已生成、用户取消后还继续跑、下载结果丢失等问题。

怎么做：

1. 每次模型调用创建 `requestId`。
2. 所有模型任务必须绑定 taskId。
3. 支持超时配置，默认读取业务设置。
4. 支持取消：
   - 已排队任务直接取消。
   - 运行中任务尽量中断。
   - 不能中断的任务标记 cancel requested。
5. 支持有限重试，只对网络类临时错误重试。
6. 图片/视频/音频结果先在模型层校验 URL/base64、MIME 和大小，再交给业务落盘点。
7. 当前不新增第二套全局媒体表；写入 md5、size、mime、duration 或尺寸不在本任务里做历史批量回填。
8. 文件写入失败和孤儿文件清理已由 `OPT-BATCH-002` 完成第一版，本任务先保证取消后的迟到结果不写入业务成功。
9. 任务状态和业务对象状态分开更新。
10. 所有模型返回 URL 下载前检查：
    - 协议只允许 http/https。
    - content-type 必须匹配 image/video/audio。
    - content-length 超过预算直接失败。
    - 没有 content-length 时边下载边计数，超过预算中断。
11. 所有 base64 结果解码前先做长度预算，解码后再校验实际大小。
12. 上传给模型的参考图、音频、视频也必须有大小上限，超过上限先提示用户压缩或换文件。
13. 不把错误 HTML、JSON 错误体、空文件当成媒体成功。
14. 取消后即使外部接口后来返回成功，也不能再把业务对象改成成功；最多记录为“取消后返回，已丢弃”。
15. 下载、解码、写文件失败时，任务失败原因必须能看懂，例如“模型返回内容不是图片”“视频超过大小限制”。

完成标准：

1. 用户取消资产图片生成后，业务媒体状态能保持取消；如果没有其它同任务媒体运行，任务中心能看到取消状态。
2. 超时失败有明确原因。
3. 输出文件仍只写受控项目目录。
4. 模型调用失败不会进入正式业务成功写入；文件生命周期第一版由 `OPT-BATCH-002` 验证。
5. 日志能通过 requestId 找到模型请求摘要。
6. 超大 URL、超大 base64、错误 MIME 都会失败，不会写入正式素材。
7. 取消后的迟到结果不会覆盖业务状态。

验证方式：

1. 故意设置很短超时，确认任务失败和原因。
2. 运行批量生图时取消，确认部分结果和任务状态正确。
3. 模拟下载失败，确认临时文件被清理。
4. 搜索日志确认没有明文 key。
5. 模拟返回 text/html URL，确认提示“模型返回内容不是媒体”。
6. 模拟超过大小限制的媒体，确认下载中断、任务失败、无正式文件。
7. 取消任务后再让 mock 返回成功，确认业务对象仍是取消或失败，不被改成成功。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/status.ts`、`src/main/services/model/gateway.ts`、`src/main/services/model/media.ts`、`src/main/services/model/types.ts`、`src/main/services/assets/migrations.ts`、`src/main/services/assets/service.ts`、`src/main/services/production/service.ts`、`scripts/verify-opt-032-model-runtime.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-032-模型调用取消超时重试和落盘规范.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-032-model-runtime.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-033 ComfyUI workflow 规范

优先级：P0

处理状态：已完成；ComfyUI 作为模型能力来源接入，不再单独做 `OPT-007`。

关联任务：补充 `CORE-007-模型适配层.md`、`M-006-资产中心`、`M-008-生产工作台`

问题：

TODO 已经提到 ComfyUI 接入，但还没把 workflow 的存放、节点映射、输入输出、图片/视频边界说清。只写“支持 ComfyUI”不够，后期会变成每个功能自己拼 workflow。

为什么要做：

ComfyUI 的核心不是一个 URL，而是 workflow JSON 和节点参数映射。没有规范，文生图、图生图、视频工作流、参考图、多图输入都会混乱。

怎么做：

1. 定义 `vt.comfyui.workflow.v1` manifest：
   - `workflow`：原生 ComfyUI workflow JSON。
   - `inputs.prompt`：提示词写入节点。
   - `inputs.width/height/seed/batchSize`：可选参数节点。
   - `inputs.referenceImages`：可选参考图节点，按 index 注入上传后的文件名。
   - `outputs.images`：图片输出节点。
   - `options.pollIntervalMs/timeoutMs`：队列轮询间隔和总超时。
2. 允许粘贴原生 ComfyUI workflow，但只有能自动识别 prompt 和 SaveImage/PreviewImage 输出时才通过；识别不了就要求 manifest。
3. 普通模型服务的“本地工作流”增加 Workflow Manifest 输入。
4. 保存模型连接时校验 manifest：
   - 缺 Endpoint 标记 incomplete。
   - 缺 manifest 或节点映射错误标记 incomplete。
   - 投影到 `model_vendors` 时同步 `workflowManifest`。
5. 内置 `comfyui` runtime 支持图片生成：
   - 上传参考图到 `/upload/image`。
   - 提交 workflow 到 `/prompt`。
   - 轮询 `/history/{prompt_id}`。
   - 从配置输出节点读取图片。
   - 调 `/view` 取回图片 data URL。
6. 视频 workflow 第一版不支持；仍然要通过高级 adapter 或后续独立任务处理，不能在页面假装可用。
7. ComfyUI 图片生成仍走 `generateImageByModel`，因此继续继承任务中心、requestId、超时和错误归一。

完成标准：

1. 本地工作流连接没有 manifest 时不能被标为 ready。
2. workflow 参数来自 manifest，不在页面硬编码节点 id。
3. 图片测试能进入 ComfyUI `/prompt`、`/history`、`/view` 链路。
4. 参考图通过 `/upload/image` 后再写入 LoadImage 类节点。
5. 连接失败、JSON 错误、节点映射错误、超时、输出读取失败都有明确错误。
6. 视频 workflow 没做成假能力。

验证方式：

1. 跑 `D:\software\nodejs\node.exe scripts\verify-opt-033-comfyui-workflow.mjs`。
2. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。
3. 跑 `D:\software\nodejs\pnpm.cmd run verify:core`。
4. 跑 `D:\software\nodejs\pnpm.cmd run verify:settings`。
5. 跑 `D:\software\nodejs\pnpm.cmd run build`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/comfyui-workflow.ts`、`src/main/services/model/comfyui-workflow.ts`、`src/main/services/model/builtin-vendors.ts`、`src/main/services/settings/model-config.ts`、`src/shared/types/model-config.ts`、`src/renderer/src/features/settings/components/ModelServiceConfig.vue`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-033-comfyui-workflow.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-033-ComfyUI-workflow规范.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-033-comfyui-workflow.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-034 生成链路记录提示词和手册快照

优先级：P0

处理状态：已完成；资产图、生产分镜图、生产衍生资产图、视频提示词、视频候选已记录生成快照，页面已有查看入口。音频生成尚未进入当前真实生成链路，后续 TTS 独立接入时必须复用本快照结构。

关联任务：`docs/tasks/OPT-034-生成链路记录提示词和手册快照.md`

问题：

视觉手册、导演手册、模型提示词模板、用户补充描述都会影响生成结果。如果只记录最终 prompt 或只记录当前手册 id，用户后面修改模板后，旧结果无法复现。

为什么要做：

生成类软件必须可追溯。否则用户看到一张图或一个视频，不知道它是用哪个模型、哪个模板、哪个手册内容生成的。

怎么做：

1. 每次生成记录生成上下文快照：
   - model vendor
   - model name
   - model mode
   - prompt template id
   - prompt template content snapshot
   - visual manual id 和 tabs snapshot
   - director manual id 和 tabs snapshot
   - user prompt
   - final prompt
   - negative prompt
   - seed
   - requestId
   - taskId
2. 资产图、分镜图、视频、音频都能追溯。
3. 页面可以查看“本次生成使用了什么”。
4. 用户修改手册后，不影响旧生成记录。

完成标准：

1. 任意已接入真实生成链路的结果都能查看生成参数。
2. 修改手册后旧图的快照不变。
3. 重新生成可读取旧参数；“一键复用旧参数重新生成”交给后续体验增强，不阻塞本任务快照落地。
4. 任务中心能通过 taskId/requestId 关联到生成记录。

验证方式：

1. 跑 `D:\software\nodejs\node.exe scripts\verify-opt-034-generation-snapshot.mjs`。
2. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。
3. 跑 `D:\software\nodejs\pnpm.cmd run verify:assets`。
4. 跑 `D:\software\nodejs\pnpm.cmd run verify:production`。
5. 跑 `D:\software\nodejs\pnpm.cmd run verify:docs`。
6. 跑 `D:\software\nodejs\pnpm.cmd run build`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/generation/snapshot.ts`、`src/main/services/project/manual-prompt.ts`、`src/main/services/model/types.ts`、`src/main/services/model/text.ts`、`src/main/services/model/media.ts`、`src/main/services/model/index.ts`、`src/main/services/assets/service.ts`、`src/main/services/production/service.ts`、`src/main/services/production/migrations.ts`、`src/shared/types/production.ts`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/production/components/ProductionFlowNode.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-034-generation-snapshot.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-034-生成链路记录提示词和手册快照.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-034-generation-snapshot.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

---

## P1 数据安全和资产生命周期

### 【√】OPT-035 密钥存储、脱敏、备份和导出规范

优先级：P1

处理状态：已完成；模型治理前后都要执行，任何日志、诊断、导出都不能泄露密钥。

关联任务：`docs/tasks/OPT-035-密钥存储脱敏备份和导出规范.md`

问题：

供应商配置里会保存 API Key、token、secret。现在 TODO 里有日志脱敏，但还没有完整说明密钥在数据库、备份、导出、页面、日志中的处理方式。

为什么要做：

这是桌面软件的基本安全边界。密钥泄露会直接影响用户账号和费用。

怎么做：

1. 数据库存储密钥字段必须标记敏感。
2. 页面展示只显示脱敏值。
3. 日志永远不输出明文密钥。
4. request diagnostics 只显示供应商、模型、错误摘要，不显示 key。
5. 数据库导出时明确是否包含密钥：
   - 完整备份包含，但必须提示。
   - 项目迁移包默认不包含全局密钥。
6. 清空/恢复数据库时，密钥处理规则要明确。
7. 后续可评估系统级安全存储，但第一版至少不能泄露。

完成标准：

1. 全局搜索日志文件，没有明文 API Key。
2. 页面不直接显示完整密钥。
3. 导出数据库前有明确提示。
4. 项目包不默认带走全局供应商密钥。

验证方式：

1. 配置一个测试 key。
2. 触发模型失败。
3. 搜索日志、任务失败原因、诊断结果，确认没有明文 key。
4. 导出数据库时确认提示文案。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/security/secrets.ts`、`src/main/services/logger.ts`、`src/main/services/task/service.ts`、`src/main/services/model/request-diagnostics.ts`、`src/shared/types/model-config.ts`、`src/main/services/settings/model-config.ts`、`src/renderer/src/features/settings/components/ModelServiceConfig.vue`、`src/shared/types/vendor.ts`、`src/main/services/settings/vendor.ts`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/shared/types/database-management.ts`、`src/main/services/settings/database-management.ts`、`src/renderer/src/features/settings/components/DatabaseManagement.vue`、`scripts/verify-opt-035-secret-boundary.mjs`、`scripts/verify-opt-014-model-observability.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-035-密钥存储脱敏备份和导出规范.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-035-secret-boundary.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-036 资产文件生命周期和孤儿文件清理

优先级：P1

处理状态：已完成；并入 `OPT-BATCH-002`，第一版完成引用诊断、孤儿项目素材清理、cache/temp 清理；完整 md5/尺寸/duration 补齐不在本批次一次性强做。

关联任务：`docs/tasks/OPT-BATCH-002-素材生命周期和导出结构治理.md`

问题：

图片、视频、音频、缩略图、临时文件、导出文件会越来越多。现在还没有统一规则说明哪些文件被业务引用、哪些可以清理、删除资产时是否删除文件、缩略图何时重建。

当前上传和生成落盘也没有一个全局文件预算。资产上传、模型测试、资产图片、分镜图、视频候选、导出草稿都可能写文件，如果大小、类型、生命周期规则不统一，项目目录会越来越不可控。

为什么要做：

素材生成量很大。如果没有生命周期管理，项目目录会膨胀，且可能出现数据库记录指向不存在文件、文件存在但页面找不到。

怎么做：

1. 第一版统一文件生命周期诊断：
   - filePath
   - relativePath
   - rootKey
   - mime
   - size
2. 扫描数据库引用：
   - `asset_media.relative_path`
   - `production_storyboards.relative_path`
   - `production_videos.relative_path`
3. 找出缺失引用，只提示，不自动删数据库。
4. 找出项目素材目录孤儿文件，允许用户确认后清理。
5. cache/temp 目录失败后可清理。
6. 缩略图可以重建，不作为主数据。
7. 模型测试输出、正式项目素材、导出文件分别进入不同目录，不能混放。
8. 清理时按引用关系处理：
    - 正在被资产、分镜、视频候选、导出历史引用的文件不能直接删。
    - 缩略图和失败临时文件可以重建或清理。
9. 文件管理页要能显示项目目录大小、缓存大小、导出目录大小和可清理项。
10. 完整 md5、宽高、duration 批量补齐后置，不在本批次为历史数据硬迁移。

完成标准：

1. 删除资产不会误删其他对象正在引用的文件。
2. 文件丢失时页面显示明确错误。
3. 孤儿文件能被诊断出来。
4. temp/cache 清理不影响项目正式素材。
5. 模型测试文件不会混进正式项目素材。
6. 文件管理能看出哪些能清、哪些不能清。
7. 缺失引用只提示，不自动删除数据库记录。

验证方式：

1. 创建两个资产引用同一文件，删除其中一个，不删除文件。
2. 手动删除一个素材文件，页面显示缺失。
3. 生成一个模型测试媒体，确认只写入 model-test 目录。
4. 运行孤儿文件诊断。
5. 清理 temp/cache 后，项目正式素材仍可访问。
6. 清理 cache 后缩略图可重建。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/file-management.ts`、`src/main/services/media/lifecycle.ts`、`src/main/services/settings/file-management.ts`、`src/main/ipc/settings.ts`、`src/shared/contracts/preload.ts`、`src/preload/index.ts`、`src/renderer/src/features/settings/components/FileManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-036-020-021-media-export-foundation.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-036-020-021-media-export-foundation.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:export`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-037 项目整体导入导出包规范

优先级：P1

处理状态：已完成；第一版采用目录型 `.vtproject` 项目包，不新增 zip 依赖；已支持导出、导入、打开包目录、ID 重映射和素材复制。

关联任务：`docs/tasks/OPT-037-项目整体导入导出包规范.md`、项目管理、文件管理、P10 导出边界

问题：

当前有数据库备份、剧本 zip、视频导出、剪映草稿导出，但还没有“整个项目迁移包”的规范。用户以后换电脑或备份项目时，需要带走项目数据和素材。

为什么要做：

项目级迁移是桌面创作软件常见需求。没有规范，用户只能手动拷贝数据库和素材目录，很容易丢。

怎么做：

1. 定义项目包结构：
   - `project.json`
   - `database.json`
   - `assets/`
   - `generated/`
   - `manual_snapshots/`
   - `prompt_snapshots/`
   - `manifest.json`
2. 项目包使用相对路径。
3. 默认不包含全局供应商 API Key。
4. 导入时检查版本、缺文件、重复项目名。
5. 导入失败必须回滚。
6. 导出前跑素材完整性校验。
7. 第一版不做 zip 单文件，导出为 `exports/project-packages/*.vtproject/` 目录包。
8. 导入时重映射 project、script、asset、asset_media、storyboard、track、video、flow、manual ID。
9. 导入时复制项目 `source/assets/generated/production` 文件夹，并把旧项目 ID 前缀改成新项目 ID。
10. 任务记录、登录态、全局供应商密钥、缓存、临时文件不进项目包。

完成标准：

1. 一个项目可以导出为 `.vtproject` 目录包。
2. 在目标 runtime 中能导入并打开；如果原模型不存在，会映射到当前可用模型并提示。
3. 导入后素材预览可用。
4. 全局密钥不会被项目包带走。
5. 页面只通过 `window.vtStudio.project.*` 调用，不直接碰 Node、SQLite、文件系统。

验证方式：

1. 创建带素材的项目。
2. 导出项目包。
3. 清空 runtime 或换测试 runtime。
4. 导入项目包并打开。
5. 检查素材和剧本数据。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/project.ts`、`src/main/services/project.ts`、`src/main/ipc/project.ts`、`src/shared/contracts/preload.ts`、`src/preload/index.ts`、`src/renderer/src/features/project/ProjectHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-037-project-package.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-037-项目整体导入导出包规范.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-037-project-package.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-038 任务并发和业务锁统一

优先级：P1

处理状态：已完成；删除项目、数据库导入、清表、清空全部已走同一套锁检查。

关联任务：`docs/tasks/OPT-038-任务并发和业务锁统一.md`

问题：

删除项目、清空数据库、编辑剧本、生成资产、生成视频、导出草稿时，如果有任务正在运行，必须统一判断。现在不同模块容易各写各的检查。

为什么要做：

没有统一锁会出现正在生成时删除素材、正在导出时清空数据库、任务成功后业务对象已经不存在等问题。

怎么做：

1. 建立业务锁 service：`src/main/services/task/locks.ts`。
2. 锁信息来自任务表和业务表状态：
   - `tasks.status=running`
   - `source_chapters.event_status=running`
   - `scripts.extract_status=waiting/running`
   - `assets.prompt_status/image_status/audio_bind_status=running`
   - `asset_media.status=running`
   - `production_storyboards.image_status=running`
   - `production_video_tracks.status=running`
   - `production_videos.status=running`
3. 危险操作先查锁：
   - 删除项目：项目级查锁。
   - 导入数据库：全局查锁。
   - 清空指定表：全局查锁。
   - 清空全部数据：全局查锁。
4. 页面提示运行中任务数量、锁定对象数量和锁定明细。
5. 原文、剧本、资产、生产模块内已有的对象级 running 检查先保留，不在本任务强行重写。

完成标准：

1. 运行中任务能阻止危险删除。
2. 任务完成或取消后锁释放。
3. 不同模块使用同一套锁检查。
4. 锁提示不是泛泛的“操作失败”，而是说明哪个任务占用。

验证方式：

1. 启动资产生成任务。
2. 尝试删除项目，必须被阻止。
3. 取消任务后再次删除，允许继续。
4. 跑任务中心回归。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/business-lock.ts`、`src/shared/types/project.ts`、`src/shared/types/database-management.ts`、`src/main/services/task/locks.ts`、`src/main/services/task/index.ts`、`src/main/services/project.ts`、`src/main/services/settings/database-management.ts`、`src/renderer/src/features/project/ProjectHome.vue`、`src/renderer/src/features/settings/components/DatabaseManagement.vue`、`scripts/verify-opt-038-business-locks.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-038-任务并发和业务锁统一.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-038-business-locks.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run build`、`D:\software\nodejs\pnpm.cmd run verify:docs` 通过。

### 【√】OPT-039 参考项目资源对账表

优先级：P1

处理状态：已完成；由 `CORE-014` 的 `diagnoseDefaultAssets()` 输出“文件、数据库、页面、链路”状态。

关联任务：`docs/tasks/CORE-014-默认资源治理.md`

问题：

已经从参考项目拷入了很多 Skill、手册、提示词、供应商文件，但现在缺一张对账表说明：哪些已经拷贝、哪些已经 seed、哪些页面可见、哪些业务链路已经使用、哪些只是文件存在。

为什么要做：

用户明确要求“放到对应文件，能直接用”。只判断文件是否存在不够，必须知道资源有没有真正进入业务链路。

怎么做：

1. 新增资源对账清单，可以写进 TODO 关联的后续文档或诊断输出。
2. 每类资源记录：
   - 参考项目来源。
   - VT Studio 文件位置。
   - 数据库表。
   - 设置页是否可见。
   - 项目创建是否可选。
   - 生成链路是否使用。
   - 当前状态。
3. 诊断输出也要按这张表检查。
4. 对“文件有但未使用”的资源标出原因。

完成标准：

1. 能一眼看出默认资源是否真正可用。
2. 页面空数据问题能通过对账表定位。
3. 后续新增默认资源必须补对账记录。

验证方式：

1. 抽查一个视觉手册，从文件到项目选择再到生成 prompt。
2. 抽查一个 reference skill，从文件到数据库再到 Agent 检索。
3. 抽查一个视频 prompt 模板，从文件到模型绑定。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/default-assets/registry.ts`、`src/main/services/default-assets/diagnostics.ts`、`scripts/verify-core-014-default-assets.mjs`
- 验证结果：诊断项包含 `sourcePath`、`runtimePath`、`seedTargetTable`、`pageVisible`、`chainUsed`、`autoFixable`；`verify-core-014-default-assets.mjs` 通过。

---

## P1 前端契约和体验稳定性

### 【√】OPT-040 renderer 请求封装和提示统一

优先级：P1

处理状态：已完成；前端页面请求、loading、toast、msgKey、requestId 已建立统一样板。

关联任务：`docs/tasks/OPT-040-renderer请求封装和提示统一.md`

问题：

当前页面里大量重复写 `response.code === 200`、`MessagePlugin.error(response.msg)`、loading 状态和错误处理。后期页面越多，这种重复会导致提示风格不一致、多语言不一致、requestId 无法统一展示。

为什么要做：

页面不应该每个地方自己判断响应格式。统一请求封装能减少重复代码，也能保证 `{ code, data, msg }`、`msgKey`、`requestId` 处理一致。

怎么做：

1. 新增 renderer 请求 helper，例如 `useVtRequest`。
2. 统一处理：
   - loading。
   - success 判断。
   - error toast。
   - msgKey 翻译。
   - requestId 复制或展开。
   - 防重复点击。
3. 页面只关心成功后的 data。
4. 特殊错误允许页面覆盖展示方式。
5. 不改变 preload 契约。

完成标准：

1. 新页面不再手写重复的 `isOk`。
2. 错误提示风格统一。
3. 多语言优先用 `msgKey`。
4. 模型失败时可以看到 requestId 或诊断入口。

验证方式：

1. 改造一个设置页和一个业务页做样板。
2. 故意触发失败，确认提示一致。
3. 搜索重复 `code === 200`，逐步减少。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/composables/useVtRequest.ts`、`src/renderer/src/i18n/messages.ts`、`src/renderer/src/features/settings/components/RequestDiagnostics.vue`、`src/renderer/src/features/task-center/TaskCenter.vue`、`scripts/verify-opt-040-renderer-request.mjs`、`scripts/verify.mjs`、`scripts/verify-p4-task-center.mjs`、`scripts/verify-p6-script-agent-phase4.mjs`、`scripts/verify-p7-scripts.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-040-renderer-request.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run build` 通过。`verify:content` 期间同步修正 P4/P6/P7 三个过期校验断言。

### 【√】OPT-041 renderer 全局错误边界

优先级：P1

处理状态：已完成；本项收口 renderer 全局异常兜底。Socket 断开状态和 media 图片/视频占位重试不在本项伪装完成，后续跟 `OPT-024/048/049` 页面治理和 Socket 专项继续处理。

关联任务：`docs/tasks/OPT-041-renderer全局错误边界.md`

问题：

页面运行时异常、路由错误、未捕获 Promise rejection 需要统一兜底。否则用户只会觉得页面白屏、卡住或没反应。IPC 调用失败已经由 `OPT-040 useVtRequest` 覆盖；Socket 断开和 media 资源加载失败属于页面/媒体专项，不能混在这里一次性假完成。

为什么要做：

桌面程序没有浏览器用户习惯的 Network 面板，错误必须产品内可见、日志可追。

怎么做：

1. Vue app 注册全局 `errorHandler`。
2. 注册 `window error` 监听。
3. 注册 `unhandledrejection` 监听。
4. 注册 `router.onError`。
5. 新增 `RendererErrorBoundary` 包住 `RouterView`。
6. 错误提示走 i18n 和 TDesign `MessagePlugin`。
7. 原始 error 只进开发者控制台，不在页面展示 stack、本地路径或实现细节。
8. 同类错误 3 秒内节流，避免连续刷屏。

完成标准：

1. 页面异常不会导致整页白屏。
2. 用户能看到可理解提示。
3. 开发者能在控制台看到错误来源。
4. Promise 未 catch 和路由错误都有兜底。
5. 用户可见文案支持中英文。

验证方式：

1. 跑专项 verify，确认入口、边界组件、i18n 和 verify 分组接入。
2. 跑 typecheck。
3. 跑 settings 分组回归。
4. 跑 docs 校验。
5. 跑 build。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/utils/renderer-error-boundary.ts`、`src/renderer/src/components/RendererErrorBoundary.vue`、`src/renderer/src/main.ts`、`src/renderer/src/App.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-041-renderer-error-boundary.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-041-renderer全局错误边界.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-041-renderer-error-boundary.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。`verify:settings` 中的 ONNX、默认资源缺文件和 Electron GPU 警告为既有环境警告，命令最终通过。

### 【√】OPT-042 Tailwind 优先和 SCSS 边界治理

优先级：P1

处理状态：已完成；已固定新 UI 的 Tailwind 优先规则、SCSS 允许范围和专项 verify。旧 SCSS 不一次性迁移，后续随 `OPT-048/049/050/051` 按页面逐步收敛。

关联任务：`docs/tasks/OPT-042-Tailwind优先和SCSS边界治理.md`

问题：

`src/renderer/src/styles/index.scss` 已经很大。项目已有 Tailwind 配置，但很多历史 task 仍写“修改 index.scss”。如果继续把普通页面样式塞进 SCSS，后期滚动锁死、弹窗遮挡、z-index 冲突、局部样式互相影响会越来越多。

为什么要做：

用户已经遇到过页面卡住和不能滚动。样式治理不是美化问题，而是稳定性问题。VT Studio 的前端规则必须明确：能用 Tailwind 就不要写 SCSS。

怎么做：

1. 新增 UI 默认使用 Tailwind：
   - 布局
   - 间距
   - 字号
   - 颜色
   - 边框
   - flex/grid
   - hover/focus/disabled
   - 响应式
2. SCSS 只允许用于：
   - `@tailwind` 引入。
   - 全局 reset。
   - 主题 CSS 变量和 token。
   - Electron 根布局。
   - 全局滚动容器。
   - z-index 层级。
   - TDesign `:deep()` 穿透。
   - 第三方组件覆盖。
   - 滚动条、keyframes、复杂伪元素。
   - 多处复用且 Tailwind 难以表达的公共 class。
3. 不再把普通页面样式继续追加到 `src/renderer/src/styles/index.scss`。
4. 旧 SCSS 不为了统一而大面积重写；碰到模块开发时逐步收敛。
5. 定义滚动容器规则：
   - body 不承担业务滚动。
   - 主工作区一个明确滚动层。
   - 弹窗打开关闭必须恢复滚动。
6. 定义 z-index 层级：
   - titlebar
   - sidebar
   - modal
   - dropdown
   - toast
7. 禁止随意写全局选择器影响 TDesign 内部。
8. 涉及页面结构、视觉层级、交互、响应式、可访问性的任务，必须使用 `ui-ux-pro-max` Skill 做设计和验收检查。
9. 每个批次做页面滚动回归。

完成标准：

1. 新增页面和组件优先使用 Tailwind。
2. 新增 SCSS 都能说明属于允许场景。
3. 主样式文件不再无限膨胀。
4. 主要页面缩放窗口后不锁死。
5. 弹窗、下拉、toast 层级稳定。
6. 新模块不会默认创建一堆模块 SCSS 替代 Tailwind。
7. UI 相关 task 能说明已按 `ui-ux-pro-max` 检查可访问性、交互、布局、颜色、表单反馈。

验证方式：

1. 打开设置、项目、任务中心、原文、剧本 Agent。
2. 各页面滚动到底。
3. 打开弹窗再关闭，继续滚动。
4. 缩小窗口验证无内容遮挡。
5. 抽查本次改动，确认普通样式使用 Tailwind。
6. 抽查新增 SCSS，确认属于允许场景。
7. 抽查 UI task，确认已按 `ui-ux-pro-max` 的关键项检查：可访问性、触控/点击区域、布局响应式、颜色对比、表单反馈、滚动和 z-index。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/styles/index.scss`、`scripts/verify-opt-042-style-boundary.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-042-Tailwind优先和SCSS边界治理.md`、`docs/TODO-优化与缺口.md`、`docs/03-执行进度.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-042-style-boundary.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run typecheck` 通过。

---

## P2 工程整理和脚本规范

### 【√】OPT-043 verify 脚本分组入口和 package scripts 规范

优先级：P2

处理状态：已完成；同时覆盖 `OPT-025`，已经同步标记 `OPT-025`。

关联任务：`docs/tasks/OPT-BATCH-001-工程入口和文档治理.md`

问题：

项目已经有很多 verify 脚本，但 `package.json` 只有 `dev/build/typecheck/preview`。后续不知道该跑哪个验证。同时 `build` 脚本内部写了 `pnpm run typecheck`，在用户强调不能混用 pnpm 的前提下，这种嵌套命令不够稳。

为什么要做：

验证入口必须简单明确。脚本内部也不应该依赖 PATH 上的 pnpm，避免又走到错误版本。

怎么做：

1. 增加 package scripts：
   - `verify:core`
   - `verify:settings`
   - `verify:project`
   - `verify:content`
   - `verify:assets`
   - `verify:production`
   - `verify:export`
   - `verify:acceptance`
   - `verify:docs`
   - `verify:all`
2. `build` 脚本不要嵌套 `pnpm run typecheck`，改成直接执行 typecheck 对应命令，或由外部按顺序跑。
3. 文档里写明 Codex 执行时用 `D:\software\nodejs\pnpm.cmd run xxx`。
4. 每个批次文档写清对应 verify。

完成标准：

1. 用户能一眼知道当前阶段跑哪个 verify。
2. 脚本内部不再隐式调用错误 pnpm。
3. CI 或人工验证有统一入口。

验证方式：

1. 跑 `D:\software\nodejs\pnpm.cmd run verify:core`。
2. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。
3. 跑 `D:\software\nodejs\pnpm.cmd run build`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`package.json`、`scripts/verify.mjs`、`scripts/verify-core-011.mjs`
- 验证结果：`D:\software\nodejs\pnpm.cmd run verify:core` 通过；`D:\software\nodejs\pnpm.cmd run typecheck` 通过；`D:\software\nodejs\pnpm.cmd run build` 通过。`verify:core` 中默认资源缺文件为后续 `CORE-014/默认资源治理` 范围，不作为本任务阻塞。

### 【√】OPT-044 `.gitignore` 异常内容清理

优先级：P2

处理状态：已完成；已删除末尾误粘贴内容，保留必要工程忽略项。

关联任务：`docs/tasks/OPT-BATCH-001-工程入口和文档治理.md`

问题：

`.gitignore` 末尾存在明显异常内容：

```txt
\!docs.includes(e)
c.url))].sort()
m\[1\]
```

这些不像有效 gitignore 规则，更像误粘贴残留。

为什么要做：

根目录工程文件必须干净。无意义规则会降低项目可信度，也可能误导后续 AI 或开发者。

怎么做：

1. 复查 `.gitignore` 每一行。
2. 删除明显误粘贴内容。
3. 保留必要忽略项：
   - node_modules
   - dist
   - out
   - .runtime
   - .pnpm-store
   - .node-gyp
   - .npm-cache
   - tsbuildinfo
   - log
4. 如需保留特殊规则，必须写注释说明原因。

完成标准：

1. `.gitignore` 没有乱码或误粘贴残留。
2. git status 不出现 runtime、out、node_modules。
3. 忽略规则清楚可读。

验证方式：

1. 运行 `git status`。
2. 检查 `out/.runtime/node_modules` 不被追踪。
3. 人工复查 `.gitignore`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`.gitignore`、`!docs.includes(e)`、`c.url))].sort()`、`m[1]`、`docs/TODO-优化与缺口.md`
- 验证结果：已人工复查 `.gitignore`；保留 `node_modules`、`dist`、`out`、`.runtime`、`.pnpm-store`、`.node-gyp`、`.npm-cache`、`*.tsbuildinfo`、`*.log`；删除 `.gitignore` 中 `\!docs.includes(e)`、`c.url))].sort()`、`m\[1\]` 三行误粘贴内容；根目录同名 0 字节空文件也已删除；`git status` 当前未显示 `out`、`.runtime`、`node_modules`。

### 【√】OPT-045 docs、tasks、TODO 三套文档状态联动

优先级：P2

处理状态：已完成；用来保证 task、TODO、执行进度不互相打架。

关联任务：`docs/tasks/OPT-BATCH-001-工程入口和文档治理.md`

问题：

现在有 `03-执行进度.md`、`05-后续执行计划.md`、`docs/tasks` 和本 TODO。功能 task 完成后，TODO 里的优化项不一定同步；TODO 新增后，对应 task 也不一定创建。

为什么要做：

用户要的是“后面丢给 AI 就能继续处理”。如果状态不同步，换窗口或换 AI 会不知道哪个已做、哪个只是记录。

怎么做：

1. TODO 项正式进入开发前，必须关联 task 或批次文档。
2. task 完成后，如果覆盖 TODO 项，必须回填完成记录。
3. `03` 只写当前进度，不写细节。
4. TODO 只写全局缺口，不替代 task。
5. 每次批次完成时，扫一遍相关 TODO 状态。

完成标准：

1. TODO 里的每个已完成项都有完成时间、涉及文件、验证结果。
2. task 文档里能找到对应实现记录。
3. 不出现“代码做了但 TODO 还写没做”的长期状态。

验证方式：

1. 完成一个优化项后检查 TODO、task、03 是否同步。
2. 随机抽查 3 个已完成项，看是否有验证记录。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`docs/tasks/OPT-BATCH-001-工程入口和文档治理.md`、`scripts/verify-doc-status.mjs`、`scripts/verify.mjs`、`package.json`、`docs/TODO-优化与缺口.md`
- 验证结果：`D:\software\nodejs\pnpm.cmd run verify:docs` 通过；已抽查 `OPT-016`、`OPT-023`、`OPT-043`、`OPT-044` 完成记录；`docs/03-执行进度.md` 中的 task/features 文档引用存在。

### 【√】OPT-046 参考项目差异和 VT Studio 增强边界复核

优先级：P2

处理状态：已完成；本轮复核已完成，后续每个新批次完成后继续新增复核记录。

关联任务：补充 `docs/04-对齐验收与偏差记录.md`

问题：

项目目标不是一比一照抄参考项目，而是在技术栈不同的情况下逻辑尽量一致，并做更专业的本地桌面化。但哪些是“参考项目原样逻辑”、哪些是“VT Studio 增强”、哪些是“暂时没做”，需要持续记录。

为什么要做：

否则后期会出现两种偏差：一种是漏掉参考项目能力，另一种是 AI 自己加了看似合理但不符合用户预期的逻辑。

怎么做：

1. 每个批次完成后复核参考项目对应模块。
2. 差异写进 `04`：
   - 原参考怎么做。
   - VT Studio 怎么做。
   - 为什么不同。
   - 用户是否确认。
3. 对“比参考项目更专业”的增强，也要记录边界。
4. 对“参考项目有但暂未实现”的能力，必须进入 TODO 或后续计划。

完成标准：

1. 重要业务差异都有记录。
2. 没有只在聊天里说、文档里找不到的关键决策。
3. 后续 AI 能通过 `04` 判断是否偏题。

验证方式：

1. 抽查模型配置、项目管理、资产生成、导出四个模块。
2. 对比参考项目和 VT Studio 现状。
3. 确认差异都有记录或 TODO。

最近一次复核：

- 复核时间：2026-07-04
- 复核范围：`OPT-051` 项目流程总览和流程驱动交互；对照参考项目任务中心、项目内生产流程、失败原因和跳转入口。
- 参考项目结论：参考项目没有独立“流程总览”页，任务失败原因主要停留在任务中心和具体业务页面；用户需要靠菜单理解顺序。
- VT Studio 结论：流程总览属于桌面化流程增强，不改变原文、剧本、资产、生产、导出的业务语义；失败任务摘要只做入口提示，完整筛选、失败原因复制和排查仍回到任务中心。
- 记录位置：`docs/04-对齐验收与偏差记录.md` 的 `D-BASE-033`、`OPT-051` 偏差记录和验收记录。

完成记录：

- 完成时间：2026-07-04
- 涉及文件：`docs/04-对齐验收与偏差记录.md`、`docs/TODO-优化与缺口.md`、`docs/03-执行进度.md`
- 验证结果：本轮已复核 `OPT-051` 与参考项目的任务失败原因和流程入口差异；新增差异记录 `D-BASE-033`，并把 `OPT-051` 验收记录写入 `04`。同时完成全项目配置、默认资源、模型调用、出图、出视频、画布、导出和任务失败链路复核；`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:all`、`D:\software\nodejs\pnpm.cmd run build` 通过。后续新批次仍继续按本规则回查。

### 【√】OPT-047 可见文案 i18n 全量治理

优先级：P1

处理状态：已完成；第一批基础入口、第二批设置模型服务、第三批设置供应商、第四批设置 Skill 管理、第五批设置 Agent 配置、第六批设置记忆配置、第七批设置提示词管理、第八批设置模型专用模板、第九批设置其他业务配置、第十批设置数据库管理、第十一批设置开发者配置、第十二批共享脚手架和设置残留、第十三批项目管理页、第十四批原文/小说页、第十五批剧本页、第十六批剩余业务页复扫和收尾复扫已完成。后续新增 UI 仍必须遵守。

关联任务：`docs/tasks/OPT-047-可见文案i18n治理-第一批.md`、`docs/tasks/OPT-047-可见文案i18n治理-第二批-设置模型服务.md`、`docs/tasks/OPT-047-可见文案i18n治理-第三批-设置供应商.md`、`docs/tasks/OPT-047-可见文案i18n治理-第四批-设置Skill管理.md`、`docs/tasks/OPT-047-可见文案i18n治理-第五批-设置Agent配置.md`、`docs/tasks/OPT-047-可见文案i18n治理-第六批-设置记忆配置.md`、`docs/tasks/OPT-047-可见文案i18n治理-第七批-设置提示词管理.md`、`docs/tasks/OPT-047-可见文案i18n治理-第八批-设置模型专用模板.md`、`docs/tasks/OPT-047-可见文案i18n治理-第九批-设置其他业务配置.md`、`docs/tasks/OPT-047-可见文案i18n治理-第十批-设置数据库管理.md`、`docs/tasks/OPT-047-可见文案i18n治理-第十一批-设置开发者配置.md`、`docs/tasks/OPT-047-可见文案i18n治理-第十二批-共享脚手架和设置残留.md`、`docs/tasks/OPT-047-可见文案i18n治理-第十三批-项目管理页.md`、`docs/tasks/OPT-047-可见文案i18n治理-第十四批-原文小说页.md`、`docs/tasks/OPT-047-可见文案i18n治理-第十五批-剧本页.md`、`docs/tasks/OPT-047-可见文案i18n治理-第十六批-剩余业务页复扫.md`、`docs/tasks/OPT-047-可见文案i18n治理-收尾复扫.md`；后续所有 UI task 必须遵守

问题：

项目已经有 i18n 底座，但 renderer 里仍有大量历史硬编码中文/英文。范围不只是新增 UI，已经做过的页面、store、router、toast、dialog、状态文案也要治理。

为什么要做：

用户要求所有能看到的内容都支持多语言。只要求“新增 UI”不够，旧页面继续硬编码会导致语言切换后界面一半中文一半英文，看起来不专业，也会影响后续 AI 按规范续做。

怎么做：

1. 全量扫描 renderer 可见文案：
   - `.vue` 模板文本。
   - 组件 props：`label`、`placeholder`、`title`、`description`、`header`、`confirm-btn`、`cancel-btn`。
   - `MessagePlugin`、`DialogPlugin`、`NotifyPlugin`。
   - router `meta.title`、菜单 `title/description`。
   - store 里的用户可见错误。
   - 表格列名、空状态、loading、状态 tag、tooltip。
2. 所有可见文案写入 `src/renderer/src/i18n/messages.ts`。
3. `zh-CN` 和 `en` 必须同时补齐。
4. 动态文案用 i18n params：
   - `删除 {name}`
   - `耗时：{duration}ms`
   - `{count} 个任务正在运行`
5. 页面展示枚举 label 必须从 shared constants + i18n label 派生，不在页面散写。
6. main 返回的 `msg` 可作为 fallback；renderer 优先用 `msgKey` 翻译。
7. 不强制翻译这些内容：
   - 用户自己输入的项目名、剧本内容、prompt 内容。
   - 模型返回正文。
   - Skill/手册 Markdown 正文。
   - 文件名、模型 ID、vendor ID、路径。
   - 正则表达式和协议字段。
8. 但上述内容旁边的标题、按钮、字段名、状态说明、错误提示必须翻译。

完成标准：

1. 切换中文/英文后，已完成页面的菜单、标题、按钮、表单、弹窗、toast、空状态、状态 tag 都跟随切换。
2. 新增 UI 不允许硬编码中文/英文可见文案。
3. 已有页面逐批清理，不再长期保留明显硬编码。
4. renderer 中的中文硬编码只允许出现在：
   - i18n messages。
   - 用户内容默认值或测试 prompt。
   - 正则或资源正文。
   - 明确不需要翻译的技术字段。
5. 每个后续 UI task 验收都必须包含“可见文案 i18n”。

验证方式：

1. 搜索 renderer 中文硬编码，逐项分类处理。
2. 抽查 `App.vue`、router、Project、Settings、Task、Source、Script Agent 页面。
3. 手动切换 zh-CN/en，确认页面、toast、dialog、empty、placeholder 都切换。
4. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/i18n/messages.ts`、`src/renderer/src/features/project/ProjectHome.vue`、`src/renderer/src/features/project/components/ProjectFormDialog.vue`、`src/renderer/src/features/project/components/ManualFormDialog.vue`、`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/features/script/ScriptHome.vue`、`scripts/verify-opt-047-renderer-i18n-sweep.mjs`、`scripts/verify.mjs`
- 验证结果：OPT-047 第一批到第十六批和收尾复扫均已完成；`D:\software\nodejs\node.exe scripts\verify-opt-047-renderer-i18n-sweep.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第一批完成时间：2026-07-03
- 第一批涉及文件：`src/renderer/src/utils/i18n-text.ts`、`src/shared/types/app.ts`、`src/renderer/src/router/menu.ts`、`src/renderer/src/router/index.ts`、`src/renderer/src/layouts/WorkbenchLayout.vue`、`src/renderer/src/stores/auth.ts`、`src/renderer/src/stores/app.ts`、`src/renderer/src/App.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-i18n-foundation.mjs`、`scripts/verify.mjs`
- 第一批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-i18n-foundation.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第二批完成时间：2026-07-03
- 第二批涉及文件：`src/renderer/src/features/settings/components/ModelServiceConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-model-service-i18n.mjs`、`scripts/verify.mjs`
- 第二批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-model-service-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第三批完成时间：2026-07-03
- 第三批涉及文件：`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-vendor-config-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-opt-035-secret-boundary.mjs`、`scripts/verify-opt-052-adapter-security.mjs`、`scripts/verify-opt-053-model-connection-projection.mjs`
- 第三批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-vendor-config-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第四批完成时间：2026-07-03
- 第四批涉及文件：`src/renderer/src/features/settings/components/SkillManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-skill-management-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-007.mjs`
- 第四批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-skill-management-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第五批完成时间：2026-07-03
- 第五批涉及文件：`src/renderer/src/features/settings/components/AgentConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-agent-config-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-005.mjs`
- 第五批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-agent-config-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第六批完成时间：2026-07-03
- 第六批涉及文件：`src/renderer/src/features/settings/components/MemoryConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-memory-config-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-008.mjs`
- 第六批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-memory-config-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第七批完成时间：2026-07-03
- 第七批涉及文件：`src/renderer/src/features/settings/components/PromptConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-prompt-config-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-006.mjs`
- 第七批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-prompt-config-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第八批完成时间：2026-07-03
- 第八批涉及文件：`src/renderer/src/features/settings/components/ModelPromptConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-model-prompt-config-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-004.mjs`
- 第八批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-model-prompt-config-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第九批完成时间：2026-07-03
- 第九批涉及文件：`src/renderer/src/features/settings/components/BusinessConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-business-config-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-012.mjs`
- 第九批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-business-config-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第十批完成时间：2026-07-03
- 第十批涉及文件：`src/renderer/src/features/settings/components/DatabaseManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-database-management-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-010.mjs`、`scripts/verify-opt-035-secret-boundary.mjs`、`scripts/verify-opt-038-business-locks.mjs`
- 第十批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-database-management-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第十一批完成时间：2026-07-03
- 第十一批涉及文件：`src/renderer/src/features/settings/components/DeveloperConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-developer-config-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-014.mjs`
- 第十一批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-developer-config-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第十二批完成时间：2026-07-03
- 第十二批涉及文件：`src/renderer/src/features/shared/ModuleScaffold.vue`、`src/renderer/src/features/settings/SettingsHome.vue`、`src/renderer/src/features/export/ExportHome.vue`、`src/renderer/src/features/shell/WelcomeGuide.vue`、`src/renderer/src/features/settings/appearance/theme.ts`、`scripts/verify-opt-047-shared-foundation-i18n.mjs`、`scripts/verify.mjs`
- 第十二批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-shared-foundation-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第十三批完成时间：2026-07-03
- 第十三批涉及文件：`src/renderer/src/features/project/ProjectHome.vue`、`src/renderer/src/features/project/components/ProjectFormDialog.vue`、`src/renderer/src/features/project/components/ManualFormDialog.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-project-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-p3-projects.mjs`
- 第十三批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-project-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第十四批完成时间：2026-07-03
- 第十四批涉及文件：`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-source-i18n.mjs`、`scripts/verify.mjs`
- 第十四批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-source-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第十五批完成时间：2026-07-03
- 第十五批涉及文件：`src/renderer/src/features/script/ScriptHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-script-i18n.mjs`、`scripts/verify.mjs`
- 第十五批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-script-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:content` 通过；本批只处理导入预览文案，未单独跑全量 build，后续业务页合并批次收尾时集中执行。
- 第十六批完成时间：2026-07-03
- 第十六批涉及文件：`scripts/verify-opt-047-business-pages-i18n.mjs`、`scripts/verify.mjs`
- 第十六批验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-business-pages-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run typecheck` 通过；本批为复扫和防回退，未改业务代码，未单独跑 build。
- 收尾复扫完成时间：2026-07-03
- 收尾复扫涉及文件：`scripts/verify-opt-047-renderer-i18n-sweep.mjs`、`scripts/verify.mjs`
- 收尾复扫验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-renderer-i18n-sweep.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 后续批次：项目/原文/剧本/资产/生产/导出页面、弹窗/表格/状态 tag/toast 仍需继续迁移。

### 【√】OPT-048 全局菜单和页面布局治理

优先级：P1

处理状态：已完成第一批；工作台骨架、菜单去重、设置快速定位和可访问性入口已落地。项目页、任务中心、原文、剧本 Agent、生产、导出等页面内部细节继续走 `OPT-049/050/051`。

关联任务：`docs/tasks/OPT-048-全局菜单和页面布局治理.md`；后续页面类 task 必须遵守

问题：

当前整体菜单、页面布局、设置页结构偏乱。继续做资产中心、生产工作台、导出前，如果不先统一页面骨架，后面每个页面都会自己长一套结构，最终容易变成“四不像”。

为什么要做：

这不是单纯美化。菜单、页面壳、标题区、工具栏、内容滚动区、空状态、弹窗/抽屉如果没有统一规则，后续功能越多越难维护，也容易再次出现滚动锁死、按钮位置混乱、设置项看不懂的问题。

怎么做：

1. 使用 `ui-ux-pro-max` Skill 做 UI/UX 检查，不凭感觉改样式。
2. 先治理全局骨架，不提前精装修未开发业务页。
3. 统一左侧全局菜单：
   - 项目。
   - 任务中心。
   - 项目内功能入口。
   - 设置入口。
   - 当前选中态。
   - 折叠态。
   - 图标和文字对齐。
4. 统一顶部项目栏：
   - 当前项目信息。
   - 返回项目列表。
   - 刷新或同步状态。
   - 任务运行状态提示。
   - 设置、版本、诊断入口。
5. 统一页面结构：
   - 页面标题区。
   - 页面说明区，说明必须短，不写说明书。
   - 页面工具栏。
   - 搜索和筛选区。
   - 主内容区。
   - 分页区。
   - 固定底部操作区，只有确实需要时使用。
6. 统一列表页规则：
   - 表格列密度。
   - 批量操作。
   - 空状态。
   - 加载状态。
   - 失败状态。
   - 删除确认。
7. 统一表单和弹窗规则：
   - 字段按业务分组。
   - 必填、帮助、错误提示靠近字段。
   - 保存、取消、测试、重置、删除等按钮位置固定。
   - 危险操作放在独立区域。
   - 未保存关闭必须提醒。
8. 重新整理设置页信息架构：
   - 模型与生成。
   - 提示词、Skill、记忆。
   - 项目与资源。
   - 数据库和文件。
   - 外观、语言、主题。
   - 开发者诊断。
   - 关于和版本。
9. 所有新增样式优先 Tailwind。
10. 所有可见文案必须走 i18n，同时补 `zh-CN` 和 `en`。
11. 不新增大面积 SCSS；确实需要 SCSS 时必须属于 `OPT-042` 允许场景。
12. 页面结构组件可以抽，但只抽真实复用组件，不为了“看起来专业”造空架构。

完成标准：

1. 用户打开软件后，能清楚知道当前在哪个项目、哪个页面、下一步能点什么。
2. 设置页不再像一堆散配置，普通用户能按目标找到配置。
3. 项目页、设置页、任务中心、原文、剧本 Agent、剧本页使用一致的页面结构。
4. 页面缩放后没有明显遮挡、横向溢出、按钮挤压。
5. 打开弹窗/抽屉再关闭后，主页面仍能正常滚动。
6. 页面按钮、表格、空状态、失败提示、loading 风格一致。
7. UI task 已记录使用 `ui-ux-pro-max` 检查过可访问性、交互、布局、颜色、表单反馈。
8. 没有把业务功能提前改偏；这轮只统一骨架和交互规范。

验证方式：

1. 打开项目页、设置页、任务中心、原文、剧本 Agent、剧本页。
2. 每个页面检查：标题、工具栏、主内容、空状态、错误状态、滚动。
3. 打开并关闭至少一个弹窗或抽屉，确认滚动和焦点正常。
4. 缩小窗口到小尺寸，确认不横向溢出、不遮挡核心按钮。
5. 切换中文/英文，确认菜单、标题、按钮、空状态、toast、dialog 跟随切换。
6. 检查新增普通样式是否优先 Tailwind。
7. 按 `ui-ux-pro-max` 的重点项复核：可访问性、点击区域、布局响应式、颜色对比、表单反馈、导航清晰度。
8. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/layouts/WorkbenchLayout.vue`、`src/renderer/src/features/settings/SettingsHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-p2-shell.mjs`、`scripts/verify-opt-048-layout-governance.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-048-全局菜单和页面布局治理.md`、`docs/TODO-优化与缺口.md`、`docs/03-执行进度.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-048-layout-governance.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run typecheck` 通过。

### 【√】OPT-049 全页面交互 UI 整改清单

优先级：P1

处理状态：已完成；总清单已固化，第一批页面已完成：项目页、任务中心、原文页；第二批页面已完成：剧本页、资产页、角景页、全局工作台壳层视觉微调；第三批页面已完成：登录页小窗口、错误提示和回车提交收口；第四批第一组已完成：全局壳层顶部、设置页目录化、原生 title 清理、TDesign checkbox/tooltip 规则和生产工作台关键图标交互；第四批第二组已完成：弹窗/抽屉全局治理、文件上传入口组件化和业务页面 file input 清零；最终收口已完成：剧本 Agent 三栏、原文失败重试、登录恢复动作、ModuleScaffold 下一步提示和最终防回退校验已闭环。

关联任务：`docs/tasks/OPT-049-全页面交互UI整改清单.md`

问题：

当前页面能跑，但整体更像“工程功能堆出来的页面”，还不是一个成熟桌面产品。主要问题是：右侧顶部占用过多空间、页面结构不统一、设置页顶部二次堆叠、按钮和工具栏位置不稳定、卡片套卡片、空状态和失败状态弱、部分页面滚动容易出问题、图标按钮还依赖原生 `title`、部分位置没有优先使用 TDesign/已有组件。

为什么要做：

后续要做资产、角景、生产、导出，这些页面信息量更大。如果现在不把全局交互和页面规范定好，后面每个功能都会按自己的方式长出来，最后就会变成用户担心的“四不像”。这一项不是单纯美化，是为了让所有页面都按同一套产品逻辑工作。

怎么做：

1. 先做 `OPT-048`，把全局菜单、顶部栏、页面壳、滚动容器、设置页信息架构统一。
2. 再按本清单逐页改，不一次性乱改所有页面。
3. 每个页面改之前必须先确认：
   - 这个页面的主任务是什么。
   - 用户最常点的 1 个主操作是什么。
   - 哪些操作是次要操作。
   - 哪些操作危险，必须二次确认。
   - 页面有没有空状态、加载状态、失败状态。
   - 是否需要批量操作、筛选、搜索、分页。
4. 所有页面统一使用：
   - 页面标题区。
   - 工具栏。
   - 筛选/搜索区。
   - 主内容区。
   - 空状态/失败状态/加载状态。
   - 分页或底部操作区。
5. 操作按钮统一规则：
   - 一个页面只突出一个主按钮。
   - 次要操作放普通按钮或更多菜单。
   - 危险操作放危险区或危险按钮，不和保存按钮挤在一起。
   - 批量操作只在选中内容后明显出现。
6. 表单统一规则：
   - 字段按业务分组。
   - 必填、帮助、错误提示靠近字段。
   - 保存时按钮进入 loading。
   - 保存失败显示原因和恢复动作。
   - 关闭有未保存内容时必须提醒。
7. 列表/表格统一规则：
   - 列名、筛选、排序、分页固定风格。
   - 长文本不硬挤，必要时折叠、tooltip、抽屉详情。
   - 空列表必须告诉用户下一步点什么。
   - 失败列表必须能重试。
8. 弹窗/抽屉统一规则：
   - 新建和编辑优先弹窗或抽屉，不跳来跳去。
   - 详情类优先抽屉。
   - 删除类必须确认影响范围。
   - 弹窗打开关闭后主页面滚动要恢复。
9. 视觉统一规则：
    - 使用 `ui-ux-pro-max` 检查布局、交互、可访问性、颜色对比、表单反馈。
    - 优先 Tailwind，不把普通页面样式继续堆进全局 SCSS。
    - 图标使用统一图标库，不用 emoji 当结构图标。
    - 颜色使用主题 token，不在页面随手写一堆颜色。
10. 组件化交互规则：
    - 能用 TDesign 或项目已有封装组件就不用裸 HTML 控件。
    - 图标按钮、窄导航、复制、刷新、打开目录、设置、详情、预览等动作必须使用 `t-tooltip` 或组件内建 tooltip，不用原生 `title` 充当说明。
    - checkbox、select、input、button 优先用 TDesign 组件；原生控件只允许用于语义布局或组件库缺口，并必须补齐 focus、aria 和状态样式。
    - 弹窗、抽屉、表单、空状态、失败提示优先复用组件库能力，不手写一套风格不一致的壳。
11. 第四批先做全局重构：
    - 压缩右侧顶部为低高度 command bar。
    - 设置页移除 `ModuleScaffold` 和顶部大 quick cards，改成左侧设置目录 + 右侧内容。
    - 全量检查弹窗/抽屉和图标按钮的 tooltip、footer、滚动、危险操作。
12. 多语言统一规则：
    - 所有用户能看到的标题、按钮、提示、状态、空状态、弹窗、toast 都走 i18n。
    - `zh-CN` 和 `en` 同时补。
    - 技术字段、文件名、用户内容、模型返回内容不强制翻译。

页面整改清单：

1. 登录页：
   - 移除默认明文账号密码展示，不要让 `admin/admin123` 看起来像正式产品默认密码。
   - 本地模式说明要短，说明“当前是本地桌面优先”即可，不写长说明书。
   - 初始化失败时要有重试和查看日志入口。
   - 登录按钮要有 loading、失败提示、回车提交。
   - 小窗口不能横向溢出。

2. 全局工作台布局：
   - 左侧菜单和顶部项目菜单职责要分清。
   - 左侧负责全局入口和项目内主模块。
   - 顶部负责当前项目、任务运行状态、设置/诊断/版本入口。
   - 当前页面选中态要清楚。
   - 设置入口不要到处重复出现。
   - `M-xxx` 这种开发编号不能成为普通用户理解页面的主要信息。

3. 项目页：
   - 项目卡片现在信息偏密，要区分“项目核心信息”和“辅助统计”。
   - 新建项目、打开项目、编辑项目、删除项目位置要固定。
   - 项目管理和视觉/导演手册管理不要混成一个难懂的大表单。
   - 删除项目影响范围不要用原始 `pre` 文本，要改成结构化风险摘要。
   - 空项目状态要直接引导“新建项目”。
   - 项目缩略图、更新时间、模型/画质配置要有稳定展示规则。

4. 设置页：
   - 当前最大问题是长滚动配置堆叠，用户很难定位。
   - 必须改成左侧分类或锚点导航。
   - 分类建议：
     - 模型与生成。
     - 提示词、Skill、记忆。
     - 项目与资源。
     - 数据库与文件。
     - 外观、语言、主题。
     - 开发者诊断。
     - 关于、版本、账号。
   - 每个设置块只放同一类事情。
   - 测试连接、保存、重置、删除这几类按钮位置要统一。
   - 密钥字段必须默认脱敏，有显示/隐藏和测试入口。
   - 长配置不要一屏堆完，能折叠的高级配置折叠。

5. 任务中心：
   - 当前表格偏粗糙，失败原因只靠 tooltip 不够。
   - 要有任务状态汇总：等待、进行中、成功、失败、取消。
   - 筛选条件要稳定：项目、分类、状态、时间。
   - 失败任务要有详情抽屉，能看到失败原因、requestId、关联项目、关联功能。
   - 能复制 requestId。
   - 可重试的任务要显示重试入口，不可重试要说明原因。
   - 刷新按钮、自动刷新状态要清楚。

6. 小说/原文页：
   - 导入流程基本方向可以保留，但表格密度要降。
   - 原文章节、搜索、分页、批量删除要放在清楚的工具栏里。
   - 原生 checkbox 风格要和 TDesign/Tailwind 统一。
   - 事件分析状态要明显：未分析、分析中、成功、失败。
   - 批量删除要有数量和影响范围确认。
   - 分析失败要能查看原因和重试。

7. 剧本 Agent 页：
   - 当前聊天、计划、上下文、剧本编辑混在一起，信息密度太高。
   - 建议拆成清楚的三段工作流：
     - 左侧对话和指令。
     - 中间计划/上下文/事件。
     - 右侧剧本结果或编辑区。
   - 屏幕窄时改成 tabs，不强行三栏。
   - 清理记忆、读取上下文这类高影响操作不要放得像普通按钮。
   - Agent 正在执行时要有步骤状态、可取消、失败原因。
   - 生成结果写入剧本前要让用户看清楚影响范围。

8. 剧本页：
   - 卡片列表比表格更适合，但现在导入、批量新增、AI 正则、资产提取混在一起。
   - 要按工作流分组：
     - 新增/导入剧本。
     - 编辑和搜索剧本。
     - 从剧本提取资产。
     - 导出剧本 zip。
   - 剧本卡片要突出集数、标题、状态、更新时间。
   - 批量操作只在选中剧本后出现。
   - 资产提取要显示任务状态和失败原因。

9. 资产页：
   - 卡片按钮太多，用户很难判断先点哪个。
   - 资产列表要先分清角色、场景、道具、片段、音频。
   - 每个资产卡片只显示核心状态和 1 个主操作。
   - 详情、提示词、生成历史、图片预览放到详情抽屉。
   - 批量生成提示词、批量生成图片、取消生成放稳定批量操作栏。
   - 图片预览要有固定比例，避免加载后卡片跳动。
   - 生成失败要有失败原因和重试。

10. 角景页：
    - 左侧配置 + 右侧资产网格方向可以保留。
    - 左侧配置项要分组，可折叠。
    - 角色、场景、音频绑定关系要一眼看清。
    - 批量绑定音频要显示选择范围。
    - 音频生成轮询要显示状态，不要让用户猜。
    - 复用资产提示词和图片生成时，要清楚显示来源。

11. 生产页：
    - 这是交互最复杂的页面，不能只把 VueFlow 放出来。
    - 顶部要有当前剧集/分集选择、流程完成度、刷新、保存。
    - 流程节点要有状态：未开始、等待、进行中、成功、失败、跳过。
    - 右侧需要属性面板，点击节点后显示参数、输入、输出、失败原因。
    - 底部或侧边需要任务/日志区域，显示 Production Agent 调度过程。
    - 自动布局、保存流程、刷新流程要位置稳定。
    - 生成衍生资产、分镜图、视频轨道时必须走任务状态，不静默执行。

12. 导出页：
    - 现在如果只是占位页，不满足最终工作流。
    - 要设计成导出向导：
      - 选择项目/剧集/分集。
      - 校验素材是否齐全。
      - 选择导出类型和路径。
      - 执行导出。
      - 展示结果和打开目录。
   - 缺素材时要列清楚缺什么、在哪补。
   - Windows 剪映专业版草稿导出要显示输出结构、目标目录、失败原因。
   - 导出成功后要能打开目录、复制路径。

13. 通用占位页 `ModuleScaffold`：
   - 占位页只能用于未开发模块。
   - 已经开始开发的页面不能继续只显示“待开发”。
   - 占位页也要有下一步入口或说明，不要只有空文本。

14. 全局样式和布局文件：
   - `index.scss` 已经偏大，不能继续当所有页面样式垃圾桶。
   - `tokens.scss` 负责主题 token，页面样式优先 Tailwind。
   - 全局只保留 reset、根布局、滚动、z-index、TDesign 穿透、主题变量。
   - 禁止新增影响全站的宽泛选择器。
   - 主滚动层必须明确，避免 body、页面、卡片多层抢滚动。

完成标准：

1. 主要页面都有统一页面骨架，不再一页一个结构。
2. 用户能从菜单和顶部栏清楚知道自己在哪个项目、哪个功能。
3. 每个页面都有主操作、次操作、危险操作的清晰层级。
4. 每个页面都有空状态、加载状态、失败状态。
5. 设置页能按分类快速定位，不再是长配置堆叠。
6. 任务中心能看懂任务状态、失败原因和 requestId。
7. 资产、角景、生产、导出页面的复杂操作都有明确步骤和状态。
8. 所有可见文案走 i18n。
9. 新增普通样式优先 Tailwind，SCSS 只用于允许场景。
10. 页面缩放、小窗口、弹窗打开关闭后，不出现卡住、横向溢出、滚动失效。
11. UI 改造 task 必须写明已按 `ui-ux-pro-max` 检查：可访问性、交互反馈、布局响应式、颜色对比、表单反馈、导航清晰度。
12. 图标按钮不依赖原生 `title`；能用组件库的控件不使用裸 `input/checkbox/select/button`。
13. 设置页首屏不再出现全局顶部、页面 hero、sticky quick cards 三层堆叠。

验证方式：

1. 打开登录、项目、设置、任务中心、原文、剧本 Agent、剧本、资产、角景、生产、导出。
2. 每页检查：标题、工具栏、主内容、空状态、加载状态、失败状态、滚动。
3. 每页至少打开一个弹窗或抽屉，关闭后继续滚动。
4. 缩小窗口检查是否横向溢出、按钮挤压、内容遮挡。
5. 切换中文/英文，检查菜单、标题、按钮、toast、dialog、empty、状态 tag。
6. 触发一个失败请求，检查是否有可理解错误、requestId 或恢复动作。
7. 检查新增样式是否优先 Tailwind。
8. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。
9. 跑新增第四批专项 verify，检查壳层顶部、设置页布局、tooltip 和组件化规则。
10. 跑文件上传入口组件化专项 verify，检查业务页面没有散落 `<input type="file">`，弹窗/抽屉全局治理样式仍在。

完成记录：

- 完成时间：
- 涉及文件：
- 验证结果：

第一批记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/project/ProjectHome.vue`、`src/renderer/src/features/task-center/TaskCenter.vue`、`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-049-page-ui-checklist.mjs`、`scripts/verify-opt-049-first-batch-ui.mjs`、`scripts/verify-opt-047-project-i18n.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-049-全页面交互UI整改清单.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-049-page-ui-checklist.mjs`、`D:\software\nodejs\node.exe scripts\verify-opt-049-first-batch-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

第二批记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/layouts/WorkbenchLayout.vue`、`src/renderer/src/styles/index.scss`、`src/renderer/src/styles/tokens.scss`、`src/renderer/src/features/script/ScriptHome.vue`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/corner-scape/CornerScapeHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-049-second-batch-ui.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-049-全页面交互UI整改清单.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-049-second-batch-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run verify:assets` 通过。

第三批记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/auth/LoginHome.vue`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-049-login-ui.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-049-全页面交互UI整改清单.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-049-login-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

第四批第一组记录：

- 状态：第四批第一组已完成：全局壳层顶部、设置页目录化、原生 title 清理、TDesign checkbox/tooltip 规则和生产工作台关键图标交互已收口；弹窗/抽屉深层治理继续后置。
- 范围：全局 `WorkbenchLayout` 顶部 command bar、设置页布局、图标按钮 tooltip、裸控件组件化替换、生产工作台关键图标交互。
- 规则：能用 TDesign 或项目已有封装组件就不用裸 HTML 控件；图标按钮不依赖原生 `title`，统一使用 `t-tooltip` 或组件内建 tooltip。
- 涉及文件：`src/renderer/src/layouts/WorkbenchLayout.vue`、`src/renderer/src/features/settings/SettingsHome.vue`、`src/renderer/src/features/settings/components/ModelServiceConfig.vue`、`src/renderer/src/features/settings/components/AgentConfig.vue`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/renderer/src/features/settings/components/RequestDiagnostics.vue`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/production/components/ProductionFlowNode.vue`、`src/renderer/src/features/production/components/ProductionImageFlowNode.vue`、`src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-049-fourth-batch-ui.mjs`、`scripts/verify.mjs`。
- 验证：`D:\software\nodejs\node.exe scripts\verify-opt-049-fourth-batch-ui.mjs`、`D:\software\nodejs\node.exe scripts\verify-opt-049-fourth-batch-plan.mjs`、`D:\software\nodejs\node.exe scripts\verify-opt-049-page-ui-checklist.mjs`、`D:\software\nodejs\node.exe scripts\verify-opt-049-second-batch-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

第四批第二组记录：

- 状态：已完成。
- 范围：弹窗/抽屉全局治理、文件上传入口组件化、业务页面 file input 清零、复杂表单弹窗滚动边界。
- 规则：文件选择这类必须借助浏览器原生能力的场景，也不能散落在页面里写裸 input；统一封装为项目组件，并以 TDesign 按钮作为可见交互。
- 涉及文件：`src/renderer/src/components/VtFilePicker.vue`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/features/script/ScriptHome.vue`、`src/renderer/src/features/project/components/ManualFormDialog.vue`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-049-dialog-upload-ui.mjs`、`scripts/verify.mjs`。
- 验证：`D:\software\nodejs\node.exe scripts\verify-opt-049-dialog-upload-ui.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run build` 通过。

最终收口记录：

- 状态：已完成。
- 范围：剧本 Agent 页三栏重排、登录错误恢复动作、原文失败事件重试、ModuleScaffold 下一步提示、最终防回退校验。
- 涉及文件：`src/renderer/src/features/script-agent/ScriptAgentHome.vue`、`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/features/auth/LoginHome.vue`、`src/renderer/src/features/shared/ModuleScaffold.vue`、`src/renderer/src/i18n/messages.ts`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-049-final-ui.mjs`、`scripts/verify.mjs`。
- 当前剩余内容：无。真实 API 端到端生成验收、剪映原生 schema、WebAV mp4 和 ComfyUI 视频 workflow 继续按对应业务任务处理，不算 OPT-049 未完成项。
- 验证：以本次最终执行的专项、分组回归、`typecheck` 和 `build` 结果为准。

### 【√】OPT-051 项目流程总览和流程驱动交互

优先级：P1

处理状态：已完成；四批已闭环：项目工作区首页、每页下一步提示、真实统计、任务中心失败原因联动。

关联任务：`docs/tasks/OPT-051-项目流程总览和流程驱动交互.md`；前端 UI 布局治理任务、P3 项目管理、P5 原文输入、P6 剧本 Agent、P7 剧本结果、P8 资产和角景音频、P9 生产工作台、P10 导出

问题：

现在功能是按菜单分散的。懂项目的人知道要先配置模型、再导入原文、再生成剧本、再提取资产、再生产视频；普通用户打开项目后不一定知道第一步干什么、下一步去哪、哪些内容没完成。

这会导致两个问题：

1. 用户只能靠点菜单试错，不知道完整流程。
2. 每个页面都在做自己的功能，但整条“文字到视频”的链路不够明显。

为什么要做：

VT Studio 应该是流程驱动型产品，不是菜单驱动型产品。

菜单负责跳转功能；流程总览负责告诉用户怎么完成一条视频。用户打开项目后，应该一眼看到完整流程、当前进度、失败点和下一步按钮。

怎么做：

1. 新增“项目工作区首页 / 流程总览”，作为打开项目后的默认落点。
2. 流程总览按真实生产顺序展示，不按技术模块顺序展示：
   - 基础配置
   - 原文导入
   - 剧本 Agent
   - 剧本确认
   - 提取资产
   - 资产生成/替换
   - 角景音频绑定
   - 分镜生产
   - 图片检查
   - 视频生成
   - 导出剪映草稿
3. 每一步都显示四类信息：
   - 当前状态：未开始、进行中、需处理、已完成、失败。
   - 关键数量：章节数、剧本数、资产数、分镜数、视频数、失败任务数。
   - 缺什么：例如未配置图片模型、角色没图片、轨道没选视频、导出素材缺失。
   - 下一步按钮：例如去配置模型、去导入原文、去生成剧本、去提取资产、去生成视频、去导出。
4. 每个业务页面顶部增加轻量“下一步提示”，不要做成长说明：
   - 原文页：导入完成后提示去剧本 Agent。
   - 剧本 Agent：剧本生成后提示去剧本确认。
   - 剧本页：剧本确认后提示提取资产。
   - 资产中心：资产图确认后提示去角景音频绑定或生产工作台。
   - 生产工作台：分镜/图片/视频状态明确后提示去导出。
5. 页面内只显示当前页面最重要的主操作，其他操作收进次级按钮、更多菜单或详情抽屉。
6. 不把所有功能塞进生产画布：
   - 流程总览看整体进度。
   - 菜单负责快速跳转。
   - 业务页面负责具体操作。
   - 生产画布负责看生产节点和处理分镜/视频。
   - 任务中心负责看后台任务、失败原因、取消、重试。
   - 导出页负责最终校验和导出。
7. 项目顶部导航可以保留，但顺序必须贴近用户流程：
   - 原文
   - 剧本 Agent
   - 剧本
   - 资产中心
   - 角景音频绑定
   - 生产工作台
   - 导出
8. 当前项目存在阻断问题时，页面要直接告诉用户：
   - 阻断原因是什么。
   - 影响哪个步骤。
   - 去哪里修。
   - 修完后怎么继续。
9. 所有状态文案必须走 i18n，不能写死中文。
10. UI task 必须按 `ui-ux-pro-max` 检查导航清晰度、点击反馈、空状态、错误恢复、颜色对比和滚动稳定性。

完成标准：

1. 打开项目后默认看到流程总览，不需要猜菜单。
2. 用户能一眼看出整条链路：从基础配置到剪映草稿导出。
3. 用户能看出当前做到哪一步、下一步该点什么。
4. 每一步都有明确状态、关键数量、阻断原因和跳转入口。
5. 业务页面顶部有轻量下一步提示，不写成长篇教程。
6. 菜单、流程总览、任务中心、生产画布、导出页职责不混乱。
7. 资产提取不塞进视频工作台，仍从剧本页发起，资产中心统一管理。
8. 图片不满意、视频失败、导出缺素材时，用户知道回哪一步修。
9. 中英文切换后，流程步骤、状态、按钮、提示都能切换。
10. 小窗口下流程总览不横向溢出，不遮挡主操作。

验证方式：

1. 新建或打开一个项目，确认默认进入流程总览。
2. 不看文档，只看页面，能说出下一步该做什么。
3. 分别制造这些状态并检查提示：
   - 没有模型配置。
   - 没有原文。
   - 有剧本但未提取资产。
   - 有资产但缺图片。
   - 有分镜但视频未生成。
   - 有视频但导出素材缺失。
4. 从流程总览跳转到每个页面，再从页面返回流程总览，状态能同步。
5. 打开任务中心，能看到流程中产生的长任务和失败原因。
6. 切换中文/英文，检查流程步骤、状态、按钮、toast、dialog。
7. 缩小窗口，确认流程总览能正常滚动和点击。
8. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。

完成记录：

- 完成时间：2026-07-04
- 涉及文件：`src/shared/types/project.ts`、`src/main/services/project.ts`、`src/renderer/src/features/project-overview/ProjectOverviewHome.vue`、`src/renderer/src/features/task-center/TaskCenter.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-051-task-failure-link.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-051-项目流程总览和流程驱动交互.md`、`docs/04-对齐验收与偏差记录.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-051-task-failure-link.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:docs` 作为本批验证入口；本轮全项目复核补跑 `D:\software\nodejs\pnpm.cmd run verify:all`、`D:\software\nodejs\pnpm.cmd run build` 通过。

第一批记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/project-overview/ProjectOverviewHome.vue`、`src/renderer/src/router/index.ts`、`src/renderer/src/router/menu.ts`、`src/main/services/project.ts`、`src/shared/types/project.ts`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-051-project-flow-overview.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-051-项目流程总览和流程驱动交互.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-051-project-flow-overview.mjs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 当时剩余内容：业务页顶部下一步提示、真实统计接口、任务中心失败原因汇总仍未做。

第二批记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/shared/WorkflowNextStepHint.vue`、`src/renderer/src/features/novel/NovelHome.vue`、`src/renderer/src/features/script-agent/ScriptAgentHome.vue`、`src/renderer/src/features/script/ScriptHome.vue`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/corner-scape/CornerScapeHome.vue`、`src/renderer/src/features/production/ProductionHome.vue`、`src/renderer/src/features/export/ExportHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-051-next-step-hints.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-051-项目流程总览和流程驱动交互.md`
- 验证结果：`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:export`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 当时剩余内容：任务中心失败原因汇总仍未做，不能把 `OPT-051` 整项标为完成。

第三批记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/project.ts`、`src/main/services/project.ts`、`src/main/ipc/project.ts`、`src/shared/contracts/preload.ts`、`src/preload/index.ts`、`src/renderer/src/features/project-overview/ProjectOverviewHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-051-flow-stats.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-051-项目流程总览和流程驱动交互.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-051-flow-stats.mjs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 当时剩余内容：任务中心失败原因汇总仍未做，不能把 `OPT-051` 整项标为完成。

第四批记录：

- 完成时间：2026-07-04
- 涉及文件：`src/shared/types/project.ts`、`src/main/services/project.ts`、`src/renderer/src/features/project-overview/ProjectOverviewHome.vue`、`src/renderer/src/features/task-center/TaskCenter.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-051-task-failure-link.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-051-项目流程总览和流程驱动交互.md`、`docs/04-对齐验收与偏差记录.md`
- 验证结果：新增失败任务摘要、失败任务跳转、任务中心 query 自动筛选和专项 verify；验证命令同完成记录。
- 当前剩余内容：无。流程总览、业务页下一步提示、真实统计和任务中心失败原因联动已闭环。

### 【√】OPT-050 工作台导航和导出体验治理

优先级：P1

处理状态：已完成；第一批“独立导出中心/导出向导”、第二批“生产工作台快捷导出检查”、第三批“普通用户编号显示治理”、第四批“菜单顺序和复制任务 ID”均已完成。

关联任务：前端 UI 布局治理任务、P10 导出增强任务、`docs/features/M-010-导出.md`

问题：

当前底层导出服务方向基本正确：走 main 服务、写受控 `userData/exports`、做素材校验、写任务中心、不伪称已经兼容剪映原生草稿。但从用户视角看，入口和体验还不够专业：

1. `ExportHome.vue` 原来还是占位页，但路由里有 `export`；第一批已改成真实导出中心。
2. 项目菜单里没有导出入口，用户不知道“导出”到底是不是一个正式页面。
3. 生产工作台里已经有导出快捷按钮，独立导出页和工作台导出入口分工不清。
4. 工作台左侧菜单和顶部项目菜单存在职责重复风险。
5. 工作台顶部显示 `M-xxx` 这种开发编号，对普通用户意义不大。
6. 导出按钮原来主要看 `selectedVideoCount`，没有把“所有轨道是否都选了成功视频”提前讲清楚；第二批已补工作台导出检查。
7. 导出失败结果能展示列表，但还缺“去对应轨道、复制路径、复制任务 ID、去任务中心”的恢复动作；第二批已补轨道定位、复制路径和任务中心入口，复制任务 ID 可后续细化。
8. `copyAssets` 对普通用户来说是高级选项，默认开启是对的，但直接暴露容易让用户关掉后出现草稿素材丢失；第二批已补关闭风险提示。

为什么要做：

导出是整条链路最后一步，用户不会关心底层是 P9 还是 P10，只会关心“我现在能不能导、缺什么、导到哪、失败怎么修”。如果导出入口混乱，即使底层服务写得对，用户也会觉得流程不完整。

怎么做：

1. 明确工作台导航分工：
   - 左侧全局菜单只放全局入口：项目、任务中心、设置/诊断。
   - 项目内模块统一放项目顶部导航或项目内二级导航。
   - 不让同一组项目模块同时长期出现在左侧和顶部。
   - `M-xxx` 编号只在开发者模式或诊断视图显示，不作为普通用户主信息。
2. 明确导出页定位：
   - 保留独立导出页。
   - 导出页不是占位页，而是“导出中心/导出向导”。
   - 生产工作台里的导出按钮是快捷入口，适合从当前剧本直接导。
   - 独立导出页负责跨剧本查看、校验、执行、查看导出结果。
3. 独立导出页建议做成向导：
   - 第 1 步：选择项目、剧本/分集。
   - 第 2 步：读取生产工作台视频轨道。
   - 第 3 步：显示导出前检查结果。
   - 第 4 步：选择导出类型。
   - 第 5 步：执行导出。
   - 第 6 步：查看结果、打开目录、去任务中心。
4. 导出前置校验要提前展示：
   - 总轨道数。
   - 已选择视频的轨道数。
   - 未选择视频的轨道。
   - 已选择但视频未成功的轨道。
   - 素材路径为空。
   - 素材文件不存在。
   - 素材格式不支持。
   - 权限不足。
5. 工作台快捷导出按钮优化：
   - 旁边显示 `已选择 X/Y 条轨道`。
   - 只有全部必需轨道满足条件时，主按钮才是“开始导出”。
   - 不满足条件时按钮可以打开“导出检查”，而不是直接失败。
   - 缺失项要能跳到对应轨道。
6. 导出结果弹窗优化：
   - 成功时显示导出路径、clip 数、复制素材数、时长、任务 ID。
   - 提供打开目录、复制路径、查看任务中心。
   - 失败时显示结构化失败列表。
   - 每个失败项显示轨道、来源对象、失败原因、路径。
   - 每个失败项尽量提供“去对应轨道”或“复制路径”。
7. `copyAssets` 处理：
   - 默认开启。
   - 放进高级选项。
   - 关闭时必须提示：关闭后草稿依赖原素材路径，移动/删除素材会导致草稿失效。
8. 导出类型边界：
   - 剧本 zip 属于剧本页，不放进生产导出主流程。
   - 分镜图片 zip 属于快速预览，可以在工作台和导出页都提供。
   - WebAV mp4 是后置增强，没验证依赖前不要假装可用。
   - 剪映草稿第一版只能叫“VT Studio 可验证草稿包”，不能叫“已完整兼容剪映原生草稿”。
9. 所有 UI 改造必须遵守：
   - 使用 `ui-ux-pro-max` 检查导航、布局、点击反馈、错误恢复、表单反馈、颜色对比。
   - 可见文案走 i18n。
   - 新样式优先 Tailwind。
   - renderer 不直接写文件，不直接访问本地路径。

完成标准：

1. 用户能从项目内导航看到导出入口，且知道导出页是正式功能，不是占位。
2. 生产工作台里的导出按钮和独立导出页分工清楚：
   - 工作台：当前剧本快捷导出。
   - 导出页：选择剧本、检查素材、执行导出、查看结果。
3. 工作台不再让同一组项目菜单在左侧和顶部重复造成混乱。
4. 普通用户界面不把 `M-xxx` 当主要信息显示。
5. 导出前能看到 `已选择 X/Y 条轨道` 和缺失项。
6. 未选视频、视频未成功、素材缺失时，不会让用户点完才看到含糊失败。
7. 导出失败列表能定位到轨道、来源对象、路径和失败原因。
8. 导出成功能打开目录、复制路径、查看任务中心记录。
9. `copyAssets` 默认开启，关闭时有明确风险提示。
10. 不改坏 P10 已有底层原则：main 写文件、受控 exports、任务中心记录、素材校验、不伪称剪映原生兼容。

验证方式：

1. 打开项目后检查左侧菜单和项目内导航，不出现同级入口重复。
2. 打开导出页，确认不是 `ModuleScaffold` 占位。
3. 在没有视频轨道时进入导出页，看到清楚空状态和下一步入口。
4. 在有轨道但未选择视频时，导出页和工作台都显示缺失轨道。
5. 在部分轨道选择视频时，显示 `已选择 X/Y`，不能误导为可完整导出。
6. 在素材缺失时，失败项列出轨道、来源、路径、原因。
7. 导出成功后，打开目录、复制路径、任务中心入口可用。
8. 切换中文/英文，导出页、弹窗、失败原因、按钮都跟随切换。
9. 跑 `D:\software\nodejs\pnpm.cmd run typecheck`。
10. 跑 `D:\software\nodejs\node.exe scripts\verify-p10-export.mjs`。
11. 跑 `D:\software\nodejs\node.exe scripts\verify-opt-050-export-center.mjs`。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/router/menu.ts`、`src/renderer/src/features/export/ExportHome.vue`、`src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue`、`src/renderer/src/features/production/components/ProductionFlowNode.vue`、`src/renderer/src/features/shared/ModuleScaffold.vue`、`src/renderer/src/features/settings/SettingsHome.vue`、`src/renderer/src/layouts/WorkbenchLayout.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-050-export-center.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-050-工作台导航和导出体验治理.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-050-export-center.mjs`、`D:\software\nodejs\pnpm.cmd run verify:export`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
- 第一批完成时间：2026-07-03
- 第二批完成时间：2026-07-03
- 第三批完成时间：2026-07-03
- 第四批完成时间：2026-07-03
- 当前剩余内容：无。导出历史和可复现记录不并入本项，按 `OPT-056` 单独处理。

### 【√】OPT-052 自定义 adapter 安全边界

优先级：P0

处理状态：已完成；runner 安全底座、可选 allowlist、日志脱敏截断、轮询上限、adapter 诊断信息已落地。

关联任务：补充 `CORE-007-模型适配层.md`、`F-002-003-模型供应商配置.md`、`F-002-017-模型与连接配置重构.md`

问题：

自定义 adapter 会在主进程执行脚本，还能通过 `fetch`、`axios` 访问网络。它是为了兼容参考项目的动态供应商能力，但也是整个模型层风险最高的入口。

现在已经禁止页面直接执行 adapter，这是对的；但还需要继续明确：adapter 能访问哪些网络、最多跑多久、日志能输出什么、失败怎么截断、普通用户能不能随手导入未知代码。

为什么要做：

模型 adapter 不是普通配置，它接近“可执行插件”。如果边界不清，后面会出现三类问题：

1. 供应商脚本卡死或无限轮询，任务无法结束。
2. adapter 日志或错误里泄露 API Key、本地路径、请求体。
3. 用户粘贴未知来源代码后，代码访问非预期地址或上传不该上传的数据。

怎么做：

1. 普通模型服务页面不暴露 adapter 代码编辑，只提供 API Key、Base URL、模型列表。
2. 自定义 adapter 放到高级/开发者入口，并显示明确风险提示。
3. adapter 运行环境必须有非 0 超时：
   - 脚本初始化超时。
   - 单次请求超时。
   - 轮询总超时。
4. `pollTask` 必须有最大轮询次数和最大总耗时，不能无限等待。
5. 包装 `fetch` 和 `axios`：
   - 默认只允许 http/https。
   - `file://`、`data:` 网络访问禁止。
   - localhost/内网地址只在本地工作流类服务里允许，例如 ComfyUI。
   - 可根据连接的 Base URL 自动生成允许访问的域名。
   - 高级用户如需额外域名，必须显式配置 allowlist。
6. 包装下载结果：
   - 检查 content-type。
   - 检查 content-length。
   - 超过模型媒体预算直接失败。
7. adapter 日志必须统一走 logger：
   - 自动脱敏 key/token/authorization/password/secret。
   - 限制单条日志长度。
   - 不默认输出完整响应 body。
8. adapter 不暴露 `fs`、`process`、`require`、`child_process`、`eval`、`wasm`。
9. adapter 保存前必须校验导出结构：
   - `vendor`
   - `textRequest`
   - `imageRequest`
   - `videoRequest`
   - `ttsRequest`
10. 未实现能力必须显式 `throw`，不能空字符串、空函数、假成功。
11. 每个 adapter 记录版本、md5、更新时间，诊断页能看到当前运行的是哪个版本。
12. 内置 adapter 和用户自定义 adapter 分开标识，避免用户误删内置运行底座。

完成标准：

1. 自定义 adapter 初始化不会无限跑。
2. adapter 请求不能访问未允许的协议或域名。
3. adapter 返回超大媒体不会写入正式素材。
4. adapter 错误和日志不泄露密钥、本地用户目录、完整请求头。
5. 普通模型配置页不需要理解 adapter 代码。
6. 高级 adapter 保存失败不会覆盖旧的可用 adapter。
7. 诊断页能看到 adapter 版本、状态、最后错误。

验证方式：

1. 导入一个无限循环 adapter，确认初始化超时失败。
2. 导入一个访问 `file://` 的 adapter，确认被拦截。
3. 导入一个访问非 allowlist 域名的 adapter，确认失败并提示域名不允许。
4. 模拟返回超大视频 URL，确认下载中断、任务失败、无正式文件。
5. 触发带 API Key 的错误，检查日志、任务失败原因、页面提示都已脱敏。
6. 保存错误 adapter 后，再测试旧 adapter 仍可用。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/model/vendor-runner.ts`、`src/main/services/model/vendor-service.ts`、`src/main/services/model/media.ts`、`src/shared/types/vendor.ts`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`scripts/verify-opt-052-adapter-security.mjs`、`scripts/verify-opt-006-model-gateway.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-052-自定义adapter安全边界.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-052-adapter-security.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:production` 通过。

### 【√】OPT-053 模型连接和 vendor 双写一致性

优先级：P0

处理状态：已完成；普通模型连接以 `modelConnections.v1` 为主数据，`model_vendors` 的 `conn_*` 为运行投影。

关联任务：补充 `F-002-017-模型与连接配置重构.md`、`CORE-007-模型适配层.md`、默认资源诊断任务

问题：

现在项目同时有两层模型数据：

1. 普通用户看到的模型连接：`modelConnections.v1`、`modelCapabilityBindings.v1`。
2. 底层实际调用用的 vendor：`model_vendors`、adapter 文件、内置 vendor runtime。

这套设计可以保留，但必须明确谁是主数据、谁是运行投影、什么时候同步、怎么诊断。否则会出现“设置页有连接但实际调用找不到 vendor”“删除连接后底层 vendor 还在”“默认模型绑定指向已失效连接”等问题。

为什么要做：

模型连接是后面文本、图片、视频、TTS、ComfyUI 的基础。如果连接层和 vendor 层不一致，所有生成链路都会表现成偶发失败，最难排查。

怎么做：

1. 定主数据规则：
   - 普通模型服务以 `modelConnections.v1` 为主数据。
   - `conn_*` 形式的 `model_vendors` 是运行投影，不允许在高级 vendor 页随意改。
   - 内置 adapter、自定义高级 adapter 仍以 `model_vendors` 和 adapter 文件为主。
2. 保存普通模型连接时，同步写入对应 `model_vendors`。
3. 编辑普通模型连接时，同步更新：
   - input values
   - models
   - enabled
   - adapterVendorId
4. 删除普通模型连接前检查引用：
   - 默认能力绑定。
   - Agent 模型配置。
   - 项目 image/video 模型。
   - 正在运行的任务。
5. 删除普通模型连接后，同步删除或禁用对应 `conn_*` vendor 投影。
6. 启动诊断时检查：
   - 每个普通连接都有 `model_vendors` 投影。
   - 每个 `conn_*` vendor 都能在普通连接中找到来源。
   - 默认能力绑定是否还有效。
   - 项目模型是否还有效。
7. 诊断支持自动修复：
   - 缺投影：从连接补写 vendor。
   - 孤儿 `conn_*`：提示删除或禁用。
   - 失效绑定：清空并提示用户重新选择。
8. 旧 vendor 迁移到普通连接时必须幂等，不能每次启动都生成重复连接。
9. 高级 vendor 页显示 `conn_*` 投影时必须标记“由模型服务生成”，不作为普通编辑入口。
10. 模型测试、项目模型选择、Agent 解析统一走同一套模型 ID：`connectionId:modelName`。

完成标准：

1. 普通模型连接保存后，底层模型调用能立即找到对应 vendor。
2. 删除连接不会留下仍被默认模型或项目引用的坏数据。
3. 诊断能发现连接有但 vendor 缺、vendor 有但连接缺、绑定失效三类问题。
4. 旧 vendor 迁移不会重复创建连接。
5. 高级 vendor 页不会误导用户直接编辑普通连接投影。

验证方式：

1. 新增一个模型服务，查询 `modelConnections.v1` 和 `model_vendors` 都存在。
2. 修改模型列表，确认项目模型选择和实际调用同步变化。
3. 删除正在被项目引用的连接，必须被阻止并提示引用位置。
4. 手动删除一个 `conn_*` vendor，运行诊断后能补回。
5. 手动制造孤儿 `conn_*` vendor，运行诊断后能提示清理。
6. 重启应用，旧 vendor 不重复迁移。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/model/connection-projection.ts`、`src/main/services/settings/model-config.ts`、`src/main/services/model/vendor-service.ts`、`src/main/services/settings/vendor.ts`、`src/shared/types/vendor.ts`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`src/main/services/model/text.ts`、`src/main/services/agent/script-runner.ts`、`src/main/services/socket/agent-handler.ts`、`scripts/verify-opt-053-model-connection-projection.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-053-model-connection-projection.mjs`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-054 上游变更与下游失效规则

优先级：P0

处理状态：已完成；这是文字到视频主链路的状态规则，不能分散在各页面里临时判断。

关联任务：`docs/tasks/OPT-054-上游变更与下游失效规则.md`

问题：

现在原文、事件、剧本、资产、分镜、图片、视频、导出已经串起来了，但还缺一套全局规则说明：上游内容改了以后，下游哪些结果还可信，哪些必须标记过期，哪些要提示用户重新生成。

典型例子：

1. 原文章节改了，旧事件和旧剧本是否还能用。
2. 剧本改了，旧资产提取结果和生产工作台是否还能用。
3. 角色图换了，已生成分镜图和视频是否需要标记需复查。
4. 分镜图换了，视频候选和导出是否还能直接用。
5. 删除资产后，引用它的分镜、视频和导出校验怎么提示。

为什么要做：

视频生产链路不是一次性到底，用户一定会中途改文字、换图、删素材、重跑视频。如果没有失效规则，页面会静默混用旧结果，最后导出的视频看起来完整，但内容已经和当前项目不一致。

怎么做：

1. 定义依赖链路：
   - `source_chapters`
   - source events
   - `agent_work_data`
   - `scripts`
   - `assets` / `script_asset_links`
   - `production_storyboards`
   - `production_image_flows`
   - `production_video_tracks`
   - `production_videos`
   - export timeline / export history
2. 定义业务状态，不和任务状态混用：
   - `valid`
   - `stale`
   - `needs_review`
   - `missing_dependency`
   - `blocked`
3. 原文章节正文变更：
   - 当前章节事件标记 stale。
   - 剧本 Agent 页面提示原文事件未就绪。
   - 不直接删除旧剧本，但标记来源可能过期。
4. 剧本正文变更：
   - 资产提取状态标记 stale 或 needs_review。
   - 已存在生产工作区标记 needs_review。
   - 不静默删除资产、分镜、视频。
5. 重新提取资产：
   - 新资产新增。
   - 已不存在的资产不直接删，标记可能未引用。
   - 引用关系变化要提示。
6. 修改资产提示词或选择资产图片：
   - 引用该资产的分镜图标记 needs_review。
   - 已生成视频标记 needs_review。
   - 导出前校验提示素材有更新，建议重新生成或确认继续。
7. 修改分镜文案、分镜图、视频提示词：
   - 对应视频候选标记 stale 或 needs_review。
   - 已选视频保留，但导出前提示需要确认。
8. 删除资产、分镜、视频候选：
   - 先做影响预览。
   - 删除后引用方显示 missing_dependency。
   - 导出校验必须阻止缺素材导出。
9. 用户可以手动确认“继续使用旧结果”，但必须记录确认时间和确认对象。
10. 流程总览读取这些状态，告诉用户当前卡在哪一步、下一步该修哪里。

完成标准：

1. 上游内容变更后，下游不会静默保持“成功”。
2. 页面能显示“需复查/已过期/缺依赖”，而不是只显示成功失败。
3. 删除或替换素材前能看到影响范围。
4. 导出前能拦住缺素材、过期未确认的结果。
5. 用户确认继续使用旧结果时，有记录可追踪。
6. 流程总览能汇总这些阻断状态。

验证方式：

1. 改原文章节正文，确认事件状态 stale，剧本 Agent 提示原文事件未就绪。
2. 改剧本正文，确认资产提取和生产工作区提示需复查。
3. 换角色图，确认引用该角色的分镜/视频出现需复查提示。
4. 删除一个被分镜引用的资产，确认分镜显示缺依赖，导出校验失败。
5. 手动确认继续使用旧视频，确认导出历史记录了确认信息。
6. 流程总览能显示对应阻断步骤和跳转入口。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/constants/dictionaries.ts`、`src/shared/constants/status-layers.ts`、`src/shared/types/script.ts`、`src/shared/types/assets.ts`、`src/shared/types/production.ts`、`src/shared/types/export.ts`、`src/main/services/dependency-state.ts`、`src/main/services/production/migrations.ts`、`src/main/services/source/service.ts`、`src/main/services/script/service.ts`、`src/main/services/agent/script-workspace.ts`、`src/main/services/assets/service.ts`、`src/main/services/production/service.ts`、`src/main/services/export/index.ts`、`src/renderer/src/features/assets/AssetsHome.vue`、`src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue`、`src/renderer/src/features/export/ExportHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-054-upstream-invalidations.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-054-upstream-invalidations.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:export`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-055 最近打开项目和项目上下文恢复

优先级：P1

处理状态：已完成；桌面程序刷新/重启后的项目上下文恢复已落地。

关联任务：`docs/tasks/OPT-055-最近打开项目和项目上下文恢复.md`

问题：

当前项目上下文主要存在 renderer 的 Pinia 内存里。用户打开项目后，如果刷新窗口、热更新、重载页面或应用重启，项目内页面可能因为 `currentProject` 丢失而被路由守卫打回项目页。

这在开发阶段能接受，但桌面软件里不专业。用户会觉得“我明明打开过项目，为什么又没了”。

为什么要做：

项目是 VT Studio 的核心上下文。原文、剧本、资产、生产、导出都依赖当前项目。上下文不能只靠前端内存维持。

怎么做：

1. 打开项目成功后，在 main/app_settings 中保存最近打开项目：
   - projectId
   - projectName
   - sourceType
   - lastRoute
   - openedAt
2. app 启动或刷新时，renderer 先请求 main 恢复最近项目。
3. 路由守卫遇到 `requiresProject` 且前端没有 currentProject 时，不直接打回项目页，先尝试恢复最近项目。
4. 恢复前必须校验：
   - 项目还存在。
   - 项目模型还有效。
   - 手册还有效。
   - 项目目录还存在或可重建。
5. 恢复失败时：
   - 清空最近项目记录。
   - 回到项目页。
   - 给出可理解提示。
6. 用户主动回到项目管理页不等于清空最近项目；只有删除项目、退出项目、打开另一个项目时才更新。
7. 删除当前项目时同步清空最近项目。
8. 流程总览落地后，打开项目默认进入流程总览；没有流程总览前按项目类型进入原文或剧本。
9. 如果用户上次停留在项目内某个页面，可恢复到 lastRoute，但必须保证该 route 仍有效。

完成标准：

1. 打开项目后刷新窗口，仍能留在项目内。
2. 重启应用后能恢复最近项目，或给出项目失效提示。
3. 删除当前项目后不会恢复到已删除项目。
4. 项目模型失效时，不进入坏页面，而是提示去编辑项目。
5. 最近项目不依赖 localStorage 作为唯一来源。

验证方式：

1. 打开一个项目，刷新窗口，确认当前项目仍存在。
2. 重启应用，确认最近项目恢复。
3. 删除最近项目，重启后确认回到项目页并提示。
4. 禁用项目使用的模型，再恢复项目，确认提示模型失效。
5. 打开项目内生产页，刷新后确认能恢复项目上下文。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/project.ts`、`src/main/services/project.ts`、`src/main/ipc/project.ts`、`src/shared/contracts/preload.ts`、`src/preload/index.ts`、`src/renderer/src/router/index.ts`、`src/renderer/src/features/project/ProjectHome.vue`、`scripts/verify-opt-055-recent-project.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-055-最近打开项目和项目上下文恢复.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-055-recent-project.mjs`、`D:\software\nodejs\pnpm.cmd run verify:project`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

### 【√】OPT-056 导出历史和可复现记录

优先级：P1

处理状态：已完成；不替代任务中心，导出历史记录“这次导出了什么”。

关联任务：`docs/tasks/OPT-056-导出历史和可复现记录.md`、P10 导出、`F-010-006-Windows剪映专业版草稿导出.md`、`OPT-050` 工作台导航和导出体验治理

问题：

当前导出会写任务中心，也会在导出目录里写 summary 文件。但项目内还缺一个用户可查看的导出历史。

任务中心记录的是“有个导出任务成功/失败”。导出历史应该记录的是“这次导出用了哪个剧本、哪些轨道、哪些视频候选、哪些素材、导出到哪里、当时是否有失效确认”。

为什么要做：

视频项目经常会反复导出多个版本。没有导出历史，用户无法回答这些问题：

1. 上一次导出的是哪个剧本版本。
2. 用的是哪几个视频候选。
3. 素材有没有复制进草稿目录。
4. 导出失败时到底缺哪个文件。
5. 后面换图重导时，新旧导出有什么区别。

怎么做：

1. 新增 `export_history` 或等价存储，不和 `tasks` 混在一起。
2. 每次导出开始时创建历史记录：
   - projectId
   - scriptId
   - exportType
   - draftName
   - taskId
   - status
   - createdAt
3. 导出成功后写入：
   - outputPath
   - relativePath
   - clipCount
   - copiedAssetCount
   - durationMs
   - appVersion
   - schemaVersion
4. 写入可复现快照：
   - timeline snapshot
   - selected video ids
   - track ids
   - storyboard ids
   - media relativePath
   - media size/md5/mime
   - project video ratio
   - copyAssets 配置
   - 是否有用户确认继续使用旧结果
5. 导出失败也要写历史：
   - failures
   - fail reason
   - validation result
   - 失败阶段
6. 导出页提供历史列表：
   - 按项目/剧本筛选。
   - 查看详情。
   - 打开目录。
   - 复制路径。
   - 查看任务中心。
   - 重新导出同一配置。
7. 项目删除时处理导出历史：
   - 默认随项目数据库记录删除。
   - 导出文件是否删除按用户选择。
8. 项目整体迁移包后续要能选择是否包含导出历史和导出文件。

完成标准：

1. 每次导出都有历史记录，不只在任务中心出现。
2. 导出历史能看到使用的剧本、轨道、视频、素材和输出目录。
3. 导出失败也能看到结构化失败原因。
4. 打开目录、复制路径、跳任务中心可用。
5. 同一项目多次导出能区分版本。
6. 历史记录不泄露 API Key。

验证方式：

1. 成功导出一次，确认历史里能看到时间线、素材、输出目录。
2. 制造素材缺失后导出，确认历史记录失败原因。
3. 同一剧本导出两次，确认历史能区分两条记录。
4. 点击打开目录、复制路径、查看任务中心。
5. 删除项目时确认历史记录按项目删除策略处理。
6. 搜索导出历史 JSON，确认没有密钥。

完成记录：

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/database/migrations.ts`、`src/shared/types/export.ts`、`src/main/services/export/index.ts`、`src/main/ipc/export.ts`、`src/shared/contracts/preload.ts`、`src/preload/index.ts`、`src/renderer/src/features/export/ExportHome.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-056-export-history.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-056-导出历史和可复现记录.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-056-export-history.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:export`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

## 4. 新增 TODO 模板

后续新增项必须按这个格式写：

```md
### 【 】OPT-xxx 标题

优先级：P0/P1/P2

处理状态：独立处理/并入/覆盖/已完成/持续规则/暂不做

关联任务：

问题：

为什么要做：

怎么做：

完成标准：

验证方式：

完成记录：

- 完成时间：
- 涉及文件：
- 验证结果：
```
