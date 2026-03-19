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
│   ├── tools/feishu-org.ts← 飞书部门 / 成员读取工具
│   ├── tools/memory.ts    ← createMemoryTools()
│   └── tools/read-file.ts ← createReadFileTool()
│
├── im/
│   ├── conversations.ts   ← ConversationStorage（session 历史 + bridge）
│   └── context.ts         ← buildIMRunContext() / persistIMRunContext()
│
├── memory/storage.ts      ← MemoryStorage（JSON 持久化）
├── docs/library.ts        ← MountedDocLibrary（文档同步 / 缓存 / 检索）
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
- 根据用户消息内容检索已挂载的飞书文档片段，并把命中片段注入
- 注入当前 Agent 状态、任务上下文
- 实现 RAG push（主动推送检索结果），与工具 `memory_search` 的 RAG pull 互补

当前实现里，`app.ts` / `web/dev.ts` 会把记忆命中和文档命中合并为临时上下文消息，典型段落为：
- `[相关记忆]`
- `[挂载文档资料]`

与此同时，系统提示词会显式要求 Agent 在回答飞书组织问题时优先调用飞书工具，而不是凭空生成部门人数或成员信息。

记忆侧当前只有“自动搜、显式存”两段链路：
- `getContext` 会自动执行 `memoryStorage.search()`，但不会自动写入 `MemoryStorage`
- `memory_save` 是长期记忆唯一写入口，执行路径在 `src/tools/memory.ts`
- 因此 `data/agent/memory.json` 为空通常表示尚未发生显式保存，而不是检索失效
- “重要性”当前不由服务端规则判定，是否调用 `memory_save` 由模型结合 system prompt、工具描述和上下文决定

---

## IM 会话模型

`chatId` 和 `sessionId` 在 IM 场景里职责不同：

- `chatId`：平台真实回包目标，`platform.send(chatId, text)` 仍只认这个值
- `sessionId`：ConversationStorage 的短期历史键
- `continuityId`：同一发言人在同一来源里的会话桥接键

当前规则：
- 飞书普通消息：`sessionId = chatId`
- 飞书线程消息：`sessionId = ${chatId}#thread:<rootId|threadId|parentId>`
- 企业微信：暂时仍按 `chatId` 作为 `sessionId`

`ConversationStorage.loadSession(sessionId, continuityId)` 先读取当前 session 历史；若为空，则回看同 `continuityId` 的最近一个 session，把最后一条用户消息和最后一条助手回复压成一条短参考消息。这样新 session 能自然续上，但不会把旧历史整段搬过去。

---

## 飞书通讯录读取

`FeishuPlatform` 现在同时承担 IM 发送和飞书组织读取两类职责，但实现上仍保持分层：

- `#getAccessToken()` 统一获取 tenant access token
- `#request()` 统一处理 Contact v3 请求、HTTP 错误和 Feishu `code !== 0` 业务错误
- `getDepartment(openDepartmentId)` 读取单个部门详情
- `listDepartmentChildren(parentDepartmentId)` 拉取子部门，可选递归拉全树
- `findDepartmentsByName(keyword)` 基于部门树做本地名称匹配
- `listDepartmentUsers(openDepartmentId)` 拉取直属成员

Agent 工具层 `createFeishuOrgTools(() => feishu)` 使用闭包读取当前运行时的 `FeishuPlatform` 实例，因此：

- 主应用 `app.ts` 和开发入口 `web/dev.ts` 共用同一套工具定义
- WebUI 热更新飞书配置后，无需重建 Agent；工具下一次执行时自动读取新实例
- Web 对话与 IM 对话会得到相同的飞书组织查询能力

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
description: 浏览器搜索科技新闻，按国内 10 / 国际 5 生成 HTML 日报截图
queries: 国内AI科技,中国创业投资,中国互联网平台,美国OpenAI,美国英伟达AI,硅谷创投,海外互联网监管,全球科技公司
domestic-articles: 10
international-articles: 5
max-articles: 15
max-candidates: 36
---
Agent 指令（支持 $SEARCH_URLS / $MAX_ARTICLES 变量替换）
```

`loadSkillDef(skillDir)` 解析 SKILL.md，返回 `SkillDef`（含 `instructions` 字段为 frontmatter 之后的 markdown body）。
其中 `max-candidates` 用于抽取阶段的候选上限，`domestic-articles` / `international-articles` 用于最终日报配额。
`DailyDigestSkill` 运行时还可从 `ConfigStorage<DailyDigestConfig>` 读取覆盖配置，目前支持在 WebUI 动态修改搜索主题。

### DailyDigestSkill 执行流程

1. 读取 `SKILL.md` 获得默认搜索词、候选上限和国内/国际配额；若 `data/skills/daily-digest/config.json` 中存在自定义主题，则运行时覆盖默认搜索词
2. 启动 Playwright chromium（headless）
3. 依次导航各关键词的百度新闻搜索页，用 Playwright locator 提取所有链接（零 LLM 调用），并为链接打上国内/国际查询提示
4. 跨关键词去重后，按国内 / 国际各调用一次 `ctx.agent.llm.complete()`，筛选为结构化 JSON（`DigestArticle[]`，含 `category`）
5. 解析层先尝试标准 JSON，再兼容 fenced json 和 near-JSON 宽松恢复，避免标题里的未转义引号把整批结果打空
6. 按国内 10 / 国际 5 的配额选出最终 15 篇，并对低质量聚合域名做降权
7. 运行时读取 `template.html` / `section.html` / `item.html` / `layout.css`，只填内容，不再在 TS 里硬编码整页 HTML
8. Playwright 截图为 PNG，写入 `data/skills/daily-digest/YYYY-MM-DD.{html,md,png,json}`
9. 返回 `{ outputPath: "data/skills/daily-digest/YYYY-MM-DD.png" }`
10. 由独立的 `sendSkillOutput` Cron Job 调用 `feishu.sendImage(chatId, pngPath)`

其中 HTML 不再由 `index.ts` 直接拼整页结构，而是运行时读取 `src/skills/daily-digest/template.html`、`section.html`、`item.html` 和 `layout.css` 进行模板替换；这样 HTML 模板和 CSS 模板共同成为截图与导出文件的单一版式源。
截图阶段使用 `browser.newContext({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 4 })`，并以 `scale: "device"` 输出 PNG，在不改变版心尺寸的前提下提升清晰度。

### 新闻库数据来源

`GET /api/news` 不再依赖 NewsStorage，改为扫描 `data/skills/*/YYYY-MM-DD.json`，合并排序后分页返回。文件名即日期，`savedAt` 由文件名推导。

---

## NewsStorage / MemoryStorage / ConfigStorage

`NewsStorage` 已移除（Sprint 36）。新闻数据来自 `DailyDigestSkill` 每次运行保存的 `YYYY-MM-DD.json`，`GET /api/news` 直接扫描这些文件。

### MemoryStorage / ConversationStorage / ConfigStorage

- `new MemoryStorage("./data/agent/memory.json")` — 长期记忆，仅保存 `memory_save` 写入的条目
- `new ConversationStorage("./data/im/conversations.json")` — IM session 历史
- `new ConfigStorage<IMConfig>("./data/im/im-config.json")` — IM 凭证
- `new ConfigStorage<LLMConfig>("./data/agent/llm-config.json")` — LLM 配置
- `new ConfigStorage<AgentMetaConfig>("./data/agent/agent-config.json")` — Agent 名称和系统提示词
- `new ConfigStorage<MountedDocConfig>("./data/agent/feishu-docs/config.json", { docs: [] })` — 挂载飞书文档配置
- `new ConfigStorage<DailyDigestConfig>("./data/skills/daily-digest/config.json")` — DailyDigest 搜索主题
- `new ConfigStorage<CronJobConfig[]>("./data/cron/cron-config.json", [])` — Cron 任务配置

ConversationStorage 负责短期 session 历史；MemoryStorage 负责长期共享记忆，两者不会自动互相镜像。也就是说，IM 多轮对话会持久化到 `conversations.json`，但不会自动沉淀到 `memory.json`。各配置文件职责分离，互不干扰。WebServer 通过各自独立的注入点访问，POST 保存后通过回调（`onIMConfig` / `onLLMConfig` / `onAgentConfig`）热更新运行中的服务，无需重启。

---

## WebUI 运行概览

`GET /api/status` 现在除了原有的 `connections` / `cronJobs` 外，还会返回服务端即时拼装的 `overview` 字段，供状态页做可视化展示。

`overview` 的数据来源分两层：

- 运行时层：`app.ts` / `web/dev.ts` 通过 `getStatus()` 注入飞书实例是否激活、配置来源（持久化配置或环境变量）、Webhook 路径
- 存储层：`WebServer` 直接读取 `ConfigStorage` / `MemoryStorage` / `IMEventStorage` / `ConversationStorage` / `MountedDocLibrary`，生成配置文件状态、群聊摘要和指标摘要

这样做的好处：

- 状态页不需要逐个请求多个接口再自己拼数据
- 后端能直接感知真实落盘文件状态，而不是只看表单值
- 同一接口同时覆盖“当前实例是否在跑”和“配置文件是否真的写到了磁盘”

`IMEventStorage` 现在除了 ring buffer 事件列表，还会维护一个群聊摘要索引：

- 群聊 key 为 `${platform}:${chatId}`
- `bot_added` 事件会把群标记为 `active: true`
- `bot_removed` 事件会把群标记为 `active: false`
- 普通消息和 cron 事件会刷新 `lastSeen`
- 若事件里带群名，则同步更新 `chatName`

这样状态页可以直接展示“机器人已加入哪些飞书群，以及群名是什么”，不需要再从消息日志倒推。

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

`createMemoryTools(storage)` 通过工厂函数注入 storage 依赖，便于测试时替换实例，也支持多 Agent 共享同一个 storage 或各自独立。

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
| `/api/im-config` | GET/POST | 飞书等 IM 凭证（读写 `data/im/im-config.json`） |
| `/api/config/llm` | GET/POST | LLM 配置（读写 `data/agent/llm-config.json`） |
| `/api/config/agent` | GET/POST | Agent 配置（读写 `data/agent/agent-config.json`） |
| `/api/config/daily-digest` | GET/POST | DailyDigest 搜索主题（读写 `data/skills/daily-digest/config.json`） |
| `/api/config/feishu-docs` | GET/POST | 挂载飞书文档配置（读写 `data/agent/feishu-docs/config.json`） |
| `/api/config/feishu-docs/sync` | POST | 用 Playwright 同步飞书文档正文到本地缓存 |
| `/api/cron` | GET/POST/DELETE | Cron 任务 CRUD |
| `/api/cron/:id/run` | POST | 立即执行单条 Cron 任务 |
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

**七标签页导航（hash 路由）：**

| Tab | URL hash | 组件 | 说明 |
|-----|----------|------|------|
| 对话 | `#chat` | `ChatView` | 消息气泡 + 工具事件 + 思考气泡 + 等待动画 |
| 新闻库 | `#news` | `NewsView` | 关键词搜索、分页浏览（读 skill JSON 输出） |
| 记忆库 | `#memory` | `MemoryView` | 关键词搜索、分页、内容展开/收起，只展示已通过 `memory_save` 落库的条目 |
| Skills | `#skills` | `SkillsView` | Skill 列表、手动触发、实时执行日志 |
| 状态 | `#status` | `StatusView` | IM 连接状态、IM 日志 |
| Cron | `#cron` | `CronView` | Cron 列表、增删改、立即执行 |
| 设置 | `#settings` | `SettingsView` | Agent 配置 / 飞书文档挂载 / DailyDigest 搜索主题 / LLM 配置 / 飞书 IM 配置 |

URL hash 路由由 `App.tsx` 自行管理（无路由库依赖）：初始化读 `window.location.hash`，切换 tab 更新 hash，监听 `hashchange` 支持浏览器前进/后退。

`CronView` 通过 `GET /api/cron` 读取配置，`POST /api/cron` 保存，`DELETE /api/cron/:id` 删除，`POST /api/cron/:id/run` 直接触发一次运行；后端再通过 `CronScheduler.runNow()` 复用既有 Skill / IM 投递链路。

`SettingsView` 的飞书文档区块通过 `GET /api/config/feishu-docs` 读取配置和同步状态，`POST /api/config/feishu-docs` 保存来源列表，`POST /api/config/feishu-docs/sync` 调用 `MountedDocLibrary` 用 Playwright 拉取正文并写入本地缓存。

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
