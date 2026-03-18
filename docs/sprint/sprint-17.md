# Sprint 17 — IM 消息上下文 + WebUI IM 日志

**状态**: ✅ 完成

**目标**：
1. IM 收到消息时，将 `userId` / `chatId` 注入 agent 上下文，让 agent 知道来源
2. WebUI 新增 IM 消息实时日志，显示来源（platform / userId / chatId）、消息内容、时间戳

---

## 分析

### Item 1 — 注入 userId / chatId

当前 `ClawServer` / `WebServer#handleIMRoute` 只传 `message.text` 给 `agent.run()`。
`IMMessage` 已有 `userId`、`chatId`、`platform` 字段，只需在调用 agent 前额外注入一条 `user` 类型的 context 消息，告知 agent 消息来源。

### Item 2 — WebUI IM 日志

新增 `IMEventStorage`（内存环形队列，最多 200 条），每次收到 IM 消息时追加记录。
WebUI 通过 `GET /api/im-log` 拉取日志（支持 `?since=` 增量轮询）。
展示位置：**Status 页**下方新增「IM 消息日志」卡片，或独立 tab。

---

## 任务

### 1. 注入 IM 上下文到 agent
- [ ] `ClawServer#handleRequest` / `WebServer#handleIMRoute`：构造前置 context 消息 `[来自飞书] userId=xxx chatId=xxx`，通过 `agent.run(text, { extraContext })` 传入

  > 当前 `agent.run(text)` 签名需确认是否支持 extraContext，若不支持则直接拼接到 text

### 2. IMEventStorage（内存）
- [ ] `src/im/storage.ts`：`IMEventStorage` 类，环形队列（上限 200），`append(event)` / `since(id)` 方法
- [ ] `IMEvent` 类型：`{ id, platform, userId, chatId, text, replyText?, timestamp }`

### 3. ClawServer + WebServer#handleIMRoute 记录事件
- [ ] 收到消息 → `imEventStorage.append(...)`
- [ ] agent 回复后 → 更新 `replyText`

### 4. WebServer GET /api/im-log
- [ ] 返回 `{ events: IMEvent[], total }`, 支持 `?since=<lastId>` 增量拉取

### 5. WebUI — Status 页 IM 日志卡片
- [ ] `StatusView.tsx`：复用现有 Status tab，下方新增 IM 日志卡片
- [ ] 每 3 秒轮询 `/api/im-log?since=lastId`，展示最新若干条
- [ ] 每条显示：时间 / platform / chatId / userId / 消息内容 / 回复摘要

---

## 验收标准

- [ ] 飞书发消息 → agent system context 中包含 userId / chatId
- [ ] WebUI Status 页可看到收到的 IM 消息列表，实时更新
- [ ] 类型检查通过，所有测试通过
