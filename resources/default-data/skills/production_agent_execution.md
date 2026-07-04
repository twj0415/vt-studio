---
name: production_agent_execution
description: 生产 Agent 执行层总索引，负责把导演规划、衍生资产、分镜表、分镜面板和分镜图生成等子执行技能串起来。
---

# 生产 Agent 执行层

这是生产 Agent 的执行层入口索引。

参考项目真实执行时按生产阶段拆分到以下文件：

- `production_execution_director_plan.md`：生成导演规划。
- `production_execution_derive_assets.md`：分析衍生资产。
- `production_execution_generate_assets.md`：生成衍生资产图片。
- `production_execution_storyboard_table.md`：生成分镜表。
- `production_execution_storyboard_panel.md`：写入分镜面板。
- `production_execution_storyboard_gen.md`：生成分镜图片。

## 使用规则

1. 决策层只派发任务，不直接读取或改写流程数据。
2. 执行层必须按阶段读取 `script`、`assets`、`scriptPlan`、`storyboardTable` 等上下文。
3. 阶段输出必须写回对应流程节点，不能覆盖其他节点。
4. 图片和视频生成类任务必须进入任务队列，不能阻塞主流程。
5. 执行失败必须返回明确原因，由决策层决定是否重试或终止。

## 阶段映射

| 生产阶段 | 执行技能 |
| --- | --- |
| 导演规划 | `production_execution_director_plan.md` |
| 衍生资产分析 | `production_execution_derive_assets.md` |
| 衍生资产生成 | `production_execution_generate_assets.md` |
| 分镜表 | `production_execution_storyboard_table.md` |
| 分镜面板 | `production_execution_storyboard_panel.md` |
| 分镜图生成 | `production_execution_storyboard_gen.md` |
