---
id: daily-digest
description: 通过 Brave Search API 搜索过去 24 小时科技新闻，按国内 10 / 国际 5 生成 HTML 日报并截图保存
queries: 国内AI科技,中国创业投资,中国互联网平台,美国OpenAI,美国英伟达AI,硅谷创投,海外互联网监管,全球科技公司
domestic-articles: 10
international-articles: 5
max-articles: 15
max-candidates: 36
---

## 执行流程

1. 默认使用本文件里的 `queries`；若 `data/skills/daily-digest/config.json` 中配置了自定义主题，则运行时优先使用配置值
2. 通过 Brave Search API 的 `news/search` 接口检索各关键词在过去 24 小时内的候选新闻（优先使用 WebUI 保存的 Brave Key，未配置时回退到 `BRAVE_SEARCH_API_KEY` 环境变量）
3. 将 Brave 返回的标题、URL、来源、摘要与时间元信息整理为候选链接，并打上国内/国际查询提示
4. 跨关键词去重后，先过滤百家号等自媒体 / 黑名单链接，再按国内 / 国际分别调用 LLM 筛选真实新闻文章并结构化为 JSON（含 `category`）；新闻时间继续沿用 Brave 返回的时间 hint，并最佳努力推导结构化 `date`
5. 按国内 10 / 国际 5 的配额裁剪
6. 将内容填入 HTML 模板，读取 `layout.css` 渲染日报并截图为 PNG
7. 保存 `YYYY-MM-DD.{html,md,png,json}` 到 `data/skills/daily-digest/`

手动执行默认 Cron `daily-digest-generate` 时，生成文件同样写入 `data/skills/daily-digest/`。

## 数据格式

```json
[{"title":"文章标题","url":"文章完整URL","summary":"摘要（无则空字符串）","source":"来源媒体","publishedAt":"2小时前","date":"2026-03-30","category":"domestic"}]
```
