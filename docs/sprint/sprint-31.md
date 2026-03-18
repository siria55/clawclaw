# Sprint 31 — DailyDigest 浏览器搜索新闻

**状态**: ✅ 完成

**目标**：参考 openclaw 操作浏览器的理念，将 DailyDigestSkill 从「爬固定页面」升级为「浏览器搜索新闻」：

- 用 Playwright 搜索百度新闻（支持多关键词）
- 保留 36Kr 作为兜底来源
- 支持在 `DailyDigestSkill` 构造时传入 `queries` 列表，默认搜索科技/AI/创业相关关键词
- 抓取摘要（snippet），丰富日报内容

## 架构

```
DailyDigestSkill({ queries: ["AI科技", "创业投资", "互联网动态"] })
  → searchBaiduNews(page, query) × N  （浏览器搜索）
  → crawl36kr(page)                   （兜底补充）
  → dedupe by URL → top 12
  → renderHtml / renderMarkdown / screenshot
  → save files + send to Feishu
```

### 百度新闻搜索

URL: `https://news.baidu.com/ns?word={query}&tn=news&cl=2&rn=20&ct=1`

提取字段：
- 标题：`.result h3 a` 或 `.news-title`
- 摘要：`.news-summary` 或 `.c-summary`
- 来源：`.news-from` 或 `.c-author`
- URL：href

## 任务

- [x] `src/skills/daily-digest/index.ts` — 新增 `searchBaiduNews()`，重构 `run()` 支持多源多词
- [x] DailyDigestSkill 构造器接受 `queries?: string[]`（默认 3 个关键词）
- [x] 更新 `src/web/dev.ts` 传入默认 queries
- [x] typecheck + 手动验证截图
