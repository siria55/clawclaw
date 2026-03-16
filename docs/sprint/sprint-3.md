# Sprint 3 — IM 平台接入 + 24/7 常驻服务

**周期**: 2026-03-16
**状态**: ✅ 完成

## 目标

实现框架的核心定位：Agent 以 Bot 形式常驻在飞书、企业微信中，24 小时响应用户消息。

---

## 完成内容

### 1. IMPlatform 接口 & 统一消息格式

- [x] `src/platform/types.ts` — `IMPlatform` 接口、`IMMessage`、`IMVerifyParams` 类型
- [x] `verify()` 接受 `{ method, headers, query, body }` 参数，覆盖飞书 header 签名和企业微信 query 参数签名两种场景

### 2. 飞书适配器

- [x] `src/platform/feishu.ts` — `FeishuPlatform`
- [x] SHA256 HMAC 签名验证（`X-Lark-Signature`），有 `encryptKey` 时启用
- [x] Timestamp 防重放（5 分钟窗口）
- [x] 解析 `im.message.receive_v1` 事件，跳过 Bot 自发消息
- [x] 飞书 URL 验证 challenge 处理（`FeishuChallenge`）
- [x] 调用飞书消息 API 发送文本回复
- [x] 11 个测试用例全部通过

### 3. 企业微信适配器

- [x] `src/platform/wecom.ts` — `WecomPlatform`
- [x] SHA1 签名验证（`msg_signature` query 参数）
- [x] AES-256-CBC 消息解密（`wecomAesDecrypt` / `wecomAesEncrypt`）
- [x] GET URL 验证 echo 处理（`WecomEcho`）
- [x] 解析解密后的 XML 文本消息
- [x] 调用企业微信消息 API 发送回复
- [x] 13 个测试用例全部通过

### 4. ClawServer

- [x] `src/server/index.ts` — URL 路由解析 query 参数，透传 `method`
- [x] 同时处理 `FeishuChallenge`（来自 `verify()` 或 `parse()`）和 `WecomEcho`
- [x] `stop()` 清理 SIGTERM/SIGINT 监听器，避免多实例冲突
- [x] `port` getter 暴露实际绑定端口
- [x] 7 个测试用例全部通过

### 5. 文档 & 配置

- [x] `.env.example` 补充所有 IM 平台环境变量
- [x] `src/platform/index.ts` 导出所有新增符号

---

## 验收结果

- [x] 飞书签名验证（含防重放）有测试覆盖
- [x] 企业微信 AES 解密有测试覆盖
- [x] `ClawServer` 正确响应 FeishuChallenge / WecomEcho
- [x] 服务收到 SIGTERM 后优雅退出，不丢失进行中的请求
- [x] 类型检查零错误，**46/46 测试通过**
