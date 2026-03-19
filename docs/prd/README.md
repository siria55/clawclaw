# clawclaw 产品文档

## 定位

clawclaw 是一个可 24 小时持续运行的 AI Agent 框架，TypeScript 实现。核心能力是将 Agent 接入飞书、企业微信等 IM 平台，让 AI 以 Bot 形式常驻在团队工作流中，自动搜集和整理信息，并主动推送日报、新闻简报等内容。

---

## 核心架构

```
IM 平台 (飞书 / 企业微信 / ...)
    ↓ Webhook 推送消息
  ClawServer              ← 24/7 常驻 HTTP 服务
    ↓ 路由到对应 Agent
  Agent
    ↓ 动态组装上下文（system / getContext）
  LLM (Anthropic / ...)
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
- 实现 `send()` 方法，将文本回复发送到对应会话

内置适配器：飞书（Feishu/Lark）、企业微信（WeCom）。

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
| `memory_save` | 保存长期记忆（文本 + 标签） |
| `memory_search` | 关键词检索记忆库，返回摘要列表 |
| `memory_get` | 按 id 取回完整记忆内容 |
| `read_file` | 读取 allowedPaths 白名单内的文件（供 Agent 查阅 Skill 输出） |

### CronScheduler

让 Agent 或 Skill 主动触发任务，不再只等待 IM 消息。支持标准 5 字段 cron 表达式。

触发模式：
- **Agent 模式**：调用 Agent.run()，将 LLM 回复发送到 IM
- **直发模式**（`direct: true`）：直接发送预设文本或图片
- **Skill 生成**（`skillId`）：执行指定 Skill，生成并保存文件，不发 IM
- **Skill 投递**（`sendSkillOutput`）：找指定 Skill 最新 PNG，发送到 IM

### Skills 系统

Skills 是独立的内容生成单元，职责收窄为"生成内容 + 保存文件"，不感知 IM 平台细节。

**架构：**
```
Cron1(skillId)          → skill.run(ctx) → 保存文件，不发 IM
Cron2(sendSkillOutput)  → 找最新 PNG → platform.sendImage()

WebUI 手动运行：
onRunSkill → skill.run(ctx) → SkillResult → 展示日志 + 图片预览
```

生成和投递解耦为两个独立 Cron Job，可分别设定时间（如 7:00 生成、8:00 发送）。

**SKILL.md 标准：**
每个 Skill 以子目录形式存放，包含 `SKILL.md`（元数据 + Agent 指令）和 `index.ts`（执行逻辑）。`SKILL.md` 使用简单 YAML frontmatter：
```
---
id: daily-digest
description: 浏览器搜索科技新闻，按国内 10 / 国际 5 生成 HTML 日报截图
queries: 国内AI科技,中国创业投资,中国互联网平台,国际AI科技,海外创业投资,全球互联网动态
domestic-articles: 10
international-articles: 5
max-articles: 15
max-candidates: 36
---
Agent 指令...
```

**内置 Skill — DailyDigestSkill：**
1. 启动 Playwright 浏览器，依次搜索多个科技关键词
2. 直接从搜索结果页提取候选链接并去重，同时为每个链接保留国内/国际查询提示
3. 调用一次专用 LLM 抽取提示词，将候选链接筛成带 `category` 的结构化文章数组
4. 若 LLM 返回 fenced json 或 near-JSON（如标题引号未转义），解析层会做兜底修复
5. 依据配额裁成国内 10 篇、国际 5 篇，共 15 篇
6. 将内容填入 HTML 模板，Playwright 截图为 PNG
7. 保存 `YYYY-MM-DD.{html,md,png,json}` 到 `data/skills/daily-digest/`
8. 返回 `{ outputPath }`；由独立的 `sendSkillOutput` Cron 发送到飞书

HTML 结构由 `src/skills/daily-digest/template.html`、`section.html`、`item.html` 提供，视觉样式由 `src/skills/daily-digest/layout.css` 提供；Skill 运行时读取这些模板并填入文本内容，保证模板、截图和导出 HTML 使用同一套版式。
PNG 截图使用 `1080px` 版心和 `4x` 高清输出，适合在 IM 里预览和放大查看。

**数据目录：**
```
data/skills/{skillId}/
├── YYYY-MM-DD.html
├── YYYY-MM-DD.md
├── YYYY-MM-DD.png
└── YYYY-MM-DD.json   ← 原始文章数组（含 category），供新闻库展示
```

### MemoryStorage（记忆库）

文件持久化的长期记忆。Agent 通过工具主动存取记忆：搜索相关记忆（RAG pull），或通过 `getContext` 钩子自动注入上下文（RAG push）。

### WebServer

本地调试界面，同时提供 API 给浏览器 UI 消费：

| 路由 | 说明 |
|------|------|
| `POST /api/chat` | SSE 流式对话 |
| `GET /api/status` | 系统状态（cron 任务、IM 连接） |
| `GET /api/news` | 新闻库查询（扫描 data/skills/*/YYYY-MM-DD.json） |
| `GET /api/memory` | 记忆库查询（关键词、分页） |
| `GET /api/skills` | 已注册 Skill 列表 |
| `POST /api/skills/:id/run` | 手动触发 Skill（SSE 流式日志） |
| `GET /api/skills/:id/latest-image` | 返回该 Skill 最新 PNG 截图 |
| `GET/POST /api/im-config` | 飞书等 IM 凭证 |
| `GET/POST /api/config/llm` | LLM 配置 |
| `GET/POST /api/config/agent` | Agent 配置 |
| `GET/POST /api/cron` | Cron 任务管理 |

所有 POST 配置接口均支持热更新，保存后立即生效，无需重启。

Web UI 六个标签页各对应独立 URL（hash 路由）：`#chat` / `#news` / `#memory` / `#skills` / `#status` / `#settings`，支持直接访问和浏览器前进/后退。

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
│   └── index.ts        createLLM() 工厂
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
    └── ui/             React + Vite 前端（六标签页）
```

依赖方向：`server/web → platform / core`，`core → llm / tools`，`tools → news / memory`，`skills → core`，各层不反向依赖。

---

## 设计原则

- **接口优于实现** — `LLMProvider`、`Tool`、`IMPlatform` 均为接口，不锁定具体实现
- **错误不崩溃** — 工具异常、IM 发送失败均捕获处理，不影响其他会话
- **可测试** — 核心逻辑不依赖网络，Mock LLM 和 IMPlatform 即可单元测试
- **最小依赖** — 运行时只需 `@anthropic-ai/sdk`、`zod` 和 `playwright`- **按需加载上下文** — 记忆和知识不预置在 system prompt，通过工具检索或 getContext 钩子按需注入
- **Skill 职责单一** — Skill 只负责生成内容和保存文件，IM 投递由 CronScheduler 统一处理
