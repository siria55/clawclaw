# Sprint 46 — Agent 挂载飞书文档资料

**状态**: ✅ 完成

**问题**：
- Agent 目前只能基于通用系统提示词、长期记忆和本地文件回答，无法直接挂载飞书文档资料形成项目级知识上下文。
- 即使用户已有飞书文档，当前也没有同步、缓存、检索和注入链路，回答无法稳定体现文档里的特定规则和术语。

**方案**：
- 新增飞书文档挂载配置，允许在 WebUI 设置页维护文档名称和 URL。
- 服务端增加文档同步接口，使用 Playwright 打开页面、提取正文文本并缓存到本地。
- 新增文档库检索模块，按用户问题搜索命中文档片段，并通过 `getContext` 自动注入 Agent 上下文。
- 同步产品、技术、使用说明和 sprint 总览文档。

## 任务

- [x] `src/docs/` — 新增飞书文档同步、缓存、检索模块
- [x] `src/config/types.ts` / `src/app.ts` / `src/web/dev.ts` — 新增文档挂载配置和运行时接入
- [x] `src/web/server.ts` — 新增文档配置与同步 API
- [x] `src/web/ui/SettingsView.tsx` / `src/web/ui/SettingsView.module.css` — 设置页新增飞书文档挂载区块
- [x] `tests/docs/library.test.ts` / `tests/web/server.test.ts` — 补回归测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` / `docs/sprint/README.md` — 同步文档
- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test`
