# Sprint 9 — 记忆模块与动态上下文

**周期**: Sprint 9
**状态**: ✅ 完成

## 目标

两个紧密相关的能力：

1. **按需动态记忆** — `src/memory/` 模块 + `memory_save` / `memory_search` / `memory_get` 三个工具，Agent 在需要时主动检索记忆（RAG pull）
2. **Agentic Context Engineering** — `AgentConfig` 支持动态系统 prompt 和 `getContext` 钩子，让每次 LLM 调用前可以按需组装上下文（RAG push + 动态注入）

---

## 背景

现状：
- `AgentConfig.system` 是静态字符串，每次调用完全相同
- 所有上下文要么在 system prompt 里预置，要么通过 compressor 截断

目标状态：
- **动态系统 prompt**：`system` 可以是 `() => string | Promise<string>`，每轮 LLM 调用前重新求值（注入当前时间、最新配置等）
- **上下文钩子**：`getContext(messages)` 在每轮 LLM 调用前执行，可向会话注入短暂存在的消息（检索结果、提醒等），这些消息**不写入历史**，只影响当次调用
- **记忆工具**：Agent 在对话中主动调用 `memory_search` / `memory_get` 检索相关记忆，用 `memory_save` 保存新知识

---

## 架构

```
每轮 LLM 调用前：
  1. system()           →  动态生成系统 prompt（可含当前时间、状态等）
  2. getContext(msgs)   →  注入临时消息（RAG 检索结果 / 提示），不写入历史
  3. compressor         →  压缩过长历史（现有逻辑不变）
  4. LLM.complete()     →  正式调用

Agent 工具：
  memory_save           →  MemoryStorage.save()
  memory_search(q)      →  关键词检索，返回摘要列表（id + snippet）
  memory_get(id)        →  按 id 取完整内容
```

---

## 任务

### 1. `src/memory/` 模块

#### `src/memory/types.ts`

```ts
export interface MemoryEntry {
  id: string;          // crypto.randomUUID()
  content: string;     // 记忆内容，纯文本
  tags: string[];      // 可选标签
  createdAt: string;   // ISO 8601
}

export interface MemoryQuery {
  q: string;           // 关键词（不区分大小写）
  limit?: number;      // 默认 10，最大 50
}

export interface MemorySearchResult {
  id: string;
  snippet: string;     // 最多 200 字的摘要
  tags: string[];
  createdAt: string;
}
```

#### `src/memory/storage.ts` — `MemoryStorage` 类

- 构造函数接受 `filePath: string`
- `save(entry: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry`
- `search(query: MemoryQuery): MemorySearchResult[]` — 关键词匹配 `content`（不区分大小写），按 `createdAt` 降序，截取前 `limit` 条，每条 snippet 取前 200 字
- `get(id: string): MemoryEntry | undefined` — 精确按 id 查找
- `all(): MemoryEntry[]` — 返回全部
- 文件格式：JSON 数组（与 NewsStorage 一致）

#### `src/memory/index.ts` — 公共导出

- [x] `src/memory/types.ts`
- [x] `src/memory/storage.ts`
- [x] `src/memory/index.ts`

---

### 2. 记忆工具 — `src/tools/memory.ts`

工厂函数 `createMemoryTools(storage: MemoryStorage): Tool[]`，返回三个工具：

**`memory_save`**
```ts
schema: z.object({
  content: z.string(),
  tags: z.array(z.string()).optional(),
})
// execute: storage.save()，返回 "已保存记忆 (id: xxx)"
```

**`memory_search`**
```ts
schema: z.object({
  q: z.string(),
  limit: z.number().optional(),
})
// execute: storage.search()，结果格式化为文本列表返回
// 格式：[id] snippet... (tags: tag1, tag2) createdAt
```

**`memory_get`**
```ts
schema: z.object({ id: z.string() })
// execute: storage.get()，找不到时返回 error
```

- [x] `src/tools/memory.ts` — `createMemoryTools()`
- [x] `src/tools/index.ts` — 导出 `createMemoryTools`

---

### 3. Agentic Context Engineering — `AgentConfig` 扩展

#### `src/core/types.ts`

```ts
export interface AgentConfig {
  name: string;
  /** 静态字符串或动态函数，每轮 LLM 调用前求值 */
  system: string | (() => string | Promise<string>);
  llm: LLMProvider;
  tools?: Tool[];
  compressor: ContextCompressor | undefined;
  /**
   * 上下文钩子：每轮 LLM 调用前执行，返回临时注入的消息列表。
   * 这些消息追加在历史末尾，仅影响当次调用，不写入对话历史。
   * 适合：检索结果注入、当前时间/状态提示、RAG 结果
   */
  getContext?: (messages: Message[]) => Message[] | Promise<Message[]>;
}
```

#### `src/core/agent.ts` — 支持动态 system 和 getContext

在 `run()` 和 `stream()` 的 while 循环内，每次 `llm.complete()` 调用前：

```ts
// 1. 解析 system
const system = typeof this.#config.system === "function"
  ? await this.#config.system()
  : this.#config.system;

// 2. 注入临时上下文（不修改 messages 历史）
const contextMessages = this.#config.getContext
  ? await this.#config.getContext(messages)
  : [];

// 3. 调用 LLM（传入 messages + contextMessages，contextMessages 不写回历史）
const response = await this.#config.llm.complete({
  system,
  messages: [...messages, ...contextMessages],
  ...(this.#config.tools ? { tools: this.#config.tools } : {}),
});
```

- [x] `src/core/types.ts` — 扩展 `AgentConfig`
- [x] `src/core/agent.ts` — 支持动态 system + getContext

---

### 4. 公共导出 — `src/index.ts`

- [x] 导出 `MemoryStorage`、`MemoryEntry`、`MemoryQuery`、`MemorySearchResult`
- [x] 导出 `createMemoryTools`

---

### 5. 测试

- [x] `tests/memory/storage.test.ts` — MemoryStorage 单元测试：
  - save 自动生成 id 和 createdAt
  - search 关键词匹配
  - search limit
  - get 按 id 查找
  - get 不存在时返回 undefined
  - 数据持久化
- [x] `tests/tools/memory.test.ts` — createMemoryTools 单元测试：
  - memory_save execute
  - memory_search execute（有结果 / 无结果）
  - memory_get execute（存在 / 不存在）
- [x] `tests/core/agent.test.ts` — 扩展现有测试：
  - system 为函数时，每轮调用前求值
  - getContext 返回的消息注入 LLM 调用，但不写入历史

---

## 验收标准

- [x] Agent 可调用 `memory_save` 保存知识，重启后保留
- [x] Agent 可调用 `memory_search` 检索相关记忆（返回 id + snippet）
- [x] Agent 可调用 `memory_get` 取完整记忆内容
- [x] `system` 为函数时，每轮 LLM 调用前动态求值
- [x] `getContext` 注入的消息参与 LLM 调用，但不出现在 `AgentRunResult.messages` 中
- [x] 所有测试通过
