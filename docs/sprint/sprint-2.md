# Sprint 2 — 代理支持 + Web UI

**周期**: 待定
**状态**: 🚧 进行中

## 目标

让框架在国内环境可用，并提供可视化调试界面。

---

## 任务

### 1. 代理 & 自定义 Base URL

Anthropic SDK 支持通过 `baseURL` 和 `httpAgent` 覆盖默认连接配置，需要暴露给用户。

**需要做的事：**

- [ ] `AnthropicProvider` 构造参数增加 `baseURL?: string`，透传给 SDK
- [ ] 支持 HTTP/HTTPS 代理，通过环境变量 `HTTPS_PROXY` / `HTTP_PROXY` 自动读取
- [ ] `.env.example` 补充代理相关变量说明
- [ ] 更新 `docs/manual` 的环境变量表格

**涉及文件：**
- `src/llm/anthropic.ts`
- `.env.example`
- `docs/manual/README.md`

---

### 2. 可视化 Web UI

提供一个轻量网页，用于调试 Agent 对话、查看消息历史和工具调用过程。

**需要做的事：**

- [ ] 技术选型：确定 Web 框架（候选：Hono + 原生 HTML，或 Vite + React）
- [ ] HTTP 接口：`POST /api/chat` 接收消息，返回 SSE 流
- [ ] 前端页面：对话输入框 + 消息气泡 + 工具调用展示
- [ ] `npm run dev:web` 启动 Web 服务
- [ ] 补充文档

**涉及文件：**
- `src/web/server.ts`（新建）
- `src/web/index.html`（新建）
- `package.json` — 新增 `dev:web` script

---

## 验收标准

- [ ] 设置 `ANTHROPIC_BASE_URL` 后，请求走自定义地址
- [ ] 设置 `HTTPS_PROXY` 后，SDK 请求走代理
- [ ] 代理相关配置有测试覆盖
- [ ] Web 页面可正常发送消息并流式展示回复
- [ ] Web 页面显示工具调用过程
