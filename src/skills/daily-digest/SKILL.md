---
id: daily-digest
description: 浏览器搜索科技新闻，生成 HTML 日报并截图保存
queries: AI科技,创业投资,互联网动态
max-articles: 12
---

## 执行流程

1. Playwright 直接导航各关键词的百度新闻搜索页（零 LLM 调用）
2. 用 Playwright locator 提取页面所有链接（text + href）
3. 跨关键词去重后，**一次** LLM 调用筛选出真实新闻文章并结构化为 JSON
4. 渲染 HTML 日报，Playwright 截图为 PNG
5. 保存 `YYYY-MM-DD.{html,md,png,json}` 到 `data/skills/daily-digest/`

## 数据格式

```json
[{"title":"文章标题","url":"文章完整URL","summary":"摘要（无则空字符串）","source":"来源媒体"}]
```
