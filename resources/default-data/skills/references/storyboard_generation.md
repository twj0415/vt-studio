---
name: storyboard_generation
description: 根据剧本和资产列表生成结构化分镜面板，涵盖分镜拆分原则、字段填写规范和工具调用流程。
---

# 分镜生成

## 要做什么

把剧本转成可用于图片和视频生成的分镜数据。

## 分镜字段

| 字段 | 说明 |
| --- | --- |
| shotId | 分镜编号 |
| duration | 推荐时长 |
| shotSize | 景别 |
| cameraMove | 运镜 |
| visualDesc | 画面描述 |
| characterAction | 角色动作 |
| emotion | 情绪 |
| lighting | 光影氛围 |
| dialogue | 台词 |
| sound | 音效 |
| associateAssetsIds | 关联资产 |
| prompt | 绘图提示词 |

## 约束

1. 分镜必须来自剧本，不额外扩写剧情。
2. 每条分镜都要能独立生成首帧图。
3. 关联资产只能使用资产库中已有资产。
