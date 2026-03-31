# Sprint 93

## 目标

- 解释为什么当前国内资讯仍然缺少中国大陆新闻
- 将 `daily-digest` 的 Brave 搜索时间窗口改为滚动过去 3 天
- 让 WebUI、默认配置和本地持久化配置使用一致口径

## 完成项

- [x] 支持 Brave `freshness` 的滚动 3 天别名
- [x] 默认 `daily-digest` 搜索时间窗口改为过去 3 天
- [x] 更新本地 `data/skills/daily-digest/config.json`
- [x] 更新 WebUI 提示与相关文档
- [x] 补充测试并完成验证

## 设计说明

- 当前本地持久化配置仍是 `freshness=pd`，也就是只搜过去 24 小时，这会让中国大陆候选池过窄
- Brave 官方新闻接口支持自定义日期区间 `YYYY-MM-DDtoYYYY-MM-DD`
- 为避免每天手改日期，新增滚动别名 `p3d`，运行时自动展开为“今天往前 3 个自然日”的日期区间

## 验证

- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts tests/web/server.test.ts`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`

## 结果

- 当前生效的本地搜索窗口已从 `pd` 的 24 小时改为滚动过去 3 天
- 默认配置、WebUI 提示和文档说明已统一为 `p3d`
- `p3d` 会在运行时自动展开成 Brave 官方日期区间，例如 2026-03-31 会展开为 `2026-03-29to2026-03-31`
