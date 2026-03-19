# Sprint 48 — WebUI 可视化飞书配置与运行状态

**状态**: ✅ 已完成

**问题**：
- 当前 WebUI 只能在设置页分散编辑飞书与其他配置，缺少统一的可视化概览。
- 飞书相关信息、配置文件落盘情况、最近运行状态和存储状态，无法在一个地方快速确认。
- 线上排查时只能靠翻 JSON 文件或看终端日志，效率低。

**方案**：
- 为 WebServer 增加统一的运行概览接口，聚合飞书配置摘要、配置文件状态、存储统计和 IM 活动摘要。
- 在状态页新增可视化概览卡片，集中展示飞书、配置文件和运行状态。
- 在设置页补充关键飞书状态摘要，减少“保存完还要去翻文件确认”的往返。

## 任务

- [x] `src/config/storage.ts` / `src/im/storage.ts` / `src/im/conversations.ts` / `src/memory/storage.ts` — 暴露必要的文件路径与统计信息
- [x] `src/web/server.ts` — 新增运行概览 API，聚合飞书配置、配置文件与存储状态
- [x] `src/app.ts` / `src/web/dev.ts` — 补充飞书运行时状态摘要
- [x] `src/web/ui/StatusView.tsx` / `src/web/ui/SettingsView.tsx` / 对应 CSS — 增强 WebUI 可视化展示
- [x] `tests/web/server.test.ts` / `tests/web/StatusView.test.ts` — 补回归测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` / `docs/sprint/README.md` — 同步文档
- [x] `pnpm typecheck`
- [x] `pnpm test`
