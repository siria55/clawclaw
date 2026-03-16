# 使用说明

## 安装

```bash
npm install clawclaw
```

环境变量配置（复制 `.env.example` 并填入）：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key，必填 |
| `ANTHROPIC_BASE_URL` | 自定义 API 地址，用于代理或镜像站 |
| `HTTPS_PROXY` | HTTPS 代理，格式 `http://host:port`，需安装 `https-proxy-agent` |
| `HTTP_PROXY` | HTTP 代理（HTTPS_PROXY 未设置时生效） |

---

## Agent

Agent 是框架的核心单元，负责编排 LLM 调用与工具执行。

创建时需指定：
- **name** — Agent 名称，用于日志和多 Agent 场景标识
- **system** — 系统提示词，决定 Agent 的行为边界
- **llm** — LLM 适配器实例
- **tools**（可选）— Agent 可调用的工具列表

### 运行模式

**`run()`** — 一次性运行，等待所有轮次完成后返回完整消息历史和执行轮数。适合批处理场景。

**`stream()`** — 流式运行，每完成一个步骤即 yield 一个事件。适合需要实时反馈的场景。事件类型：

| 事件 | 说明 |
|------|------|
| `message` | LLM 返回了一条消息 |
| `tool_call` | LLM 决定调用某个工具 |
| `tool_result` | 工具执行完毕，返回结果 |
| `done` | 本次运行结束，附带完整结果 |

### 防止死循环

`maxTurns` 参数限制最大执行轮数，默认 20。超出后自动停止并返回当前结果。

---

## Tool

Tool 是 Agent 可调用的外部能力单元，每个 Tool 包含：

- **name** — 唯一标识，snake_case 命名
- **description** — 给 LLM 看的功能描述，越清晰调用越准确
- **inputSchema** — 输入参数的 JSON Schema，用于 LLM 生成合法调用
- **execute** — 实际执行逻辑，输入经 Zod schema 校验后传入

使用 `defineTool()` 创建工具时，输入校验自动处理——若 LLM 传入非法参数，工具会返回错误信息而不是抛出异常。

---

## LLM 适配器

通过 `createLLM()` 工厂方法创建适配器，当前支持：

| 适配器 | 标识符 | 默认模型 |
|--------|--------|----------|
| Anthropic | `"anthropic"` | `claude-sonnet-4-6` |

如需接入其他 LLM，实现 `LLMProvider` 接口即可，框架对具体 LLM 无依赖。

---

## IM 平台接入

clawclaw 通过 `ClawServer` 以 Bot 形式常驻在 IM 平台，监听 Webhook 并自动调用 Agent 回复。

### 飞书（Feishu/Lark）

在飞书开放平台创建企业自建应用，开启「接收消息」事件权限，配置 Webhook 回调地址。

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` | 应用 App ID |
| `FEISHU_APP_SECRET` | 应用 App Secret |
| `FEISHU_VERIFICATION_TOKEN` | 事件验证 Token |
| `FEISHU_ENCRYPT_KEY` | 加密密钥（可选，启用后开启签名验证） |

Webhook 路径默认为 `/feishu`，可在 `ClawServer` 路由配置中自定义。

飞书首次配置时会发送 URL 验证请求，`ClawServer` 会自动响应，无需额外处理。

### 企业微信（WeCom）

在企业微信管理后台创建应用，开启接收消息功能，配置回调地址（需支持 GET/POST）。

| 变量 | 说明 |
|------|------|
| `WECOM_CORP_ID` | 企业 ID |
| `WECOM_CORP_SECRET` | 应用 Secret |
| `WECOM_AGENT_ID` | 应用 AgentId |
| `WECOM_TOKEN` | 消息加解密 Token |
| `WECOM_ENCODING_AES_KEY` | 消息加解密 Key（43 位） |

企业微信所有消息均经过 AES-256-CBC 加密，`ClawServer` 会自动解密，无需额外配置。

### 本地调试

使用 `ngrok` 或 `frp` 将本地端口暴露到公网，填入飞书/企业微信的回调地址：

```bash
ngrok http 3000
```

---

## Web UI 调试界面

本地调试时可启动可视化对话页面，支持工具调用过程展示和流式回复：

```bash
npm run dev:web
```

启动后访问 `http://localhost:3001`，页面提供：
- 对话输入框（Enter 发送，Shift+Enter 换行）
- 流式消息气泡
- 工具调用 / 执行结果展示

---

## 开发

```bash
npm test               # 运行测试
npm run typecheck      # 类型检查
npm run lint           # ESLint 检查
npm run build          # 编译输出到 dist/
npm run test:coverage  # 生成覆盖率报告
```
