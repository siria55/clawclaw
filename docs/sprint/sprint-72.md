# Sprint 72

## 目标

- 为 `daily-digest` 的每条新闻补充新闻时间展示
- 将新闻时间从搜索结果链路带到 HTML / Markdown / JSON 输出
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 为 `DigestArticle` 增加新闻时间字段
- [x] 在 `daily-digest` 条目里显示来源 + 新闻时间
- [x] 让 JSON / Markdown 输出包含新闻时间
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 新闻时间优先从百度新闻搜索结果页的结果卡片元信息中提取
- 若某条新闻没有稳定提取到时间，则保留为空，不阻断日报生成
- 页面渲染上继续保持“来源 + 时间”的轻量信息层，不让条目视觉过重

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 现在会为新闻条目补充 `publishedAt`，并在 HTML / Markdown 中展示“来源 + 时间”
- 新闻时间优先从搜索结果卡片元信息提取，并随链接提示一路传递到最终结构化文章结果
- 若搜索结果没有稳定时间信息，日报仍可正常生成，只展示来源，不因缺少时间而报错
