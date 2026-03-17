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

CronScheduler             ← 定时触发 Agent 主动任务
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

### Tool

Agent 可调用的外部能力单元。`defineTool()` 内置 Zod 输入校验，工具执行失败不中断循环，错误信息回传 LLM 自行处理。

**内置工具集：**

| 工具 | 说明 |
|------|------|
| `save_news` | 将搜索到的新闻写入新闻库 |
| `memory_save` | 保存长期记忆（文本 + 标签） |
| `memory_search` | 关键词检索记忆库，返回摘要列表 |
| `memory_get` | 按 id 取回完整记忆内容 |

### CronScheduler

让 Agent 主动触发任务，不再只等待 IM 消息。支持标准 5 字段 cron 表达式。每次触发后，Agent 执行指定消息并通过 IMPlatform 发送回复。

### NewsStorage（新闻库）

文件持久化的新闻存储。Agent 通过 `save_news` 工具将搜索到的新闻写入库，Web UI 新闻库标签页可按关键词、标签、分页浏览全部历史文章。

### MemoryStorage（记忆库）

文件持久化的长期记忆。Agent 通过工具主动存取记忆：搜索相关记忆（RAG pull），或通过 `getContext` 钩子自动注入上下文（RAG push）。

### WebServer

本地调试界面，同时提供 API 给浏览器 UI 消费：

| 路由 | 说明 |
|------|------|
| `POST /api/chat` | SSE 流式对话 |
| `GET /api/status` | 系统状态（cron 任务、IM 连接） |
| `GET /api/news` | 新闻库查询（关键词、标签、分页） |
| `GET/POST /api/im-config` | 飞书等 IM 凭证（读写 `data/im-config.json`） |
| `GET/POST /api/config/llm` | LLM 配置（读写 `data/llm-config.json`） |
| `GET/POST /api/config/agent` | Agent 配置（读写 `data/agent-config.json`） |

所有 POST 配置接口均支持热更新，保存后立即生效，无需重启。

---

## 模块结构

```
src/
├── core/
│   ├── agent.ts        Agent 类，run() / stream() / 动态 system / getContext
│   ├── compressor.ts   LLMContextCompressor，超长历史自动压缩
│   └── types.ts        AgentConfig / AgentOptions / AgentEvent
├── llm/
│   ├── types.ts        LLMProvider 接口、Message、ToolCall 等
│   ├── anthropic.ts    Anthropic Claude 适配器（含代理支持）
│   └── index.ts        createLLM() 工厂
├── platform/
│   ├── types.ts        IMPlatform 接口、IMMessage 类型
│   ├── feishu.ts       飞书适配器
│   └── wecom.ts        企业微信适配器
├── server/
│   └── index.ts        ClawServer，24/7 常驻服务
├── tools/
│   ├── types.ts        Tool 接口、ToolResult、defineTool()
│   ├── news.ts         createSaveNewsTool()
│   ├── memory.ts       createMemoryTools()
│   └── index.ts        公共导出
├── news/
│   ├── types.ts        NewsArticle / NewsQuery / NewsPage
│   ├── storage.ts      NewsStorage，JSON 文件持久化
│   └── index.ts        公共导出
├── memory/
│   ├── types.ts        MemoryEntry / MemoryQuery / MemorySearchResult
│   ├── storage.ts      MemoryStorage，JSON 文件持久化
│   └── index.ts        公共导出
├── cron/
│   ├── types.ts        CronJob 类型
│   ├── scheduler.ts    CronScheduler
│   └── index.ts        公共导出
└── web/
    ├── server.ts       WebServer，调试 API + 静态文件服务
    └── ui/             React + Vite 前端（四标签页：对话/新闻库/状态/设置）
```

依赖方向：`server/web → platform / core`，`core → llm / tools`，`tools → news / memory`，各层不反向依赖。

---

## 设计原则

- **接口优于实现** — `LLMProvider`、`Tool`、`IMPlatform` 均为接口，不锁定具体实现
- **错误不崩溃** — 工具异常、IM 发送失败均捕获处理，不影响其他会话
- **可测试** — 核心逻辑不依赖网络，Mock LLM 和 IMPlatform 即可单元测试
- **最小依赖** — 运行时只需 `@anthropic-ai/sdk` 和 `zod`
- **按需加载上下文** — 记忆和知识不预置在 system prompt，通过工具检索或 getContext 钩子按需注入，保持 context window 干净
