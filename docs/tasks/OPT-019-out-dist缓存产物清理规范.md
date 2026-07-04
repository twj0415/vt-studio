# OPT-019 out、dist、缓存产物清理规范

状态：已完成  
优先级：P2  
处理方式：工程整理，避开 `OPT-037` 项目导入导出业务代码

## 0. 快速理解

```txt
一句话：把源码、构建产物、依赖缓存、runtime 数据的边界写清楚，并用 verify 防止根目录再次混入垃圾文件。
为什么现在做：另一个线程正在做 OPT-037，业务代码容易冲突；本项只做工程边界，冲突面最小。
做完后有什么用：用户和后续 AI 能判断哪些目录可删、哪些不能提交、哪些必须放到 userData。
```

## 1. 问题

```txt
项目根目录有构建产物、依赖缓存和运行数据目录；如果没有明确规则，后续容易把 out/dist/cache/runtime 当源码处理。
本轮还发现根目录有两枚 0 字节命令片段文件：
1. l.includes('OPT-050
2. l.includes('settings
这类文件不是业务资料，也不是可复现配置，应该清理并加专项检查。
```

## 2. 范围

```txt
1. 整理 .gitignore 分类。
2. 在 00-项目规范补源码、构建产物、依赖缓存、runtime 数据边界。
3. 清理本轮发现的 0 字节命令片段文件。
4. 新增 verify-opt-019-build-artifacts.mjs：
   - 检查 .gitignore 必要规则。
   - 检查 out/node_modules/.runtime 等产物目录未被 git 追踪。
   - 检查根目录没有命令片段残留文件。
   - 检查规范文档包含可删除边界说明。
5. 接入 verify:docs。
```

## 3. 不做范围

```txt
1. 不删除 out、node_modules、.pnpm-store、.node-gyp、.npm-cache。
2. 不碰项目导入导出、项目页、preload、IPC、i18n。
3. 不清理用户真实资料。
4. 不引入新依赖。
```

## 4. 验收标准

```txt
1. .gitignore 按依赖、构建产物、runtime、诊断输出、OS 文件分类。
2. 00-项目规范能说明哪些目录可删除、哪些不能提交、哪些不能放项目源码目录。
3. 根目录不再有本轮发现的 0 字节命令片段文件。
4. 专项 verify 通过。
5. verify:docs 通过。
```

## 5. 执行后记录

```txt
已完成：
1. .gitignore 已按分类重整，并补 .vite、.electron-vite、coverage、data、temp、cache、debug log 等产物/缓存规则。
2. 00-项目规范已补源码、构建产物、依赖缓存、runtime 数据边界和清理规则。
3. 已删除根目录 0 字节命令片段文件。
4. 已新增 scripts/verify-opt-019-build-artifacts.mjs 并接入 verify:docs。

验证结果：
1. D:\software\nodejs\node.exe scripts\verify-opt-019-build-artifacts.mjs：通过。
2. D:\software\nodejs\pnpm.cmd run verify:docs：通过。
```
