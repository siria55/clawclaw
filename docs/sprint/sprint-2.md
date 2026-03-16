# Sprint 2 — 代理支持 + Web UI

**周期**: 2026-03-16
**状态**: ✅ 完成

## 目标

让框架在国内环境可用，并提供可视化调试界面。

---

## 完成内容

### 1. 代理 & 自定义 Base URL

- [x] `AnthropicProvider` 支持 `baseURL` 构造参数，透传给 SDK
- [x] 自动读取 `ANTHROPIC_BASE_URL` 环境变量
- [x] 自动读取 `HTTPS_PROXY` / `HTTP_PROXY`，通过 `https-proxy-agent`（可选依赖）挂载
- [x] `.env.example` 补充代理相关变量
- [x] `docs/manual` 更新环境变量表格
- [x] 测试覆盖（4 个用例，Mock SDK）

**涉及文件：**
- `src/llm/anthropic.ts`
- `tests/llm/anthropic.test.ts`
- `.env.example`
- `docs/manual/README.md`

---

### 2. 可视化 Web UI

原生 Node.js HTTP + 静态 HTML，零额外依赖。

- [x] `src/web/server.ts` — `WebServer` 类，`POST /api/chat` 返回 SSE 流
- [x] `src/web/index.html` — 深色主题对话界面，支持工具调用展示
- [x] `src/web/dev.ts` — 开发入口，直接 `npm run dev:web` 启动
- [x] `package.json` 新增 `dev:web` script
- [x] `docs/manual` 补充 Web UI 使用说明

**涉及文件：**
- `src/web/server.ts`
- `src/web/index.html`
- `src/web/dev.ts`
- `package.json`

---

## 验收结果

- [x] 设置 `ANTHROPIC_BASE_URL` 后，请求走自定义地址（测试覆盖）
- [x] 设置 `HTTPS_PROXY` 后，SDK 请求走代理（需安装 `https-proxy-agent`）
- [x] 代理相关配置有测试覆盖
- [x] Web 页面流式展示 Agent 回复
- [x] Web 页面显示工具调用和执行结果
- [x] 类型检查零错误，15/15 测试通过
