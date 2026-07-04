# OPT-041 renderer 全局错误边界

状态：已完成

## 0. 快速理解

一句话：页面代码突然报错、Promise 没 catch、路由加载失败时，不能让用户看到白屏或“点了没反应”，要有统一兜底提示。

为什么现在做：`OPT-040` 已经把普通请求失败收口了，但它只能管“页面主动调用的请求”。组件运行时错误、路由错误、未捕获 Promise 还没有统一处理。

做完后有什么用：后续页面写坏了、异步漏 catch、路由懒加载失败时，至少能看到可理解提示，控制台也能看到统一来源，方便继续排查。

这一步不碰什么：不重做所有页面，不处理每个图片/视频的占位和重试，不重构 Socket 连接状态。那些属于后续 UI、media、Socket 专项。

## 1. 参考项目怎么做

| 范围 | 结论 |
|---|---|
| `Toonflow-web/src/utils/axios.ts` | axios 响应错误集中处理，401 跳登录，Network Error 用 TDesign Notify 给明确提示 |
| `Toonflow-web/src/utils/useChat.ts` | Socket/chat 错误主要 `console.error`，没有全局错误边界 |
| `Toonflow-app/src/utils/error.ts` | 后端把 Axios/Error/unknown 统一归一成 message、code、status、meta |

参考项目能借鉴：

1. 错误先集中归一，再给用户提示。
2. 用户看提示，开发者看日志来源。
3. 网络/会话类错误不能静默失败。

VT Studio 不能照搬：

1. 当前是桌面 Electron，不是纯 Web 后台接口；renderer 的兜底要覆盖 Vue、window、Promise、router。
2. 返回格式已经固定 `{ code, data, msg }`，请求类错误继续走 `useVtRequest`。
3. 用户可见提示必须走 i18n，不在错误边界里写死中文。

## 2. 本次做什么

1. 新增 renderer 错误边界工具：
   - 统一归一错误 message。
   - 记录错误来源：Vue、window、Promise、router。
   - 同类错误短时间节流，避免刷屏。
   - 用户提示只展示通俗文案，细节留给控制台。
2. `main.ts` 注册：
   - `app.config.errorHandler`。
   - `window.addEventListener('error')`。
   - `window.addEventListener('unhandledrejection')`。
   - `router.onError()`。
3. 新增全局错误边界组件：
   - 包住 `RouterView`。
   - 子页面渲染异常时显示可恢复页面，不让整页白屏。
   - 提供“重试当前页面”和“回到项目管理”。
4. 补 i18n 文案。
5. 新增 verify，检查入口、组件、文案和脚本接入。

## 3. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| Vue 组件异常兜底 | `app.config.errorHandler` 记录全局 Vue 异常；错误边界组件捕获 `RouterView` 子树异常 |
| Promise 漏 catch 兜底 | 监听 `unhandledrejection`，把 `event.reason` 归一后提示 |
| window 运行时异常兜底 | 监听 `error`，记录文件、行列号摘要 |
| 路由错误兜底 | `router.onError` 记录从哪个路由跳到哪个路由失败 |
| 用户提示 | TDesign `MessagePlugin.error` 显示统一文案，不暴露 stack、本地路径、密钥 |
| 开发排查 | `console.error('[RendererError]', ...)` 输出 source、info、message 和原始 error |
| 防刷屏 | 同一 source/message/info 3 秒内只提示一次 |
| 不和请求封装打架 | 普通 preload IPC 失败仍走 `useVtRequest`；这里只兜没被页面捕获的异常 |

## 4. 文件改动

| 文件 | 作用 |
|---|---|
| `src/renderer/src/utils/renderer-error-boundary.ts` | 全局错误归一、提示、注册入口 |
| `src/renderer/src/components/RendererErrorBoundary.vue` | 包住路由视图，避免页面白屏 |
| `src/renderer/src/main.ts` | 注册全局错误边界 |
| `src/renderer/src/App.vue` | 使用错误边界包住 `RouterView` |
| `src/renderer/src/i18n/messages.ts` | 新增中英文错误边界文案 |
| `scripts/verify-opt-041-renderer-error-boundary.mjs` | 专项校验 |
| `scripts/verify.mjs` | 加入 `settings` 分组 |

## 5. 验收标准

1. Vue app 有 `app.config.errorHandler`。
2. 有 `window` runtime error 监听。
3. 有 `unhandledrejection` 监听。
4. 有 `router.onError`。
5. `RouterView` 被错误边界包住。
6. 用户可见提示走 i18n。
7. 同类错误不会连续刷屏。
8. typecheck 和 build 通过。

## 6. 验证方式

```txt
D:\software\nodejs\node.exe scripts\verify-opt-041-renderer-error-boundary.mjs
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run verify:settings
D:\software\nodejs\pnpm.cmd run verify:docs
D:\software\nodejs\pnpm.cmd run build
```

## 7. 确认点

本任务没有需要停下来的确认点。采用以下口径：

1. 这一步只做 renderer 全局兜底。
2. media 图片/视频占位重试后续跟 `OPT-024/048/049` 页面治理做。
3. Socket 断开状态后续跟 Agent/Socket 专项做，不塞进本任务。

## 8. 执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/utils/renderer-error-boundary.ts`、`src/renderer/src/components/RendererErrorBoundary.vue`、`src/renderer/src/main.ts`、`src/renderer/src/App.vue`、`src/renderer/src/i18n/messages.ts`、`scripts/verify-opt-041-renderer-error-boundary.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-041-renderer-error-boundary.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。`verify:settings` 中的 ONNX、默认资源缺文件和 Electron GPU 警告为既有环境警告，命令最终通过。

## 9. 最后大白话

这一步就是给前端加一张安全网。普通请求失败继续走 `useVtRequest`；真正没被页面 catch 到的运行时报错，会统一提示用户，并在控制台留下能定位的来源。
