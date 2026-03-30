# Sprint 75

## 目标

- 修复 `daily-digest-generate` 执行后未在 `./data` 中产生日报文件的问题
- 让 Cron 手动执行在失败时返回明确错误，便于排查
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 复现并定位 `daily-digest-generate` 的落盘异常
- [x] 修复生成链路或输出目录传递问题
- [x] 让 Cron 手动执行失败时返回可见错误
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 优先复用现有 `DailyDigestSkill` 和 `CronScheduler` 执行链路，不新增分叉入口
- 对 skill-only Cron，既要保证输出落盘，也要保证失败不会被静默吞掉
- 保持默认输出目录仍为 `data/skills/daily-digest/`

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- 已复现根因：`extractPageLinks()` 在 Playwright `evaluateAll()` 浏览器上下文内引用了打包后的 `__name` 辅助符号，导致 `daily-digest-generate` 在搜索第一页就报错，中断后没有任何日报文件落盘
- 已改为在浏览器上下文里使用纯内联逻辑提取链接与时间，`daily-digest-generate` 现可正常写入 `data/skills/daily-digest/`
- `CronScheduler.runNow()` 现在会把手动执行时的 skill 异常继续抛给 WebUI，避免“执行失败但接口仍显示成功”的误导
