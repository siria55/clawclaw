# clawclaw 产品文档

## 定位

24/7 常驻 AI Agent 框架，TypeScript 实现。将 AI 以 Bot 形式接入飞书、企业微信等 IM 平台，自动搜集、整理并推送信息（当前内置教育科技日报）。

运行态数据统一写入 `data/`，不随仓库分发。

---

## 核心概念

### ClawServer

框架运行容器。监听 IM Webhook 回调，将消息分发给对应 Agent，再通过 IMPlatform 将回复发送回 IM。单进程可挂载多个 Agent，服务多个 IM 频道或群组。

### IMPlatform

IM 平台适配器接口，统一将 Webhook 事件解析为 `IMMessage`，完成签名验证并通过 `send()` 发送回复。内置飞书和企业微信适配器。

`IMMessage` 携带两个标识：
- `chatId`：IM 平台真实回包目标
- `sessionId`：短期对话历史隔离键

飞书附加能力：
- 命中 Markdown 结构时自动升级为 `post` 格式原生渲染
- 群聊仅响应明确 `@机器人` 的消息
- 支持"给我今天的新闻"快捷指令，直接返回日报图片或文本
- 日报图片发出后，用户可回复数字（如 `3`）获取对应原文链接
- 飞书线程消息自动拆为独立 `sessionId`，避免同一群聊不同线程相互污染

### Agent

核心调度单元，驱动 LLM 决策 → 工具执行 → 结果回传的循环。

两种运行模式：
- **run** — 阻塞执行，返回完整消息历史，适合批处理
- **stream** — 逐步 yield 事件，适合流式推送

**Agentic Context Engineering：**
- `system` 支持动态函数，每轮调用前求值（可注入当前时间、实时配置等）
- `getContext(messages)` 钩子：每轮调用前注入临时消息（记忆检索结果、文档片段等），仅影响当次调用，不写入历史

**热更新：** `updateLLM()` / `updateSystem()` 支持运行时替换，无需重启。WebUI 保存配置后自动调用。

### Tool

Agent 可调用的能力单元。基于 `defineTool()` + Zod 内联校验，执行失败不中断循环，错误信息回传 LLM 处理。

内置工具：

| 工具 | 说明 |
|------|------|
| `memory_save` | 显式保存长期记忆（文本 + 标签） |
| `memory_search` | 关键词检索记忆库，返回摘要列表 |
| `memory_get` | 按 id 取回完整记忆内容 |
| `feishu_department_info` | 读取飞书部门信息（人数、上级部门、ID 等） |
| `feishu_department_users` | 读取飞书部门直属成员列表 |
| `read_file` | 读取 allowedPaths 白名单内的文件 |

### CronScheduler

定时触发 Agent 任务或 Skill，支持标准 5 字段 cron 表达式。

四种触发模式：
- **Agent 模式** — Agent 执行后将 LLM 回复发送到 IM
- **直发模式**（`direct: true`）— 直接发送预设文本、Markdown 或图片，不经 LLM
- **Skill 生成**（`skillId`）— 执行 Skill，保存文件，不发 IM
- **Skill 投递**（`sendSkillOutput`）— 发送 Skill PNG 产物到 IM

投递目标支持单目标（`chatId`）或多目标（`chatIds`）广播，可同时覆盖私聊和群聊。

### Skill

独立内容生成单元，职责收窄为"生成内容 + 保存文件"，不感知 IM 平台细节。每个 Skill 以子目录形式存放，包含 `SKILL.md`（YAML frontmatter 元数据 + Agent 指令）和 `index.ts`（执行逻辑）。

生成与投递解耦为两个独立 Cron Job，可分别配置时间（如 9:00 生成、10:00 发送）。

**内置 Skill — DailyDigestSkill：**

调用 Brave Search API 搜索教育 / 教育科技新闻，最终输出国内 10 篇、国际 5 篇的 HTML 日报截图。

筛选策略：
- 国内候选优先中国大陆媒体、政府 / 高校 / 企业官网，不足时回退到港澳台或海外来源
- 百家号、搜狐号等自媒体来源不会进入日报
- LLM 筛选优先保留教育、教育科技、AI 教育、教育公司内容
- 繁体中文统一转简体，其他语言翻译为简体中文

输出：`data/skills/daily-digest/YYYY-MM-DD.{html,md,png,json}` + 每次执行的 `runs/{runId}.json` 诊断记录。

### 会话与记忆

- **短期历史**：按 `sessionId` 持久化，飞书线程消息自动拆分 session
- **长期记忆**：只有 Agent 显式调用 `memory_save` 时写入；每轮调用前 `getContext` 自动检索并注入命中片段
- 切到新 session 时注入上一段会话的极短参考，保持连贯但不合并历史

### 飞书文档挂载

Agent 可挂载飞书文档（名称 + URL），服务端用 Playwright 抓取正文缓存到本地。每轮对话前按用户消息检索命中片段自动注入为上下文。

### WebServer

本地调试界面 + API 服务。React SPA，6 个一级能力域：

| 一级域 | 二级 tab | 说明 |
|--------|----------|------|
| 对话 | — | 与 Agent 实时对话，查看工具调用过程 |
| 内容 | 新闻库 / 记忆库 | 浏览日报 JSON 输出和长期记忆 |
| 日报记录 | — | 查看每次 `daily-digest` 的 Brave 请求、原始返回和筛选明细 |
| 自动化 | Cron / Skills / 搜索 | 管理定时任务、手动运行 Skill、配置 Brave 搜索参数 |
| IM | 状态 / 消息 / 配置 | IM 连接状态、消息日志、飞书凭证 |
| 系统 | 状态 / 设置 | 运行概览、Agent 配置、LLM 配置、飞书文档挂载 |

所有 POST 配置接口热更新，保存后立即生效，无需重启。

---

## 数据目录

```
data/
├── agent/
│   ├── memory.json                 ← 长期记忆（仅 memory_save 写入）
│   ├── llm-config.json             ← LLM provider / key / model
│   ├── agent-config.json           ← Agent 名称和 system prompt
│   └── feishu-docs/                ← 挂载文档正文缓存
├── im/
│   ├── conversations.json          ← session 历史
│   └── im-config.json             ← 飞书凭证
├── cron/
│   └── cron-config.json           ← Cron 任务列表
└── skills/
    └── daily-digest/
        ├── config.json             ← 搜索主题、Brave Key 与请求参数
        ├── YYYY-MM-DD.*            ← 日报输出（html / md / png / json）
        └── runs/                   ← 每次执行诊断记录
```

---

## 设计原则

- **接口优于实现** — `LLMProvider`、`Tool`、`IMPlatform` 均为接口，不锁定具体实现
- **错误不崩溃** — 工具异常、IM 发送失败均捕获处理，不影响其他会话
- **按需加载上下文** — 记忆和知识不预置在 system prompt，通过工具检索或 `getContext` 注入
- **Skill 职责单一** — Skill 只生成内容和保存文件，IM 投递由 CronScheduler 统一处理
- **可测试** — 核心逻辑不依赖网络，Mock LLM 和 IMPlatform 即可单元测试
- **最小依赖** — 运行时只需 `@anthropic-ai/sdk`、`openai`、`zod` 和 `playwright`
