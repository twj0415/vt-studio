# OPT-047 可见文案 i18n 治理 - 第五批：设置 Agent 配置

状态：已完成

## 0. 快速理解

一句话：这次只处理设置页里的 `AgentConfig.vue`，把 Agent 高级配置页用户能看到的固定文案全部改成 i18n key。

为什么单独做它：Agent 配置会影响剧本 Agent、生产 Agent 和通用 AI 的模型选择。如果这里的标题、状态、校验提示还是中文写死，英文界面和后续 Agent 调试都会断层。

这一步不碰什么：不改 Agent 保存逻辑、不改模型解析、不改默认文本模型规则、不改主进程返回结构，也不处理其它设置组件。

## 1. 扫描结论

`AgentConfig.vue` 的硬编码主要集中在这些地方：

1. 页面标题和说明：Agent 高级设置、继承默认文本模型说明。
2. 操作按钮：刷新、保存。
3. 默认模型状态：默认文本模型、未配置、默认模型是否可用。
4. 全局参数选项：创作稳定性、稳/平衡/发散、输出长度、自动/短/中/长。
5. 高级区：高级覆盖、主 Agent、剧本子 Agent、生产子 Agent。
6. Agent 名称：剧本 Agent、生产 Agent、故事骨架、分镜生成等默认中文名来自主进程，页面展示要按 `agent.key` 映射语言包。
7. Agent 状态：继承默认文本模型、高级覆盖、覆盖模型已失效、已禁用等不能直接展示主进程中文 `statusText`。
8. 字段和 placeholder：当前生效、覆盖模型、选择已启用文本模型、继承全局参数、0 为自动。
9. 校验和 toast：覆盖模型无效、temperature 范围、maxOutputTokens 范围、保存成功/失败。

## 2. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| 组件接入 i18n | `AgentConfig.vue` 引入 `useI18n()`，所有可见静态文案走 `settings.agentConfig.*` |
| 选项 label 改语言包 | `CREATIVITY_OPTIONS`、`OUTPUT_LENGTH_OPTIONS` 改成 `labelKey`，模板里用 `t(labelKey)` |
| 分组名改语言包 | `main/script/production` 通过 `GROUP_LABEL_KEYS` 映射显示 |
| Agent 名称改语言包 | 按 `TextAgentKey` 建 `AGENT_NAME_KEYS`，页面展示和校验提示都用 `getAgentName()` |
| 状态文案改语言包 | 按 `agent.status` 和 `defaultTextStatus` 推导 i18n 文案，不直接展示后端中文 `statusText/defaultTextStatusText` |
| 校验和 toast | `MessagePlugin` 和前端校验错误改用语言包；接口 `response.msg` 继续原样展示 |
| 中英文语言包 | `messages.ts` 新增 `settings.agentConfig.*`，中英文同步补齐 |
| 防回退 | 新增专项 verify，检查 `AgentConfig.vue` 不再出现中文硬编码和后端中文状态直出 |
| 旧校验更新 | `verify-f-002-005` 不再查页面中文标题，改查 i18n key |

## 3. 文件改动

| 文件 | 作用 |
|---|---|
| `src/renderer/src/features/settings/components/AgentConfig.vue` | Agent 配置页可见文案改为 i18n |
| `src/renderer/src/i18n/messages.ts` | 补 `settings.agentConfig.*` 中英文文案 |
| `scripts/verify-opt-047-agent-config-i18n.mjs` | 第五批专项校验 |
| `scripts/verify.mjs` | 把专项校验加入 settings 分组 |
| `scripts/verify-f-002-005.mjs` | 旧 Agent 配置校验改查 i18n key |
| `docs/TODO-优化与缺口.md` | 回填第五批进度 |
| `docs/03-执行进度.md` | 回填已完成和下一步 |

## 4. 验收标准

1. `AgentConfig.vue` 不再出现中文硬编码。
2. Agent 配置页标题、按钮、tag、分组、默认模型、选项、placeholder、toast、校验提示都走 i18n。
3. 切换语言后，Agent 配置页静态文案能跟随语言包变化。
4. `agent.statusText`、`defaultTextStatusText` 不直接展示，避免主进程中文漏到页面。
5. 接口 `response.msg` 继续原样展示，不在前端乱翻译。
6. Agent 保存、默认文本模型继承、高级覆盖、参数继承逻辑不变。
7. 专项 verify、typecheck、settings verify、docs verify、build 通过。

## 5. 后续批次

1. 第六批继续设置页剩余组件，优先处理 `MemoryConfig.vue`、`PromptConfig.vue`、`ModelPromptConfig.vue` 等残留文案。
2. 设置页清完后，再进入项目、原文、剧本、资产、生产、导出页面。

## 6. 执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/settings/components/AgentConfig.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-agent-config-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-005.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-agent-config-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。`verify:settings` 中的 ONNX、默认资源缺文件、模型调用失败日志为既有环境/验证噪声，命令最终通过。

## 7. 最后大白话

这一批就是把“Agent 高级配置页”的中文写死清掉。功能不动，只把用户看得见的固定文字、状态和提示统一交给语言包，避免以后多语言界面一半中文一半英文。
