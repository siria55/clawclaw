# 使用说明

## 快速上手

**第一步：安装依赖**

```bash
pnpm install
```

**第二步：配置环境变量**

```bash
cp .env.example .env
```

然后编辑 `.env`，填入必要配置（至少需要 `ANTHROPIC_API_KEY`）。

**第三步：启动调试界面**

```bash
pnpm dev:web
```

浏览器访问 `http://localhost:5173`，即可看到 Web 调试界面。

**第四步：生产部署**

```bash
pnpm build
pnpm start
```

---

## 环境变量

| 变量 | 说明 | 是否必填 |
|------|------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | 必填 |
| `ANTHROPIC_BASE_URL` | 自定义 API 地址（代理或镜像站） | 可选 |
| `HTTPS_PROXY` | HTTPS 代理，格式 `http://host:port` | 可选 |
| `HTTP_PROXY` | HTTP 代理（HTTPS_PROXY 未设置时生效） | 可选 |
| `PORT` | ClawServer 监听端口，默认 `3000` | 可选 |
| `FEISHU_APP_ID` | 飞书应用 App ID | 接飞书时必填 |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret | 接飞书时必填 |
| `FEISHU_VERIFICATION_TOKEN` | 飞书事件验证 Token | 接飞书时必填 |
| `FEISHU_ENCRYPT_KEY` | 飞书消息加密密钥 | 可选 |
| `FEISHU_CHAT_ID` | Cron 任务推送目标会话 ID | 使用 Cron 时必填 |
| `WECOM_CORP_ID` | 企业微信企业 ID | 接企业微信时必填 |
| `WECOM_CORP_SECRET` | 企业微信应用 Secret | 接企业微信时必填 |
| `WECOM_AGENT_ID` | 企业微信应用 AgentId | 接企业微信时必填 |
| `WECOM_TOKEN` | 企业微信消息加解密 Token | 接企业微信时必填 |
| `WECOM_ENCODING_AES_KEY` | 企业微信消息加解密 Key（43 位） | 接企业微信时必填 |

---

## 命令行工具

详细的命令说明见 [cli.md](cli.md)。

常用命令速查：

| 命令 | 说明 |
|------|------|
| `pnpm dev:web` | 启动本地调试界面（API + Vite UI） |
| `pnpm dev` | 启动完整应用（含 IM Webhook 服务） |
| `pnpm start` | 生产模式启动 |
| `pnpm build` | 编译 TypeScript + 构建前端 |
| `pnpm test` | 运行所有测试 |

---

## Web 调试界面

运行 `pnpm dev:web` 后访问 `http://localhost:5173`，界面包含四个标签页：

### 对话（Chat）

与 Agent 实时对话，观察完整的工具调用过程：
- 发送消息后立即显示等待动画
- 流式回复实时渲染
- 工具调用和执行结果以徽章形式展示
- 若 Agent 启用扩展思考，可展开查看思考过程

### 新闻库

浏览 Agent 搜集保存的新闻：
- 关键词搜索（匹配标题 + 摘要）
- 按标签筛选
- 分页浏览，每页 20 条
- 点击标题在新标签页打开原文

### 状态

查看运行时状态：
- IM 平台连接状态（飞书 / 企业微信）
- 已注册的 Cron 任务（ID、表达式、触发消息）
- 点击刷新实时更新

### 设置

调整 Agent 运行参数（保存在浏览器本地，无需重启服务）：
- API Key / Base URL / HTTPS Proxy
- 模型名称（默认 `claude-sonnet-4-6`）
- 点击「清除配置」恢复服务端默认设置

---

## Agent

Agent 是框架的核心单元，负责 LLM 调用与工具执行的编排。

### 配置参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | Agent 名称，用于日志标识 |
| `system` | `string \| () => string` | 系统提示词，支持动态函数 |
| `llm` | `LLMProvider` | LLM 适配器实例 |
| `tools` | `Tool[]` | Agent 可调用的工具列表（可选） |
| `compressor` | `ContextCompressor` | 上下文压缩器（可选） |
| `getContext` | `(messages) => Message[]` | 每轮调用前注入临时上下文（可选） |
| `maxTurns` | `number` | 最大执行轮数，默认 20 |

### 运行模式

**`run()`** — 阻塞执行，返回完整消息历史，适合批处理。

**`stream()`** — 逐步产出事件，适合实时反馈场景。

---

## Agentic Context Engineering

### 动态系统提示词

`system` 参数支持函数形式，每次 LLM 调用前自动重新求值，可注入当前时间、实时状态等动态信息。

### getContext 钩子

`getContext` 在每轮 LLM 调用前执行，返回的消息注入到本次调用，不写入对话历史。

适用场景：根据用户消息内容自动检索记忆、注入状态摘要、实现自动 RAG（检索增强生成）。

---

## 内置工具

### 记忆工具

通过 `createMemoryTools(storage)` 创建，赋予 Agent 长期记忆能力：

| 工具 | 说明 |
|------|------|
| `memory_save` | 保存文本记忆，支持标签分类 |
| `memory_search` | 关键词检索，返回 id + 摘要列表 |
| `memory_get` | 按 id 取回完整记忆内容 |

### 新闻工具

通过 `createSaveNewsTool(storage)` 创建。Agent 调用 `save_news` 将搜索到的新闻存入本地新闻库，可在 Web UI 新闻库标签页浏览，或通过 `GET /api/news` 查询。

---

## IM 平台接入

### 飞书（Feishu/Lark）

1. 在飞书开放平台创建企业自建应用
2. 开启「接收消息」事件权限
3. 配置事件 Webhook 地址：`http://your-server/feishu`
4. 将 `FEISHU_*` 环境变量填入 `.env`

飞书首次配置时会发送 URL 验证请求，服务会自动响应。

本地调试时，使用 ngrok 暴露端口：

```bash
ngrok http 3000
```

### 企业微信（WeCom）

1. 在企业微信管理后台创建应用
2. 开启「接收消息」功能，配置回调地址：`http://your-server/wecom`
3. 将 `WECOM_*` 环境变量填入 `.env`

企业微信所有消息均经 AES-256-CBC 加密，服务会自动解密。

---

## Cron 定时任务

`CronScheduler` 让 Agent 主动触发任务，支持标准 5 字段 cron 表达式：

```
分 时 日 月 周
```

示例：`0 9 * * *` — 每天早上 9:00 触发

任务触发后，Agent 执行指定消息，并通过 IM 平台将回复发送到 `FEISHU_CHAT_ID` 指定的会话。

---

## Context Compression — 上下文压缩

对话过长时，`LLMContextCompressor` 自动压缩历史，防止 context window 溢出：

- 默认 token 阈值：6000（约 24000 字符）
- 策略：保留首条消息 → LLM 摘要中间部分 → 保留最近 4 轮完整对话

---

## LLM 适配器

当前支持 Anthropic Claude（默认模型 `claude-sonnet-4-6`）。

如需代理，在 `.env` 中设置 `ANTHROPIC_BASE_URL` 或 `HTTPS_PROXY`。

如需接入其他 LLM，实现 `LLMProvider` 接口即可。
