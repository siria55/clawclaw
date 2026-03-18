# Sprint 19 — 持久化 IM 日志 + 多轮对话记忆

**状态**: ✅ 完成

**目标**：
1. IM 消息日志持久化到 `data/im-events.json`，重启后历史不丢失
2. 飞书 bot 按 chatId 保存多轮对话上下文，持久化到 `data/conversations.json`

---

## 分析

### 现状
- `IMEventStorage` 是纯内存 ring buffer，重启即清空
- `agent.run(text)` 无状态，每条飞书消息独立对话，没有上下文记忆

### 方案

**IM 日志持久化**：
- `IMEventStorage` 构造函数接受可选 `filePath`
- 启动时从文件加载历史事件
- `append()` / `setReply()` 后写盘

**多轮对话记忆**：
- 新增 `ConversationStorage`（`src/im/conversations.ts`）
  - 存 `Record<chatId, Message[]>`，写入 `data/conversations.json`
  - `get(chatId)` / `set(chatId, messages)` / trim 到最近 40 条
- `AgentOptions` 加 `history?: Message[]`
- `agent.run(text, { history })` 开头 prepend 历史
- IM handler（ClawServer + WebServer）收消息前读历史，run 完后保存

---

## 任务

### 1. IMEventStorage 持久化
- [x] 构造函数加 `filePath?: string`，启动时加载
- [x] `append()` / `setReply()` 后写盘

### 2. ConversationStorage
- [x] 新建 `src/im/conversations.ts`
- [x] `get(chatId): Message[]`、`set(chatId, messages): void`，trim 到 40 条
- [x] 持久化到 `data/conversations.json`

### 3. Agent history 支持
- [x] `AgentOptions` 加 `history?: Message[]`
- [x] `agent.run()` prepend history

### 4. ClawServer + WebServer IM handler 接入
- [x] 两处 handler 读取/保存 conversationStorage
- [x] `app.ts` / `dev.ts` 传入 conversationStorage 和持久化 imEventStorage

---

## 验收标准

- [x] 重启后 WebUI IM 日志仍显示历史消息
- [x] 飞书 bot 能记住同一群/会话的上下文（多轮对话）
- [x] 类型检查通过，所有测试通过
