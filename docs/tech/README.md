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
│   └── tools/memory.ts    ← createMemoryTools()
│
├── news/storage.ts        ← NewsStorage（JSON 持久化）
├── memory/storage.ts      ← MemoryStorage（JSON 持久化）
│
├── platform/feishu.ts     ← 飞书适配器
├── platform/wecom.ts      ← 企业微信适配器
│
├── server/index.ts        ← ClawServer（IM 服务）
├── web/server.ts          ← WebServer（调试 API）
└── cron/scheduler.ts      ← CronScheduler
```

原则：依赖只向下，`server` 和 `web` 依赖 `core`，`core` 依赖 `llm` 和 `tools`，`tools` 依赖 `news` 和 `memory`，各层不反向依赖。

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

每轮调用前通过 `#resolveSystem()` 求值：

```ts
async #resolveSystem(): Promise<string> {
  return typeof this.#config.system === "function"
    ? this.#config.system()
    : this.#config.system;
}
```

适用场景：注入当前时间、今日摘要、最新配置、用户偏好等随时间变化的信息。

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

## NewsStorage / MemoryStorage

两个存储类设计完全对称，均基于 JSON 文件：

```
读 → filter/sort/page → 返回
写 → 读全部 → push → 写全部
```

适合千级以内条目，无需外部数据库。如需扩展到更大规模，替换 `all()` / `save()` 实现即可，对上层工具和 API 透明。

**NewsStorage** (`src/news/storage.ts`)：存储新闻文章，支持关键词（title + summary）、标签过滤，分页，按 `savedAt` 降序。

**MemoryStorage** (`src/memory/storage.ts`)：存储任意文本记忆，支持关键词（content）过滤，limit，按 `createdAt` 降序；支持按 id 精确查找。

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
| `/api/news` | GET | 新闻库查询，query: `q / tag / page / pageSize` |
| `*` | GET | 静态文件或 SPA fallback |

SPA fallback 规则：请求路径无扩展名 → 返回 `index.html`（支持前端路由）；有扩展名且文件不存在 → 404。

### SSE 事件类型

| 事件 | data 结构 | 说明 |
|------|-----------|------|
| `thinking` | `{text}` | Claude extended thinking 内容（增量） |
| `message` | `{content}` | assistant 文本（增量） |
| `tool_call` | `{toolName, input}` | 工具调用 |
| `tool_result` | `{toolName, result}` | 工具结果 |
| `error` | `{message}` | 错误 |
| `done` | `{result}` | 运行结束 |

---

## Web UI

React 19 + Vite 6 + CSS Modules + TypeScript strict。

**四标签页导航：**

| Tab | 组件 | 说明 |
|-----|------|------|
| 对话 | `ChatView` | 消息气泡 + 工具事件 + 思考气泡 + 等待动画 |
| 新闻库 | `NewsView` | 关键词搜索、标签过滤、分页浏览 |
| 状态 | `StatusView` | IM 连接状态、Cron 任务列表 |
| 设置 | `SettingsView` | API Key / Base URL / Proxy / Model |

**关键 hooks：**
- `useChatStream` — SSE 解析、事件状态管理、thinking 块累积
- `useNewsQuery` — `GET /api/news` 封装，参数序列化、loading 状态

**等待指示器（TypingBubble）：** `streaming=true` 且无正在流式输出的 assistant 气泡时显示三点跳动动画，给予即时反馈。

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

当前测试总数：134 个，全部通过。
