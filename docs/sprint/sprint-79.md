# Sprint 79

## 目标

- 让 `daily-digest` 生成结果不再展示新闻时间
- 保留内部 `publishedAt` / `date` 数据，避免影响筛选与 JSON 复用
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 去掉 HTML / PNG 生成结果中的新闻时间展示
- [x] 去掉 Markdown 生成结果中的新闻时间展示
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 仅调整展示层，不改动 Brave 返回时间的解析、`publishedAt` 持久化和 `date` 推导
- 新闻条目生成结果保留来源，不再显示“来源 + 时间”
- JSON 仍继续输出 `publishedAt` 与 `date`，便于后续新闻库和自动化链路复用

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm build`

## 结果

- HTML / PNG 条目现在只显示来源，不再显示新闻时间
- Markdown 条目也只显示来源，不再拼接 `publishedAt`
- JSON 仍继续输出 `publishedAt` 与 `date`，不影响新闻库和后续自动化链路
- `daily-digest` 相关测试、构建和类型检查已通过
