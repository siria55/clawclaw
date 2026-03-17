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

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | Agent 名称，用于日志和多 Agent 场景标识 |
| `system` | `string \| () => string \| Promise<string>` | 系统提示词，可以是静态字符串或动态函数 |
| `llm` | `LLMProvider` | LLM 适配器实例 |
| `tools` | `Tool[]`（可选） | Agent 可调用的工具列表 |
| `compressor` | `ContextCompressor \| undefined` | 上下文压缩器，超长历史自动压缩 |
| `getContext` | `(messages) => Message[]`（可选） | 每轮调用前注入临时上下文 |

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

## Agentic Context Engineering

### 动态系统提示词

`system` 支持函数形式，每轮 LLM 调用前重新求值：

```ts
const agent = new Agent({
  system: () => `你是一个助手。当前时间：${new Date().toLocaleString()}`,
  // ...
});
```

适合在提示词中注入当前时间、实时状态、用户偏好等随时间变化的信息。

### getContext 钩子

`getContext` 在每轮 LLM 调用前执行，返回的消息注入到本次调用，**不写入对话历史**：

```ts
const agent = new Agent({
  system: "你是一个助手",
  getContext: async (messages) => {
    // 根据最新用户消息自动检索记忆
    const lastUser = messages.filter(m => m.role === "user").at(-1);
    if (!lastUser) return [];
    const results = memoryStorage.search({ q: String(lastUser.content) });
    if (results.length === 0) return [];
    return [{
      role: "user",
      content: `[相关记忆]\n${results.map(r => r.snippet).join("\n")}`,
    }];
  },
  // ...
});
```

适合自动化 RAG：不需要 Agent 主动调工具，上下文在每轮调用前自动补充。

---

## Tool

Tool 是 Agent 可调用的外部能力单元，每个 Tool 包含：

- **name** — 唯一标识，snake_case 命名
- **description** — 给 LLM 看的功能描述，越清晰调用越准确
- **inputSchema** — 输入参数的 JSON Schema
- **execute** — 实际执行逻辑，输入经 Zod schema 校验后传入

使用 `defineTool()` 创建工具时，输入校验自动处理——若 LLM 传入非法参数，工具会返回错误信息而不是抛出异常。

---

## 记忆工具

`createMemoryTools(storage)` 返回三个工具，赋予 Agent 长期记忆能力：

| 工具 | 说明 |
|------|------|
| `memory_save` | 保存文本记忆，支持标签 |
| `memory_search` | 关键词检索，返回 id + 摘要列表 |
| `memory_get` | 按 id 取回完整内容 |

典型用法：Agent 在对话中主动调用 `memory_search` 查找相关知识（RAG pull），用 `memory_save` 记录新的信息。

```ts
import { MemoryStorage, createMemoryTools } from "clawclaw";

const memoryStorage = new MemoryStorage("./data/memory.json");

const agent = new Agent({
  system: "你是一个助手，可以保存和检索知识。",
  llm,
  tools: [...createMemoryTools(memoryStorage)],
  compressor: undefined,
});
```

---

## 新闻工具

`createSaveNewsTool(storage)` 返回 `save_news` 工具，Agent 搜索到新闻后调用保存：

```ts
import { NewsStorage, createSaveNewsTool } from "clawclaw";

const newsStorage = new NewsStorage("./data/news.json");

const agent = new Agent({
  tools: [createSaveNewsTool(newsStorage)],
  // ...
});
```

保存的新闻可在 Web UI 新闻库标签页浏览，也可通过 `GET /api/news` 查询。

---

## LLM 适配器

通过 `createLLM()` 工厂方法创建适配器，当前支持：

| 适配器 | 标识符 | 默认模型 |
|--------|--------|----------|
| Anthropic | `"anthropic"` | `claude-sonnet-4-6` |

如需接入其他 LLM，实现 `LLMProvider` 接口即可。

---

## Context Compression — 上下文压缩

对话轮数过多时，`LLMContextCompressor` 自动压缩中间历史，保留关键信息：

- **threshold** — 触发压缩的 token 估算阈值，默认 6000（约 24000 字符）
- **keepRecentPairs** — 压缩后保留最近 N 轮完整对话，默认 4

压缩策略：保留首条消息 → LLM 摘要中间部分 → 保留最近 N 轮。

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

Webhook 路径默认为 `/feishu`。飞书首次配置时会发送 URL 验证请求，`ClawServer` 会自动响应。

### 企业微信（WeCom）

在企业微信管理后台创建应用，开启接收消息功能，配置回调地址（需支持 GET/POST）。

| 变量 | 说明 |
|------|------|
| `WECOM_CORP_ID` | 企业 ID |
| `WECOM_CORP_SECRET` | 应用 Secret |
| `WECOM_AGENT_ID` | 应用 AgentId |
| `WECOM_TOKEN` | 消息加解密 Token |
| `WECOM_ENCODING_AES_KEY` | 消息加解密 Key（43 位） |

企业微信所有消息均经过 AES-256-CBC 加密，`ClawServer` 会自动解密。

### 本地调试

使用 `ngrok` 或 `frp` 将本地端口暴露到公网，填入飞书/企业微信的回调地址：

```bash
ngrok http 3000
```

---

## Cron Job — 定时任务

`CronScheduler` 让 Agent 主动触发任务，不再只等待消息。支持标准 5 字段 cron 表达式（分 时 日 月 周）。

支持的语法：`*` / `*/n` / `a-b` / `a,b,c` / `a-b/n`

任务触发后，Agent 执行 `message` 并将回复通过 `IMPlatform.send()` 发送到指定 `chatId`。

---

## Web UI 调试界面

本地调试时可启动可视化界面，查看对话过程、管理设置、浏览新闻库：

```bash
npm run dev:web
```

启动后访问 `http://localhost:3000`，界面包含四个标签页：

### 对话（Chat）

- 消息气泡（用户发出右侧显示，助手回复左侧显示）
- 发送后立即显示等待动画，有即时反馈
- 流式回复实时渲染，带光标动画
- 工具调用 / 执行结果以徽章形式展示
- 若 Agent 启用了扩展思考（extended thinking），可展开查看思考过程

### 新闻库

- 关键词搜索（匹配标题 + 摘要）
- 标签过滤
- 分页浏览，每页 20 条
- 点击标题在新标签页打开原文

### 状态

- 查看 IM 平台连接状态（飞书 / 企业微信）
- 查看已注册的 Cron 任务列表（id、表达式、消息内容、时区）
- 点击刷新按钮实时更新

### 设置

- API Key / Base URL / HTTPS Proxy / Model 配置
- 配置保存在 `localStorage`，刷新后自动恢复
- 每次发消息时通过 `X-Claw-Config` 请求头传给服务端，覆盖服务端默认配置
- 点击「清除配置」恢复使用服务端默认设置

---

## 开发

```bash
npm test               # 运行测试
npm run typecheck      # 类型检查
npm run lint           # ESLint 检查
npm run build          # 编译输出到 dist/
npm run test:coverage  # 生成覆盖率报告
```
