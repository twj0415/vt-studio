---
name: video_dialogue_extract
description: 从视频分镜提示词中提取结构化台词、旁白与音效信息，用于生成配音和音频绑定数据。
---

# 视频台词和音效提取

## 要做什么

从分镜描述或视频提示词中提取对白、内心独白、画外音和音效。

## 输出字段

| 字段 | 说明 |
| --- | --- |
| shotId | 分镜编号 |
| speaker | 说话角色，无明确角色则为空 |
| type | dialogue / inner_monologue / voiceover / sfx |
| content | 台词或音效内容 |
| performance | 表演指导，如语气、情绪、停顿 |
| lipSync | 是否需要口型 |

## 约束

1. 台词必须保持原文，不翻译、不改写。
2. 内心独白和画外音不要求口型。
3. 音效单独标记为 `sfx`。
