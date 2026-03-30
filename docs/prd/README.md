# clawclaw 产品文档

## 定位

clawclaw 是一个可 24 小时持续运行的 AI Agent 框架，TypeScript 实现。核心能力是将 Agent 接入飞书、企业微信等 IM 平台，让 AI 以 Bot 形式常驻在团队工作流中，自动搜集和整理信息，并主动推送日报、新闻简报等内容。

默认运行状态统一落在本地 `data/` 目录，包括配置、会话、IM 事件和 skill 产物。该目录属于运行态数据，不应作为 GitHub 仓库内容分发。

---

## 核心架构

```
IM 平台 (飞书 / 企业微信 / ...)
    ↓ Webhook 推送消息
  ClawServer              ← 24/7 常驻 HTTP 服务
    ↓ 路由到对应 Agent
  Agent
    ↓ 动态组装上下文（system / getContext）
  LLM (Anthropic / OpenAI / ...)
    ↓ 工具调用
  Tool × N                ← 记忆、新闻、浏览器等
    ↓ 执行结果
  Agent
    ↓ 生成回复
  ClawServer
    ↓ 调用 IM API 发送
IM 平台

CronScheduler             ← 定时触发任务（Agent 消息 / Skill 执行）
Skill                     ← 独立内容生成单元（浏览器搜索、截图等）
WebServer                 ← 本地调试 + 新闻库查阅界面
```

---

## 核心概念

### ClawServer

框架的运行容器，负责：
- 启动 HTTP 服务监听 IM Webhook 回调
- 将收到的 IM 消息分发给对应的 Agent 实例
- 将 Agent 回复通过 IMPlatform 发送回 IM
- 优雅关闭（SIGTERM / SIGINT）

一个进程可挂载多个 Agent，服务多个 IM 频道或群组。

### IMPlatform

所有 IM 平台适配器实现的接口，职责：
- 解析平台推送的 Webhook 事件，转换为统一的 `IMMessage`
- 提供签名验证，防止伪造请求
- 实现 `send()` 方法，将回复发送到对应会话；支持的平台可额外提供 `sendMarkdown()`

内置适配器：飞书（Feishu/Lark）、企业微信（WeCom）。

飞书当前支持两条发送路径：
- 普通文本走 `text` 消息
- 命中明显 Markdown 结构的内容可升级为飞书 `post` Markdown 渲染
- 问“给我今天的新闻”时，服务端会优先命中 `daily-digest` 快捷链路：优先发今日图片，缺失时先生成；显式要文本版时发送 Markdown
- 收到 digest 后，用户可直接回复数字（如 `3`）获取当天对应新闻的原文链接，返回内容为单独 URL；飞书群聊里带 `@机器人 3` 这类前置 mention 也能命中
- 飞书群聊里的普通消息默认只记录日志；只有明确 `@机器人` 时，才会继续进入快捷链路或 Agent 回复

`IMMessage` 同时携带两个标识：
- `chatId`：IM 平台真实回包目标
- `sessionId`：Agent 短期历史隔离键

飞书中，普通消息默认 `sessionId = chatId`；线程回复会拆成 `chatId#thread:<rootId|threadId|parentId>`，避免同一群聊里的不同线程互相污染。

### Agent

Agent 是框架的核心调度单元，驱动"LLM 决策 → 工具执行 → 结果回传"的循环。

**两种运行模式：**
- **run** — 阻塞执行，完成后返回完整消息历史
- **stream** — 逐步 yield 事件，适合流式推送回复

**动态上下文（Agentic Context Engineering）：**
- `system` 支持静态字符串或函数，每轮 LLM 调用前动态求值（注入当前时间、实时状态等）
- `getContext(messages)` 钩子：每轮调用前注入临时消息（检索结果、提醒等），不写入历史，只影响当次调用

**热更新：**
- `updateLLM(provider)` — 运行时热换 LLM 提供商，无需重启
- `updateSystem(fn)` — 运行时热替换 system prompt 函数，下一轮对话即生效

### 会话与记忆

- 短期多轮历史按 `sessionId` 持久化
- 长期记忆仍统一保存在 `MemoryStorage`，跨 session 共用
- 当同一飞书 `chatId + userId` 自动切到新 session 时，系统会注入一条极短的上一段会话参考，尽量保持衔接，但不会把两个 session 真的合并

### Tool

Agent 可调用的外部能力单元。`defineTool()` 内置 Zod 输入校验，工具执行失败不中断循环，错误信息回传 LLM 自行处理。

**内置工具集：**

| 工具 | 说明 |
|------|------|
| `memory_save` | 显式保存长期记忆（文本 + 标签） |
| `memory_search` | 关键词检索记忆库，返回摘要列表 |
| `memory_get` | 按 id 取回完整记忆内容 |
| `feishu_department_info` | 读取飞书部门信息，返回部门 ID、上级部门、部门人数等 |
| `feishu_department_users` | 读取飞书部门直属成员列表 |
| `read_file` | 读取 allowedPaths 白名单内的文件（供 Agent 查阅 Skill 输出） |

### CronScheduler

让 Agent 或 Skill 主动触发任务，不再只等待 IM 消息。支持标准 5 字段 cron 表达式。

触发模式：
- **Agent 模式**：调用 Agent.run()，将 LLM 回复发送到 IM
- **直发模式**（`direct: true`）：直接发送预设文本、Markdown 或图片
- **Skill 生成**（`skillId`）：执行指定 Skill，生成并保存文件，不发 IM
- **Skill 投递**（`sendSkillOutput`）：找指定 Skill 最新 PNG，发送到 IM

Cron 投递目标支持两种配置：
- 单目标：`chatId`
- 多目标：`chatIds`

当 `chatIds` 存在时，同一条 Cron 会把同一份内容广播到全部目标，可同时覆盖飞书私聊和群聊。
飞书里常见的目标 ID 形式为：
- `ou_...`：用户 / 私聊目标
- `oc_...`：群聊 chat ID

除 Cron 外，飞书 IM 入口也有一条面向日报的快捷处理：
- 当用户直接在飞书里问“给我今天的新闻”这类短请求时，服务端优先返回 `daily-digest` 的今日结果；群聊里的 `@机器人 给我今天的新闻` 也同样生效
- 默认返回图片；如果用户显式要求“文本版 / Markdown / 文字”，则发送 Markdown 正文
- 若今日文件还不存在，服务端会先触发一次 `daily-digest` 生成

### Skills 系统

Skills 是独立的内容生成单元，职责收窄为"生成内容 + 保存文件"，不感知 IM 平台细节。

**架构：**
```
Cron1(skillId)          → skill.run(ctx) → 保存文件，不发 IM
Cron2(sendSkillOutput)  → 找最新 PNG → platform.sendImage()

WebUI 手动运行：
onRunSkill → skill.run(ctx) → SkillResult → 展示日志 + 图片预览
```

生成和投递解耦为两个独立 Cron Job，可分别设定时间（如 9:00 生成、10:00 发送）。

其中：
- `skillId` Cron 只负责生成内容，可不配置飞书目标
- `sendSkillOutput` Cron 负责把最新产物投递到指定 `oc_...` / `ou_...` 飞书目标

**SKILL.md 标准：**
每个 Skill 以子目录形式存放，包含 `SKILL.md`（元数据 + Agent 指令）和 `index.ts`（执行逻辑）。`SKILL.md` 使用简单 YAML frontmatter：
```
---
id: daily-digest
description: 浏览器搜索科技新闻，按国内 10 / 国际 5 生成 HTML 日报截图
queries: 国内AI科技,中国创业投资,中国互联网平台,美国OpenAI,美国英伟达AI,硅谷创投,海外互联网监管,全球科技公司
domestic-articles: 10
international-articles: 5
max-articles: 15
max-candidates: 36
---
Agent 指令...
```

**内置 Skill — DailyDigestSkill：**
1. 启动 Playwright 浏览器，依次搜索多个科技关键词
2. 直接从搜索结果页提取候选链接并去重，同时为每个链接保留国内/国际查询提示，并尽量补充新闻时间
3. 候选阶段会先过滤百家号等自媒体 / 聚合号链接，再按国内 / 国际两路调用专用 LLM 抽取提示词，将候选链接筛成带 `category` 的结构化文章数组
4. 若 LLM 返回 fenced json 或 near-JSON（如标题引号未转义），解析层会做兜底修复
5. 依据配额裁成国内 10 篇、国际 5 篇，共 15 篇
6. 将内容填入 HTML 模板，封面 `deck` 使用每日轮换短句，“今日摘要”按新闻内容生成概览
7. 新闻条目展示来源与新闻时间；若个别条目未提取到时间，则仅展示来源
8. 保存 `YYYY-MM-DD.{html,md,png,json}` 到 `data/skills/daily-digest/`
9. 返回 `{ outputPath }`；由独立的 `sendSkillOutput` Cron 发送到飞书

HTML 结构由 `src/skills/daily-digest/template.html`、`section.html`、`item.html` 提供，视觉样式由 `src/skills/daily-digest/layout.css` 提供；Skill 运行时读取这些模板并填入文本内容，保证模板、截图和导出 HTML 使用同一套版式。
PNG 截图使用 `1080px` 版心和 `4x` 高清输出，适合在 IM 里预览和放大查看。
模板中的“今日摘要”不再展示国内 / 国际 / 总计数量 chips，而是直接输出当日内容概览；新闻列表里的无效英文信号标签也已移除。
为降低长图在截图和 IM 预览里的断层风险，模板已去掉大面积滤镜叠层，并收紧 section / item 间距。
同花顺（`10jqka`）和百家号、搜狐号、网易号、企鹅号、头条号等自媒体来源不会进入 `daily-digest` 最终结果。
主流媒体、公司官网和权威发布会获得更高排序优先级，尽量减少聚合号和弱来源混入。
日报条目编号现在按整份 digest 全局连续编号，便于飞书侧用“回复数字”的方式索取对应原文链接；命中后直接返回单独新闻 URL。
搜索主题可在 WebUI `自动化 > Skills > daily-digest` 卡片中调整，服务端持久化到 `data/skills/daily-digest/config.json`，下一次运行 `daily-digest` 时自动生效。

**数据目录：**
```
data/skills/{skillId}/
├── config.json        ← Skill 运行时配置（如搜索主题）
├── YYYY-MM-DD.html
├── YYYY-MM-DD.md
├── YYYY-MM-DD.png
└── YYYY-MM-DD.json   ← 原始文章数组（含 category），供新闻库展示
```

### MemoryStorage（记忆库）

文件持久化的长期记忆，默认路径 `data/agent/memory.json`。

当前实现分成“自动检索、显式写入”两部分：
- 读取侧：`getContext` 会在每轮调用前按用户最新消息自动搜索已有记忆，并把命中摘要作为临时上下文注入
- 写入侧：只有 Agent 显式调用 `memory_save` 时，内容才会写入记忆库并出现在 WebUI

这意味着：
- 记忆库为空通常表示尚未发生 `memory_save`
- 当前版本不会自动把每轮对话或“看起来重要”的内容写入长期记忆
- “重要”暂无独立规则引擎，主要由模型结合 system prompt、工具描述和当前上下文自行判断

### 挂载飞书文档资料

Agent 可挂载一组飞书文档来源（名称 + URL），由服务端使用 Playwright 抓取正文并缓存到本地。每轮对话前，系统会按用户问题检索命中的文档片段，并作为临时上下文注入。

- 文档配置保存在 `data/agent/feishu-docs/config.json`
- 已同步正文保存在 `data/agent/feishu-docs/{docId}.json`
- 命中文档时，Agent 优先依据文档内容回答；文档未覆盖的细节需明确说明

### 飞书组织读取

当飞书应用已开通通讯录 / 部门读取权限时，Agent 可直接调用飞书工具查询组织信息，覆盖 Web 对话与 IM 对话两种入口。

- 典型问题：部门人数、直属成员、部门 ID、上级部门
- 运行方式：Agent 在需要时主动调用 `feishu_department_info` / `feishu_department_users`
- 权限前提：飞书应用需具备 Contact v3 相关读取权限；未开通时工具会返回明确报错，不会让 Agent 猜测组织数据

### WebServer

本地调试界面，同时提供 API 给浏览器 UI 消费：

| 路由 | 说明 |
|------|------|
| `POST /api/chat` | SSE 流式对话 |
| `GET /api/status` | 系统状态（cron 任务、IM 连接） |
| `GET /api/im-log` | IM 消息日志（支持 `since` 增量轮询，并补齐飞书用户名 / 群名） |
| `GET /api/news` | 新闻库查询（扫描 data/skills/*/YYYY-MM-DD.json） |
| `GET /api/memory` | 记忆库查询（关键词、分页） |
| `GET /api/skills` | 已注册 Skill 列表 |
| `POST /api/skills/:id/run` | 手动触发 Skill（SSE 流式日志） |
| `GET /api/skills/:id/latest-image` | 返回该 Skill 最新 PNG 截图 |
| `GET/POST /api/im-config` | 飞书等 IM 凭证 |
| `GET /api/im-config/feishu-target` | 解析飞书 Chat ID，返回群名 / 用户名 |
| `GET/POST /api/config/llm` | LLM 配置 |
| `GET/POST /api/config/agent` | Agent 配置 |
| `GET/POST /api/config/daily-digest` | DailyDigest 搜索主题配置 |
| `GET/POST /api/config/feishu-docs` | 飞书文档挂载配置 |
| `POST /api/config/feishu-docs/sync` | 同步飞书文档正文到本地缓存 |
| `GET/POST /api/cron` | Cron 任务管理 |
| `POST /api/cron/:id/run` | 立即执行单条 Cron 任务 |

所有 POST 配置接口均支持热更新，保存后立即生效，无需重启。

Web UI 现已收敛为 5 个一级能力域：

- `对话`：实时与 Agent 对话，入口 hash 为 `#chat`
- `内容`：二级 tab 为 `新闻库` / `记忆库`，对应 `#news` / `#memory`
- `自动化`：二级 tab 为 `Cron` / `Skills`，对应 `#cron` / `#skills`
- `IM`：二级 tab 为 `状态` / `消息` / `配置`，默认入口 hash 为 `#im`
- `系统`：二级 tab 为 `状态` / `设置`，对应 `#status` / `#settings`

补充说明：
- 点击一级 tab 会落到该能力域的默认二级页：`对话 -> #chat`、`内容 -> #news`、`自动化 -> #cron`、`IM -> #im`、`系统 -> #status`
- `IM > 状态` 展示 IM 平台连接、飞书运行摘要、飞书群聊列表
- `IM > 消息` 展示实时 IM 消息日志，支持群聊 / 直发筛选，并以“用户名 / 群名 + 原始 ID”形式展示飞书身份
- 当飞书用户名 / 群名未解析成功时，界面会明确显示未解析状态，而不是只剩下一串 `ou_...` / `oc_...`
- `IM > 配置` 展示飞书 IM 凭证、运行摘要、默认 Chat ID 配置，并在界面中解析展示目标用户名 / 群名
- `IM > 状态` 的飞书运行摘要会显示默认目标名称
- `系统 > 状态` 的最近一条 IM 活动会显示飞书用户名 / 群名
- `自动化 > Cron` 的飞书目标会显示用户名 / 群名与原始 ID
- `系统 > 状态`、`系统 > 设置` 以及 `IM > 状态` 的长页面内置页内 TOC，并固定在页面外侧，减少遮挡主内容
- 旧 hash 仍兼容：`#im-status` 会映射到 `IM > 状态`，`#im-config` 会映射到 `IM > 配置`
- `#cron` 的直发模式支持 `text` / `markdown` / `image`
- `#cron` 的发送目标支持多行配置，一个任务可同时发给多个 chatId
- 飞书 IM 对“今天的新闻”类请求支持直接回图片 / 文本，不必先配置 Cron
- `对话` 页左侧的 assistant 回复支持浏览器原生拖拽选中复制，也支持一键复制，便于把生成内容转发到其他工具
- `对话` 页中的错误卡片支持复制；当后端返回 `401` 等 HTTP 错误时，界面会直接显示状态码和服务端返回内容
- 当 OpenAI provider 或代理网关返回异常 JSON 时，界面会尽量展示真实错误，而不是退化成前端难以理解的内部异常

---

## 模块结构

```
src/
├── core/
│   ├── agent.ts        Agent 类，run() / stream() / 动态 system / getContext
│   ├── compressor.ts   LLMContextCompressor，超长历史自动压缩
│   └── types.ts        AgentConfig / AgentOptions / AgentEvent
├── im/
│   ├── conversations.ts ConversationStorage，session 历史持久化 + bridge
│   └── context.ts      buildIMRunContext()，统一组装 IM prompt/history
├── llm/
│   ├── types.ts        LLMProvider 接口、Message、ToolCall 等
│   ├── anthropic.ts    Anthropic Claude 适配器（含代理支持）
│   ├── openai.ts       OpenAI Chat Completions 适配器（兼容工具调用）
│   └── index.ts        createLLM() / createLLMFromConfig() 工厂
├── platform/
│   ├── types.ts        IMPlatform 接口、IMMessage 类型
│   ├── feishu.ts       飞书适配器（含 sendImage / sendImageBuffer）
│   └── wecom.ts        企业微信适配器
├── server/
│   └── index.ts        ClawServer，24/7 常驻服务
├── tools/
│   ├── types.ts        Tool 接口、ToolResult、defineTool()
│   ├── memory.ts       createMemoryTools()
│   └── read-file.ts    createReadFileTool()（路径白名单）
├── memory/
│   └── storage.ts      MemoryStorage，JSON 文件持久化
├── docs/
│   ├── library.ts      MountedDocLibrary，飞书文档同步 / 缓存 / 检索
│   └── index.ts        文档模块导出
├── cron/
│   ├── types.ts        CronJob / CronJobConfig / CronSchedulerOptions
│   ├── scheduler.ts    CronScheduler
│   └── index.ts        公共导出
├── skills/
│   ├── types.ts        Skill / SkillContext / SkillResult 接口
│   ├── registry.ts     SkillRegistry
│   ├── loader.ts       loadSkillDef() — 解析 SKILL.md frontmatter
│   └── daily-digest/
│       ├── SKILL.md    Skill 定义（元数据 + Agent 指令）
│       ├── template.html 页面模板
│       ├── section.html 分类区块模板
│       ├── item.html    新闻条目模板
│       ├── layout.css   日报样式模板
│       └── index.ts     DailyDigestSkill 实现
└── web/
    ├── server.ts       WebServer，调试 API + 静态文件服务
    └── ui/             React + Vite 前端（八标签页）
```

依赖方向：`server/web → platform / core`，`core → llm / tools`，`tools → news / memory`，`skills → core`，各层不反向依赖。

---

## 设计原则

- **接口优于实现** — `LLMProvider`、`Tool`、`IMPlatform` 均为接口，不锁定具体实现
- **错误不崩溃** — 工具异常、IM 发送失败均捕获处理，不影响其他会话
- **可测试** — 核心逻辑不依赖网络，Mock LLM 和 IMPlatform 即可单元测试
- **最小依赖** — 运行时只需 `@anthropic-ai/sdk`、`openai`、`zod` 和 `playwright`
- **按需加载上下文** — 记忆和知识不预置在 system prompt，通过工具检索或 getContext 钩子按需注入
- **Skill 职责单一** — Skill 只负责生成内容和保存文件，IM 投递由 CronScheduler 统一处理
