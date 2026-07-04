# OPT-033 ComfyUI workflow 规范

状态：已完成

## 0. 快速理解

一句话：ComfyUI 不是只填一个 URL，它必须有 workflow JSON、节点映射、队列轮询和输出读取规则；本任务把这些收口到模型层。

为什么现在做：后面资产生图、分镜生图、图片工作流都会用图片模型。如果 ComfyUI 没先定规范，页面会到处手写节点 ID，后面一定乱。

做完后有什么用：用户在模型服务里配置“本地工作流”，填 ComfyUI Endpoint 和 Workflow Manifest。图片生成时系统会把 prompt、尺寸、参考图写进指定节点，提交到 ComfyUI，轮询结果，并把输出图片读回来。

这一步不碰什么：不做视频 workflow，不做 ComfyUI 节点可视化编辑器，不做 workflow 文件库，不做默认 workflow 资源包，不改生产画布交互。

## 1. 参考项目怎么做

已重新搜索参考项目：

| 范围 | 结论 |
|---|---|
| `Toonflow-web/src` | 只找到 `providersLogo.ts` 里有 `comfyui` 图标和 provider 匹配规则 |
| `Toonflow-app/src` | 没找到 ComfyUI `/prompt`、`/history`、`/view`、workflow queue 实现 |
| `Toonflow-app/data/vendor` | 默认供应商有 openai、atlascloud、klingai、vidu、minimax 等，没有 ComfyUI 默认 adapter |
| `Toonflow-app/src/utils/ai.ts` | 图片/视频调用统一走动态 vendor 的 `imageRequest/videoRequest`，返回 URL 时转 base64 |

参考项目已确认：

1. Toonflow 的专业点是“供应商动态脚本 + `u.Ai.Image/Video` 统一调用”，不是内置 ComfyUI workflow。
2. 参考项目没有完整 ComfyUI workflow；ComfyUI 在参考项目前端只是 provider logo 识别，不是完整可用能力。
3. 图片测试语义是：调用图片模型 -> 保存测试图片 -> 返回可访问 URL。

参考项目不能照搬：

1. 不能只把 ComfyUI 当普通 adapter 名字，因为 workflow 节点映射是 ComfyUI 独有的核心配置。
2. 不能把 ComfyUI 写到 renderer；Endpoint、workflow、参考图、输出读取都必须在 main。
3. 不能假装支持视频 workflow；参考项目也没有这条闭环。

## 2. 本次做什么

1. 新增共享 manifest 类型：
   - `COMFYUI_WORKFLOW_SCHEMA = vt.comfyui.workflow.v1`
   - `ComfyUiWorkflowManifest`
   - `ComfyUiWorkflowValidationResult`
2. 新增 main 侧 ComfyUI helper：
   - 解析 manifest
   - 校验节点映射
   - 自动识别简单原生 workflow
   - 上传参考图
   - 提交 `/prompt`
   - 轮询 `/history/{prompt_id}`
   - 读取 `/view`
3. 接入内置 `comfyui` 供应商：
   - `workflowManifest` 变成必填输入
   - `imageRequest` 调用 ComfyUI workflow helper
   - `videoRequest` 仍不实现
4. 接入普通模型服务：
   - `ApiConnection` 增加 `workflowManifest`
   - 本地工作流连接保存时校验 manifest
   - 投影到 `model_vendors` 时同步 `workflowManifest`
   - manifest 无效时连接状态为 incomplete
5. 接入设置页：
   - 本地工作流显示 `ComfyUI Endpoint`
   - 显示 `Workflow Manifest` 文本框
   - 缺 Endpoint 或缺 manifest 时不允许保存
6. 新增专项 verify，并加入 `verify:core`。

## 3. Manifest 格式

VT Studio 推荐格式：

```json
{
  "schema": "vt.comfyui.workflow.v1",
  "name": "SDXL text to image",
  "workflow": {
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": { "text": "", "clip": ["4", 1] }
    },
    "9": {
      "class_type": "SaveImage",
      "inputs": { "filename_prefix": "vt-studio", "images": ["8", 0] }
    }
  },
  "inputs": {
    "prompt": { "nodeId": "6", "input": "text" },
    "width": { "nodeId": "5", "input": "width" },
    "height": { "nodeId": "5", "input": "height" },
    "seed": { "nodeId": "3", "input": "seed" },
    "referenceImages": [
      { "index": 0, "nodeId": "10", "input": "image" }
    ]
  },
  "outputs": {
    "images": [{ "nodeId": "9" }]
  },
  "options": {
    "pollIntervalMs": 1500,
    "timeoutMs": 600000
  }
}
```

说明：

1. `workflow` 是原生 ComfyUI workflow。
2. `inputs.prompt` 必须有。
3. `outputs.images` 必须至少有一个。
4. `referenceImages` 可选；用了图生图或多参考图才需要。
5. `width/height/seed/batchSize` 都是可选；没有配置就不写入。
6. 也允许直接粘贴原生 workflow，但只有能自动识别 prompt 和 SaveImage/PreviewImage 输出时才通过。

## 4. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| 校验 manifest | `parseComfyUiWorkflowManifest()` 解析 JSON，检查 `inputs.prompt`、`outputs.images`、节点是否存在 |
| 识别原生 workflow | 没有 schema 时扫描第一个带 `inputs.text` 的节点和 SaveImage/PreviewImage 输出节点 |
| 写入 prompt | 生成前把用户 prompt 写入 manifest 指定节点 |
| 写入尺寸 | 按 `1K/2K/4K + aspectRatio` 算 width/height，再写入配置节点 |
| 写入 seed | 如果 manifest 配了 seed 节点，每次生成写随机 seed |
| 上传参考图 | 参考图先转 Buffer，经 `/upload/image` 上传，返回文件名写进 reference image 节点 |
| 提交任务 | POST `/prompt`，读取 `prompt_id` |
| 轮询任务 | GET `/history/{prompt_id}`，按 manifest 输出节点找 `images` |
| 读取输出 | GET `/view?filename&subfolder&type`，转成 data URL 返回给模型层 |
| 接入任务中心 | 不单独写任务逻辑，继续走 `generateImageByModel` 的 `runWithTask` |
| 接入测试 | 模型服务测试图片模型时走同一条 ComfyUI 图片链路 |
| 明确不做视频 | `comfyui` 内置模型只有 image；视频 workflow 以后另开任务 |

## 5. 文件改动

| 文件 | 作用 |
|---|---|
| `src/shared/types/comfyui-workflow.ts` | 共享 manifest 类型 |
| `src/main/services/model/comfyui-workflow.ts` | ComfyUI manifest、队列、history、输出读取 helper |
| `src/main/services/model/builtin-vendors.ts` | 内置 comfyui 图片请求接入 workflow helper |
| `src/shared/types/model-config.ts` | 模型连接增加 `workflowManifest` |
| `src/main/services/settings/model-config.ts` | 本地工作流保存、状态、投影同步 manifest |
| `src/renderer/src/features/settings/components/ModelServiceConfig.vue` | 本地工作流表单显示 Endpoint 和 Workflow Manifest |
| `src/renderer/src/styles/index.scss` | manifest 文本框等宽字体 |
| `scripts/verify-opt-033-comfyui-workflow.mjs` | 专项验证 |
| `scripts/verify.mjs` | 接入 `verify:core` |

## 6. 和 Toonflow 不同的地方

1. Toonflow 没有完整 ComfyUI workflow 实现；VT Studio 这是增强。
2. Toonflow 主要靠动态 vendor script；VT Studio 保留动态 adapter，同时给 ComfyUI 单独加 manifest 规范。
3. VT Studio 不让 renderer 碰 ComfyUI 请求、workflow 执行、参考图上传。
4. VT Studio 第一版只把 ComfyUI 作为图片 workflow 能力，不把视频 workflow 写成占位成功。

偏差记录：新增 `D-BASE-031`。

## 7. 验收标准

1. 本地工作流连接缺 Endpoint 或缺 manifest 时不是 ready。
2. manifest 节点不存在时能明确提示哪个节点映射失效。
3. 图片测试能走 `executeComfyUiImageWorkflow()`。
4. 生成会调用 `/upload/image`、`/prompt`、`/history/{prompt_id}`、`/view`。
5. 参考图数量超过 manifest 节点数量时会失败。
6. ComfyUI 超时返回 `MODEL_TIMEOUT`。
7. renderer 不直接请求 ComfyUI，不直接处理本地文件。
8. 视频 workflow 没有被标为完成。

## 8. 验证方式

```txt
D:\software\nodejs\node.exe scripts\verify-opt-033-comfyui-workflow.mjs
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run verify:core
D:\software\nodejs\pnpm.cmd run verify:settings
D:\software\nodejs\pnpm.cmd run verify:docs
D:\software\nodejs\pnpm.cmd run build
```

## 9. 确认点

本任务没有需要停下来的确认点。采用以下口径：

1. 第一版只支持图片 workflow。
2. 视频 workflow 后续单独做，不伪装已支持。
3. manifest 存在模型连接配置中，后续如做 workflow 文件库，再迁移到受控资源目录。
4. ComfyUI Endpoint 只允许 http/https。

## 10. 执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/shared/types/comfyui-workflow.ts`、`src/main/services/model/comfyui-workflow.ts`、`src/main/services/model/builtin-vendors.ts`、`src/main/services/settings/model-config.ts`、`src/shared/types/model-config.ts`、`src/renderer/src/features/settings/components/ModelServiceConfig.vue`、`src/renderer/src/styles/index.scss`、`scripts/verify-opt-033-comfyui-workflow.mjs`、`scripts/verify.mjs`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-033-comfyui-workflow.mjs`、`D:\software\nodejs\pnpm.cmd run typecheck`、`D:\software\nodejs\pnpm.cmd run verify:core`、`D:\software\nodejs\pnpm.cmd run verify:settings`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run build` 通过。

## 11. 最后大白话

以后 ComfyUI 不再是“填个地址试试看”。要跑哪个 workflow、prompt 写哪个节点、参考图写哪个节点、输出从哪个节点拿，都必须写在 manifest 里。页面只负责让用户配置，真正请求 ComfyUI 的事全部在 main 模型层完成。
