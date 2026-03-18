# Sprint 28 — Settings WebUI 与本地数据同步修复

**状态**: ✅ 完成

**目标**：修复 Settings 页面与 `data/` 下配置文件不同步的几个问题：

1. `httpsProxy` 字段不生效 — 存入 JSON 但从未传给 `AnthropicProvider`
2. 清空字段无法持久化 — save 函数用 truthy 判断跳过空值，导致清空后刷新恢复旧值
3. `buildLLM()` 与 `onLLMConfig` 条件不一致（`!== undefined` vs `&&`）

## 修复方案

### 1. `AnthropicProvider` 接受 `httpsProxy` 参数

```ts
constructor(config: AnthropicConfig = {}) {
  const proxy = config.httpsProxy ?? process.env["HTTPS_PROXY"] ?? process.env["HTTP_PROXY"];
  ...
}
```

`AnthropicConfig` 已经通过 `extends Partial<LLMConfig>` 继承了 `httpsProxy?`，只需在构造函数里读取它。

### 2. `dev.ts` + `app.ts` 传递 `httpsProxy`

`buildLLM()` 和 `onLLMConfig` 统一用 `!== undefined` 判断，加上 `httpsProxy`。

### 3. SettingsView save — 始终发送所有字段

```ts
// LLM
body: JSON.stringify({
  apiKey: fields.apiKey,
  baseURL: fields.baseURL,
  httpsProxy: fields.httpsProxy,
  model: fields.model,
})

// Agent
body: JSON.stringify({
  name: fields.name,
  systemPrompt: fields.systemPrompt,
  allowedPaths: ...,
})
```

### 4. 服务端 merge 逻辑：空字符串 = 清除该字段

`mergeLLMConfig` 和 `#handlePostAgentConfig`：
- 空字符串 `""` → 不存储该字段（效果等同于清除，下次使用默认值）
- 已有值且 incoming 为 `undefined` → 保留旧值
- masked 字符串（ends with `****`）→ 保留旧值

## 任务

- [x] `src/llm/anthropic.ts` — 构造函数读 `config.httpsProxy`
- [x] `src/web/dev.ts` — `buildLLM` + `onLLMConfig` 加 `httpsProxy`，统一 `!== undefined`
- [x] `src/app.ts` — 同上
- [x] `src/web/ui/SettingsView.tsx` — LLM + Agent save 始终发送所有字段
- [x] `src/web/server.ts` — `mergeLLMConfig` + agent merge 处理空字符串
- [x] typecheck + tests 通过（155 tests）
