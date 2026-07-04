# OPT-047 可见文案 i18n 治理 - 第四批：设置 Skill 管理

状态：已完成

## 0. 快速理解

一句话：这次只处理设置页里的 `SkillManagement.vue`，把 Skill 管理页能看到的中文文案全部改成 i18n key。

为什么单独做它：Skill 管理是 Agent 能力的基础资源入口，页面里有文件状态、向量状态、结构风险弹窗和编辑器。如果这些文案写死中文，后面英文界面和 Agent 调试都会不一致。

这一步不碰什么：不改 Skill 保存逻辑、不改路径安全、不改 frontmatter 校验、不改 embedding 重建逻辑，也不把其它设置组件混进来。

## 1. 扫描结论

`SkillManagement.vue` 的硬编码主要集中在这些地方：

1. 页面标题和说明：Skill 管理、编辑本地 Markdown 的说明。
2. 搜索和刷新：搜索 placeholder、刷新按钮。
3. 文件状态：文件正常、文件缺失、无法查看、不能编辑。
4. 向量状态：向量可用、需重建向量、主 Skill。
5. 元信息：类型、文件、向量、字符数、路径、归属、更新时间。
6. 空状态：没有匹配的 Skill、请选择 Skill、正在读取内容。
7. 编辑弹窗：标题、保存、取消、textarea placeholder。
8. 风险弹窗：Skill 结构风险、仍然保存、返回修改。
9. toast：内容为空、保存成功、文件缺失。

## 2. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| 组件接入 i18n | `SkillManagement.vue` 引入 `useI18n()`，所有可见静态文案走 `settings.skillManagement.*` |
| 日期格式跟随语言 | `formatUpdatedAt()` 使用当前 `locale.value`，不再固定 `zh-CN` |
| 文件和向量状态 | 新增 `getFileStatusText()`、`getSkillTypeText()`，状态展示走语言包 |
| toast 和风险弹窗 | `MessagePlugin`、`DialogPlugin.confirm` 改用语言包，warnings 内容保留后端原文 |
| 编辑弹窗 | header、保存、取消、placeholder、元信息 label 全部走语言包 |
| 中英文语言包 | `messages.ts` 新增 `settings.skillManagement.*`，中英文同步补齐 |
| 防回退 | 新增专项 verify，检查 `SkillManagement.vue` 不再出现中文硬编码 |
| 旧校验更新 | `verify-f-002-007` 不再查页面中文，改查 i18n key |

## 3. 文件改动

| 文件 | 作用 |
|---|---|
| `src/renderer/src/features/settings/components/SkillManagement.vue` | Skill 管理页可见文案改为 i18n |
| `src/renderer/src/i18n/messages.ts` | 补 `settings.skillManagement.*` 中英文文案 |
| `scripts/verify-opt-047-skill-management-i18n.mjs` | 第四批专项校验 |
| `scripts/verify.mjs` | 把专项校验加入 settings 分组 |
| `scripts/verify-f-002-007.mjs` | 旧 Skill 管理校验改查 i18n key |
| `docs/TODO-优化与缺口.md` | 回填第四批进度 |
| `docs/03-执行进度.md` | 回填已完成和下一步 |

## 4. 验收标准

1. `SkillManagement.vue` 不再出现中文硬编码。
2. Skill 管理页标题、搜索、按钮、tag、空状态、toast、弹窗和编辑器文案都走 i18n。
3. 切换语言后，Skill 管理页静态文案能跟随语言包变化。
4. 风险 warnings、接口 `response.msg` 继续原样展示，不在前端乱翻译。
5. Skill 保存、路径越界保护、frontmatter 风险校验和 embedding 过期标记逻辑不变。
6. 专项 verify、typecheck、settings verify、docs verify、build 通过。

## 5. 后续批次

1. 第五批：继续设置页 `AgentConfig.vue`、`MemoryConfig.vue`、`PromptConfig.vue`、`ModelPromptConfig.vue` 等残留文案，按组件拆分。
2. 设置页清完后，再进入项目、原文、剧本、资产、生产、导出页面。

## 6. 执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/features/settings/components/SkillManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-047-skill-management-i18n.mjs`、`scripts/verify.mjs`、`scripts/verify-f-002-007.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-047-skill-management-i18n.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run build` 通过。`verify:settings` 中的 ONNX、默认资源缺文件、模型调用失败和 Electron GPU 日志为既有环境/验证噪声，命令最终通过。

## 7. 最后大白话

这一批就是把“Skill 管理页”的中文写死清掉。页面功能不动，只把用户看得到的固定文案交给语言包，保证后面多语言不会在 Skill 页面断掉。
