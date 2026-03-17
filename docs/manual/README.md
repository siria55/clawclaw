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

然后编辑 `.env`，飞书/企业微信等 IM 凭证可留空，启动后在 WebUI 设置页配置。

**第三步：启动调试界面**

```bash
pnpm dev:web
```

浏览器访问 `http://localhost:5173`，即可看到 Web 调试界面。首次使用在「设置」页填入 API Key 并保存。

**第四步：生产部署**

```bash
pnpm build
pnpm start
```

---

## 环境变量

| 变量 | 说明 | 是否必填 |
|------|------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | 可选（WebUI 设置页可替代） |
| `ANTHROPIC_BASE_URL` | 自定义 API 地址（代理或镜像站） | 可选（WebUI 设置页可替代） |
| `HTTPS_PROXY` | HTTPS 代理，格式 `http://host:port` | 可选 |
| `HTTP_PROXY` | HTTP 代理（HTTPS_PROXY 未设置时生效） | 可选 |
| `PORT` | ClawServer 监听端口，默认 `3000` | 可选 |
| `FEISHU_APP_ID` | 飞书应用 App ID | 可选（WebUI 设置页可替代） |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret | 可选（WebUI 设置页可替代） |
| `FEISHU_VERIFICATION_TOKEN` | 飞书事件验证 Token | 可选（WebUI 设置页可替代） |
| `FEISHU_ENCRYPT_KEY` | 飞书消息加密密钥 | 可选 |
| `FEISHU_CHAT_ID` | Cron 任务推送目标会话 ID | 可选（WebUI 设置页可替代） |
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

两类配置均保存在服务端，重启后自动恢复，无需重新输入：

**模型（LLM）配置**（保存在 `data/llm-config.json`）：
- API Key / Base URL / HTTPS Proxy / 模型名称
- 保存后立即生效，无需重启
- API Key 显示为脱敏值（`sk-a****`），修改后重新保存即可更新

**飞书 IM 配置**（保存在 `data/im-config.json`）：
- App ID / App Secret / Verification Token / Encrypt Key / Chat ID
- 保存后立即生效，无需重启
- 已保存的敏感字段显示为脱敏值（如 `cli_****`）

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

IM 凭证支持两种配置方式，**优先级：WebUI 设置 > 环境变量**。

未配置任何 IM 平台时，应用仍可正常启动，WebServer 调试界面照常使用。

### 方式一：WebUI 设置页（推荐）

启动后访问 `http://localhost:5173` → **设置** 标签页 → **飞书（Feishu）** 分区，填入凭证后点击「保存飞书配置」：

- 保存后**立即生效**，无需重启
- 凭证存储在 `data/im-config.json`，重启后自动恢复
- 已保存的敏感字段显示为脱敏值（如 `cli_****`），修改后重新保存即可更新

### 方式二：环境变量（适合生产部署）

编辑 `.env`：

```
FEISHU_APP_ID=cli_xxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=         # 可选
FEISHU_CHAT_ID=oc_xxxxxxxxxx  # 可选，Cron 日报推送目标群
```

### 飞书开放平台配置步骤

1. 进入[飞书开放平台](https://open.feishu.cn) → 创建**企业自建应用**
2. 「添加应用能力」→ 选**机器人**
3. 「事件与回调」→ 添加事件：`im.message.receive_v1`
4. 配置 Webhook 回调地址：`http://your-server:3000/feishu`
5. 记录 App ID、App Secret、Verification Token，填入 WebUI 或 `.env`

飞书首次配置时会发送 URL 验证请求，服务自动响应，无需手动处理。

**本地调试**（让飞书能回调到本机）：

```bash
ngrok http 3000
```

将 ngrok 生成的 `https://xxxx.ngrok.io/feishu` 填入飞书回调地址。

### 企业微信（WeCom）

1. 在企业微信管理后台创建应用，开启「接收消息」
2. 配置回调地址：`http://your-server:3000/wecom`
3. 将 `WECOM_*` 环境变量填入 `.env`（企业微信暂不支持 WebUI 配置）

企业微信所有消息均经 AES-256-CBC 加密，服务自动解密。

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
