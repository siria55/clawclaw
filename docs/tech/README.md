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
├── llm/openai.ts          ← OpenAI Chat Completions 适配器
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
│   ├── context.ts         ← buildIMRunContext() / persistIMRunContext()
│   ├── news-reply.ts      ← 飞书"今天新闻"快捷处理
│   └── route.ts           ← IM 路由 / onMessage 拦截
│
├── memory/storage.ts      ← MemoryStorage（JSON 持久化）
├── docs/library.ts        ← MountedDocLibrary（文档同步 / 缓存 / 检索）
│
├── platform/feishu.ts     ← 飞书适配器
├── platform/wecom.ts      ← 企业微信适配器
│
├── server/index.ts        ← ClawServer（IM 服务）
├── web/server.ts          ← WebServer（调试 API + SPA）
├── cron/scheduler.ts      ← CronScheduler
└── skills/
    ├── types.ts           ← Skill / SkillContext / SkillResult
    ├── registry.ts        ← SkillRegistry
    ├── loader.ts          ← SKILL.md 解析
    └── daily-digest/      ← DailyDigestSkill
        └── source-classification.ts ← 大陆来源识别（前后端共用）
```

依赖方向：`server/web → platform/core`，`core → llm/tools`，`skills → core`，各层不反向依赖。

运行期数据统一写入 `data/`，仓库不提交本地生成的配置、会话日志或 Skill 产物。

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

`contextMessages` 仅在步骤 4 传入 LLM，不写入 `messages`，因此不会出现在 `AgentRunResult.messages` 中。检索结果等临时信息"用完即扔"，不污染历史。

---

## Agentic Context Engineering

### 动态 system prompt

`AgentConfig.system` 类型为 `string | (() => string | Promise<string>)`，每轮通过 `#resolveSystem()` 求值。`updateSystem(fn)` 支持运行时热替换，WebUI 保存 Agent 配置后自动调用。

### getContext 钩子

```ts
getContext?: (messages: Message[]) => Message[] | Promise<Message[]>
```

每轮 LLM 调用前执行，返回本轮额外注入的消息，**不写入历史**。当前用途：
- 按用户最新消息自动检索记忆库，把命中摘要注入为临时上下文
- 检索命中的飞书挂载文档片段并注入

记忆侧只有"自动检索、显式写入"两段链路：`getContext` 自动搜索但不写入；`memory_save` 是唯一写入口。

---

## IM 会话模型

| 字段 | 说明 |
|------|------|
| `chatId` | 平台真实回包目标，`platform.send(chatId, text)` 使用 |
| `sessionId` | ConversationStorage 的短期历史键 |
| `continuityId` | 同一发言人在同一来源的会话桥接键 |

当前规则：
- 飞书普通消息：`sessionId = chatId`
- 飞书线程消息：`sessionId = ${chatId}#thread:<rootId|threadId|parentId>`

`ConversationStorage.loadSession()` 先读当前 session；若为空，则从同 `continuityId` 的上一个 session 取最后一轮对话压成短参考注入，新 session 自然续上但不合并历史。

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

内联 `zodToJsonSchema()` 将 Zod schema 转为 JSON Schema，不引入额外依赖，当前支持 `ZodObject / ZodString / ZodNumber / ZodBoolean / ZodOptional`。

### 工厂模式

`createMemoryTools(storage)` / `createFeishuOrgTools(() => feishu)` 通过工厂函数注入依赖，便于测试替换，也支持 `app.ts` 与 `web/dev.ts` 共用同一套工具定义。

---

## 存储层

| 类 | 文件路径 | 说明 |
|----|----------|------|
| `MemoryStorage` | `data/agent/memory.json` | 长期记忆，仅 `memory_save` 写入 |
| `ConversationStorage` | `data/im/conversations.json` | IM session 历史 |
| `ConfigStorage<IMConfig>` | `data/im/im-config.json` | IM 凭证 |
| `ConfigStorage<LLMConfig>` | `data/agent/llm-config.json` | LLM provider / key / model |
| `ConfigStorage<AgentMetaConfig>` | `data/agent/agent-config.json` | Agent 名称和 system prompt |
| `ConfigStorage<MountedDocConfig>` | `data/agent/feishu-docs/config.json` | 挂载文档列表 |
| `ConfigStorage<DailyDigestConfig>` | `data/skills/daily-digest/config.json` | 搜索主题、Brave Key 和请求参数 |
| `ConfigStorage<CronJobConfig[]>` | `data/cron/cron-config.json` | Cron 任务列表 |

POST 配置接口保存后通过回调（`onIMConfig` / `onLLMConfig` / `onAgentConfig`）热更新运行中的服务，无需重启。

---

## 关键实现说明

### Anthropic Tool Result 编码

Anthropic 要求工具结果为标准 `tool_result` block。`Agent.#executeTools()` 保留 `toolCallId`，`AnthropicProvider` 在发送前将内部结构转换为 `{ type: "tool_result", tool_use_id, content, is_error? }`，避免 `invalid_request_error: type: Field required`。

### OpenAI Chat Completions 适配

发送前两层转换：`system` 转为首条 `developer` message；内部 `tool` 消息展开为多条 `role: "tool"` 消息（各带 `tool_call_id`）。返回后反向标准化为内部 `Message` 结构，使 Agent 编排层对底层 provider 无感知。

### 飞书 Markdown 发送

`FeishuPlatform.send()` 检测内容是否含明显 Markdown 结构（标题、列表、引用、代码块、链接），命中时升级为 `msg_type: "post"` 加 `md` 节点。首行 `#` 标题会提取为 `post.zh_cn.title`。

### IM 路由短路

`onMessage(message)` 拦截器返回 `handled: true` 时跳过 Agent，用于飞书 `daily-digest` 快捷指令和数字回复链路。飞书群聊消息在进入拦截器前先做 mention-to-bot 判断，未 `@` 时仅记录日志。

### Cron 多目标投递

`CronJobConfig` 支持 `chatId`（向后兼容）和 `chatIds`（多目标）。执行时 Agent 只跑一次，同一份回复依次广播到所有目标；`sendSkillOutput` 同理。

---

## Skills 系统

### SKILL.md 规范

```
---
id: daily-digest
description: ...
queries: ...
domestic-articles: 10
international-articles: 5
max-articles: 15
max-candidates: 36
---
Agent 指令（支持变量替换）
```

`loadSkillDef(skillDir)` 解析 frontmatter，返回 `SkillDef`（含 `instructions` 字段）。

### DailyDigestSkill 架构

Playwright 只保留在最终 HTML 截图阶段；候选新闻直接来自 Brave Search API。

```
Brave Search API
  → 候选去重 + 来源分层（大陆优先 / 非大陆回退）
  → LLM 抽取（国内 / 国际两路）
  → 语言归一化（繁体转简体 / 其他语言译简体）
  → 按配额选稿
  → 模板渲染（template.html / section.html / item.html / layout.css）
  → Playwright 截图（1080px / 4x）
  → 写入 YYYY-MM-DD.{html,md,png,json} + runs/{runId}.json
```

大陆来源识别逻辑统一在 `source-classification.ts`，后端筛选和 `DailyDigestRunsView` 共用，避免 UI 与实际筛选口径偏离。

---

## WebServer API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/chat` | POST | SSE 流式对话，body `{message}` |
| `/api/status` | GET | 运行状态（连接、Cron、overview） |
| `/api/im-log` | GET | IM 事件日志，query: `since=` |
| `/api/im-config/feishu-target` | GET | 解析飞书 chatId 返回群名 / 用户名 |
| `/api/news` | GET | 新闻库查询，扫描 `data/skills/*/YYYY-MM-DD.json` |
| `/api/daily-digest/runs` | GET | 日报执行记录列表 |
| `/api/daily-digest/runs/:id` | GET | 单次执行详情 |
| `/api/memory` | GET | 记忆库查询 |
| `/api/skills` | GET | 已注册 Skill 列表 |
| `/api/skills/:id/run` | POST | 手动触发 Skill（SSE 日志流） |
| `/api/skills/:id/latest-image` | GET | 该 Skill 最新 PNG |
| `/api/im-config` | GET/POST | IM 凭证 |
| `/api/config/llm` | GET/POST | LLM 配置 |
| `/api/config/agent` | GET/POST | Agent 配置 |
| `/api/config/daily-digest` | GET/POST | DailyDigest 搜索配置 |
| `/api/config/feishu-docs` | GET/POST | 挂载文档配置 |
| `/api/config/feishu-docs/sync` | POST | 同步文档正文到本地缓存 |
| `/api/cron` | GET/POST/DELETE | Cron 任务 CRUD |
| `/api/cron/:id/run` | POST | 立即执行单条 Cron |

SPA fallback：无扩展名路径返回 `index.html`，有扩展名且文件不存在返回 404。

### SSE 事件类型

**`/api/chat`**

| 事件 | data | 说明 |
|------|------|------|
| `thinking` | `{text}` | 扩展思考内容（增量） |
| `message` | `{content}` | assistant 文本（增量） |
| `tool_call` | `{toolName, input}` | 工具调用 |
| `tool_result` | `{toolName, result}` | 工具结果 |
| `error` | `{message}` | 错误 |
| `done` | `{result}` | 运行结束 |

**`/api/skills/:id/run`**

| data | 说明 |
|------|------|
| `{type:"log", text}` | 执行日志 |
| `{type:"done", outputPath?}` | 完成，含输出路径 |
| `{type:"error", error}` | 失败 |

---

## 上下文压缩（LLMContextCompressor）

触发条件：估算 token 数（字符数 / 4）超过阈值（默认 6000）。

策略：
1. 保留首条用户消息（维持原始意图）
2. LLM 摘要中间消息
3. 保留最近 `keepRecentPairs × 2` 条（默认 4 轮）

---

## 签名验证

| 平台 | 方案 |
|------|------|
| 飞书 | SHA256 HMAC + 5 分钟时间窗防重放 |
| 企业微信 | SHA1 明文验证；消息体 AES-256-CBC 解密 |

自动过滤 Bot 自发消息（飞书：`sender_type === "app"`；企业微信：`MsgType === "event"`）。

---

## 测试策略

- **单元测试**：Mock LLM / IMPlatform，不访问外网
- **存储测试**：`tmpdir` 临时目录，`afterEach` 清理
- **Web hook 测试**：`port: 0` 随机端口
- **React hook 测试**：`@vitest-environment jsdom` + `@testing-library/react renderHook`
- **覆盖率阈值**：全局 80%
