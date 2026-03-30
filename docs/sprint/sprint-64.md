# Sprint 64

## 目标

- 让 Web Chat 页里的 AI 回复支持一键复制
- 在飞书配置页里显示已配置目标的用户名 / 群名，而不只显示 ID

## 完成项

- [x] 为聊天页 AI 回复增加复制入口
- [x] 为飞书目标补充名称解析与展示
- [x] 补充相关前端 / 服务端测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 复制内容以 assistant 原始文本为准，避免复制到渲染后的额外 UI 文案
- 飞书目标名称优先显示群名或用户名；解析失败时保留 ID，不阻断配置页使用

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- Chat 页中的 assistant 回复已支持直接选中文本复制，也支持一键复制原始文本
- IM 配置页中的飞书 `Chat ID` 会自动解析并显示对应群名 / 用户名
- WebServer 新增 `GET /api/im-config/feishu-target?chatId=...`，前端可按需解析飞书目标展示名
