# Sprint 51

## 目标

- 修复飞书 IM 对话在 tool call 后偶发“无回复”的问题
- 调整长 tab 的页内 TOC 位置，不再贴近中间主内容
- 让飞书里“给我今天的新闻”这类请求直接命中日报交付链路

## 完成项

- [x] 修复 Anthropic tool result 回传格式，补齐 `tool_result.type` 和 `tool_use_id`
- [x] `ClawServer` / `WebServer` 路由增加 `onMessage` 拦截点，可在进 Agent 前短路处理 IM 请求
- [x] 新增日报请求处理器：飞书里问“给我今天的新闻”默认发今日新闻图片
- [x] 今日图片不存在时自动执行 `daily-digest` 生成后再发送
- [x] 显式要求“文本版 / Markdown / 文字”时发送今日新闻 Markdown
- [x] `Status` / `Settings` 的页内 TOC 调整到页面右侧外沿
- [x] 补齐 Anthropic / IM route / 日报请求相关测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- “给我今天的新闻”不再依赖模型理解意图，而是通过 IM 路由层短路到 `daily-digest` 交付逻辑
- 默认优先发送图片，并附带提示文案引导用户索取文本版
- 为避免重复生成，当今日日报缺失时会复用同一轮生成 Promise
- Tool call 修复落在 Anthropic 适配层：内部工具执行结果先转换成标准 `tool_result` block 再回传模型

## 验证

- [x] `pnpm typecheck`
- [ ] `pnpm lint`（仓库现有 ESLint / tsconfig 基线问题，非本次改动引入）
- [x] `pnpm test tests/llm/anthropic.test.ts tests/server/server.test.ts tests/web/server.test.ts tests/im/news-reply.test.ts tests/platform/feishu.test.ts tests/cron/scheduler.test.ts tests/web/CronView.test.ts tests/web/StatusView.test.ts tests/web/SectionToc.test.ts`
- [x] `pnpm build`

## 结果

- 飞书里问“给我今天的新闻”会优先收到今日新闻图片；回复“今天新闻文本版”会收到 Markdown 文本
- 之前日志里的 `invalid_request_error: ***.type: Field required` 已对应修复
- 页内 TOC 停靠在页面右侧，不再悬在主内容左边中段
