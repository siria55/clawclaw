# Sprint 80

## 目标

- 将 `daily-digest` 的 Brave 搜索时效过滤从“过去 24 小时”调整为“过去一周”
- 同步更新运行日志、测试和相关文档说明
- 保持现有来源过滤、排序和 JSON 输出链路不变

## 完成项

- [x] 将 Brave News Search 的 `freshness` 参数从 `pd` 调整为 `pw`
- [x] 更新运行日志与说明文案，明确当前搜索范围为过去一周
- [x] 补充 / 更新相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 使用 Brave Search API `news/search` 的 `freshness=pw` 参数，将搜索范围限制在过去一周
- 该限制作为 `daily-digest` 默认行为，无需用户额外配置
- 仅调整候选新闻时效窗口，不改动主流媒体优先、自媒体过滤、`publishedAt` / `date` 输出等现有逻辑

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 现在默认使用 Brave News Search 的 `freshness=pw`，搜索范围为过去一周
- 运行日志、`SKILL.md`、`manual / prd / tech / sprint README` 已统一改为“过去一周”口径
- `buildBraveNewsSearchUrl` 单测已更新为校验 `freshness=pw`
- 使用当前本地 Brave Key 实测 `freshness=pw` 请求返回 `200`，接口兼容正常
