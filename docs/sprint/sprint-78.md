# Sprint 78

## 目标

- 让 `daily-digest` 只检索当前 24 小时内的新闻
- 为 Brave News Search 请求补充明确的时效筛选参数
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] `daily-digest` 的 Brave News Search 请求增加最近 24 小时筛选
- [x] 更新运行日志与说明文案，明确当前仅搜索过去 24 小时新闻
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 使用 Brave Search API `news/search` 的 `freshness=pd` 参数，将搜索范围限制在过去 24 小时
- 该限制作为 `daily-digest` 默认行为，无需用户额外配置
- 后续仍保留现有的自媒体过滤、来源优先级和发布日期归一化链路

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 现在会通过 Brave News Search 的 `freshness=pd` 参数，仅检索过去 24 小时内的新闻候选
- 搜索日志已改成“过去 24 小时”口径，便于在 WebUI / Cron 日志里确认当前抓取范围
- 新增 URL 构造测试，锁住 `freshness=pd`、`count` 上限与基础查询参数
- `manual / prd / tech / sprint README / SKILL` 已同步更新
