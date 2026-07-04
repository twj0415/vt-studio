# OPT-BATCH-001 工程入口和文档治理

状态：已完成

## 0. 快速理解

一句话：把工程入口、无效文件清理、文档状态同步先收稳，避免后续继续乱。

为什么现在做：后面要连续做 TODO，如果验证入口和文档状态都靠记忆，做得越多越容易对不上。

做完后有什么用：能用固定命令跑分组验证；TODO 已完成项必须带完成记录；03 里的文档引用能被脚本检查。

这一步不碰什么：不改业务功能，不改页面交互，不补默认资源缺文件。

## 1. 覆盖范围

| TODO | 状态 | 结果 |
|---|---|---|
| `OPT-044` `.gitignore` 异常内容清理 | 已完成 | 删除 `.gitignore` 误粘贴规则，并清理根目录 3 个同名空文件 |
| `OPT-043` verify 脚本分组入口和 package scripts 规范 | 已完成 | 新增 `scripts/verify.mjs` 和 package verify scripts，`build` 不再嵌套调用 pnpm |
| `OPT-025` verify 脚本统一入口 | 已完成 | 由 `OPT-043` 覆盖 |
| `OPT-045` docs、tasks、TODO 三套文档状态联动 | 已完成 | 新增 `scripts/verify-doc-status.mjs` 和 `verify:docs` |

## 2. 实现内容

1. `package.json` 增加分组验证入口：
   - `verify`
   - `verify:all`
   - `verify:core`
   - `verify:settings`
   - `verify:project`
   - `verify:content`
   - `verify:assets`
   - `verify:production`
   - `verify:export`
   - `verify:acceptance`
   - `verify:docs`
2. `scripts/verify.mjs` 负责串行执行现有 verify 脚本。
3. `scripts/verify-doc-status.mjs` 负责检查：
   - TODO 推荐顺序里标“已完成”的项，正文必须是 `【√】`。
   - TODO 正文里标 `【√】` 的项必须有完成时间、涉及文件、验证结果。
   - 已完成 TODO 必须有可检查的关联任务 md，或明确关联规则。
   - `docs/03-执行进度.md` 里引用的 `tasks/*.md`、`features/*.md` 必须存在。
4. `scripts/verify-core-011.mjs` 排除 `sharp`、`vm2`，避免 Electron 验证时把原生/运行时依赖错误打进 bundle。
5. `.gitignore` 保留必要忽略项，删除误粘贴规则。
6. 根目录误生成的 `!docs.includes(e)`、`c.url))].sort()`、`m[1]` 已删除。

## 3. 验证结果

```txt
D:\software\nodejs\pnpm.cmd run verify:core
D:\software\nodejs\pnpm.cmd run typecheck
D:\software\nodejs\pnpm.cmd run build
D:\software\nodejs\pnpm.cmd run verify:docs
```

结果：全部通过。

## 4. 注意事项

1. `verify:all` 不包含清理真实数据的脚本。
2. `inspect-p11-real-data.mjs` 和 `cleanup-p11-demo-residuals.mjs` 仍然只能手动按需运行。
3. `verify:core` 中看到的默认资源缺文件警告不归本批次处理，后续放到 `CORE-014/默认资源治理`。
4. 后续每完成一个 TODO，都必须先更新 TODO 完成记录，再跑 `verify:docs`。

## 5. 最后大白话

这次做的是“别再靠脑子记状态”。以后一个 TODO 做完，文档里有没有写完成、有没有写验证、关联的 task 文件在不在，脚本会直接检查出来。
