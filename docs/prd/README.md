# clawclaw 产品文档

## 定位

clawclaw 是一个轻量、可扩展的 AI Agent 框架，TypeScript 实现。目标是用最少的抽象让开发者快速构建具备工具调用能力的 Agent，同时保持代码可测试、可替换。

---

## 核心概念

### Agent

Agent 是框架的核心调度单元。它持有一个系统提示词、一个 LLM 适配器和一组工具，负责驱动"LLM 决策 → 工具执行 → 结果回传"的循环，直到 LLM 不再调用工具或达到最大轮数为止。

```
用户消息
    ↓
  Agent
    ↓ 调用
  LLM
    ↓ 返回 (文本 | 工具调用)
  Tool × N          ← 并发执行所有工具调用
    ↓ 返回结果
  LLM               ← 继续下一轮
    ↓ 返回文本
  结束
```

Agent 有两种运行模式：
- **run** — 阻塞执行，完成后返回完整消息历史
- **stream** — 逐步 yield 事件，适合流式 UI

### Message

消息是 Agent 与 LLM 之间的信息单元，有三种角色：

| role | 说明 |
|------|------|
| `user` | 用户输入 |
| `assistant` | LLM 输出（文本或工具调用指令） |
| `tool` | 工具执行结果，回传给 LLM |

消息按时间顺序追加，构成完整的对话上下文，每轮都完整传给 LLM。

### LLMProvider

`LLMProvider` 是所有 LLM 适配器必须实现的接口，只有一个方法：`complete(params)`。

框架对 LLM 无任何假设，只要实现该接口即可接入。目前内置 Anthropic 适配器，后续可扩展 OpenAI、DeepSeek、本地模型等。

适配器负责：
- 将框架内部的 `Message[]` 格式转换为具体 API 格式
- 解析响应中的工具调用指令（`ToolCall[]`）
- 透传 token 用量（可选）

### Tool

Tool 是 Agent 可调用的外部能力单元。LLM 根据工具的 `name` 和 `description` 决定是否调用，根据 `inputSchema`（JSON Schema）生成合法的调用参数。

工具执行的结果只有两种状态：
- `output` — 成功，字符串内容回传给 LLM
- `error` — 失败，错误信息回传给 LLM，LLM 自行决定如何处理

工具调用失败不会中断 Agent 循环，LLM 会根据错误信息决定重试或放弃。

`defineTool()` 是创建工具的推荐方式，内置 Zod 输入校验，参数非法时自动返回 `error` 而不是抛出异常。

### AgentEvent

`stream()` 模式下 yield 的事件类型，共四种：

| 事件 | 触发时机 |
|------|----------|
| `message` | LLM 返回消息（含文本或工具调用指令） |
| `tool_call` | Agent 准备执行某个工具 |
| `tool_result` | 工具执行完毕 |
| `done` | 本轮 Agent 运行结束 |

---

## 模块结构

```
src/
├── core/
│   ├── agent.ts      Agent 类，run() 和 stream() 实现
│   └── types.ts      AgentConfig / AgentOptions / AgentEvent 类型定义
├── llm/
│   ├── types.ts      LLMProvider 接口、Message、ToolCall 等核心类型
│   ├── anthropic.ts  Anthropic Claude 适配器
│   └── index.ts      createLLM() 工厂函数
└── tools/
    ├── types.ts      Tool 接口、ToolResult、defineTool() 实现
    └── index.ts      公共导出
```

各模块职责单一，依赖方向为：`core → llm / tools`，`llm` 和 `tools` 互不依赖。

---

## 设计原则

- **接口优于实现** — `LLMProvider` 和 `Tool` 都是接口，框架不锁定任何具体实现
- **错误不崩溃** — 工具执行异常转为 `error` 返回，Agent 循环不中断
- **可测试** — 核心逻辑不依赖网络，Mock LLM 即可单元测试
- **最小依赖** — 运行时只需 `@anthropic-ai/sdk` 和 `zod`
