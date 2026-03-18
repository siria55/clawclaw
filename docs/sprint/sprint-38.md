# Sprint 38 — DailyDigestSkill 改用 Playwright 直接搜索

**状态**: ✅ 完成

**问题**：当前做法是 sub-agent（最多 12 轮 LLM turns）驱动浏览器搜索，导致 API rate limit 报错。

**方案**：
- Playwright 直接导航搜索页，在浏览器上下文中提取所有链接（零 LLM 调用）
- 完成所有关键词搜索后，做**一次** `ctx.agent.run()` 统一筛选为结构化 JSON
- 彻底移除 sub-agent / createBrowserTools / defineTool

```
之前：sub-agent 12 turns × N 关键词 → N×12 次 LLM API 调用
之后：Playwright 直接抓链接 → 1 次 LLM API 调用
```

## 任务

- [x] `src/skills/daily-digest/index.ts` — 移除 sub-agent；新增 `extractPageLinks()` + `searchNewsWithBrowser()`
- [x] `src/skills/daily-digest/SKILL.md` — 更新 instructions（不再用于代码，改为流程说明）
- [x] typecheck
