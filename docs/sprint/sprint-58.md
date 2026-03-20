# Sprint 58

## 目标

- 修复飞书群聊里 `@机器人 1` 这类数字回复无法命中日报链接的问题
- 让日报快捷指令兼容群聊里的前置 mention

## 完成项

- [x] `daily-digest` 数字回复解析支持忽略飞书群聊中的 `@_user_x` mention 前缀
- [x] “给我今天的新闻” / “今天新闻文本版” 这类短指令也支持前置 mention
- [x] 补齐 `news-reply` 测试，覆盖群聊 mention + 数字、mention + 文本指令
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 飞书群聊消息文本在服务端可能表现为 `@_user_1 1`、`@_user_1 今天新闻文本版`
- 解析层在识别日报数字回复和新闻快捷指令前，会先去掉前置 mention、全角空格和常见分隔符
- 只有完成清洗后仍满足数字规则时，才会命中“回复数字拿链接”逻辑，避免误伤普通文本

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test tests/im/news-reply.test.ts`
- [x] `corepack pnpm build`

## 结果

- 飞书群聊里对机器人发送 `@机器人 1`、`@机器人 10` 时，会正确返回对应新闻原文链接
- 飞书群聊里的 `@机器人 给我今天的新闻`、`@机器人 今天新闻文本版` 也会命中日报快捷链路
