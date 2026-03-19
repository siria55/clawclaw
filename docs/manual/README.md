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

运行 `pnpm dev:web` 后访问 `http://localhost:5173`，界面包含六个标签页，每个标签页对应独立 URL，支持直接访问和浏览器前进/后退。

### 对话（Chat）— `/#chat`

与 Agent 实时对话，观察完整的工具调用过程：
- 发送消息后立即显示等待动画
- 流式回复实时渲染
- 工具调用和执行结果以徽章形式展示
- 若 Agent 启用扩展思考，可展开查看思考过程

### 新闻库 — `/#news`

浏览 DailyDigestSkill 搜集保存的新闻：
- 关键词搜索（匹配标题 + 摘要）
- 分页浏览，每页 20 条
- 点击标题在新标签页打开原文
- 数据来源：`data/skills/daily-digest/YYYY-MM-DD.json`（每次 Skill 运行后自动写入，单条记录含 `category` 字段）

### 记忆库 — `/#memory`

浏览 Agent 通过 `memory_save` 工具保存的长期记忆：
- 关键词搜索（匹配内容 + 标签）
- 分页浏览，每页 20 条，按存入时间倒序
- 长记忆可点击「展开全文」查看完整内容

### Skills — `/#skills`

管理和手动触发已注册的 Skill：
- 查看所有 Skill 的 ID 和描述
- 点击「运行」手动触发单个 Skill
- 实时展示执行日志（深色终端面板，自动滚动）
- 执行完成后自动展示生成的截图预览

### 状态 — `/#status`

查看运行时状态：
- IM 平台连接状态（飞书 / 企业微信）
- 已注册的 Cron 任务（ID、表达式、触发消息）
- IM 事件日志（按群聊/直发分类，实时轮询）
- 点击刷新实时更新

### 设置 — `/#settings`

所有配置均保存在服务端，重启后自动恢复，无需重新输入：

**Agent 配置**（保存在 `data/agent-config.json`）：
- 名称（标识用）、系统提示词（System Prompt）
- 留空则使用默认提示词
- 保存后下一轮对话即生效，无需重启

**模型（LLM）配置**（保存在 `data/llm-config.json`）：
- API Key / Base URL / HTTPS Proxy / 模型名称
- 保存后立即生效，无需重启

**飞书 IM 配置**（保存在 `data/im-config.json`）：
- App ID / App Secret / Verification Token / Encrypt Key / Chat ID
- 保存后立即生效，无需重启

**飞书会话规则**：
- 长期记忆仍共用同一个记忆库
- 短期对话历史按 `sessionId` 存，不再只看 `chatId`
- 飞书线程回复会自动拆成独立 session；首次切到新 session 时，会带一条很短的上一段会话参考，尽量保持连贯

**Cron 任务管理**：
- 新增、删除定时任务
- 支持绑定 Skill（`skillId`），Skill 生成的截图自动发送到飞书
- 支持直发文本或图片（`direct: true`）

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

### 热更新

**`updateLLM(provider)`** — 运行时热换 LLM 提供商，无需重启。WebUI 模型配置保存后自动调用。

**`updateSystem(fn)`** — 运行时替换 system prompt 函数，下一轮对话即生效。WebUI Agent 配置保存后自动调用。

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

### 文件读取工具

通过 `createReadFileTool(getAllowedPaths)` 创建。Agent 可读取 `allowedPaths` 白名单内的文件，默认允许 `./data/skills`，方便 Agent 查阅 Skill 的历史输出。

---

## Skills 系统

Skills 是独立的内容生成单元，与 Agent 对话解耦，专注于"搜索 → 渲染 → 截图 → 保存"的流水线。

### 内置 Skill — DailyDigestSkill

每次运行：
1. 用 Playwright 浏览器搜索百度新闻，抓取候选链接
2. 按国内 / 国际两路用专用 LLM 抽取提示词，把候选链接筛成带 `category` 的文章列表（JSON）
3. 若模型返回 fenced json 或格式略脏的 near-JSON，系统会自动做兼容解析
4. 按国内 10 篇、国际 5 篇裁成最终日报
5. 将文字内容填入 HTML 模板，截图为 PNG，同时保存 `.html / .md / .png / .json` 四个文件
6. 返回 PNG 路径；WebUI 自动展示预览，Cron `sendSkillOutput` 发送到飞书

日报 HTML 的结构模板来自 `src/skills/daily-digest/template.html`、`section.html`、`item.html`，视觉样式来自 `src/skills/daily-digest/layout.css`；Skill 每次运行都会读取这些模板并写入当天导出的 HTML。
PNG 截图当前使用 4x 高清输出，版面宽度不变，但图片更适合放大查看。

输出目录：`data/skills/daily-digest/`

### 典型 Cron 配置

在设置页新增两条 Cron 任务：

| 时间 | 类型 | 说明 |
|------|------|------|
| `0 7 * * *` | `skillId: "daily-digest"` | 每天 7:00 生成日报 |
| `0 8 * * *` | `sendSkillOutput: "daily-digest"` | 每天 8:00 发送到飞书 |

---

## IM 平台接入

IM 凭证支持两种配置方式，**优先级：WebUI 设置 > 环境变量**。

未配置任何 IM 平台时，应用仍可正常启动，WebServer 调试界面照常使用。

### 会话隔离规则

- 飞书普通消息：沿用 `chatId` 作为 session
- 飞书线程消息：自动拆成 `chatId#thread:<rootId|threadId|parentId>`
- 长期记忆不拆分，仍由同一个 `MemoryStorage` 统一管理

### 方式一：WebUI 设置页（推荐）

启动后访问 `http://localhost:5173` → **设置** 标签页 → **飞书（Feishu）** 分区，填入凭证后点击「保存飞书配置」：

- 保存后**立即生效**，无需重启
- 凭证存储在 `data/im-config.json`，重启后自动恢复

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

`CronScheduler` 让 Agent 或 Skill 主动触发任务，支持标准 5 字段 cron 表达式：

```
分 时 日 月 周
```

示例：`0 9 * * *` — 每天早上 9:00 触发

四种触发模式：
- **Agent 模式**（默认）：Agent 执行指定消息，LLM 回复发送到 IM
- **直发模式**（`direct: true`）：直接发送预设文本或图片，不经 LLM
- **Skill 生成**（`skillId`）：执行指定 Skill，保存文件，不发 IM
- **Skill 投递**（`sendSkillOutput`）：找指定 Skill 最新 PNG，发送到飞书

生成和发送推荐拆成两个 Cron Job，分别设定时间，例如：
- 7:00 `skillId: "daily-digest"` — 生成日报
- 8:00 `sendSkillOutput: "daily-digest"` — 发送到飞书

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
