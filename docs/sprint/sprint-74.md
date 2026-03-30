# Sprint 74

## 目标

- 确保 `daily-digest` 最终结果不出现百家号等自媒体来源
- 为 `daily-digest` 导出的 JSON 增加新闻发布日期 `date` 字段
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 收紧 `daily-digest` 自媒体来源过滤说明与实现
- [x] 为 `DigestArticle` 增加新闻发布日期 `date` 字段
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- `publishedAt` 继续保留原始搜索结果里的时间文本，用于 HTML / Markdown 展示
- `date` 作为结构化发布日期字段，优先从 `publishedAt` 推导为 `YYYY-MM-DD`
- 对“昨天 / 前天 / 几小时前 / 几分钟前”这类相对时间，按日报生成日期做最佳努力换算
- 若搜索结果未给出稳定时间信息，则 `date` 允许缺失，不阻断日报生成

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 在 LLM 解析完成后会再次拦截百家号等自媒体文章，避免低质量来源继续进入后续流程
- `DigestArticle` 新增结构化 `date` 字段，JSON 导出会保留 `publishedAt` 并最佳努力推导 `date: YYYY-MM-DD`
- 对“昨天 / 前天 / 几小时前 / 几分钟前”这类相对时间，系统会按日报生成日期换算；若无法稳定判断则允许缺失
