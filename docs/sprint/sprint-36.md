# Sprint 36 — 移除 NewsStorage 和 save_news 工具

**状态**: ✅ 完成

**目标**：`NewsStorage` 和 `save_news` 工具是遗留死代码。Sprint 33 后 `GET /api/news` 已改为读取 skill 输出的 JSON 文件，`save_news` 写入的 `data/agent/news.json` 无处展示。统一由 `DailyDigestSkill` 负责新闻采集与存储。

## 任务

- [x] 删除 `src/news/storage.ts`
- [x] 删除 `src/tools/news.ts`
- [x] 删除 `tests/news/storage.test.ts`
- [x] 删除 `tests/tools/news.test.ts`
- [x] `src/news/index.ts` — 移除 `NewsStorage` 导出，仅保留类型
- [x] `src/tools/index.ts` — 移除 `createSaveNewsTool` 导出
- [x] `src/index.ts` — 移除 `createSaveNewsTool` 导出
- [x] `src/app.ts` — 移除 `NewsStorage` / `newsStorage` / `createSaveNewsTool`
- [x] `src/web/dev.ts` — 同上
- [x] `tests/web/server.test.ts` — 移除 NewsStorage 相关测试、更新 import
- [x] 更新 prd / tech / manual 文档
- [x] typecheck + tests
