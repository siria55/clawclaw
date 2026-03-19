# Sprint 39 — 飞书 Session 拆分 + 会话桥接

**状态**: ✅ 完成

**问题**：当前 IM 多轮历史只按 `chatId` 存。飞书同一 chat 内的不同线程会串到同一个 session；切到新 session 时又完全断开。长期记忆虽然全局共享，但短期上下文不够连贯。

**方案**：
- `IMMessage` 增加 `sessionId` / `continuityId`
- 飞书普通消息继续沿用 `chatId`；线程消息改用 `chatId#thread:<rootId|threadId|parentId>`
- `ConversationStorage` 改为按 `sessionId` 持久化，并在同 `continuityId` 的新 session 首轮注入一条短桥接消息
- `chatId` 继续只负责回包；长期记忆仍共用 `MemoryStorage`

## 任务

- [x] `src/platform/types.ts` / `src/platform/feishu.ts` / `src/platform/wecom.ts` — 增加 `sessionId` / `continuityId`
- [x] `src/im/conversations.ts` / `src/im/context.ts` — ConversationStorage 支持 session 持久化 + continuity bridge
- [x] `src/server/index.ts` / `src/web/server.ts` — IM webhook 统一走 session history
- [x] `tests/im/conversations.test.ts` / `tests/platform/*.test.ts` / `tests/server/server.test.ts` / `tests/web/server.test.ts` — 补测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` — 同步 session 规则
- [x] `pnpm typecheck`
- [x] `pnpm test`（143 tests）
