# Sprint 49 — WebUI 展示飞书已加入群与群名

**状态**: ✅ 已完成

**问题**：
- 当前 WebUI 只能看到 IM 消息日志，看不到机器人被加入了哪些飞书群。
- 现有 IM 事件存储没有保留群名，也没有为“机器人进群”建立独立的群组状态记录。
- 排查机器人是否已被拉进目标群时，只能依赖飞书端人工确认，不够直观。

**方案**：
- 扩展飞书事件解析，接住 `im.chat.member.bot.added_v1` 等群组事件，并保存群 ID / 群名。
- 扩展 IM 存储，持久化群组摘要，支持 WebUI 查询当前已记录的飞书群列表。
- 在状态页和 IM 日志里直接展示群名与最近加入的群。

## 任务

- [x] `src/platform/types.ts` / `src/platform/feishu.ts` — 扩展 IMMessage，支持群名与群组事件
- [x] `src/im/storage.ts` / `src/server/index.ts` / `src/web/server.ts` — 持久化群信息并暴露接口
- [x] `src/web/ui/StatusView.tsx` / 对应 CSS — 展示飞书群列表、群名和进群事件
- [x] `tests/platform/feishu.test.ts` / `tests/server/server.test.ts` / `tests/web/server.test.ts` / `tests/web/StatusView.test.ts` — 补回归测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` / `docs/sprint/README.md` — 同步文档
- [x] `pnpm typecheck`
- [x] `pnpm test`
