# OPT-053 模型连接和 vendor 双写一致性

状态：已完成

## 0. 快速理解

一句话：普通“模型服务”保存的是用户配置，`model_vendors` 里对应的 `conn_*` 是底层运行投影，两边现在会同步、能诊断、能修复，不让它们长期漂移。

为什么现在做：后面文本、图片、视频、TTS 都要从模型连接走。如果设置页有连接但底层 vendor 没有，项目模型选择、Agent、生成任务会随机失败。

做完后有什么用：保存/编辑模型服务后，底层调用立刻能找到 vendor；误删或改坏 `conn_*` 投影后，诊断能发现并补回；删除连接前会拦住默认模型、Agent、项目和 running 任务引用。

这一步不碰什么：不重构多协议请求入口，不做 adapter 沙盒安全，不做模型请求取消/超时/重试，不把 `modelConnections.v1` 改成新表。

## 1. 本次做什么

1. 新增连接投影识别规则：
   - `conn_*` 是普通模型服务生成的运行投影。
   - 投影通过 `__adapterVendorId` 记录实际复用哪个高级 adapter。
   - 投影通过 `__connectionName` 记录普通连接名称。
2. 普通模型连接保存/编辑时，同步写入 `model_vendors`：
   - `apiKey`
   - `baseUrl`
   - `endpoint`
   - `__adapterVendorId`
   - `__connectionName`
   - `models`
   - `enabled`
3. 读取普通连接时自动补齐缺失或陈旧投影，避免项目页因为底层投影缺失崩掉。
4. 新增一致性诊断：
   - 连接有、vendor 投影缺。
   - 连接有、vendor 投影字段不一致。
   - `conn_*` vendor 有、普通连接缺。
   - 默认模型绑定失效。
   - Agent 模型引用失效。
   - 项目 image/video 模型引用失效。
5. 诊断修复策略：
   - 缺投影：从连接补写。
   - 陈旧投影：用连接覆盖投影。
   - 孤儿投影：禁用，不直接删除。
   - 失效默认绑定：清空。
   - Agent/项目失效引用：只报告，不自动改用户业务数据。
6. 删除普通连接前检查引用：
   - 默认能力绑定。
   - Agent 高级覆盖。
   - 项目 image/video 模型。
   - running 任务的 `model_name`。
7. 删除普通连接成功后，同步删除对应 `model_vendors` 投影。
8. 高级 vendor 页显示 `conn_*` 投影，但标记“模型服务生成”，并禁止直接编辑参数、模型、adapter、启用状态和删除。

## 2. 关键决定

1. `modelConnections.v1` 继续作为普通用户模型服务的主数据。
   - 原因：当前设置页、项目模型、Agent 配置都已经围绕这个结构完成。
2. `model_vendors` 里的 `conn_*` 只作为运行投影。
   - 原因：底层模型调用仍然统一从 vendor runtime 走，不能让页面直接碰 SDK 或 adapter。
3. 读取连接时允许自动修复缺失/陈旧投影。
   - 原因：项目页、模型选择、测试入口都依赖投影；自动补齐比让页面炸掉更合理。
4. 孤儿 `conn_*` 诊断修复只禁用，不直接删除。
   - 原因：诊断入口未来可能给开发者用，禁用比静默删除更稳。
5. 项目和 Agent 的失效引用不自动清。
   - 原因：这是用户业务配置，自动清会让用户不知道哪里被改了；只能提示去对应页面修。

## 3. 落地文件

| 文件 | 作用 |
|---|---|
| `src/main/services/model/connection-projection.ts` | 统一 `conn_*` 投影识别和隐藏字段常量 |
| `src/main/services/settings/model-config.ts` | 普通连接和 vendor 投影同步、诊断、引用阻断 |
| `src/main/services/model/vendor-service.ts` | vendor runtime 读取投影隐藏字段时使用统一常量 |
| `src/main/services/settings/vendor.ts` | 高级 vendor 服务禁止直接修改 `conn_*` 投影 |
| `src/shared/types/vendor.ts` | vendor 列表增加 `managedBy/readOnly` |
| `src/renderer/src/features/settings/components/VendorConfig.vue` | 高级 vendor 页只读展示模型服务投影 |
| `scripts/verify-opt-053-model-connection-projection.mjs` | 专项验证 |
| `scripts/verify.mjs` | `verify:settings` 接入本任务 |

## 4. 验证结果

```txt
D:\software\nodejs\node.exe scripts\verify-opt-053-model-connection-projection.mjs
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run verify:settings
D:\software\nodejs\pnpm.cmd run verify:docs
D:\software\nodejs\pnpm.cmd run build
```

结果：通过。

## 5. 后续边界

1. `OPT-006` 再做 SDK、OpenAI compatible、自定义 adapter 的统一请求入口。
2. `OPT-052` 再做自定义 adapter 沙盒、allowlist、日志脱敏和超时边界。
3. `OPT-032` 再做模型调用取消、超时、重试和请求落盘。
4. 如果后面把普通模型连接迁到独立表，本任务的投影诊断规则仍然保留，只替换主数据读取来源。

## 6. 最后大白话

以后别在高级 vendor 页直接改 `conn_*`。普通人只改“模型服务”，系统会把它同步成底层能跑的 vendor；如果底层投影坏了，诊断会补回来。
