# clawclaw 产品文档

## 定位

clawclaw 是一个可 24 小时持续运行的 AI Agent 框架，TypeScript 实现。核心能力是将 Agent 接入飞书、企业微信等 IM 平台，让 AI 以 Bot 形式常驻在团队工作流中。

---

## 核心架构

```
IM 平台 (飞书 / 企业微信 / ...)
    ↓ Webhook 推送消息
  ClawServer              ← 24/7 常驻 HTTP 服务
    ↓ 路由到对应 Agent
  Agent
    ↓ LLM 决策
  LLM (Anthropic / ...)
    ↓ 工具调用
  Tool × N
    ↓ 执行结果
  Agent
    ↓ 生成回复
  ClawServer
    ↓ 调用 IM API 发送
IM 平台
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

### IMMessage

平台无关的统一消息格式：

| 字段 | 说明 |
|------|------|
| `platform` | 来源平台标识 |
| `chatId` | 会话 ID（群 or 单聊） |
| `userId` | 发消息的用户 ID |
| `text` | 消息文本内容 |
| `raw` | 原始平台事件，供高级用途 |

### Agent

Agent 是框架的核心调度单元，负责驱动"LLM 决策 → 工具执行 → 结果回传"的循环。每收到一条 IM 消息，ClawServer 创建一次 Agent 运行。

Agent 有两种运行模式：
- **run** — 阻塞执行，完成后返回完整消息历史
- **stream** — 逐步 yield 事件，适合流式推送回复

### LLMProvider

所有 LLM 适配器实现的接口，只有一个方法 `complete(params)`。框架对 LLM 无假设，目前内置 Anthropic 适配器，可扩展 OpenAI、DeepSeek、本地模型。

### Tool

Agent 可调用的外部能力单元。工具执行失败不中断循环，错误信息回传给 LLM 自行处理。`defineTool()` 是推荐的创建方式，内置 Zod 输入校验。

### Message

Agent 与 LLM 之间的消息单元，三种角色：

| role | 说明 |
|------|------|
| `user` | 用户输入 |
| `assistant` | LLM 输出 |
| `tool` | 工具执行结果 |

---

## 模块结构

```
src/
├── core/
│   ├── agent.ts        Agent 类，run() 和 stream() 实现
│   └── types.ts        AgentConfig / AgentOptions / AgentEvent 类型
├── llm/
│   ├── types.ts        LLMProvider 接口、Message、ToolCall 等
│   ├── anthropic.ts    Anthropic Claude 适配器
│   └── index.ts        createLLM() 工厂
├── platform/
│   ├── types.ts        IMPlatform 接口、IMMessage 类型
│   ├── feishu.ts       飞书适配器
│   └── wecom.ts        企业微信适配器
├── server/
│   └── index.ts        ClawServer，24/7 常驻服务
└── tools/
    ├── types.ts        Tool 接口、ToolResult、defineTool()
    └── index.ts        公共导出
```

依赖方向：`server → platform / core`，`core → llm / tools`，各层互不反向依赖。

---

## 设计原则

- **接口优于实现** — `LLMProvider`、`Tool`、`IMPlatform` 均为接口，不锁定任何具体实现
- **错误不崩溃** — 工具异常和 IM 发送失败均捕获处理，不影响其他会话
- **可测试** — 核心逻辑不依赖网络，Mock LLM 和 IMPlatform 即可单元测试
- **最小依赖** — 运行时只需 `@anthropic-ai/sdk` 和 `zod`
