---
id: daily-digest
description: 浏览器搜索科技新闻，按国内 10 / 国际 5 生成 HTML 日报并截图保存
queries: 国内AI科技,中国创业投资,中国互联网平台,美国OpenAI,美国英伟达AI,硅谷创投,海外互联网监管,全球科技公司
domestic-articles: 10
international-articles: 5
max-articles: 15
max-candidates: 36
---

## 执行流程

1. 默认使用本文件里的 `queries`；若 `data/skills/daily-digest/config.json` 中配置了自定义主题，则运行时优先使用配置值
2. Playwright 直接导航各关键词的百度新闻搜索页（零 LLM 调用）
3. 用 Playwright locator 提取页面所有链接（text + href），并尽量从搜索结果卡片提取新闻时间，再给链接打上国内/国际查询提示
4. 跨关键词去重后，按国内 / 国际分别调用 LLM 筛选真实新闻文章并结构化为 JSON（含 `category`）；新闻时间继续沿用搜索结果里的 hint
5. 按国内 10 / 国际 5 的配额裁剪
6. 将内容填入 HTML 模板，读取 `layout.css` 渲染日报并截图为 PNG
7. 保存 `YYYY-MM-DD.{html,md,png,json}` 到 `data/skills/daily-digest/`

## 数据格式

```json
[{"title":"文章标题","url":"文章完整URL","summary":"摘要（无则空字符串）","source":"来源媒体","publishedAt":"2小时前","category":"domestic"}]
```
