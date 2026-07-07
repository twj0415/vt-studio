---
name: script_agent_execution
description: 改编助手执行层总索引，负责把故事大纲、改编方案、成稿生成三个执行技能串起来。
---

# 改编助手执行层

这是改编助手的执行层入口索引。

参考项目真实执行时按阶段拆分到以下文件：

- `script_execution_skeleton.md`：生成故事大纲。
- `script_execution_adaptation.md`：生成改编方案。
- `script_execution_script.md`：生成待确认成稿。

## 使用规则

1. 决策层不得自己写执行结果，必须把任务派发给对应子执行技能。
2. 执行层必须读取当前项目的原文事件、计划数据和已保存产物。
3. 每个阶段只写入自己负责的数据，不跨阶段覆盖其他产物。
4. 输出格式必须服从对应子技能文件，不允许临时改格式。
5. 执行失败必须返回明确原因，由决策层决定是否重试或终止。

## 阶段映射

| 用户目标 | 执行技能 |
| --- | --- |
| 故事大纲、分集、三幕结构 | `script_execution_skeleton.md` |
| 改编方案、删减、世界观呈现 | `script_execution_adaptation.md` |
| 成稿编写、分镜脚本、对白 | `script_execution_script.md` |
