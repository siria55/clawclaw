# Sprint 22 — IM 日志分类 + JSON 可读性

**状态**: ✅ 完成

**目标**：
1. IM 消息日志按 chatId 前缀分类：`oc_` = 群聊/会话，`ou_` = 直发（cron 等主动推送）
2. `data/` 下所有 JSON 文件改为缩进格式，便于阅读和调试

## 分析

- `oc_` 前缀：Feishu 标准会话 ID（群聊或 p2p 对话）
- `ou_` 前缀：用户 open_id，用于 cron 直发
- `IMEventStorage.#persist()` 和 `ConversationStorage.#persist()` 用 `JSON.stringify` 无缩进
- `ConfigStorage.write()` 已有缩进 ✓

## 任务

- [x] `IMEventStorage.#persist()` 改为 `JSON.stringify(..., null, 2)`
- [x] `ConversationStorage.#persist()` 同上
- [x] `StatusView.tsx`：IM 日志加分类 tab（全部 / 群聊 / 直发）
- [x] typecheck + tests 通过
