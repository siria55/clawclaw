# Sprint 49 — WebUI 展示飞书已加入群与群名

**状态**: ✅ 已完成

**目标**：
- 在 WebUI 直接看到机器人已加入的飞书群和群名
- 让群组状态从 IM 日志里独立沉淀，便于排查

**结果**：
- 飞书事件解析新增机器人进群 / 退群事件，持久化群 ID、群名、最近事件和时间
- 状态页可直接展示飞书群聊列表，排查是否已进群不再依赖飞书端人工确认

## 任务

- [x] `src/platform/types.ts` / `src/platform/feishu.ts` — 群事件与群名解析
- [x] `src/im/storage.ts` / `src/server/index.ts` / `src/web/server.ts` — 群摘要持久化与接口
- [x] `src/web/ui/StatusView.tsx` / 对应 CSS — 状态页展示飞书群列表
- [x] `tests/platform/feishu.test.ts` / `tests/server/server.test.ts` / `tests/web/server.test.ts` / `tests/web/StatusView.test.ts` — 补回归测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` / `docs/sprint/README.md` — 同步文档
- [x] `pnpm typecheck`
- [x] `pnpm test`
