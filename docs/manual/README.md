# 使用说明

## 快速上手

**第一步：安装依赖**

```bash
corepack enable
corepack pnpm install
corepack pnpm playwright:install
```

**第二步：配置环境变量**

```bash
cp .env.example .env
```

然后编辑 `.env`，飞书/企业微信等 IM 凭证可留空，启动后也可以直接在 WebUI 里配置。
运行产生的本地状态会写入 `data/`，该目录不应提交到 GitHub。

**第三步：启动调试界面**

```bash
corepack pnpm dev:web
```

浏览器访问 `http://localhost:5173`，即可看到 Web 调试界面。首次使用在「设置」页选择 Provider，填入 API Key 并保存。

**第四步：生产部署**

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
| `ANTHROPIC_BASE_URL` | 自定义 API 地址（代理或镜像站） | 可选（WebUI 可替代） |
| `OPENAI_API_KEY` | OpenAI API Key | 可选（WebUI 可替代） |
| `OPENAI_BASE_URL` | 自定义 OpenAI API 地址（网关或代理） | 可选（WebUI 可替代） |
| `HTTPS_PROXY` | HTTPS 代理，格式 `http://host:port` | 可选 |
| `HTTP_PROXY` | HTTP 代理（HTTPS_PROXY 未设置时生效） | 可选 |
| `PORT` | ClawServer 监听端口，默认 `3000` | 可选 |
| `FEISHU_APP_ID` | 飞书应用 App ID | 可选（WebUI 可替代） |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret | 可选（WebUI 可替代） |
| `FEISHU_VERIFICATION_TOKEN` | 飞书事件验证 Token | 可选（WebUI 可替代） |
| `FEISHU_ENCRYPT_KEY` | 飞书消息加密密钥 | 可选 |
| `FEISHU_CHAT_ID` | Cron 任务推送目标会话 ID | 可选（WebUI 可替代） |
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
| `corepack pnpm dev:web` | 启动本地调试界面（API + Vite UI） |
| `corepack pnpm dev` | 启动完整应用（含 IM Webhook 服务） |
| `corepack pnpm start` | 生产模式启动 |
| `corepack pnpm build` | 编译 TypeScript + 构建前端 |
| `corepack pnpm test` | 运行所有测试 |

---

## Web 调试界面

运行 `corepack pnpm dev:web` 后访问 `http://localhost:5173`，界面现在按 5 个一级 tab 组织，每个一级 tab 下再分二级 tab；所有页面仍然使用 hash 路由，支持直接访问和浏览器前进/后退。

### 对话 — `/#chat`

与 Agent 实时对话，观察完整的工具调用过程：
- 发送消息后立即显示等待动画
- 流式回复实时渲染
- AI 回复支持直接选中文本复制，也支持一键复制原始文本，便于转发到 IM、文档或其他工具
- 当聊天请求失败时，错误卡片也支持复制；`401` 等报错会直接显示状态码和服务端返回内容
- 如果 OpenAI 或代理网关返回了不兼容的异常 JSON，页面现在也会尽量展示真实错误，不再只显示内部异常
- 工具调用和执行结果以徽章形式展示
- 若 Agent 启用扩展思考，可展开查看思考过程

### 内容 — `/#news` / `/#memory`

`内容` 一级 tab 下包含两个二级 tab：

- `新闻库`（`/#news`）：浏览 DailyDigestSkill 搜集保存的新闻，支持关键词搜索、分页浏览、打开原文；数据来源为 `data/skills/daily-digest/YYYY-MM-DD.json`
- `记忆库`（`/#memory`）：浏览 Agent 通过 `memory_save` 保存的长期记忆，支持关键词搜索、分页、展开全文；数据文件为 `data/agent/memory.json`
- 如果记忆库为空，通常表示 Agent 还没有显式调用 `memory_save`
- 当前版本会自动检索已有记忆，但不会自动把每轮对话写入长期记忆

### 日报记录 — `/#digest`

- `日报记录` 是单独的一级 tab，用来排查 `daily-digest` 每次执行到底搜到了什么、筛掉了什么
- 页面会展示最近 run 列表，并可查看每次执行的 Brave 请求参数、原始返回、解析后的候选链接、LLM 抽取结果和最终入选文章
- `LLM 抽取` 区块会额外显示送入 LLM 的候选明细、抽取通过率、候选与最终入选对照，以及诊断提示，便于判断到底是搜索不准还是提示词过滤过严
- 对应持久化文件位于 `data/skills/daily-digest/runs/{runId}.json`

### 自动化 — `/#cron` / `/#skills` / `/#search`

`自动化` 一级 tab 下包含三个二级 tab：

- `Cron`（`/#cron`）：管理所有定时任务，支持新增、编辑、删除、立即执行；发送目标支持多行输入，每行一个 chatId，可同时发给个人和群
- `Cron` 常见飞书目标 ID：`ou_...` 为用户 / 私聊，`oc_...` 为群聊
- 已保存的飞书 Cron 目标会同时显示用户名 / 群名和原始 ID，便于确认到底发给谁
- `Cron` 支持绑定 Skill（`skillId`）或发送最新 Skill 图片（`sendSkillOutput`）
- `Cron` 支持直发文本、Markdown 或图片（`direct: true`）
- `Skills`（`/#skills`）：查看所有 Skill、手动运行单个 Skill、实时查看执行日志，并在完成后预览生成截图
- `daily-digest` 卡片会把手动运行、日志和图片预览放在一起；搜索主题兼容保留在卡片内，保存后可直接按新配置运行
- `搜索`（`/#search`）：集中管理 Brave 搜索相关配置，可直接修改 `Brave Search API Key`、`daily-digest` 搜索主题，以及 Brave `news/search` 的 `count / offset / freshness / safesearch / ui_lang / spellcheck / extra_snippets / goggles` 与国内 / 国际 `country / search_lang`；保存后写入 `data/skills/daily-digest/config.json`
- 默认搜索主题现在更聚焦 `AI + 教育`，例如 `AI 教育`、`生成式 AI 教育`、`教育科技 AI`、`教育 AI 公司`、`OpenAI education`

### IM — `/#im` / `/#im-status` / `/#im-config`

`IM` 一级 tab 下包含三个二级 tab：

- `消息`（`/#im`）：展示 IM 事件日志实时轮询，并支持按群聊 / 直发筛选；可看到平台、`用户名 / 群名 + 原始 ID`、回复摘要
- `消息` 子页里的飞书记录会直接显示 `会话 群名（oc_xxx）`、`用户 用户名（ou_xxx）`
- 若飞书用户名 / 群名暂时未解析出来，页面会明确显示“未解析用户名 / 群名”，并保留原始 ID；常见原因是飞书权限未开通，或事件本身未携带名称
- `状态`（`/#im-status`）：展示 IM 平台连接状态、飞书运行摘要、飞书群聊列表；页内导航固定在页面右侧，可跳到平台连接、飞书运行、群聊摘要
- `状态` 子页里的飞书运行摘要会补充显示默认目标名称，不再只看到 `Chat ID`
- `配置`（`/#im-config`）：展示飞书 IM 配置表单和当前飞书运行摘要；配置保存在 `data/im/im-config.json`，保存后立即生效，无需重启
- 在飞书 `Chat ID` 输入框下方，页面会自动解析并显示对应的用户名 / 群名；运行摘要里也会显示当前目标名称
- 若希望 Agent 能读取部门人数、直属成员等组织信息，还需在飞书开放平台开通通讯录 / 部门读取权限
- Agent 回复若包含明显 Markdown 结构，飞书会尽量按原生 Markdown 渲染发送；如果需要强制直发 Markdown，可在 `Cron` 里把直发类型切到 `Markdown`
- 在飞书里直接问“给我今天的新闻”时，系统会优先发送今日新闻图片；文字版可回复“今天新闻文本版”
- 飞书群聊里只有带上 `@机器人` 的消息才会触发回复；未 `@` 的普通群消息只会记录到 IM 日志
- 在飞书群聊里带上 `@机器人` 再发这两类指令，也同样生效
- 如果今日日报文件还不存在，服务端会先自动执行一次 `daily-digest` 再发送

### 系统 — `/#status` / `/#settings`

`系统` 一级 tab 下包含两个二级 tab：

- `状态`（`/#status`）：查看运行时状态；页内导航固定在页面右侧，可直接跳到运行概览、配置文件；可查看配置文件状态、关键指标、最近一条 IM 活动摘要
- 最近一条 IM 活动若来自飞书，会同时显示会话名 / 用户名和原始 ID
- `设置`（`/#settings`）：所有配置均保存在服务端，重启后自动恢复；页内导航固定在页面右侧，可直接跳到 Agent、飞书文档、模型

**Agent 配置**（保存在 `data/agent/agent-config.json`）：
- 名称（标识用）、系统提示词（System Prompt）
- 留空则使用默认提示词
- 保存后下一轮对话即生效，无需重启
- `allowedPaths` 默认包含 `./data/skills` 和 `./data/agent/feishu-docs`
- 如需更积极地保存长期记忆，可在系统提示词里明确哪些信息应调用 `memory_save`
- 当用户问“你谁”“你叫什么”“你是做什么的”这类身份问题时，Agent 会优先依据这里的名称和系统提示词用第一人称回答

**飞书文档资料**（保存在 `data/agent/feishu-docs/config.json`）：
- 维护文档名称和飞书 URL，可按需启用或停用
- 先保存挂载配置，再点击同步；服务端会抓取正文并缓存到 `data/agent/feishu-docs/{docId}.json`
- Agent 每轮会按用户问题检索命中的文档片段，并优先据此回答
- 适合挂载制度、SOP、FAQ、产品说明等内部资料

**模型（LLM）配置**（保存在 `data/agent/llm-config.json`）：
- Provider（`Anthropic Claude` / `OpenAI ChatGPT`）
- API Key / Base URL / HTTPS Proxy / 模型名称
- 保存后立即生效，无需重启

飞书 IM 配置已移到 `IM` 页的 `配置` 子 tab。

旧链接仍兼容：
- `#memory`、`#skills`、`#settings` 仍可直接打开对应二级页
- `#search-config` 会直接打开 `自动化 > 搜索`
- `#im-status` / `#im-config` 会直接打开 `IM` 页对应子 tab

新入口也可直接访问：`#digest` 可直接打开 `日报记录`。

**飞书会话规则**：
- 长期记忆仍共用同一个记忆库
- 短期对话历史按 `sessionId` 存，不再只看 `chatId`
- 飞书线程回复会自动拆成独立 session；首次切到新 session 时，会带一条很短的上一段会话参考，尽量保持连贯
- 当机器人被加入飞书群时，系统会记录群 ID 和群名，`IM` 页的 `状态` 子 tab 可直接查看已记录群聊

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

当前项目还会用同一机制自动注入命中的挂载飞书文档片段，因此 Agent 回答时会同时参考长期记忆和已同步的文档正文。

需要注意：
- 这里的“自动”仅指自动检索和自动注入上下文，不包含自动写入长期记忆
- 长期记忆的新增仍依赖 Agent 主动调用 `memory_save`

---

## 内置工具

### 记忆工具

通过 `createMemoryTools(storage)` 创建，赋予 Agent 长期记忆能力：

| 工具 | 说明 |
|------|------|
| `memory_save` | 保存文本记忆，支持标签分类 |
| `memory_search` | 关键词检索，返回 id + 摘要列表 |
| `memory_get` | 按 id 取回完整记忆内容 |
| `feishu_department_info` | 查询飞书部门信息，可回答部门人数、上级部门、部门 ID |
| `feishu_department_users` | 查询飞书部门直属成员列表 |

关于 `memory_save`：
- 这是当前版本唯一的长期记忆写入口
- “重要信息”目前没有固定阈值或独立规则引擎，是否保存由模型结合 system prompt、工具描述和当前上下文决定
- 如果希望稳定保存某类信息，建议在 Agent 系统提示词里明确要求

### 文件读取工具

通过 `createReadFileTool(getAllowedPaths)` 创建。Agent 可读取 `allowedPaths` 白名单内的文件，默认允许 `./data/skills` 和 `./data/agent/feishu-docs`，方便 Agent 查阅 Skill 输出和已同步的挂载文档缓存。

### 飞书组织工具

通过 `createFeishuOrgTools(getFeishu)` 创建。工具执行时会读取当前运行中的飞书配置，因此 Web 对话和 IM 对话都能使用同一套通讯录查询能力。

- `feishu_department_info`：输入部门名称关键词或 `open_department_id`，返回部门名称、上级部门、部门人数等信息
- `feishu_department_users`：输入部门名称关键词或 `open_department_id`，返回直属成员列表，可用 `limit` 控制返回人数
- 若飞书未配置，或应用未开通通讯录读取权限，工具会直接返回错误提示，Agent 不会伪造组织数据

---

## Skills 系统

Skills 是独立的内容生成单元，与 Agent 对话解耦，专注于"搜索 → 渲染 → 截图 → 保存"的流水线。

### 内置 Skill — DailyDigestSkill

每次运行：
1. 用 Brave Search API 搜索候选新闻
2. 通过 Brave Search API 拉取候选新闻，并读取接口返回的来源、摘要和时间元信息
3. 候选阶段会先过滤百家号等自媒体 / 聚合号链接，再按国内 / 国际两路用专用 LLM 抽取提示词，优先保留教育、教育科技、AI 教育、教育公司内容，同时保留与教育场景强相关的科技动态，把候选链接筛成带 `category` 的文章列表（JSON）
4. 若模型返回 fenced json 或格式略脏的 near-JSON，系统会自动做兼容解析
5. 按国内 10 篇、国际 5 篇裁成最终日报
6. 将文字内容填入 HTML 模板，截图为 PNG，同时保存 `.html / .md / .png / .json` 四个文件
7. 返回 PNG 路径；WebUI 自动展示预览，Cron `sendSkillOutput` 发送到飞书
8. 同时把本次执行的 Brave 请求参数、返回结果、候选数、抽取结果和最终入选内容持久化保存到 `data/skills/daily-digest/runs/{runId}.json`

日报 HTML 的结构模板来自 `src/skills/daily-digest/template.html`、`section.html`、`item.html`，视觉样式来自 `src/skills/daily-digest/layout.css`；Skill 每次运行都会读取这些模板并写入当天导出的 HTML。
当前 Brave 检索默认只搜索过去一周内的新闻。
默认请求参数会带 `count=20`、`offset=0`、`freshness=pw`、`safesearch=strict`、`spellcheck=0`；国内搜索默认还会附带 `country=CN` 和 `search_lang=zh-hans`。
新闻条目生成结果现在只显示来源，不再在 HTML / Markdown / PNG 中展示新闻时间。
最终结果会尽量优先使用主流媒体、公司官网和权威发布；百家号、搜狐号、网易号、企鹅号、头条号等自媒体来源不会进入日报。
日报最终展示现在只保留简体中文 / 英文内容；繁体中文会自动转成简体中文，中文 / 英文之外的其他语言会自动翻译成简体中文；若个别条目归一化后仍不合规，才会在最终入选时被过滤掉。
导出的 JSON 现在会额外带上结构化发布日期 `date`，也会继续保留 `publishedAt`；若搜索结果里只有相对时间，系统会按当天日报日期做最佳努力换算。
PNG 截图当前使用 4x 高清输出，版面宽度不变，但图片更适合放大查看。
Brave 搜索相关配置推荐在 `自动化 > 搜索` 统一维护；这里可以同时修改 `Brave Search API Key`、搜索主题，以及 Brave `news/search` 参数，并持久化到 `data/skills/daily-digest/config.json`。
同一张卡片里也可以直接手动运行、看日志和看最新截图预览。
如果想排查“为什么只搜到很少的新闻”，可直接打开一级 tab `日报记录` 查看最近一次 run 的 Brave 请求参数、返回结果和各阶段数量变化。
兼容入口仍保留：`自动化 > Skills > daily-digest` 卡片内仍可改搜索主题，`系统 > 设置` 里仍可保存 `Brave Search API Key`；它们同样写入 `data/skills/daily-digest/config.json`。
若 WebUI 未配置 Brave Key，运行 `daily-digest` 时会回退到环境变量 `BRAVE_SEARCH_API_KEY`；两边都没有时搜索阶段会直接报错。

输出目录：`data/skills/daily-digest/`

### 典型 Cron 配置

在 `Cron` 标签页通常保留两条日报任务；首次启动时，系统也会默认写入这两个模板：

| 时间 | 类型 | 说明 |
|------|------|------|
| `0 9 * * *` | `skillId: "daily-digest"` | 每天 9:00 生成日报 |
| `0 10 * * *` | `sendSkillOutput: "daily-digest"` | 每天 10:00 发送到飞书 |

说明：
- `skillId: "daily-digest"` 这类“只生成不发送”的 Cron 可以不填发送目标
- `sendSkillOutput: "daily-digest"` 这类发送型 Cron 需要填写飞书目标，可填 `oc_xxx` 群聊或 `ou_xxx` 用户
- 手动执行 `daily-digest-generate` 后，生成文件会落到 `data/skills/daily-digest/`
- 若手动执行失败，页面会直接返回错误，不再出现“执行了但没有文件、接口却显示成功”的情况

---

## IM 平台接入

IM 凭证支持两种配置方式，**优先级：WebUI 设置 > 环境变量**。

未配置任何 IM 平台时，应用仍可正常启动，WebServer 调试界面照常使用。

### 会话隔离规则

- 飞书普通消息：沿用 `chatId` 作为 session
- 飞书线程消息：自动拆成 `chatId#thread:<rootId|threadId|parentId>`
- 长期记忆不拆分，仍由同一个 `MemoryStorage` 统一管理

### 方式一：WebUI IM 配置页（推荐）

启动后访问 `http://localhost:5173` → **IM** 标签页 → **配置** 子 tab，填入凭证后点击「保存飞书配置」：

- 保存后**立即生效**，无需重启
- 凭证存储在 `data/im/im-config.json`，重启后自动恢复
- 填写 `Chat ID` 后，页面会自动解析目标名称，便于确认当前配置指向的是用户还是群聊

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
- **直发模式**（`direct: true`）：直接发送预设文本、Markdown 或图片，不经 LLM
- **Skill 生成**（`skillId`）：执行指定 Skill，保存文件，不发 IM
- **Skill 投递**（`sendSkillOutput`）：找指定 Skill 最新 PNG，发送到飞书

发送目标支持多目标：

- 表单里每行一个 chatId
- 可同时填写 `ou_xxx`（用户）和 `oc_xxx`（群聊）
- 同一条 Cron 只运行一次，再把结果广播到所有目标

生成和发送推荐拆成两个 Cron Job，分别设定时间，例如：
- 9:00 `skillId: "daily-digest"` — 生成日报
- 10:00 `sendSkillOutput: "daily-digest"` — 发送到飞书

其中：
- 仅执行 Skill 的 Cron 可不填发送目标
- 发送型 Cron 继续通过多行 `chatId` 选择飞书目标

WebUI 的 `Cron` 标签页还支持点击「运行」直接执行单条任务，不必等待下一个调度时间点。若直发类型选 `Markdown`，飞书会按原生渲染展示标题、列表、引用、代码块和链接。

飞书里的快捷日报请求不依赖 Cron：

- “给我今天的新闻” → 默认发今日新闻图片
- “今天新闻文本版” → 发今日 Markdown 正文
- 当天文件不存在时，服务端会先生成再发送

---

## Context Compression — 上下文压缩

对话过长时，`LLMContextCompressor` 自动压缩历史，防止 context window 溢出：

- 默认 token 阈值：6000（约 24000 字符）
- 策略：保留首条消息 → LLM 摘要中间部分 → 保留最近 4 轮完整对话

---

## LLM 适配器

当前支持：

- Anthropic Claude（默认模型 `claude-sonnet-4-6`）
- OpenAI ChatGPT / API（默认模型 `gpt-5.2-chat-latest`）

Anthropic 可通过 `ANTHROPIC_BASE_URL` 或 `HTTPS_PROXY` 走代理 / 网关；OpenAI 可通过 `OPENAI_BASE_URL` 或 `HTTPS_PROXY` 走代理 / 网关。

如需纯 `.env` 启动 OpenAI，把 `LLM_PROVIDER=openai`，并填写 `OPENAI_API_KEY`。

如需接入其他 LLM，实现 `LLMProvider` 接口即可。
