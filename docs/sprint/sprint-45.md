# Sprint 45 — Cron 独立 Tab 与手动执行

**状态**: ✅ 完成

**问题**：
- `Cron` 配置现在混在 `Status` 页里，系统状态和任务管理耦合在一起，操作路径不清晰。
- `Cron` 任务只能等调度器按表达式触发，缺少手动执行入口，调试和验证成本高。

**方案**：
- 将 `Cron` 配置从 `StatusView` 拆出为独立 `CronView` 和独立 tab。
- WebServer 新增 `POST /api/cron/:id/run`，支持从 WebUI 手动执行单个 Cron 任务。
- `CronScheduler` 暴露一次性执行能力，复用现有投递、Skill 执行与 IM 日志记录链路。
- 更新产品、技术、使用文档，明确 WebUI 已变为 7-tab 导航。

## 任务

- [x] `src/web/ui/App.tsx` / `src/web/ui/App.module.css` — 新增 `Cron` tab 并接入独立视图
- [x] `src/web/ui/CronView.tsx` / `src/web/ui/CronView.module.css` — 拆出 Cron 管理界面，新增手动运行按钮
- [x] `src/web/ui/StatusView.tsx` — 移除 Cron 配置区，仅保留系统状态与 IM 日志
- [x] `src/cron/scheduler.ts` / `src/app.ts` / `src/web/dev.ts` — 新增手动执行 Cron 的运行时能力
- [x] `src/web/server.ts` — 新增 `POST /api/cron/:id/run`
- [x] `tests/cron/scheduler.test.ts` / `tests/web/server.test.ts` / `tests/web/CronView.test.ts` — 补回归测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` / `docs/sprint/README.md` — 同步文档
- [x] `pnpm typecheck`
- [x] `pnpm test tests/cron/scheduler.test.ts tests/web/server.test.ts tests/web/CronView.test.ts`
- [x] `pnpm build`
- [x] `pnpm test`
