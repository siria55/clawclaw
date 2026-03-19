# Sprint 50

## 目标

- 长内容 tab 内增加页内 TOC，减少上下滚动成本
- 支持把 Markdown 内容按飞书原生格式发送出去

## 完成项

- [x] 新增 `SectionToc` 组件，并接入 `状态` / `设置` 两个长页面 tab
- [x] `StatusView` 支持跳转到运行概览、飞书概览、配置文件、IM 消息日志
- [x] `SettingsView` 支持跳转到 Agent、飞书文档、DailyDigest、模型、飞书 IM
- [x] `FeishuPlatform` 新增 `sendMarkdown()`，用 `msg_type: "post"` + `md` 节点发送 Markdown
- [x] `FeishuPlatform.send()` 自动识别明显 Markdown 结构，命中时自动切到 Markdown 渲染
- [x] `Cron` 直发支持 `msgType: "markdown"`，可直接发送飞书渲染版 Markdown
- [x] 补齐 Web / Cron / Feishu 相关测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 页内 TOC 只做当前 tab 内滚动跳转，不改 URL hash，避免和现有 tab hash 路由互相冲突
- 飞书 Markdown 发送优先走普通消息接口，使用 `post` 消息体里的 `md` 节点，不额外引入卡片模板链路
- Cron 直发 Markdown 优先调用平台的 `sendMarkdown()`；未实现该能力的平台继续回退到普通 `send()`

## 验证

- [x] `pnpm typecheck`
- [ ] `pnpm lint`（仓库现有 ESLint / tsconfig 基线问题，非本次改动引入）
- [x] `pnpm test tests/platform/feishu.test.ts tests/cron/scheduler.test.ts tests/web/CronView.test.ts tests/web/StatusView.test.ts tests/web/SectionToc.test.ts`
- [x] `pnpm build`

## 参考文档

- 飞书发送消息: <https://open.feishu.cn/document/server-docs/im-v1/message/create>
- 飞书消息内容结构: <https://open.feishu.cn/document/server-docs/im-v1/message-content-description/create_json>
