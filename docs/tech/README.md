# 技术设计文档

## 模块依赖图

```
src/index.ts（公共入口）
│
├── core/agent.ts          ← LLM 编排循环
│   ├── core/types.ts      ← AgentConfig / AgentEvent
│   └── core/compressor.ts ← 历史压缩
│
├── llm/anthropic.ts       ← Anthropic 适配器
│   └── llm/types.ts       ← LLMProvider 接口
│
├── tools/
│   ├── tools/types.ts     ← Tool 接口 / defineTool()
│   ├── tools/news.ts      ← createSaveNewsTool()
│   ├── tools/memory.ts    ← createMemoryTools()
│   └── tools/read-file.ts ← createReadFileTool()
│
├── news/storage.ts        ← NewsStorage（JSON 持久化）
├── memory/storage.ts      ← MemoryStorage（JSON 持久化）
│
├── platform/feishu.ts     ← 飞书适配器
├── platform/wecom.ts      ← 企业微信适配器
│
├── server/index.ts        ← ClawServer（IM 服务）
├── web/server.ts          ← WebServer（调试 API）
├── cron/scheduler.ts      ← CronScheduler
└── skills/
    ├── types.ts           ← Skill / SkillContext / SkillResult
    ├── registry.ts        ← SkillRegistry
    ├── loader.ts          ← SKILL.md 解析
    └── daily-digest/      ← DailyDigestSkill
```

原则：依赖只向下，`server` 和 `web` 依赖 `core`，`core` 依赖 `llm` 和 `tools`，`tools` 依赖 `news` 和 `memory`，`skills` 依赖 `core`，各层不反向依赖。

---

## Agent 编排循环

`Agent.run()` 和 `Agent.stream()` 内部结构相同，区别在于后者每步 yield 事件：

```
while turns < maxTurns:
  1. compressor.compress(messages)        // 超长历史压缩（可选）
  2. system = resolveSystem()             // 动态 system prompt 求值
  3. contextMessages = getContext(msgs)   // 临时上下文注入（不写历史）
  4. response = llm.complete({
       system,
       messages: [...messages, ...contextMessages],
       tools,
     })
  5. messages.push(response.message)      // 写入历史
  6. if no toolCalls → break
  7. execute tools in parallel
  8. messages.push(toolResults)
```

`contextMessages` 仅在步骤 4 传入 LLM，不写入 `messages`，因此不会出现在 `AgentRunResult.messages` 中。这是 Agentic Context Engineering 的关键机制：检索结果等临时信息"用完即扔"，不污染历史。

---

## Agentic Context Engineering

### 动态 system prompt

`AgentConfig.system` 类型为 `string | (() => string | Promise<string>)`。

每轮调用前通过 `#resolveSystem()` 求值：优先使用 `updateSystem()` 热注入的函数，其次回退到构造时的 `config.system`。

```ts
async #resolveSystem(): Promise<string> {
  if (this.#systemFn) return this.#systemFn();
  return typeof this.#config.system === "function"
    ? this.#config.system()
    : this.#config.system;
}
```

适用场景：注入当前时间、今日摘要、最新配置、用户偏好等随时间变化的信息。

**热更新：** `agent.updateSystem(fn)` 在运行时替换 system prompt 函数，下一轮对话即使用新 prompt，无需重启。WebUI 设置页保存 Agent 配置后自动调用此方法。

### getContext 钩子

```ts
getContext?: (messages: Message[]) => Message[] | Promise<Message[]>
```

每轮 LLM 调用前执行，接收当前完整历史，返回本轮额外注入的消息。注入消息**不写入历史**，仅影响当次 LLM 决策。

适用场景：
- 根据用户消息内容自动检索记忆库，将命中结果注入
- 注入当前 Agent 状态、任务上下文
- 实现 RAG push（主动推送检索结果），与工具 `memory_search` 的 RAG pull 互补

---

## Skills 系统

### 架构设计

Skill 职责收窄为"生成内容 + 保存文件"。IM 投递由 CronScheduler 统一处理，Skill 不感知平台细节。

```
Cron1(skillId)          → skill.run(ctx) → 保存文件，不发 IM
Cron2(sendSkillOutput)  → findLatestSkillPng() → platform.sendImage()

WebUI 手动运行：
onRunSkill → skill.run(ctx) → SkillResult → SSE done + outputPath → 前端加载图片预览
```

生成与投递解耦为两个独立 Cron Job。

### SkillContext / SkillResult

```ts
interface SkillContext {
  agent: Agent;              // LLM 调用
  imEventStorage?: IMEventStorage;
  dataDir?: string;          // 输出目录（如 data/skills/daily-digest）
  log?: (msg: string) => void; // WebUI 实时日志回调
}

interface SkillResult {
  outputPath?: string;       // 生成文件的路径（PNG 截图等）
}
```

### SKILL.md 标准

每个 Skill 子目录包含：
- `SKILL.md` — 元数据 + Agent 指令（YAML frontmatter + markdown body）
- `index.ts` — 执行逻辑（读 SKILL.md，实现 `Skill` 接口）

frontmatter 字段（简化 YAML，无额外依赖）：

```
---
id: daily-digest
description: 浏览器搜索科技新闻，生成 HTML 日报截图
queries: AI科技,创业投资,互联网动态   # 逗号分隔数组
max-articles: 12
---
Agent 指令（支持 $SEARCH_URLS / $MAX_ARTICLES 变量替换）
```

`loadSkillDef(skillDir)` 解析 SKILL.md，返回 `SkillDef`（含 `instructions` 字段为 frontmatter 之后的 markdown body）。

### DailyDigestSkill 执行流程

1. 读取 `SKILL.md` 获得搜索词和最大文章数
2. 启动 Playwright chromium（headless）
3. 构建子 Agent（`news-browser`），配备 `browser_navigate` / `browser_get_links` 工具
4. 子 Agent 调用 `agent.stream()` 执行新闻搜索，实时 log 每次 tool_call
5. 从最终 LLM 回复中提取 JSON 文章数组（`RawArticle[]`）
6. 渲染 HTML，Playwright 截图为 PNG
7. 写入 `data/skills/daily-digest/YYYY-MM-DD.{html,md,png,json}`
8. 返回 `{ outputPath: "data/skills/daily-digest/YYYY-MM-DD.png" }`
9. 由独立的 `sendSkillOutput` Cron Job 调用 `feishu.sendImage(chatId, pngPath)`

### 新闻库数据来源

`GET /api/news` 不再依赖 NewsStorage，改为扫描 `data/skills/*/YYYY-MM-DD.json`，合并排序后分页返回。文件名即日期，`savedAt` 由文件名推导。

---

## NewsStorage / MemoryStorage / ConfigStorage

三个存储类均基于 JSON 文件：

**NewsStorage / MemoryStorage** 设计对称：

```
读 → filter/sort/page → 返回
写 → 读全部 → push → 写全部
```

**ConfigStorage\<T\>**（`src/config/storage.ts`）：泛型 JSON 配置文件读写。

- `new ConfigStorage<IMConfig>("./data/im-config.json")` — IM 凭证
- `new ConfigStorage<LLMConfig>("./data/llm-config.json")` — LLM 配置
- `new ConfigStorage<AgentMetaConfig>("./data/agent-config.json")` — Agent 名称和系统提示词
- `new ConfigStorage<CronJobConfig[]>("./data/cron-config.json", [])` — Cron 任务配置

三个配置文件职责分离，互不干扰。WebServer 通过各自独立的注入点访问，POST 保存后通过回调（`onIMConfig` / `onLLMConfig` / `onAgentConfig`）热更新运行中的服务，无需重启。

---

## 工具系统

### defineTool()

```ts
defineTool({
  name: string,
  description: string,
  schema: ZodType,
  execute: (input: z.infer<typeof schema>) => Promise<ToolResult>,
})
```

内联 `zodToJsonSchema()` 将 Zod schema 转换为 JSON Schema，避免引入 `zod-to-json-schema` 依赖。当前支持 `ZodObject / ZodString / ZodNumber / ZodBoolean / ZodOptional`，不覆盖的类型退化为 `{}`。如需更复杂 schema，可替换为完整的转换包。

### 工具工厂模式

`createSaveNewsTool(storage)` 和 `createMemoryTools(storage)` 通过工厂函数注入 storage 依赖，便于测试时替换实例，也支持多 Agent 共享同一个 storage 或各自独立。

---

## WebServer API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/` | GET | SPA 入口（index.html） |
| `/api/chat` | POST | SSE 流式对话，body `{message}` |
| `/api/status` | GET | 系统状态 JSON |
| `/api/news` | GET | 新闻库查询，扫描 `data/skills/*/YYYY-MM-DD.json`，query: `q / page / pageSize` |
| `/api/memory` | GET | 记忆库查询，query: `q / page / pageSize` |
| `/api/skills` | GET | 已注册 Skill 列表（id + description） |
| `/api/skills/:id/run` | POST | 手动触发 Skill，SSE 流式日志 |
| `/api/skills/:id/latest-image` | GET | 返回该 Skill 最新 PNG（`image/png`），404 表示无输出 |
| `/api/im-config` | GET/POST | 飞书等 IM 凭证（读写 `data/im-config.json`） |
| `/api/config/llm` | GET/POST | LLM 配置（读写 `data/llm-config.json`） |
| `/api/config/agent` | GET/POST | Agent 配置（读写 `data/agent-config.json`） |
| `/api/cron` | GET/POST/DELETE | Cron 任务 CRUD |
| `/api/im-log` | GET | IM 事件日志（query: `since=`） |
| `*` | GET | 静态文件或 SPA fallback |

SPA fallback 规则：请求路径无扩展名 → 返回 `index.html`；有扩展名且文件不存在 → 404。

### SSE 事件类型

#### `/api/chat` — 对话流

| 事件 | data 结构 | 说明 |
|------|-----------|------|
| `thinking` | `{text}` | Claude extended thinking 内容（增量） |
| `message` | `{content}` | assistant 文本（增量） |
| `tool_call` | `{toolName, input}` | 工具调用 |
| `tool_result` | `{toolName, result}` | 工具结果 |
| `error` | `{message}` | 错误 |
| `done` | `{result}` | 运行结束 |

#### `/api/skills/:id/run` — Skill 执行日志

| 事件 data 结构 | 说明 |
|----------------|------|
| `{type:"log", text}` | 执行过程日志（浏览器访问、文件保存等） |
| `{type:"done", outputPath?}` | 执行完成；`outputPath` 存在时前端加载图片预览 |
| `{type:"error", error}` | 执行失败 |

---

## Web UI

React 19 + Vite 6 + CSS Modules + TypeScript strict。

**开发服务端口：**
- Vite dev server：`http://localhost:5173`（通过 proxy 转发 `/api/*` 到 `http://localhost:3000`）
- API server（`pnpm dev:api`）：`http://localhost:3000`
- WebServer（生产 app.ts）：`http://localhost:3001`

**六标签页导航（hash 路由）：**

| Tab | URL hash | 组件 | 说明 |
|-----|----------|------|------|
| 对话 | `#chat` | `ChatView` | 消息气泡 + 工具事件 + 思考气泡 + 等待动画 |
| 新闻库 | `#news` | `NewsView` | 关键词搜索、分页浏览（读 skill JSON 输出） |
| 记忆库 | `#memory` | `MemoryView` | 关键词搜索、分页、内容展开/收起 |
| Skills | `#skills` | `SkillsView` | Skill 列表、手动触发、实时执行日志 |
| 状态 | `#status` | `StatusView` | IM 连接状态、Cron 任务列表、IM 日志 |
| 设置 | `#settings` | `SettingsView` | Agent 配置 / LLM 配置 / 飞书 IM 配置 / Cron 管理 |

URL hash 路由由 `App.tsx` 自行管理（无路由库依赖）：初始化读 `window.location.hash`，切换 tab 更新 hash，监听 `hashchange` 支持浏览器前进/后退。

**关键 hooks：**
- `useChatStream` — SSE 解析、事件状态管理、thinking 块累积
- `useNewsQuery` — `GET /api/news` 封装，参数序列化、loading 状态

**等待指示器（TypingBubble）：** `streaming=true` 且无正在流式输出的 assistant 气泡时显示三点跳动动画，给予即时反馈。

**SkillsView 日志面板：** 手动触发 Skill 后，通过 `fetch` + `ReadableStream` 读取 SSE 流，实时渲染深色终端风格日志，自动滚动到底部。`done` 事件后请求 `GET /api/skills/:id/latest-image` 展示 PNG 预览，加载失败自动隐藏。

---

## 上下文压缩（LLMContextCompressor）

触发条件：估算 token 数（字符数 / 4）超过 `threshold`（默认 6000）。

压缩策略：
1. 保留首条用户消息（维持原始意图）
2. 用 LLM 摘要中间消息
3. 保留最近 `keepRecentPairs × 2` 条消息（默认 4 轮）

摘要消息以 `[Conversation summary — N messages compressed]` 开头，LLM 可感知压缩发生。

---

## 签名验证设计

飞书和企业微信的签名方案不同，`IMVerifyParams` 提供 `method / headers / query / body`，各适配器自行提取所需字段：

- **飞书**：从 `headers` 取签名，SHA256 HMAC + 5 分钟时间窗防重放
- **企业微信**：从 `query` 取签名参数，SHA1 明文验证；消息体 AES-256-CBC 解密

自动过滤 Bot 自发消息（飞书：`sender.sender_type === "app"`；企业微信：`MsgType === "event"`）。

---

## 测试策略

- **单元测试**：Mock LLM / IMPlatform，不访问外网
- **存储测试**：使用 `tmpdir` 临时目录，`afterEach` 清理
- **Web hook 测试**：`port: 0` 随机端口，避免冲突
- **React hook 测试**：`@vitest-environment jsdom` + `@testing-library/react renderHook`
- **覆盖率阈值**：全局 80%

当前测试总数：146 个，全部通过。
