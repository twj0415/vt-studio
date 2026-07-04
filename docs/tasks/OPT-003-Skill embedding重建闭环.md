# OPT-003 Skill embedding 重建闭环

状态：已完成

## 要做什么

把 Skill 管理里的“需要重建向量”变成可操作闭环。

之前保存 references Skill 后会标记 `state=-1`，页面能看到“需重建向量”，但用户没有按钮处理。底层已有 `rebuildSkillEmbeddings()`，这次把它接到设置页。

## 为什么要做

剧本 Agent 和生产 Agent 会按 references Skill 做语义检索。Skill 内容改了但 embedding 不更新，Agent 可能继续按旧语义排序，生成质量会偏。

## 怎么做

1. `src/shared/types/skill-management.ts` 增加重建入参和结果类型。
2. `src/main/services/settings/skill-management.ts` 暴露 `rebuildSkillEmbeddingsForManagement()`。
3. 重建服务动态 import `skill-retrieval`，避免普通 Skill 列表/编辑提前加载 embedding 依赖。
4. `src/main/ipc/settings.ts` 增加 `settings:skill:rebuild-embeddings`。
5. `src/shared/contracts/preload.ts` 和 `src/preload/index.ts` 暴露 `window.vtStudio.settings.skill.rebuildEmbeddings()`。
6. `SkillManagement.vue` 增加：
   - 重建全部 references Skill 向量。
   - 重建当前 references Skill 向量。
   - 重建中 loading。
   - 重建成功结果提示。
   - 当前 Skill 状态刷新。
7. `state=0` 映射为重建失败，页面显示失败态。
8. 所有新增可见文案写入 `messages.ts` 中英文语言包。
9. `verify-f-002-007.mjs` 扩展验证：
   - IPC/preload/页面入口存在。
   - 缺 ONNX 或重建失败不会假成功。
   - `state=0` 能映射到页面数据的 failed 状态。

## 不做什么

1. 不自动下载 ONNX 模型。
2. 不把重建做成任务中心长任务。
3. 不做进度条和逐条进度流。
4. 不新增 Skill 市场、删除、安装能力。
5. 不改 Agent 调用逻辑。

## 完成标准

1. Skill 管理页有“重建全部向量”和“重建当前向量”。
2. 只有 references Skill 能重建当前向量。
3. 保存 references Skill 后仍是 expired。
4. 重建成功后底层可把 `state` 改成 `1`，页面刷新后显示 ready。
5. 重建失败后可显示 failed。
6. ONNX 模型缺失时返回明确失败，不写假成功。
7. 页面不直接访问数据库、文件系统或模型依赖。

## 验证方式

1. `D:\software\nodejs\node.exe scripts\verify-f-002-007.mjs`
2. `D:\software\nodejs\node.exe scripts\verify-core-011.mjs`
3. `D:\software\nodejs\pnpm.cmd run typecheck`
4. `D:\software\nodejs\pnpm.cmd run verify:settings`
5. `D:\software\nodejs\pnpm.cmd run verify:docs`
6. `D:\software\nodejs\pnpm.cmd run build`

## 完成记录

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/skill-management.ts`、`src/main/services/settings/skill-management.ts`、`src/main/services/skill-retrieval/index.ts`、`src/main/ipc/settings.ts`、`src/shared/contracts/preload.ts`、`src/preload/index.ts`、`src/renderer/src/features/settings/components/SkillManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-f-002-007.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-f-002-007.mjs`、`D:\software\nodejs\node.exe scripts\verify-core-011.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

## 最后大白话

这个任务就是给 Skill 页补“重建向量”按钮。以后 Skill 改完，不再只是看到“需重建”，可以直接点按钮处理；没装 ONNX 模型时会明确失败，不会假装成功。
