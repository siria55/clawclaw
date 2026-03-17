# Sprint 16 — Chat MD 渲染 + IM Agent 确认

**状态**: ✅ 完成

**目标**：
1. WebUI 对话页：assistant 回复渲染 Markdown（代码块、列表、标题、链接等）
2. 确认并文档化：飞书等 IM 与 WebUI 共用同一 agent 实例，已复用 agent-config 和 memory

---

## 分析

### Item 2 现状（已实现，无需改动）

`app.ts` 中 ClawServer 和 WebServer 共用同一个 `agent`：
- `agent.system` 每轮动态读取 `agentConfigStorage.read().systemPrompt` ✓
- `agent.tools` 包含 `memory_save` / `memory_search` / `memory_get` ✓
- `agent.getContext` 每轮自动检索相关记忆注入上下文 ✓
- `onAgentConfig` 回调调用 `agent.updateSystem()` 热更新 ✓

IM 消息走 `ClawServer → agent.run(message.text)`，与 WebUI 走 `WebServer → agent.stream(message)` 使用的是同一个 agent 实例，天然共享所有配置和记忆能力。**无需修改代码。**

### Item 1 方案

安装 `react-markdown`，assistant bubble 内容改为 Markdown 渲染；user bubble 保持纯文本。

---

## 任务

### 1. 安装依赖
- [x] `pnpm add react-markdown`

### 2. `ChatView.tsx` — assistant bubble 改为 MD 渲染
- [x] assistant message 使用 `<ReactMarkdown>` 渲染
- [x] user message 保持纯文本 `<span>`

### 3. `ChatView.module.css` — Markdown 元素样式
- [x] `p`、`ul/ol/li`、`pre/code`、`h1-h3`、`a`、`blockquote` 等样式
- [x] 移除 assistant bubble 的 `white-space: pre-wrap`（MD 自带排版）

---

## 验收标准

- [x] assistant 回复中的代码块有底色，行内代码有高亮
- [x] 列表、标题、链接正确渲染
- [x] user 消息仍为纯文本，不受影响
- [x] 流式输出时 MD 实时渲染，无闪烁异常
- [x] 类型检查通过，所有测试通过
