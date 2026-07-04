# OPT-030 seed 模块化和幂等 helper

状态：已完成

## 要做什么

把默认数据初始化从一个大 `seed.ts` 拆清楚。

以前 `seed.ts` 同时管用户、设置、供应商、Agent、Prompt、Skill，后续新增默认数据很容易改乱。现在改成一个入口加多个小 seed 文件，每个文件只管一类默认数据。

## 为什么要做

新装、恢复数据库、默认资源修复都会跑 seed。它必须稳定、幂等、好查。

如果 seed 继续堆在一个文件里，后面加默认模板、默认 Skill、默认设置时很容易：

1. 覆盖用户已经改过的数据。
2. 同一份默认清单维护两遍。
3. 重复插入默认记录。
4. seed 和诊断逻辑各写一套工具函数。

## 怎么做

1. 新增 `seed-helpers.ts`：
   - `tableExists`
   - `insertIfMissing`
   - `upsertByKey`
   - `readJsonColumn`
   - `writeJsonColumn`
   - `safeReadDefaultText`
   - `createMd5`
2. 拆分默认数据：
   - `seed-users.ts`
   - `seed-settings.ts`
   - `seed-vendors.ts`
   - `seed-agent-configs.ts`
   - `seed-prompts.ts`
   - `seed-skills.ts`
3. `seed.ts` 只负责执行顺序，不再放大段默认数据。
4. `seed-default-assets.ts` 复用公共 helper，不再自己写一套 `tableExists/createMd5/readJson/saveJson`。
5. 保持默认数据内容不变，不借这个任务修改业务策略。

## 不做什么

1. 不改默认 Prompt 文本。
2. 不改默认 Agent 配置。
3. 不在本任务生成 Skill embedding。
4. 不改默认资源 registry。

## 完成标准

1. `seed.ts` 只做编排。
2. 默认数据按领域拆开。
3. seed 跑两次不会重复插入用户、设置、Prompt、Skill、Skill 归属。
4. 默认资源 seed 和基础 seed 使用同一套 helper。
5. `typecheck` 和专项验证通过。

## 验证方式

1. `D:\software\nodejs\node.exe scripts\verify-opt-030-seed-modules.mjs`
2. `D:\software\nodejs\pnpm.cmd run typecheck`
3. `D:\software\nodejs\pnpm.cmd run verify:core`

## 完成记录

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/database/seed.ts`、`src/main/services/database/seed-helpers.ts`、`src/main/services/database/seed-users.ts`、`src/main/services/database/seed-settings.ts`、`src/main/services/database/seed-vendors.ts`、`src/main/services/database/seed-agent-configs.ts`、`src/main/services/database/seed-prompts.ts`、`src/main/services/database/seed-skills.ts`、`src/main/services/database/seed-manuals.ts`、`src/main/services/database/seed-model-prompts.ts`、`src/main/services/database/seed-default-assets.ts`、`scripts/verify-opt-030-seed-modules.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-030-seed-modules.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core` 通过。

## 最后大白话

这个任务不是加新功能，是把“默认数据初始化”这个地基收拾干净。以后要找默认用户、默认设置、默认 Agent、默认 Prompt、默认 Skill，直接进对应文件，不用在一个大文件里乱翻。
