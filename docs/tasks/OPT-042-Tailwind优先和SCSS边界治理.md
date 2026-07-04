# OPT-042 Tailwind 优先和 SCSS 边界治理

状态：已完成

## 0. 快速理解

一句话：以后新增 UI 样式优先用 Tailwind，不再把普通页面样式继续塞进全局 `index.scss`。

为什么现在做：`index.scss` 已经很大，继续往里堆页面样式，会让滚动、弹窗层级、局部样式互相影响越来越难查。

做完后有什么用：后续做菜单、设置页、工作台 UI 大改时，有明确边界和校验，不会越改越乱。

这一步不碰什么：不迁移 5800 多行旧 SCSS，不重做页面视觉，不改业务逻辑；页面级 UI 整理放到 `OPT-048/049/050/051`。

## 1. 参考项目怎么做

| 范围 | 结论 |
|---|---|
| Toonflow 前端 | 参考项目主要按页面和组件堆样式，没有给 VT Studio 这种 Electron 桌面端定 Tailwind/SCSS 边界 |
| 当前 VT Studio | 已有 `tailwind.config.ts`、`postcss.config.cjs`、`tokens.scss`、`index.scss`；`index.scss` 包含大量历史页面样式 |
| 当前导入方式 | 只有 `src/renderer/src/main.ts` 导入全局 `index.scss` |

参考项目能借鉴：

1. 页面需要明确滚动层、固定区和内容区，不能让 body 承担业务滚动。
2. 第三方组件样式覆盖要集中处理，不能散在页面逻辑里。

VT Studio 不能照搬：

1. 不能继续按参考项目旧习惯把页面样式都写进一个大文件。
2. 不能为了“统一”一次性迁移所有旧样式，风险太大。
3. 不能绕过主题 token 直接在页面里写一堆临时颜色。

源码未找到：

1. 参考项目里没有找到和 VT Studio 当前规则等价的 Tailwind 优先治理机制。

## 2. 本次做什么

1. 固定样式边界：
   - Tailwind 负责普通页面布局、间距、字号、边框、颜色语义、hover/focus/disabled、响应式。
   - SCSS 只负责 Tailwind 不适合的全局能力和第三方覆盖。
2. 给 `index.scss` 顶部加边界说明，避免后续继续当页面样式垃圾桶。
3. 新增专项 verify：
   - 检查 Tailwind/PostCSS 配置存在。
   - 检查 Tailwind content 覆盖 renderer。
   - 检查 Tailwind 颜色走 VT Studio 语义 token。
   - 检查全局 SCSS 只从 `main.ts` 入口导入。
   - 检查项目规范、task 模板、TODO 和本任务文档都写入边界规则。
4. 把专项 verify 接进 `verify:docs`。
5. 回填 TODO 和执行进度。

## 3. 要做什么功能：怎么做

| 要做什么 | 怎么做 |
|---|---|
| Tailwind 配置固定 | `tailwind.config.ts` 保持 renderer content 扫描，颜色、线条、文本、品牌色、状态色继续消费 CSS variables |
| PostCSS 配置固定 | `postcss.config.cjs` 必须包含 `tailwindcss` 和 `autoprefixer` |
| 全局样式入口固定 | `src/renderer/src/main.ts` 是唯一导入 `./styles/index.scss` 的地方 |
| SCSS 边界固定 | `index.scss` 顶部写清允许范围：Tailwind 指令、reset、主题 token、Electron 根布局、滚动/z-index、TDesign/第三方覆盖、滚动条/keyframes/复杂伪元素、少量公共 class |
| 文档规则固定 | `00-项目规范.md`、任务模板、TODO、OPT-042 task 都要能搜到 Tailwind 优先和 SCSS 允许范围 |
| 防回退校验 | 新增 `scripts/verify-opt-042-style-boundary.mjs`，失败时直接指出缺哪个边界 |

## 4. 数据和状态

字段：无。

接口/能力：无。

数据读写：无。

任务状态：无业务任务状态；只更新文档完成状态。

轮询/Socket：无。

模型调用：无。

删除影响：无。

## 5. 不能漏的收口点

依赖谁：依赖现有 Tailwind、PostCSS、主题 token 和全局样式入口。

被谁依赖：`OPT-048` 全局菜单和页面布局治理、`OPT-049` 全页面交互 UI 整改、`OPT-050` 工作台导航和导出体验治理、`OPT-051` 项目流程总览。

服务契约：无服务契约。

数据契约：无数据库和本地文件数据契约。

状态契约：页面滚动、弹窗层级、toast/dropdown 层级后续按 UI task 验收；本任务只固定规则。

文件契约：全局样式只从 `main.ts` 导入；新增普通页面样式不再追加到 `index.scss`。

模型契约：无。

任务契约：无。

异常契约：verify 失败时说明缺少 Tailwind/PostCSS/文档规则/入口边界。

回滚契约：本任务不写业务数据，不涉及回滚。

参考项目缺陷：参考项目没有清晰的 Tailwind/SCSS 边界，不能照搬“页面样式继续堆全局”的做法。

VT Studio 差异：VT Studio 是 Electron 桌面端，必须优先保证滚动层、固定栏、弹窗层级、主题 token 可控。

## 6. VT Studio 怎么落

能力名：无。

调用链：无业务调用链。

需要新增：

1. `scripts/verify-opt-042-style-boundary.mjs`
2. 本任务文档。

需要修改：

1. `src/renderer/src/styles/index.scss`
2. `scripts/verify.mjs`
3. `docs/TODO-优化与缺口.md`
4. `docs/03-执行进度.md`

样式方案：本任务不改页面样式；只固定规则。后续新增页面普通样式优先 Tailwind，SCSS 只用于允许场景。

多语言方案：本任务无用户可见 UI 文案。

UI/UX 方案：本任务不做视觉改造；后续涉及页面结构、视觉层级、交互、响应式、可访问性时，必须使用 `ui-ux-pro-max` 检查。

## 7. 偏差

和 Toonflow 不同的地方：VT Studio 明确要求 Tailwind 优先和 SCSS 边界，参考项目没有同等治理机制。

原因：VT Studio 后续页面更多、桌面端滚动和弹窗层级更敏感，继续堆全局样式会影响稳定性。

是否写入 04：不需要；这是工程治理差异，不改变参考项目业务语义。

## 8. 验收标准

1. Tailwind 配置存在且覆盖 renderer。
2. PostCSS 配置存在且包含 Tailwind/autoprefixer。
3. Tailwind 颜色继续消费 `--vt-*` 语义 token。
4. `index.scss` 顶部写清 SCSS 允许范围。
5. 全局 `index.scss` 只有 `main.ts` 导入。
6. 项目规范、task 模板、TODO 和本 task 都写清 Tailwind/SCSS 边界。
7. 专项 verify 通过。
8. `verify:docs` 通过。
9. `typecheck` 通过。

## 9. 验证方式

```txt
D:\software\nodejs\node.exe scripts\verify-opt-042-style-boundary.mjs
D:\software\nodejs\pnpm.cmd run verify:docs
D:\software\nodejs\pnpm.cmd run typecheck
```

## 10. 确认点

本任务没有新的产品确认点。采用已经确认过的规则：

1. 能用 Tailwind 就不要写普通页面 SCSS。
2. SCSS 只保留全局、主题、穿透、滚动、z-index、动画/伪元素、公共 class 等必要场景。
3. 旧 SCSS 不一次性迁移，后续碰到页面再逐步收敛。

## 11. 执行记录

- 完成时间：2026-07-03
- 涉及文件：`src/renderer/src/styles/index.scss`、`scripts/verify-opt-042-style-boundary.mjs`、`scripts/verify.mjs`、`docs/tasks/OPT-042-Tailwind优先和SCSS边界治理.md`、`docs/TODO-优化与缺口.md`、`docs/03-执行进度.md`
- 验证结果：`D:\software\nodejs\node.exe scripts\verify-opt-042-style-boundary.mjs`、`D:\software\nodejs\pnpm.cmd run verify:docs`、`D:\software\nodejs\pnpm.cmd run typecheck` 通过。

## 12. 最后大白话

这一步不是美化页面，而是先把样式纪律立住：以后新页面、新组件能用 Tailwind 就用 Tailwind，不能再随手往 `index.scss` 里堆普通页面样式。老的 SCSS 暂时不大搬家，等后面真正改某个页面时再顺手收敛，这样速度和稳定性都更合理。
