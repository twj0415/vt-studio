# CORE-014 默认资源治理

一句话：把默认 Skill、手册、模型提示词、供应商 adapter、ONNX 模型和默认素材收成一份 registry，并让同步、seed、诊断、恢复都按这份清单走。

## 1. 要解决什么

之前的问题不是“文件有没有拷进来”，而是四件事没有闭环：

1. 文件在 `resources/default-data`，但 runtime 里可能没有。
2. runtime 有文件，但 SQLite 里可能没有记录。
3. SQLite 有记录，但页面或业务链路可能用不到。
4. 默认资源清单散在多个文件里，后面新增一个资源很容易漏。

## 2. 这次怎么做

1. 新增默认资源 registry：`src/main/services/default-assets/registry.ts`。
2. registry 统一维护：
   - 默认资源分类：`skills`、`models`、`vendors`、`modelPrompt`、`assets`
   - 默认供应商 ID
   - 默认视觉手册和导演手册
   - 默认模型提示词模板
   - 默认 Skill 和 Skill attribution
   - 默认 ONNX 模型路径
3. `syncDefaultAssets()` 改成读取 registry，不再自己维护一套目录清单。
4. `runSeed()` 和 `seedDefaultAssetRecords()` 改成读取 registry，不再自己维护供应商、手册、模型提示词、Skill 清单。
5. 新增默认资源诊断：`diagnoseDefaultAssets()`。
6. 诊断输出每项资源的状态：
   - 源文件路径
   - runtime 路径
   - seed 目标表
   - 页面是否可见
   - 链路是否使用
   - 是否能自动修复
7. 修复模式会先同步默认资源，再执行完整 `runSeed()`。
8. 手册页签配置移动到 `src/shared/constants/manuals.ts`，main 和 renderer 共用。
9. 新写入统一使用 `director_skills`。
10. 旧 `driector_skills` 只作为 legacy 读取兼容，不再作为默认资源目录存在。
11. 删除 resources 下 23 个旧 `driector_skills` 目录。
12. 修复 `resources/default-data/vendors/vidu.ts` 缺少 `exports.ttsRequest` 的问题。

## 3. 现在能保证什么

1. 新装环境同步默认资源后，默认手册、默认提示词、默认 Skill、默认供应商都能进入数据库。
2. 删除一个 runtime 默认模型提示词文件，诊断能发现并恢复。
3. 删除一条默认 Skill 数据库记录，诊断能发现并恢复。
4. 默认供应商脚本结构会被 seed 阶段解析；`vidu` 已不再报缺少 `ttsRequest`。
5. 项目手册弹窗和 main 手册保存逻辑使用同一份页签定义。
6. 默认资源对账不再靠人工看文件，后续可以直接复用 `diagnoseDefaultAssets()` 接到设置页或开发者诊断页。

## 4. 没放进本任务的事

1. Skill embedding 一键重建入口还没做，继续留给 `OPT-003`。
2. cache/temp/exports 的完整 runtime 清理策略还没做，继续留给 `OPT-017` 或文件管理补做。
3. 默认资源诊断目前是 service 和 verify 脚本，没有做 UI 面板。

## 5. 涉及文件

代码：

- `src/main/services/default-assets/registry.ts`
- `src/main/services/default-assets/diagnostics.ts`
- `src/main/services/default-assets/index.ts`
- `src/main/services/database/seed.ts`
- `src/main/services/database/seed-default-assets.ts`
- `src/main/services/embedding/index.ts`
- `src/main/services/settings/memory-settings.ts`
- `src/main/services/project.ts`
- `src/shared/constants/manuals.ts`
- `src/renderer/src/features/project/components/ManualFormDialog.vue`

资源：

- `resources/default-data/vendors/vidu.ts`
- `resources/default-data/skills/**/driector_skills` 已删除
- `resources/default-data/skills/story_skills/*/README.md`

验证：

- `scripts/verify-core-014-default-assets.mjs`
- `scripts/verify-core-011.mjs`
- `scripts/verify.mjs`

文档：

- `docs/TODO-优化与缺口.md`
- `docs/03-执行进度.md`
- `docs/04-对齐验收与偏差记录.md`

## 6. 验证结果

已通过：

1. `D:\software\nodejs\node.exe scripts\verify-core-014-default-assets.mjs`
2. `D:\software\nodejs\pnpm.cmd run typecheck`
3. `D:\software\nodejs\pnpm.cmd run verify:core`
4. `D:\software\nodejs\pnpm.cmd run build`

说明：

- `verify-core-011` 仍会故意删除 ONNX 文件来验证 embedding 降级，所以保留“本地向量模型文件未安装”的 warning，这是验证场景，不是默认资源缺失。
