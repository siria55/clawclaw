# Sprint 3 — IM 平台接入 + 24/7 常驻服务

**周期**: 待定
**状态**: 📋 待开始

## 目标

实现框架的核心定位：Agent 以 Bot 形式常驻在飞书、企业微信中，24 小时响应用户消息。

---

## 任务

### 1. IMPlatform 接口 & 统一消息格式

定义平台无关的抽象层，让 Agent 不感知具体 IM 平台。

- [ ] `src/platform/types.ts` — `IMPlatform` 接口、`IMMessage` 类型
- [ ] `IMPlatform` 接口包含：`verify()`（签名验证）、`parse()`（解析 Webhook）、`send()`（发送回复）
- [ ] `IMMessage` 统一字段：`platform` / `chatId` / `userId` / `text` / `raw`
- [ ] 补充测试：Mock IMPlatform 验证接口约束

---

### 2. 飞书适配器

- [ ] `src/platform/feishu.ts` — `FeishuPlatform` 实现 `IMPlatform`
- [ ] 支持飞书 Webhook 签名验证（SHA256 + timestamp）
- [ ] 解析 `im.message.receive_v1` 事件
- [ ] 调用飞书消息 API 发送文本回复
- [ ] 环境变量：`FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_VERIFICATION_TOKEN`
- [ ] 补充测试（Mock HTTP）

---

### 3. 企业微信适配器

- [ ] `src/platform/wecom.ts` — `WecomPlatform` 实现 `IMPlatform`
- [ ] 支持企业微信消息加解密（AES）
- [ ] 解析文本消息事件
- [ ] 调用企业微信消息 API 发送回复
- [ ] 环境变量：`WECOM_CORP_ID` / `WECOM_TOKEN` / `WECOM_ENCODING_AES_KEY`
- [ ] 补充测试（Mock HTTP）

---

### 4. ClawServer — 24/7 常驻服务

- [ ] `src/server/index.ts` — `ClawServer` 类
- [ ] HTTP 服务监听 Webhook 回调，按路径路由到对应 IMPlatform
- [ ] 收到消息后触发 Agent 运行，将回复通过 `IMPlatform.send()` 发出
- [ ] 优雅关闭：监听 `SIGTERM` / `SIGINT`，等待进行中的请求完成
- [ ] `npm run start` 启动 ClawServer
- [ ] 补充测试

---

### 5. 文档更新

- [ ] `docs/manual` 补充飞书、企业微信配置说明
- [ ] `.env.example` 补充 IM 相关环境变量

---

## 验收标准

- [ ] 飞书 Bot 能收到群消息并回复
- [ ] 企业微信 Bot 能收到消息并回复
- [ ] 服务收到 SIGTERM 后优雅退出，不丢失进行中的回复
- [ ] 所有新增代码测试覆盖率 ≥ 80%
- [ ] 本地可通过 `ngrok` 或内网穿透调试飞书 / 企业微信回调
