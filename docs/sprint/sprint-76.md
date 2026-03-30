# Sprint 76

## 目标

- 将 `daily-digest` 的候选新闻搜索从百度新闻页面切换为 Brave Search API
- 保留现有的来源过滤、新闻时间 / 日期推导、LLM 精筛与落盘链路
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 接入 Brave News Search API 检索候选新闻
- [x] 保持 `publishedAt` / `date` 与来源过滤逻辑继续可用
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 使用 Brave 官方 `news/search` 接口获取候选新闻，鉴权通过 `X-Subscription-Token`
- `publishedAt` 优先使用 Brave 返回的 `page_age`，无绝对时间时回退到 `age`
- `date` 继续从 `publishedAt` 做最佳努力推导，不改变现有 JSON 结构
- `BRAVE_SEARCH_API_KEY` 作为运行时环境变量，不落盘到项目配置文件

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 的候选新闻搜索已从百度新闻页面切换到 Brave News Search API，运行时通过 `BRAVE_SEARCH_API_KEY` 鉴权
- Brave 返回的来源、摘要、`page_age` / `age` 会继续进入后续的来源过滤、`publishedAt` 展示和 `date` 推导链路
- 已补充 Brave 结果映射测试；当前环境未设置 `BRAVE_SEARCH_API_KEY`，因此本轮未执行真实 Brave API 请求，只完成了静态验证与构建
