# Sprint 68

## 目标

- 飞书群聊里仅在机器人被 `@` 时才触发回复
- WebUI 的 IM 消息日志补充展示飞书用户名或群名
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 为飞书群消息补充 mention-to-bot 判定
- [x] 统一生产 `ClawServer` 与开发 `WebServer` 的飞书 webhook 行为
- [x] 增强 `/api/im-log` 返回数据，补齐飞书用户名或群名展示
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 飞书群消息仍会记录到 IM 日志，但未 `@` 机器人时不会继续进入 `onMessage` / Agent 回复链路
- 用户名展示优先走飞书用户查询；群名缺失时再补查群信息，尽量不改动现有 IM 事件落盘结构

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- 飞书群聊消息只有在明确 `@机器人` 时才会继续进入快捷处理或 Agent 回复
- WebUI `IM > 消息` 会补充显示飞书发言人用户名，并在缺失时补查群名
