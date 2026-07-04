# OPT-040 renderer 请求封装和提示统一

状态：已完成

## 0. 快速理解

一句话：页面不要再到处写 `response.code === 200` 和 `MessagePlugin.error(response.msg)`，统一走一个 renderer 请求 helper。

为什么现在做：底层已经统一 `{ code, data, msg }`，错误里也有 `msgKey/requestId`。如果前端继续每个页面自己处理，后面页面越多，错误提示、多语言、loading 和 requestId 展示会越来越不一致。

做完后有什么用：新页面可以直接调用 `useVtRequest().run(() => window.vtStudio.xxx())`，成功拿 `data`，失败自动显示统一提示；需要特殊处理时再覆盖。

这一步不碰什么：不改 preload 契约，不改 main 返回结构，不一次性重构全项目所有页面，不做全局错误边界，那是 `OPT-041`。

## 1. 参考项目怎么做

| 范围 | 结论 |
|---|---|
| `Toonflow-web/src/utils/axios.ts` | 前端集中创建 axios 实例；统一 baseURL、timeout、token、401 跳登录和网络错误提示 |
| `Toonflow-app/src/lib/responseFormat.ts` | 后端返回 `{ code, data, message }` |
| `Toonflow-app/src/middleware/middleware.ts` | 参数校验失败统一返回 400 和错误信息 |
| `Toonflow-app/src/utils/error.ts` | 后端错误归一，Axios/Error/unknown 都转成可读 message |

参考项目能借鉴：

1. 前端请求入口集中，不让页面重复写底层判断。
2. 网络/鉴权/失败提示统一处理。
3. 后端错误先归一，再给前端展示。

VT Studio 不能照搬：

1. 当前是 Electron preload IPC，不是浏览器 axios HTTP。
2. 返回字段已固定为 `{ code, data, msg }`，不是 `message`。
3. 错误多语言优先用 `msgKey`，不能只显示后端中文 `msg`。
4. requestId 是排错关键，页面失败提示要能带出来或进入诊断。

## 2. 本次做什么

1. 新增 `src/renderer/src/composables/useVtRequest.ts`：
   - `isVtOk(response)`：统一判断成功。
   - `extractVtErrorInfo(response, fallback)`：从失败响应里取 `errorCode/msgKey/requestId/msg`。
   - `formatVtErrorMessage()`：优先 `msgKey` 翻译，其次 `msg`，最后兜底文案。
   - `useVtRequest()`：封装 loading、重复点击锁、失败 toast、成功 toast。
2. 新增 i18n 文案：
   - 未知请求失败。
   - 请求执行异常。
   - 带 requestId 的错误格式。
3. 改两个样板页面：
   - 设置页：`RequestDiagnostics.vue`
   - 业务页：`TaskCenter.vue`
4. 新增 verify：
   - 检查 helper 存在。
   - 检查样板页面不再定义本地 `isOk()`。
   - 检查样板页面使用 `useVtRequest`。
   - 检查 i18n 有 `request.*` 文案。

## 3. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| 统一成功判断 | 只认 `code === 200`，封装成 `isVtOk()` |
| 统一错误信息 | 从 `response.data.msgKey/requestId/errorCode` 读取；没有就回退 `response.msg` |
| 多语言提示 | `msgKey` 存在且语言包有 key 时用 `t(msgKey)`；否则用原始 `msg` |
| requestId 展示 | 失败提示里追加短 requestId，方便去请求诊断和日志定位 |
| loading | `useVtRequest` 内部提供 `loading`；页面也可继续用自己的 loading，只要通过 `run()` 处理响应 |
| 防重复点击 | `run()` 默认锁住同一个 helper 的并发请求；需要轮询时允许关闭 lock |
| 页面特殊处理 | `showError:false` 或 `onError()` 允许页面自己处理，但数据解析仍走 helper |
| 不破坏旧页面 | 首批只改两个样板页面，其他页面后续按模块逐步迁移 |

## 4. 文件改动

| 文件 | 作用 |
|---|---|
| `src/renderer/src/composables/useVtRequest.ts` | renderer 统一请求 helper |
| `src/renderer/src/i18n/messages.ts` | 补请求提示中英文文案 |
| `src/renderer/src/features/settings/components/RequestDiagnostics.vue` | 设置页样板 |
| `src/renderer/src/features/task-center/TaskCenter.vue` | 业务页样板 |
| `scripts/verify-opt-040-renderer-request.mjs` | 专项验证 |
| `scripts/verify.mjs` | 把专项验证加入 `settings` 或前端相关分组 |

## 5. 和 Toonflow 不同的地方

1. Toonflow 前端用 axios；VT Studio 用 preload IPC。
2. Toonflow 返回 `message`；VT Studio 保留用户确认过的 `msg`。
3. VT Studio 错误提示必须照顾多语言和 requestId。
4. VT Studio 不让 renderer 直连 main 以外的服务。

偏差记录：不需要新增偏差；这是 Electron 架构下的前端实现差异。

## 6. 验收标准

1. 新 helper 能处理成功、失败和 invoke 抛错三类情况。
2. 失败优先显示 `msgKey` 翻译。
3. 有 `requestId` 时提示里带 requestId。
4. `RequestDiagnostics.vue` 不再手写 `isOk()`。
5. `TaskCenter.vue` 不再手写 `isOk()`。
6. 不改 preload/main 契约。
7. typecheck 通过。

## 7. 验证方式

```txt
D:\software\nodejs\node.exe scripts\verify-opt-040-renderer-request.mjs
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run verify:settings
D:\software\nodejs\pnpm.cmd run verify:content
D:\software\nodejs\pnpm.cmd run build
```

## 8. 确认点

本任务没有需要停下来的确认点。采用以下口径：

1. 首批只改两个样板页面。
2. 其他页面后续结合 `OPT-047/048/049` 或具体模块逐步迁移。
3. 不把 `MessagePlugin` 完全禁止；确认弹窗、业务特殊 toast 仍可直接用。

## 9. 执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/composables/useVtRequest.ts`、`src/renderer/src/i18n/messages.ts`、`src/renderer/src/features/settings/components/RequestDiagnostics.vue`、`src/renderer/src/features/task-center/TaskCenter.vue`、`scripts/verify-opt-040-renderer-request.mjs`、`scripts/verify.mjs`、`scripts/verify-p4-task-center.mjs`、`scripts/verify-p6-script-agent-phase4.mjs`、`scripts/verify-p7-scripts.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-040-renderer-request.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:content`、`D:\software\nodejs\pnpm.cmd run build` 通过。`verify:content` 期间同步修正 P4/P6/P7 三个过期校验断言，使其检查当前真实的 `sanitizeSensitiveText`、默认资源 registry 和统一字典入口。

## 10. 最后大白话

以后页面请求失败，不再每个页面自己拼提示。页面只管“请求什么”和“成功后怎么用数据”；失败怎么翻译、requestId 怎么带、loading 怎么锁，统一交给 `useVtRequest`。
