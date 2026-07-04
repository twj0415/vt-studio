# OPT-052 自定义 adapter 安全边界

状态：已完成

## 0. 快速理解

一句话：adapter 还是能兼容参考项目的动态供应商，但不能无限跑、不能访问危险协议、不能把密钥和大段响应直接打进日志。

为什么现在做：`OPT-006` 已经把模型调用收口到统一网关，下一步必须把 adapter 运行环境收紧。否则后面图片、视频、ComfyUI 和自定义供应商越多，风险越大。

做完后有什么用：坏 adapter 初始化不会卡死；`file://`、`data:` 这类危险访问会被拦；`pollTask` 不会无限轮询；adapter 日志会截断并脱敏；保存错误 adapter 仍不会覆盖旧的可用 adapter。

这一步不碰什么：不做完整 ComfyUI workflow 节点映射，不做模型调用取消/重试，不做 UI 级 allowlist 配置页，不把现有参考 adapter 一刀切打坏。

## 1. 本次做什么

1. `runVendorCode` 增加安全策略：
   - 初始化超时
   - 单次请求超时
   - 轮询总超时
   - 轮询最大次数
   - 日志最大长度
   - 下载最大体积
   - 可选域名 allowlist
2. VM 不再 `timeout: 0`。
3. 包装 `fetch`：
   - 只允许 `http:` 和 `https:`
   - `file:`、`data:`、`blob:` 等直接拒绝
   - 如果传入 allowlist，只允许 allowlist 里的 host
   - 自动加请求超时
4. 包装 `axios`：
   - 所有请求先走 URL 校验
   - 默认超时
   - 兼容 `axios.get/post/request`
5. 包装 `urlToBase64`：
   - 先校验 URL
   - 检查 `content-length`
   - 下载后检查实际大小
6. 收紧 `pollTask`：
   - timeout 不能超过策略上限
   - interval 不能为 0
   - 最大次数不能无限
7. adapter 日志：
   - 统一走 main logger
   - 字符串脱敏 key/token/authorization/password/secret
   - 超长内容截断
8. 增加专项 verify：
   - 无限循环初始化会超时
   - `file://` 请求会被拦截
   - allowlist 外域名会被拦截
   - pollTask 超过次数会结束
   - renderer 不接触 adapter 执行环境

## 2. 关键决定

1. 第一版不默认强制所有 adapter 只能访问 Base URL host。
   - 原因：参考项目供应商经常返回临时文件域名、对象存储域名、查询域名；粗暴锁死会导致真实供应商不可用。
2. allowlist 能力先落到底层策略，后续由高级 adapter UI 暴露。
   - 原因：先把安全能力做进 runner，UI 配置可以在开发者配置或 adapter 高级配置里继续扩展。
3. 本任务不移除 `fetch/axios`。
   - 原因：参考项目 adapter 大量依赖它们；正确做法是包装和限制，而不是直接删能力。
4. adapter 仍不暴露 `fs/process/require/child_process`。
   - 原因：当前沙盒已经没有这些对象，本任务保持并验证。

## 3. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| 初始化不能卡死 | VM timeout 改成策略值，默认非 0 |
| 危险协议拦截 | `fetch/axios/urlToBase64` 共用 URL 校验，只允许 http/https |
| 可选域名限制 | runner policy 支持 `allowedHosts`，命中时按 host 精确匹配 |
| 请求超时 | safe fetch 用 AbortController；safe axios 默认 timeout |
| 轮询收口 | `pollTask` clamp timeout/interval，并增加 maxAttempts |
| 日志收口 | adapter logger 对字符串脱敏、截断，再写 main logger detail |
| 错误不泄露 | runner 抛 `VtError`，detail 留日志，页面只拿统一错误 |
| 验证覆盖 | 新增 `verify-opt-052-adapter-security.mjs` 并接入 `verify:core` |

## 4. 验收标准

1. `while(true)` 这类同步初始化不会无限卡死。
2. adapter 内部访问 `file://` 会失败。
3. 配置 allowlist 后，访问非 allowlist 域名会失败。
4. `pollTask` 不能无限等待。
5. adapter 日志不会完整输出明显 key/token/authorization/password/secret。
6. 现有默认 adapter 能继续通过静态验证，不因为安全包装被误删能力。
7. `OPT-033` ComfyUI workflow、`OPT-032` 取消超时重试不在本任务伪装完成。

## 5. 验证方式

```txt
D:\software\nodejs\node.exe scripts\verify-opt-052-adapter-security.mjs
D:\software\nodejs\pnpm.cmd run verify:core
D:\software\nodejs\pnpm.cmd run verify:settings
D:\software\nodejs\pnpm.cmd run verify:production
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run verify:docs
D:\software\nodejs\pnpm.cmd run build
```

## 6. 确认点

本任务没有需要停下来的确认点。专业建议是：

1. 先完成 runner 安全底座。
2. 不在当前任务强制所有真实供应商走严格 host allowlist。
3. 后续 `OPT-015/OPT-052` 的 UI 增强再把 allowlist 做成高级配置。

## 7. 执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/main/services/model/vendor-runner.ts`、`src/main/services/model/vendor-service.ts`、`src/main/services/model/media.ts`、`src/shared/types/vendor.ts`、`src/renderer/src/features/settings/components/VendorConfig.vue`、`scripts/verify-opt-052-adapter-security.mjs`、`scripts/verify-opt-006-model-gateway.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-052-adapter-security.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:production` 通过。

## 8. 最后大白话

adapter 可以继续灵活，但不能裸奔。危险协议、无限等待、超长日志、明显密钥泄露先拦住；更细的“这个供应商只能访问哪些域名”已经留好底层能力，后面再做成 UI 配置。
