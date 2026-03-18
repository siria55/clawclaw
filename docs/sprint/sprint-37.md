# Sprint 37 — 清理 src/news/ 死代码目录

**状态**: ✅ 完成

**背景**：Sprint 36 删除 `NewsStorage` 和 `save_news` 工具后，`src/news/types.ts` 和 `src/news/index.ts` 无任何地方 import，成为孤立死代码。UI 层（`useNewsQuery.ts`）自定义了同构类型，`server.ts` 使用了本地 `SkillArticle` 接口，均不依赖 `src/news/`。

## 任务

- [x] 删除 `src/news/` 目录（含 `types.ts` / `index.ts`）
- [x] typecheck + tests（137 tests 通过）
