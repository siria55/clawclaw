# 使用说明

## 快速上手

**安装依赖**

```bash
corepack enable
corepack pnpm install
corepack pnpm playwright:install
```

**配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env`，填入至少一个 LLM API Key。飞书等 IM 凭证可留空，启动后在 WebUI 里配置。

**启动调试界面**

```bash
corepack pnpm dev:web
```

访问 `http://localhost:5173`。首次使用在 `系统 > 设置 > 模型` 选择 Provider 并填入 API Key。

**生产部署**

```bash
corepack pnpm build
corepack pnpm start
```

---

## 环境变量

| 变量 | 说明 | 是否必填 |
|------|------|----------|
| `LLM_PROVIDER` | 默认 LLM 提供商，`anthropic` 或 `openai` | 可选，默认 `anthropic` |
| `ANTHROPIC_API_KEY` | Anthropic API Key | 可选（WebUI 可替代） |
| `ANTHROPIC_BASE_URL` | 自定义 API 地址 | 可选 |
| `OPENAI_API_KEY` | OpenAI API Key | 可选（WebUI 可替代） |
| `OPENAI_BASE_URL` | 自定义 OpenAI API 地址 | 可选 |
| `HTTPS_PROXY` | HTTPS 代理，格式 `http://host:port` | 可选 |
| `PORT` | ClawServer 监听端口，默认 `3000` | 可选 |
| `FEISHU_APP_ID` | 飞书应用 App ID | 可选（WebUI 可替代） |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret | 可选（WebUI 可替代） |
| `FEISHU_VERIFICATION_TOKEN` | 飞书事件验证 Token | 可选（WebUI 可替代） |
| `FEISHU_ENCRYPT_KEY` | 飞书消息加密密钥 | 可选 |
| `FEISHU_CHAT_ID` | Cron 任务默认推送目标 | 可选（WebUI 可替代） |
| `BRAVE_SEARCH_API_KEY` | Brave Search API Key | 运行日报时必填（WebUI 可替代） |
| `WECOM_CORP_ID` | 企业微信企业 ID | 接企业微信时必填 |
| `WECOM_CORP_SECRET` | 企业微信应用 Secret | 接企业微信时必填 |
| `WECOM_AGENT_ID` | 企业微信应用 AgentId | 接企业微信时必填 |
| `WECOM_TOKEN` | 企业微信消息加解密 Token | 接企业微信时必填 |
| `WECOM_ENCODING_AES_KEY` | 企业微信消息加解密 Key（43 位） | 接企业微信时必填 |

---

## 命令行速查

详细说明见 [cli.md](cli.md)。

| 命令 | 说明 |
|------|------|
| `corepack pnpm dev:web` | 启动本地调试界面（API + Vite UI） |
| `corepack pnpm dev` | 启动完整应用（含 IM Webhook 服务） |
| `corepack pnpm start` | 生产模式启动 |
| `corepack pnpm build` | 编译 TypeScript + 构建前端 |
| `corepack pnpm test` | 运行所有测试 |

---

## Web 调试界面

访问 `http://localhost:5173`，界面按 6 个一级 tab 组织，每个 tab 下再分二级 tab，支持直接 hash 链接和浏览器前进/后退。

### 对话 `/#chat`

与 Agent 实时对话，查看工具调用和思考过程。AI 回复支持一键复制或拖拽选中，错误卡片支持复制（含 HTTP 状态码）。

### 内容 `/#news` / `/#memory`

- **新闻库**：浏览 `daily-digest` 搜集的新闻，支持关键词搜索和分页
- **记忆库**：浏览通过 `memory_save` 写入的长期记忆；记忆库为空表示 Agent 尚未显式保存

### 日报记录 `/#digest`

查看 `daily-digest` 每次执行的 Brave 请求参数、原始返回结果、LLM 抽取候选明细（含通过率和诊断提示）、最终入选文章。国内链路会额外显示大陆候选与非大陆回退两个阶段。

### 自动化 `/#cron` / `/#skills` / `/#search`

- **Cron**：管理定时任务，支持新增、编辑、删除、立即执行；发送目标每行一个 chatId，可同时发给多个用户或群聊（`ou_...` 为用户，`oc_...` 为群聊）
- **Skills**：手动运行 Skill，实时查看执行日志，完成后预览截图
- **搜索**：集中管理 Brave Search API Key、`daily-digest` 搜索主题和 Brave `news/search` 请求参数（`count / freshness / safesearch` 等），保存到 `data/skills/daily-digest/config.json`

### IM `/#im` / `/#im-status` / `/#im-config`

- **消息**：IM 事件实时日志，显示平台、会话名 / 用户名和原始 ID，支持群聊 / 直发筛选
- **状态**：IM 平台连接状态、飞书运行摘要、机器人已加入的群聊列表
- **配置**：飞书 IM 凭证，填写 Chat ID 后自动解析显示目标用户名 / 群名

### 系统 `/#status` / `/#settings`

- **状态**：运行概览、配置文件状态、最近 IM 活动（含飞书用户名 / 群名）
- **设置**：Agent 名称和系统提示词、飞书文档挂载、LLM 配置

**旧 hash 兼容**：`#im-status` → `IM > 状态`，`#im-config` → `IM > 配置`，`#search-config` → `自动化 > 搜索`。

---

## Agent 配置

在 `系统 > 设置` 中保存，保存后下一轮对话即生效：

| 参数 | 说明 |
|------|------|
| 名称 | Agent 标识名，影响身份类问答（"你是谁"）时的回答 |
| 系统提示词 | 自定义 Agent 行为，留空使用默认提示词 |

如需 Agent 更积极地保存长期记忆，可在系统提示词里明确哪些信息应调用 `memory_save`。

---

## LLM 配置

支持 Anthropic Claude 和 OpenAI ChatGPT，在 `系统 > 设置 > 模型` 中切换：

- Provider、API Key、Base URL（代理 / 网关）、HTTPS Proxy、模型名称
- 保存后立即生效，无需重启
- 也可通过 `LLM_PROVIDER` 环境变量设置启动时默认 provider

---

## 飞书文档挂载

在 `系统 > 设置 > 飞书文档资料` 中维护文档名称和 URL，保存后点击"同步"，服务端用 Playwright 抓取正文并缓存到本地。Agent 每轮对话前会自动检索命中片段并注入为上下文，适合挂载制度、SOP、FAQ 等内部资料。

---

## 飞书接入

### 方式一：WebUI 配置（推荐）

访问 `IM > 配置`，填入凭证后保存，立即生效，凭证存储在 `data/im/im-config.json`。

### 方式二：环境变量

```
FEISHU_APP_ID=cli_xxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx
FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxx
FEISHU_ENCRYPT_KEY=         # 可选
FEISHU_CHAT_ID=oc_xxxxxxxxxx  # 可选，Cron 默认推送目标
```

### 飞书开放平台配置

1. 进入[飞书开放平台](https://open.feishu.cn) → 创建企业自建应用
2. 「添加应用能力」→ 机器人
3. 「事件与回调」→ 添加事件：`im.message.receive_v1`
4. 配置回调地址：`http://your-server:3000/feishu`
5. 将 App ID、App Secret、Verification Token 填入 WebUI 或 `.env`

**本地调试**（让飞书能回调到本机）：

```bash
ngrok http 3000
```

将生成的 `https://xxxx.ngrok.io/feishu` 填入飞书回调地址。

**飞书会话规则：**
- 群聊里只有明确 `@机器人` 的消息才会触发回复，普通群消息只记录日志
- 线程回复自动拆为独立 session，首次进入新 session 时注入上一段会话极短摘要
- 长期记忆仍共用同一个记忆库，不按 session 拆分

**飞书日报快捷指令：**
- "给我今天的新闻" → 发送今日日报图片
- "今天新闻文本版" → 发送今日 Markdown 正文
- 当天日报不存在时，服务端先自动生成再发送
- 群聊里带 `@机器人` 的同类指令也生效

### 企业微信接入

1. 在企业微信管理后台创建应用，开启「接收消息」
2. 配置回调地址：`http://your-server:3000/wecom`
3. 将 `WECOM_*` 环境变量填入 `.env`（企业微信暂不支持 WebUI 配置）

---

## Cron 定时任务

`CronScheduler` 支持标准 5 字段 cron 表达式（`分 时 日 月 周`），在 `自动化 > Cron` 中管理。

四种触发模式：
- **Agent 模式**（默认）：Agent 执行指定消息，LLM 回复发送到 IM
- **直发模式**（`direct: true`）：直接发送预设文本、Markdown 或图片
- **Skill 生成**（`skillId`）：执行指定 Skill，保存文件，不发 IM
- **Skill 投递**（`sendSkillOutput`）：发送 Skill 最新 PNG 到飞书

**典型日报 Cron（首次启动时自动初始化）：**

| 时间 | 类型 | 说明 |
|------|------|------|
| `0 9 * * *` | `skillId: "daily-digest"` | 每天 9:00 生成日报（可不填发送目标） |
| `0 10 * * *` | `sendSkillOutput: "daily-digest"` | 每天 10:00 发送当日 PNG 到飞书 |

若 10:00 发送时当天 PNG 不存在，会明确发失败提醒，不回退发旧日报。

---

## DailyDigestSkill

`自动化 > Skills > daily-digest` 可手动运行、查看实时日志、预览截图。

搜索配置推荐统一在 `自动化 > 搜索` 管理：
- **Brave Search API Key** — 也可设 `BRAVE_SEARCH_API_KEY` 环境变量
- **搜索主题** — 国内 / 国际查询词列表，默认收紧到中国大陆教育语境
- **Brave 请求参数** — `count / freshness / safesearch` 等（默认：`count=20`，`freshness=p3d`）

如需排查"为什么搜到很少新闻"，打开 `日报记录` 查看对应 run 的 Brave 原始返回和 LLM 抽取阶段数据。

---

## Context Compression

对话过长时，`LLMContextCompressor` 自动压缩历史：

- 触发阈值：约 24000 字符（估算 6000 token）
- 策略：保留首条消息 → LLM 摘要中间部分 → 保留最近 4 轮完整对话
