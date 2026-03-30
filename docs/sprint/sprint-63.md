# Sprint 63

## 目标

- 为 clawclaw 增加 OpenAI ChatGPT / API 的 LLM 接入能力
- 让 WebUI、运行时热更新、临时覆盖配置都支持切换到 OpenAI

## 完成项

- [x] 新增 OpenAI LLM Provider，并兼容现有 Agent / Tool 调用链路
- [x] 扩展 `LLMConfig`，支持保存 provider 与 OpenAI 相关配置
- [x] 更新 WebUI 模型设置，允许选择 Anthropic / OpenAI
- [x] 补充 OpenAI Provider 与 LLM 配置链路测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`、`docs/manual/cli.md`、`README.md`、`.env.example`

## 设计说明

- OpenAI 接入保持与 Anthropic 相同的 `LLMProvider` 抽象，避免影响 Agent 编排层
- WebUI 保存 `data/agent/llm-config.json` 后，运行中的 Agent 应立即切换到新的 Provider
- 浏览器 `X-Claw-Config` 临时覆盖也应支持 provider / model / baseURL / apiKey

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- clawclaw 现已支持在 Anthropic Claude 与 OpenAI ChatGPT / API 之间切换，切换入口包括 WebUI 设置、持久化配置和 `X-Claw-Config`
- OpenAI provider 使用 Chat Completions 接口，并兼容现有 tool call / tool result 编排链路
- `.env` 和使用文档已补齐 `LLM_PROVIDER`、`OPENAI_API_KEY`、`OPENAI_BASE_URL` 的启动方式
- 新增 OpenAI provider、LLM factory 和 Web 配置接口测试，覆盖 provider 创建、消息格式转换与配置保存链路
