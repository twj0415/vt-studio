# OPT-BATCH-002 素材生命周期和导出结构治理

覆盖：`OPT-036 / OPT-020 / OPT-021`

## 通俗总结

这一步解决两个问题：

1. 素材文件别乱：数据库引用的文件要能检查，没人引用的项目素材、缓存、临时文件要能清。
2. 导出结构别临时拼：视频轨道、分镜、视频候选到导出草稿的结构要固定，后续剪映原生草稿只替换 writer，不推翻前面的数据链路。

## 做了什么

1. 新增文件生命周期诊断：
   - 扫 `asset_media.relative_path`
   - 扫 `production_storyboards.relative_path`
   - 扫 `production_videos.relative_path`
   - 找出数据库引用但文件不存在的缺失项
   - 找出项目素材目录里没有数据库引用的孤儿文件
   - 统计 cache/temp 文件数量和体积
2. 新增安全清理：
   - 缺失引用不删除，只提示用户修业务数据
   - 孤儿项目素材可清理
   - cache 可清理
   - temp 可清理
3. 文件管理页新增“素材生命周期”区：
   - 显示被引用素材、缺失引用、孤儿素材、缓存/临时统计
   - 显示前 8 条问题
   - 提供清理孤儿素材、缓存、临时文件按钮
4. 素材到视频链路确认：
   - 资产图继续走 `asset_media`
   - 分镜图继续走 `production_storyboards.relative_path`
   - 视频候选继续走 `production_videos.relative_path`
   - 视频轨道通过 `storyboardIds` 和 `selectedVideoId` 构建导出时间线
5. 导出结构确认：
   - `vt_timeline.json`
   - `draft_meta_info.json`
   - `draft_content.json`
   - `export_summary.json`
   - `assets/` 可选复制素材目录

## 不做什么

1. 不一次性给所有历史媒体补 md5、宽高、duration 字段。
2. 不自动删除缺失引用对应的数据库记录。
3. 不伪称已经输出剪映原生草稿 schema。
4. 不把导出历史并进来；导出历史走 `OPT-056`。

## 完成标准

1. 文件管理页能看出缺失引用、孤儿素材、缓存、临时文件。
2. 清理只处理可安全删除项，不碰数据库引用文件。
3. 视频导出仍从生产视频轨道读取时间线。
4. 导出目录结构固定，后续 writer 可替换。
5. `typecheck`、专项 verify、相关分组 verify、build 通过。

## 完成记录

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/file-management.ts`、`src/main/services/media/lifecycle.ts`、`src/main/services/settings/file-management.ts`、`src/main/ipc/settings.ts`、`src/shared/contracts/preload.ts`、`src/preload/index.ts`、`src/renderer/src/features/settings/components/FileManagement.vue`、`src/renderer/src/i18n/messages.ts`、`src/shared/types/export.ts`、`src/main/services/export/index.ts`、`src/main/services/production/service.ts`、`scripts/verify-opt-036-020-021-media-export-foundation.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-036-020-021-media-export-foundation.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:assets`、`D:\software\nodejs\pnpm.cmd run verify:production`、`D:\software\nodejs\pnpm.cmd run verify:export`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。
