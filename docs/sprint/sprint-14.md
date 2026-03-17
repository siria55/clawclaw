# Sprint 14 — Agent Meta 配置

**状态**: ✅ 完成

**目标**: 让用户可以在 WebUI 里编辑 Agent 的 system prompt 和名称，保存到 `data/agent-config.json`，启动时自动加载，热更新无需重启。

---

## 架构

```
data/agent-config.json          ← 用户写的 agent 配置
  { name, systemPrompt }

ConfigStorage<AgentMetaConfig>  ← 复用泛型存储
GET /api/config/agent           ← 读取
POST /api/config/agent          ← 保存 + 热更新

WebUI 设置页 → Agent 分区        ← 编辑界面（textarea）
```

Agent 的 `system` 函数每轮调用前合并：用户 systemPrompt（若有）+ 当前日期注入。

---

## 任务

### 1. `src/config/types.ts`
- [x] 新增 `AgentMetaConfig` 接口：`name?: string; systemPrompt?: string`

### 2. `src/web/server.ts`
- [x] `WebServerConfig` 新增 `agentConfigStorage?: ConfigStorage<AgentMetaConfig>`、`onAgentConfig?: (config: AgentMetaConfig) => void`
- [x] `GET /api/config/agent` — 读取返回
- [x] `POST /api/config/agent` — 保存 + 调用回调

### 3. `src/app.ts`
- [x] `agentConfigStorage = new ConfigStorage<AgentMetaConfig>("./data/agent-config.json")`
- [x] `agent.system` 函数：优先读 `agentConfigStorage.read().systemPrompt`，fallback 默认提示词
- [x] `onAgentConfig` 回调：热更新 agent 名称（`agent.updateName()`，若提供）

### 4. `src/core/agent.ts`
- [x] 新增 `updateSystem(fn: () => string): void` 方法，支持热替换 system 函数

### 5. Web UI — `SettingsView.tsx`
- [x] 新增 `AgentSection` 组件
- [x] 字段：名称（单行输入）、系统提示词（多行 textarea）
- [x] 加载：`GET /api/config/agent`，保存：`POST /api/config/agent`

### 6. 测试
- [x] `tests/web/server.test.ts` — `/api/config/agent` GET/POST
- [x] `tests/core/agent.test.ts` — `updateSystem()` 热更新

---

## 验收标准

- [x] 访问设置页，能看到 Agent 分区，有名称和 system prompt 输入
- [x] 填入 system prompt 点保存，下一轮对话即使用新 prompt，无需重启
- [x] `data/agent-config.json` 正确写入
- [x] 未填 system prompt 时使用默认提示词
- [x] 类型检查通过，所有测试通过
