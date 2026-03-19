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

运行 `pnpm dev:web` 后访问 `http://localhost:5173`，界面包含七个标签页，每个标签页对应独立 URL，支持直接访问和浏览器前进/后退。

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
- 数据文件为 `data/agent/memory.json`
- 如果这里是空的，通常表示 Agent 还没有显式调用 `memory_save`
- 当前版本会自动检索已有记忆，但不会自动把每轮对话写入长期记忆

### Skills — `/#skills`

管理和手动触发已注册的 Skill：
- 查看所有 Skill 的 ID 和描述
- 点击「运行」手动触发单个 Skill
- 实时展示执行日志（深色终端面板，自动滚动）
- 执行完成后自动展示生成的截图预览

### 状态 — `/#status`

查看运行时状态：
- 页内导航：固定在页面右侧，可直接跳到运行概览、飞书概览、配置文件、IM 消息日志
- IM 平台连接状态（飞书 / 企业微信）
- 飞书运行摘要（配置来源、Webhook、App ID / Chat ID、加密校验配置是否存在）
- 飞书群聊列表（机器人已加入的群、群名、最近事件、最近时间）
- 配置文件状态（如 `data/im/im-config.json`、`data/agent/llm-config.json`、`data/cron/cron-config.json` 等）
- 关键指标（长期记忆条数、IM 事件数、会话数、挂载文档同步数、Cron 启用数）
- IM 事件日志（按群聊/直发分类，实时轮询）
- 点击刷新实时更新

### Cron — `/#cron`

管理所有定时任务：
- 新增、编辑、删除定时任务
- 发送目标支持多行输入，每行一个 chatId，可同时发给个人和群
- 飞书常见目标 ID：`ou_...` 为用户 / 私聊，`oc_...` 为群聊
- 支持绑定 Skill（`skillId`）或发送最新 Skill 图片（`sendSkillOutput`）
- 支持直发文本、Markdown 或图片（`direct: true`）
- 支持点击「运行」立即执行单条任务，便于调试和校验

### 设置 — `/#settings`

所有配置均保存在服务端，重启后自动恢复，无需重新输入：

- 页内导航：固定在页面右侧，可直接跳到 Agent、飞书文档、DailyDigest、模型、飞书 IM

**Agent 配置**（保存在 `data/agent/agent-config.json`）：
- 名称（标识用）、系统提示词（System Prompt）
- 留空则使用默认提示词
- 保存后下一轮对话即生效，无需重启
- `allowedPaths` 默认包含 `./data/skills` 和 `./data/agent/feishu-docs`
- 如需更积极地保存长期记忆，可在系统提示词里明确哪些信息应调用 `memory_save`

**飞书文档资料**（保存在 `data/agent/feishu-docs/config.json`）：
- 维护文档名称和飞书 URL，可按需启用或停用
- 先保存挂载配置，再点击同步；服务端会抓取正文并缓存到 `data/agent/feishu-docs/{docId}.json`
- Agent 每轮会按用户问题检索命中的文档片段，并优先据此回答
- 适合挂载制度、SOP、FAQ、产品说明等内部资料

**DailyDigest 配置**（保存在 `data/skills/daily-digest/config.json`）：
- 搜索主题（每行一个）
- 建议同时填写国内和国际主题
- 保存后下一次运行 `daily-digest` 即生效，无需重启
- 今日日报封面会自动轮换一句中文短句
- “今日摘要”会概括当天入选新闻的内容，不再只显示数量统计
- 日报长图已做紧凑化处理，减少国内 / 国际交界处在 IM 预览里的空白断层感
- 同花顺（`10jqka`）来源会被自动排除，不进入最终日报

**模型（LLM）配置**（保存在 `data/agent/llm-config.json`）：
- API Key / Base URL / HTTPS Proxy / 模型名称
- 保存后立即生效，无需重启

**飞书 IM 配置**（保存在 `data/im/im-config.json`）：
- App ID / App Secret / Verification Token / Encrypt Key / Chat ID
- 保存后立即生效，无需重启
- 若希望 Agent 能读取部门人数、直属成员等组织信息，还需在飞书开放平台为该应用开通通讯录 / 部门读取权限
- 表单上方会展示当前飞书运行摘要，方便确认当前实例到底是读取了已保存配置还是环境变量
- Agent 回复若包含明显 Markdown 结构，飞书会尽量按原生 Markdown 渲染发送
- 如果需要强制直发 Markdown，可在 `Cron` 里把直发类型切到 `Markdown`
- 在飞书里直接问“给我今天的新闻”时，系统会优先发送今日新闻图片
- 如果想要文字版，可直接回复“今天新闻文本版”
- 如果今日日报文件还不存在，服务端会先自动执行一次 `daily-digest` 再发送

**飞书会话规则**：
- 长期记忆仍共用同一个记忆库
- 短期对话历史按 `sessionId` 存，不再只看 `chatId`
- 飞书线程回复会自动拆成独立 session；首次切到新 session 时，会带一条很短的上一段会话参考，尽量保持连贯
- 当机器人被加入飞书群时，系统会记录群 ID 和群名，状态页可直接查看已记录群聊

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
1. 用 Playwright 浏览器搜索百度新闻，抓取候选链接
2. 按国内 / 国际两路用专用 LLM 抽取提示词，把候选链接筛成带 `category` 的文章列表（JSON）
3. 若模型返回 fenced json 或格式略脏的 near-JSON，系统会自动做兼容解析
4. 按国内 10 篇、国际 5 篇裁成最终日报
5. 将文字内容填入 HTML 模板，截图为 PNG，同时保存 `.html / .md / .png / .json` 四个文件
6. 返回 PNG 路径；WebUI 自动展示预览，Cron `sendSkillOutput` 发送到飞书

日报 HTML 的结构模板来自 `src/skills/daily-digest/template.html`、`section.html`、`item.html`，视觉样式来自 `src/skills/daily-digest/layout.css`；Skill 每次运行都会读取这些模板并写入当天导出的 HTML。
PNG 截图当前使用 4x 高清输出，版面宽度不变，但图片更适合放大查看。
搜索主题可在设置页直接修改；保存到 `data/skills/daily-digest/config.json` 后，下一次运行 skill 时自动生效。

输出目录：`data/skills/daily-digest/`

### 典型 Cron 配置

在 `Cron` 标签页新增两条 Cron 任务：

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
- 凭证存储在 `data/im/im-config.json`，重启后自动恢复

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
- 7:00 `skillId: "daily-digest"` — 生成日报
- 8:00 `sendSkillOutput: "daily-digest"` — 发送到飞书

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

当前支持 Anthropic Claude（默认模型 `claude-sonnet-4-6`）。

如需代理，在 `.env` 中设置 `ANTHROPIC_BASE_URL` 或 `HTTPS_PROXY`。

如需接入其他 LLM，实现 `LLMProvider` 接口即可。
