# Sprint 56

## 目标

- 将 WebUI 里的 `IM` 和 `IM 状态` 拆成独立 tab
- 将飞书里 digest 后回复数字的返回内容收敛为单独新闻链接

## 完成项

- [x] WebUI 新增独立的 `IM 状态` tab，展示 IM 连接状态、飞书运行信息和已加入群聊
- [x] WebUI 新增独立的 `IM` tab，专门展示实时 IM 消息日志和群聊 / 直发筛选
- [x] `状态` tab 收敛为运行概览和配置文件，避免和 IM 视图混杂
- [x] 飞书 digest 数字回复命中后改为发送单独新闻原文链接，不再返回详情卡片
- [x] 补齐 `news-reply` 与 WebUI 状态页拆分相关测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- WebUI tab 拆分为 `状态`、`IM 状态`、`IM` 三个入口：
  - `状态` 只放运行指标、最近 IM 活动和配置文件可视化
  - `IM 状态` 只放平台连接、飞书运行态和群聊摘要
  - `IM` 只放实时 IM 消息日志
- digest 数字回复继续基于最近一次 `[日报图片] YYYY-MM-DD` / `[日报文本] YYYY-MM-DD` 上下文识别，但命中后直接发送 `article.url`

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test tests/im/news-reply.test.ts tests/web/StatusView.test.ts`
- [x] `corepack pnpm build`

## 结果

- WebUI 现在可以分别查看运行状态、IM 平台状态和 IM 消息流
- 飞书里收到 digest 后回复 `3`、`11` 这类数字时，机器人会直接回对应新闻链接
