# OPT-015 HTTP 和本地服务请求诊断

状态：已完成

## 0. 快速理解

一句话：让设置页能看清本地服务、Socket、media 路由和最近本地请求失败，不用猜“桌面程序后台到底活没活”。

为什么现在做：桌面程序没有浏览器 Network 面板。用户看不到本地 HTTP 服务是否启动、Socket 是否就绪、media 路由是否可用，也看不到图片/视频预览 404、签名过期、Range 错误这类失败。

做完后有什么用：设置里的“请求诊断”不只看 URL，还能看 Socket 状态、media 路由能力、支持的 media root、最近本地 HTTP/media 失败摘要，以及 `OPT-014` 已接入的最近模型请求。

这一步不碰什么：不显示 Socket token；不显示 media URL 签名参数；不显示完整资源路径；不记录请求体/响应体；不做外部互联网请求抓包。

## 1. 本次做什么

1. 新增本地请求失败诊断 store。
2. 本地 HTTP 服务 404 记录为 `local-http` 失败。
3. media 请求失败记录为 `media` 失败：
   - method not allowed
   - 签名无效或过期
   - 文件不存在
   - 不支持的媒体类型
   - Range 不合法
   - 目标不是文件
   - 其他媒体请求无效
4. media 失败只记录脱敏摘要：
   - 不保留签名 URL query
   - `/media/...` 统一显示为 `/media/[signed-resource]`
   - 不暴露 token 和完整文件路径
5. Socket 服务暴露安全诊断：
   - running
   - url
   - scriptAgent / productionAgent namespace
   - connectedCount
   - 不返回 token
6. media 路由暴露健康信息：
   - `/media/`
   - Range 支持
   - 缩略图支持
   - 支持的 root 列表
7. 设置请求诊断返回：
   - 本地服务状态
   - Socket 状态
   - media 路由状态
   - 最近本地请求失败
   - 最近模型请求
8. 设置页展示新增信息。
9. 新增中英文 i18n 文案。
10. 新增专项 verify，并接入 `verify:settings`。

## 2. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| 本地 HTTP 失败可见 | `src/main/app/server.ts` 对未知路由 404 调用 `recordLocalRequestFailure` |
| media 失败可见 | `media/request-handler.ts` 在 401/404/405/415/416/400 等分支记录失败摘要 |
| media 路径脱敏 | `local-request-diagnostics.ts` 把 `/media/...` 显示为 `/media/[signed-resource]` |
| Socket 状态可见 | `socket/index.ts` 新增 `getSocketDiagnostics()` |
| media 路由状态可见 | `media/path.ts` 导出 `listMediaRoots()`，设置诊断里组合 route 信息 |
| 设置页读取 | `settings/request-diagnostics.ts` 返回 `socket/media/localRequests/modelRequests` |
| 设置页展示 | `RequestDiagnostics.vue` 增加 Socket、media、最近本地失败表格 |
| 多语言 | `messages.ts` 增加本地请求诊断中英文文案 |
| 自动验证 | 新增 `verify-opt-015-local-request-diagnostics.mjs` 并接入 `verify:settings` |

## 3. 关键决定

1. 只记录失败，不记录所有成功请求。
   - 原因：media 图片/视频预览成功请求会非常多，全部记录会干扰排查。诊断页优先看失败。
2. Socket token 不返回页面。
   - 原因：诊断页面只是排查状态，不应该泄露鉴权令牌。
3. media path 不显示完整资源。
   - 原因：签名 URL 里包含资源标识和 token 参数，页面只需要知道是 media 路由失败。
4. 外部大模型请求继续由 `OPT-014` 负责。
   - 原因：模型请求已经走模型网关，不能和本地 HTTP/media 请求混成一张表。

## 4. 验收标准

1. 请求不存在的本地路由后，诊断页能看到 local-http 404。
2. 请求无效 media URL 后，诊断页能看到 media 401/404/400 等失败。
3. media 失败不展示 token、query、完整资源路径。
4. Socket 状态能显示 running、url、namespace 和连接数。
5. media 路由能显示 `/media/`、Range、缩略图和 root 列表。
6. 请求诊断页面新增文案支持中文和英文。
7. `verify:settings`、`typecheck`、`build` 通过。

## 5. 验证方式

```txt
D:\software\nodejs\node.exe scripts\verify-opt-015-local-request-diagnostics.mjs
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run verify:settings
D:\software\nodejs\pnpm.cmd run verify:docs
D:\software\nodejs\pnpm.cmd run build
```

## 6. 确认点

本任务没有需要停下来的确认点。按已确认规则执行：

1. renderer 不直接访问本地 HTTP 服务内部对象。
2. 诊断只返回摘要，不返回 token、签名 query、完整路径、请求体和响应体。
3. 页面新增文案走 i18n。

## 7. 执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/local-request-diagnostics.ts`、`src/main/app/server.ts`、`src/main/services/media/request-handler.ts`、`src/main/services/media/path.ts`、`src/main/services/socket/index.ts`、`src/main/services/settings/request-diagnostics.ts`、`src/shared/types/request-settings.ts`、`src/renderer/src/features/settings/components/RequestDiagnostics.vue`、`src/renderer/src/i18n/messages.ts`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-015-local-request-diagnostics.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-015-local-request-diagnostics.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

## 8. 最后大白话

以后图片、视频、本地服务或 Socket 出问题，不用靠猜。请求诊断里能看到后台服务活没活、Socket 有没有起来、media 路由支持什么、最近有没有 404/签名过期/Range 错误，而且敏感信息不会露出来。
