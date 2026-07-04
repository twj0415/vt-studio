# P6 剧本 Agent 批

状态：阶段 1、阶段 2、阶段 3、阶段 4 已完成  
覆盖范围：F-011-001 到 F-011-014  
对应功能文档：`docs/features/M-011-剧本Agent.md`

## 1. 合并结论

P6 不再按 14 个单 task 分开实现。

原因：

```txt
1. 剧本 Agent 的对话、记忆、工作区、XML 写入、工具和子 Agent 调度共享同一条 Agent 主链路。
2. 如果拆成小 task，会反复修改 socket、memory、planData、scripts、preload、页面和样式。
3. 参考源码存在 schema 冲突、重连引用错误、scriptItem 按 name 覆盖、强制生成蒙层无动作等风险，必须一次收口。
4. Agent 产物必须有真实数据落点，不能只做聊天 UI 或右侧临时状态。
```

## 2. 本批次一次完成什么

```txt
1. 替换 ScriptAgentHome.vue 占位页，做左侧 Agent 对话和右侧工作区。
2. 读取、展示和清理剧本 Agent 记忆，隔离 key 固定为 projectId:scriptAgent。
3. 接入现有 Socket.IO Agent 事件流，支持连接、重连、发送、停止、思考等级。
4. 检查 source_chapters 事件状态，发现 stale/running/failed 时给出风险提示和去原文页入口。
5. 新增 agent_work_data 表，保存故事骨架、改编策略和工作区元数据。
6. 新增 scripts 表，作为剧本卡片和后续 P7 剧本管理的真实数据来源。
7. 读取、编辑故事骨架和改编策略。
8. 查看、编辑、删除剧本卡片，剧本卡片以 scripts 表为准。
9. 解析 Agent 输出的 storySkeleton、adaptationStrategy、scriptItem XML，并写入真实工作区和 scripts 表。
10. 给 Agent 工具提供原文、事件摘要、工作区和已有剧本读取能力。
11. 接入剧本 Agent 决策层、故事骨架、改编策略、剧本生成和监督层子 Agent 的最小闭环。
12. Agent 长生成写入任务中心，记录开始、完成、失败、停止。
```

## 3. 明确不做

```txt
1. 不做 P7 的完整剧本结果页、搜索、批量新增、zip 导出和资产提取。
2. 不做资产中心、角色/场景/道具提取落库。
3. 不做生产工作台 flowData、分镜、图片、视频生成。
4. 不做聊天附件上传。
5. 不启用参考项目里被注释的章节事件独立 tab。
6. 不在 renderer 读取 skill 文件、SQLite、文件系统或模型 SDK。
7. 不把非法 XML、半截 XML 或空内容写入业务表。
```

## 4. 关键取舍

### 4.1 planData 统一为 scripts 数组

参考源码里 `planData.script` 一处像 string，一处像数组，`setPlanData` schema 也没有完整声明 script。VT Studio 不照搬这个冲突。

P6 统一为：

```txt
storySkeleton: string
adaptationStrategy: string
scripts: ScriptItem[]
```

剧本事实以 `scripts` 表为准，`agent_work_data.data` 只保存故事骨架、改编策略和必要工作区元数据。

### 4.2 scriptItem 不按 name 覆盖

参考项目按 `scriptItem name` 匹配已有剧本，同名会误覆盖。VT Studio 规则：

```txt
1. XML 带 id 时按 id 更新。
2. XML 带 episodeKey 时按 projectId + episodeKey 更新。
3. 都没有时服务端生成新的 episodeKey 并新增剧本。
4. name 只用于展示，不作为唯一键。
```

### 4.3 原文事件未完成只提示风险

P5 的原文事件状态是：

```txt
stale
running
succeeded
failed
```

P6 进入页面时读取 `source_chapters`，只要存在 stale/running/failed，就提示“原文事件未完全就绪”。用户可以继续聊天，也可以跳去原文页处理。不要照搬“强制生成”蒙层，因为参考源码按钮只是关闭蒙层，没有真正生成事件。

### 4.4 Agent 生成进入任务中心

Toonflow 没有把剧本 Agent 对话写任务中心。VT Studio 已有任务中心，Agent 长生成必须可观测：

```txt
category: 剧本 Agent
related_objects: { projectId, messageId, action }
status: running/succeeded/failed/cancelled
```

这是功能增强，完成 P6 时写入 `docs/04-对齐验收与偏差记录.md`。

### 4.5 XML 只作为结构化写入协议

XML 标签不展示在普通聊天正文里。合法标签完成后才写业务数据：

```txt
<storySkeleton>...</storySkeleton>
<adaptationStrategy>...</adaptationStrategy>
<scriptItem id="..." episodeKey="..." name="...">...</scriptItem>
```

非法 XML、空 name、空 content、标签未闭合、字段冲突都只提示错误，不写 `agent_work_data` 或 `scripts`。

### 4.6 子 Agent 放 main 服务层

决策层、执行层、监督层和工具调用都放 main 服务层。renderer 只负责：

```txt
1. 连接 socket
2. 展示消息
3. 展示工作区
4. 发起编辑/删除/清理记忆等 IPC
```

## 5. 当前代码复核结论

```txt
已有：
  1. CORE-008 Socket.IO 底座，已有 scriptAgent namespace。
  2. shared socket 事件类型，已有 message/update/content 事件。
  3. renderer useAgentSocket，已有连接、重连、发送、停止、思考配置。
  4. CORE-011 memory service，已有 projectId:scriptAgent 隔离规则。
  5. P5 source_chapters，已有章节正文、事件摘要、事件状态、失败原因。
  6. 任务中心 service，业务服务可以写任务记录。
  7. 默认数据已有 scriptAgent 及其子 Agent 模型 key。
  8. skill_list 已有 script_agent_decision/script_agent_execution/script_agent_supervision 元数据。

缺少：
  1. XML 解析和写入 service。
  2. Agent 工具读取上下文 service。
  3. 决策层和子 Agent 调度 service。
  4. Agent 长生成任务中心闭环。
```

## 6. 数据表边界

### 6.1 agent_work_data

```txt
用途：
  保存当前项目的剧本 Agent 工作区基础数据。

字段：
  id INTEGER PRIMARY KEY AUTOINCREMENT
  project_id INTEGER NOT NULL
  key TEXT NOT NULL
  data TEXT NOT NULL
  created_at INTEGER NOT NULL
  updated_at INTEGER NOT NULL

约束：
  UNIQUE(project_id, key)

key：
  scriptAgent

data：
  {
    "storySkeleton": "",
    "adaptationStrategy": ""
  }
```

### 6.2 scripts

```txt
用途：
  保存剧本 Agent 生成或用户手动编辑的分集剧本。

字段：
  id INTEGER PRIMARY KEY AUTOINCREMENT
  project_id INTEGER NOT NULL
  episode_key TEXT NOT NULL
  name TEXT NOT NULL
  content TEXT NOT NULL
  extract_status TEXT NOT NULL DEFAULT 'idle'
  error_reason TEXT NULL
  created_at INTEGER NOT NULL
  updated_at INTEGER NOT NULL

约束：
  UNIQUE(project_id, episode_key)

说明：
  P6 只使用新增、查看、编辑、删除的基础能力。
  P7 再扩展完整剧本管理、搜索、导出和资产提取。
```

## 7. 执行阶段

### 阶段 1：会话、记忆和事件检查

覆盖：

```txt
F-011-001 剧本 Agent 对话入口
F-011-002 读取历史记忆
F-011-003 清理 Agent 记忆
F-011-004 思考等级配置
F-011-005 原文事件完成检查
```

要做：

```txt
1. shared types 补 script agent 记忆、事件检查和页面状态 DTO。
2. main agent IPC 增加 getMemoryHistory、clearMemory、checkSourceEvents。
3. ScriptAgentHome 左侧对话区接 useAgentSocket。
4. 展示连接状态、错误、欢迎消息、历史消息、思考等级和清理记忆操作。
5. 页面离开时 disconnect，避免残留监听。
```

验收：

```txt
1. 没有项目时不连接 socket。
2. novel 项目能连接 scriptAgent namespace。
3. 能发送、停止、重连。
4. 能读取历史记忆。
5. 清理 message/summary/all 需要确认。
6. source_chapters 存在未就绪事件时能提示。
```

### 阶段 2：工作区底座和剧本卡片

覆盖：

```txt
F-011-006 获取计划数据
F-011-007 编辑故事骨架
F-011-008 编辑改编策略
F-011-009 查看剧本卡片
F-011-010 编辑剧本卡片
F-011-011 删除剧本卡片
```

要做：

```txt
1. 新增 agent_work_data 和 scripts 迁移。
2. 新增 shared script-agent DTO。
3. 新增 main/services/agent/script-workspace service。
4. 新增 getWorkspace、updateWorkspaceField、upsertScript、deleteScript。
5. preload 暴露 window.vtStudio.agent.script.*。
6. 右侧工作区展示故事骨架、改编策略、剧本卡片。
7. 支持编辑故事骨架、编辑改编策略、编辑剧本、删除剧本。
```

验收：

```txt
1. 首次打开自动创建空工作区。
2. storySkeleton/adaptationStrategy 能保存和刷新。
3. scripts 是数组。
4. 同名剧本不会互相覆盖。
5. 删除剧本只删 scripts，不碰原文。
6. 页面不直接访问 SQLite。
```

### 阶段 3：XML 写入和工具读取上下文

覆盖：

```txt
F-011-012 Agent XML 写入工作区
F-011-013 Agent 工具读取上下文
```

要做：

```txt
1. 新增 XML 解析器，支持 storySkeleton/adaptationStrategy/scriptItem。
2. XML complete 后通过 service 事务写入工作区和 scripts。
3. 非法 XML 不写业务表。
4. 工具读取 source_chapters 的章节名、正文、事件摘要和失败原因。
5. 工具读取当前工作区和已有 scripts。
6. 长章节读取支持范围或截断，避免一次塞爆上下文。
```

验收：

```txt
1. 合法 storySkeleton XML 能写入骨架。
2. 合法 adaptationStrategy XML 能写入策略。
3. 合法 scriptItem XML 能新增或更新剧本。
4. XML 不出现在普通聊天正文。
5. 非法 XML 有错误提示且不落库。
6. 工具只能读取当前项目数据。
```

### 阶段 4：子 Agent 调度闭环

覆盖：

```txt
F-011-014 子 Agent 调度
```

要做：

```txt
1. 在 main 服务层实现剧本 Agent 决策层。
2. 接入故事骨架、改编策略、剧本生成、监督层子 Agent。
3. 子 Agent 使用对应模型 key。
4. 子 Agent 可调用上下文工具。
5. 输出流继续通过现有 socket message/content 事件发给 renderer。
6. Agent 长生成写任务中心。
7. stop 能中断当前 AbortController 并把任务标记 cancelled。
```

验收：

```txt
1. 决策层能调用工具或子 Agent。
2. 子 Agent 输出能流式显示。
3. 子 Agent XML 能写入工作区。
4. 模型错误能进入消息错误和任务失败原因。
5. 停止生成能终止模型流和任务状态。
6. 不把密钥、token、完整用户目录写入任务失败原因。
```

## 8. 实现文件预期

```txt
新增：
  src/shared/types/script-agent.ts
  src/main/services/agent/script-workspace.ts
  src/main/services/agent/script-tools.ts
  src/main/services/agent/script-xml.ts
  src/main/services/agent/script-runner.ts
  src/main/services/agent/migrations.ts
  scripts/verify-p6-script-agent.mjs

修改：
  src/main/services/database/migrations.ts
  src/main/ipc/agent.ts
  src/preload/index.ts
  src/shared/contracts/preload.ts
  src/main/services/socket/agent-handler.ts
  src/renderer/src/features/script-agent/ScriptAgentHome.vue
  src/renderer/src/composables/useAgentSocket.ts
  src/renderer/src/i18n/messages.ts
  src/renderer/src/styles/index.scss
  docs/03-执行进度.md
  docs/04-对齐验收与偏差记录.md
```

是否需要新建 `src/main/services/agent/` 可在实现时按现有目录微调，但业务边界不变：Agent 编排不能写在 Vue 页面里。

## 9. P6 集中确认点

| 编号 | 确认点 | 专业建议 |
|---|---|---|
| C-P6-001 | Agent 生成是否进入任务中心 | 进入；剧本 Agent 是长任务，必须可观测 |
| C-P6-002 | 首次打开是否自动创建工作区 | 自动创建；避免页面大量空判断 |
| C-P6-003 | scriptItem 无 id/episodeKey 时怎么办 | 服务端生成 episodeKey 并新增 |
| C-P6-004 | 原文事件未就绪是否允许继续 | 允许继续，但必须提示风险和去原文页入口 |
| C-P6-005 | P6 是否提前建 scripts 表 | 必须建；否则 Agent 产物没有真实落点 |
| C-P6-006 | 非法 XML 怎么处理 | 不落库，只显示格式错误和失败原因 |

默认按专业建议执行。后续实现过程中如果出现新的高风险决策，再停下来确认。

## 10. 验收总表

```txt
1. 剧本 Agent 页面不再是占位 scaffold。
2. 左侧能连接、发送、停止、重连和显示流式消息。
3. 页面离开会断开 socket。
4. 能读取历史记忆，能清理 message/summary/all。
5. 思考等级能按模型能力展示和发送配置。
6. 原文事件未就绪有明确提示。
7. 右侧有故事骨架、改编策略、剧本三个工作区。
8. 工作区首次能自动创建。
9. 故事骨架和改编策略能编辑保存。
10. 剧本卡片能查看、折叠、编辑、删除。
11. scripts 表是剧本真实来源。
12. Agent XML 能写入工作区和 scripts 表。
13. 非法 XML 不写业务表。
14. Agent 工具能读取当前项目原文、事件、工作区和剧本。
15. 决策层和子 Agent 调度有最小闭环。
16. Agent 长生成写任务中心。
17. verify-p6-script-agent、typecheck、build 通过。
```

## 11. 执行后记录

```txt
阶段 1 改了哪些文件：
  新增 shared script-agent 类型、main/services/agent/script-phase1、agent IPC、preload agent.script API、P6 阶段 1 验证脚本；
  替换 ScriptAgentHome.vue 占位页为真实会话页面；
  接入 useAgentSocket、历史记忆读取、清理记忆、原文事件检查、模型思考能力检查；
  通用 Agent socket 在生成完成时写入记忆，写入失败只记录日志不影响聊天；
  补充 scriptAgent i18n 文案和 SCSS。
阶段 1 验证结果：
  verify-p6-script-agent-phase1 通过；
  typecheck 通过；
  build 通过。
阶段 1 未完成事项：
  工作区持久化、scripts 表、剧本卡片 CRUD、XML 写入、工具读取上下文和子 Agent 调度继续归阶段 2 到阶段 4。
阶段 1 结论：
  P6 阶段 1 已完成；下一步做阶段 2 工作区底座和剧本卡片。

阶段 2 改了哪些文件：
  新增 agent_work_data/scripts 迁移、script-common、script-workspace、P6 阶段 2验证脚本；
  扩展 shared script-agent DTO、agent IPC、preload 契约和 project 删除清理；
  ScriptAgentHome.vue 右侧工作区接入 getWorkspace/updateWorkspaceField/upsertScript/deleteScript；
  补充 storySkeleton/adaptationStrategy 内联编辑、scripts 卡片查看/折叠/编辑/删除、i18n 和 SCSS。
阶段 2 验证结果：
  verify-p6-script-agent-phase2 通过；
  typecheck 通过；
  build 通过。
阶段 2 边界：
  只删除 scripts 表，不做 P7/P9 资产、分镜、视频级联；
  工作区 data 只保存 storySkeleton/adaptationStrategy，不保存 scripts 快照；
  编辑采用右侧内联表单，不照搬参考项目大弹窗。
阶段 2 结论：
  P6 阶段 2 已完成；下一步做阶段 3 XML 写入和工具读取上下文。

阶段 3 改了哪些文件：
  新增 script-xml、script-tools、P6 阶段 3 验证脚本；
  扩展 shared script-agent XML/工具 DTO 和 socket workspace:update 事件；
  agent-handler 接入 XML 清洗、完成后事务写入、workspace:update 推送和剧本 Agent 只读工具；
  useAgentSocket 和 ScriptAgentHome.vue 接收工作区更新并刷新右侧数据；
  补充 XML 写入成功 i18n 文案。
阶段 3 验证结果：
  verify-p6-script-agent-phase1 通过；
  verify-p6-script-agent-phase2 通过；
  typecheck 通过；
  build 通过。
阶段 3 边界：
  XML 采用生成完成后事务写入和 socket 刷新，不做半截 XML 实时落库；
  工具只读当前项目 source_chapters、agent_work_data 和 scripts；
  子 Agent 调度、任务中心长生成闭环继续归阶段 4。
阶段 3 结论：
  P6 阶段 3 已完成；下一步做阶段 4 子 Agent 调度和任务闭环。

阶段 4 改了哪些文件：
  新增 script-runner、P6 阶段 4 验证脚本；
  agent-handler 接入 scriptAgent:decisionAgent 决策层、子 Agent 工具、任务中心 create/succeed/fail/cancel 闭环；
  子 Agent 使用 storySkeletonAgent、adaptationStrategyAgent、scriptAgent、supervisionAgent 对应模型 key；
  子 Agent 复用阶段 3 的只读上下文工具和 XML 写入 service；
  子 Agent 输出通过 toolcall 过程块显示，并对 XML 原文做展示清洗；
  监督层失败返回 ok:false，不回滚已合法保存的工作区结果。
阶段 4 验证结果：
  verify-p6-script-agent-phase1 通过；
  verify-p6-script-agent-phase2 通过；
  verify-p6-script-agent-phase3 通过；
  verify-p6-script-agent-phase4 通过；
  typecheck 通过；
  build 通过。
阶段 4 边界：
  不新增前端按钮，复用现有剧本 Agent 对话、Socket 和工作区刷新链路；
  不让 renderer 读取 skill 文件或模型 SDK；
  不做 Production Agent、图片、视频和导出；
  直接决策层 XML 兼容保留，但非法 XML 会写入任务失败原因。
阶段 4 结论：
  P6 阶段 4 已完成；F-011-014 已由本阶段覆盖；P6 批次完成，下一步进入 P7 剧本结果批。
```
