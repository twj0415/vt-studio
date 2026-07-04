# OPT-004 视频模型 mode 与提示词模板映射闭环

状态：已完成

## 0. 快速理解

一句话：设置页绑定的视频模型模板，现在真实生成视频提示词时会按 `模型 + mode` 读出来用。

为什么现在做：之前只是页面能绑定模板，生产工作台生成视频提示词还是占位成功，业务没有闭环。

做完后有什么用：同一个视频模型的 `text / singleImage / 首尾帧 / 多参考` 可以用不同模板生成不同风格的提示词，生成结果会写回轨道。

这一步不碰什么：不做 ComfyUI workflow，不做 adapter 沙盒安全，不做模型请求取消重试，不做 prompt 引用编辑器 UI。

## 1. 本次做什么

1. 在 `settings/model-prompt.ts` 增加 `resolveModelPromptTemplate()`。
2. 查模板顺序固定为：
   - 精确匹配：`connection_id + model_name + model_type + model_mode`
   - 默认匹配：同模型 `model_mode=''`
   - 默认模板：按模型名和 mode 匹配 Seedance、Wan、首尾帧、多参数模板
   - 最后兜底：`prompts.type=videoPromptGeneration`
3. 生产视频提示词生成不再占位成功。
4. 真实调用 `universalAi` 文本模型。
5. 输入内容包含：
   - 项目信息
   - 剧本节选
   - 视频模型
   - 视频 mode
   - 轨道时长
   - 分镜 `<storyboardItem>`
   - 关联资产摘要
   - 项目视觉手册里的 `storyboardVideo` 风格要求
6. 成功写回 `production_video_tracks.prompt/status/error_reason`。
7. 失败写 `error_reason`，任务中心标失败。

## 2. 关键决定

1. 继续用 `universalAi` 生成视频提示词。
   - 原因：参考项目也是用文本模型生成视频 prompt，不直接用视频模型写 prompt。
2. `model_prompt_mappings.model_mode=''` 继续保留为模型级默认模板。
   - 原因：用户不想每个 mode 都配时，可以给整个模型一个默认模板。
3. 默认模板自动匹配只做清晰规则。
   - Seedance 2.0 -> `Seedance 2.0 多参数模式`
   - Wan 2.6 -> `Wan 2.6 单图首帧模式`
   - 多参考 mode -> `通用多参数模式`
   - 首尾帧 mode -> `通用首尾帧模式`
4. 如果没有模型专用模板，就回退 `videoPromptGeneration`。
   - 原因：不能因为用户没绑定模板就让视频提示词生成完全不可用。
5. 不把图片二进制传给文本模型。
   - 原因：当前 `invokeText` 是文本调用；图片/音频/视频引用编辑器属于后续任务。

## 3. 落地文件

| 文件 | 作用 |
|---|---|
| `src/main/services/settings/model-prompt.ts` | 新增按模型和 mode 解析模板的 helper |
| `src/main/services/production/service.ts` | 视频提示词生成改为真实文本模型调用，并写回轨道 |
| `scripts/verify-opt-004-model-prompt-mode.mjs` | 防止视频提示词生成退回占位成功 |
| `scripts/verify.mjs` | `verify:production` 接入本任务检查 |
| `docs/TODO-优化与缺口.md` | 标记 OPT-004 完成 |
| `docs/03-执行进度.md` | 记录完成位置 |
| `docs/04-对齐验收与偏差记录.md` | 记录对齐结论 |

## 4. 验证结果

```txt
D:\software\nodejs\node.exe scripts\verify-opt-004-model-prompt-mode.mjs
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run verify:production
D:\software\nodejs\pnpm.cmd run verify:docs
D:\software\nodejs\pnpm.cmd run build
```

结果：通过。

## 5. 后续边界

1. `OPT-040/047/048/049` 再做前端请求封装、i18n 和工作台 UI 体验。
2. `F-008-013` 里提到的 prompt 引用编辑器还没做，这属于 UI/交互增强。
3. `OPT-032` 再做模型调用取消、超时、重试。
4. `OPT-052` 再做自定义 adapter 安全边界。
5. `OPT-033` 再做 ComfyUI workflow。

## 6. 最后大白话

以前是“点生成视频提示词，看起来成功了，但其实没生成”。现在是“点生成后，先找这个视频模型和当前 mode 对应的模板，再用文本模型生成真正的视频提示词，成功写进轨道，失败写清原因”。
