# Sprint 4 — Cron Job + Context Compression + Web UI 配置

**周期**: Sprint 4
**状态**: ✅ 完成

## 目标

让 Agent 能主动触发任务（不只等消息），长对话不爆 context，并通过 Web UI 配置连接参数。

---

## 任务

### 1. Cron Job — 定时任务

Agent 不再只是被动响应，可以设置定时任务主动运行。

- [x] `src/cron/types.ts` — `CronJob` 接口：`schedule`（cron 表达式）、`agent`、`message`
- [x] `src/cron/scheduler.ts` — `CronScheduler` 类，管理任务的增删改查
  - `add(job)` / `remove(id)` / `start()` / `stop()`
  - 基于 Node.js `setInterval` + cron 解析实现，不引入重型依赖
- [x] 定时任务执行结果通过 `IMPlatform.send()` 发送到指定 chatId
- [x] 补充测试

**涉及文件：**
- `src/cron/types.ts`（新建）
- `src/cron/scheduler.ts`（新建）
- `src/cron/index.ts`（新建）

---

### 2. Context Compression — 上下文压缩

长对话 token 累积过多时，自动压缩历史消息，保留关键信息。

- [x] `src/core/compressor.ts` — `ContextCompressor` 接口 + `LLMContextCompressor` 默认实现
  - 默认策略：超过阈值时，保留首条消息 + 摘要中间部分 + 最近 N 轮
  - 摘要通过调用 LLM 生成（复用 `LLMProvider`）
- [x] `Agent` 支持 `compressor: ContextCompressor | undefined` 配置项，每轮前检查是否需要压缩
- [x] 补充测试（Mock LLM 验证压缩触发和摘要插入）

**涉及文件：**
- `src/core/compressor.ts`（新建）
- `src/core/agent.ts`
- `src/core/types.ts`

---

### 3. Web UI 配置面板

在调试界面直接配置 API Key、代理、模型，重启前生效。

- [x] Web UI 右上角增加「设置」入口，展开配置面板
- [x] 配置项：API Key、Base URL、HTTPS Proxy、模型名称
- [x] 配置保存到 `localStorage`，页面刷新后自动恢复
- [x] 每次发送消息时，将配置通过请求头 `X-Claw-Config` 传给服务端
- [x] `WebServer` 读取配置头，构建临时 `AnthropicProvider` 覆盖默认实例
- [x] 补充测试

**涉及文件：**
- `src/web/index.html`
- `src/web/server.ts`
- `src/web/dev.ts`

---

## 验收标准

- [x] 设置 cron 任务后，到时自动触发 Agent 并发送结果到指定会话
- [x] 对话超过 token 阈值时，历史消息被压缩为摘要，不影响回复质量
- [x] Web UI 配置面板可设置 API Key / Base URL，刷新后配置保留
- [x] 所有新增代码测试覆盖率 ≥ 80%（70 tests passing）
