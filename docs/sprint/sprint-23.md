# Sprint 23 — Cron 图片发送

**状态**: ✅ 完成

## 任务

- [x] `CronJobConfig` / `CronJob` 加 `msgType: "text" | "image"`
- [x] `FeishuPlatform.sendImage(chatId, source)` — 支持 URL 和本地文件路径，先上传获取 `image_key` 再发送
- [x] `CronScheduler.#fire()` direct + image 时调用 `sendImage`
- [x] WebUI 表单：勾选「直发」后显示「类型」下拉（文本/图片）
- [x] typecheck + tests 通过

## 使用方式

WebUI 新增 cron 任务：
- 勾选「直发」
- 类型选「图片」
- 消息填图片 URL（如 `https://example.com/img.png`）或本地路径（如 `/data/banner.png`）
