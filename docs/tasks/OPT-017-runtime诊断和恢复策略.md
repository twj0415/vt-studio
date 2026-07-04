# OPT-017 runtime 诊断和恢复策略

状态：已完成

## 要做什么

把“运行数据到底放在哪里、哪些能删、哪些不能删、哪些能恢复”做成可见的诊断信息。

之前文件管理能打开目录，也能清理 cache/temp，但用户还是看不出当前 `userData` 是开发临时目录、生产应用目录，还是环境变量指定目录。这个任务补上 runtime 总览。

## 为什么要做

桌面程序不应该把运行数据混在源码目录里。项目之前出现过 `.runtime/user-data`、temp runtime、out 目录混淆，用户很难判断能不能删。

这类规则如果只靠口头解释，后续还会乱。必须在代码和页面里有明确边界。

## 怎么做

1. 文件管理接口返回 `runtime`：
   - 当前 `userData`。
   - 当前工作区根目录。
   - development / production。
   - 来源：`VT_STUDIO_USER_DATA`、开发临时目录、Electron 应用数据目录。
   - 是否落在项目源码目录内。
2. 文件管理页显示 runtime 总览：
   - 当前 userData 路径。
   - 运行来源。
   - 是否在项目目录内。
   - 可清理目录。
   - 可恢复目录。
   - 不要直接删的目录。
3. 清理仍只允许受控项：
   - cache
   - temp
   - 孤儿项目素材
4. 默认资源恢复仍由默认资源诊断/seed 负责，不在文件页手动乱写。
5. 所有新增可见文案进入 i18n。

## 不做什么

1. 不提供“一键删除整个 runtime”。
2. 不暴露数据库目录和 vendors 目录给普通文件管理。
3. 不删除 exports，导出文件由用户手动处理。
4. 不把开发 runtime 放回项目目录。

## 完成标准

1. 设置页文件管理能看到 runtime 根目录和来源。
2. 如果 userData 落在项目目录内，页面能标红提示。
3. cache/temp 明确是可清理项。
4. modelPrompt/skills/assets 明确是可恢复项。
5. projects/exports/models/logs 明确不是随便删的项。
6. `typecheck` 和专项验证通过。

## 验证方式

1. `D:\software\nodejs\node.exe scripts\verify-opt-017-runtime-diagnostics.mjs`
2. `D:\software\nodejs\pnpm.cmd run typecheck`
3. `D:\software\nodejs\pnpm.cmd run verify:settings`
4. `D:\software\nodejs\pnpm.cmd run verify:docs`

## 完成记录

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/file-management.ts`、`src/main/services/settings/file-management.ts`、`src/renderer/src/features/settings/components/FileManagement.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-017-runtime-diagnostics.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-017-runtime-diagnostics.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs` 通过。

## 最后大白话

这个任务解决“这个目录是干嘛的、能不能删”的问题。以后看文件管理页就能知道运行数据放在哪里，cache/temp 可以清，项目、导出、本地模型这些别直接删。
