# Sprint 83

## 目标

- 修复用户问“你谁 / 你叫什么 / 你是做什么的”时，Agent 未明显遵循自定义系统提示词的问题
- 将 Agent 名称与身份设定统一注入系统提示构造逻辑
- 同步更新测试与相关文档说明

## 完成项

- [x] 抽出统一的 Agent system prompt 构造函数
- [x] 将 Agent 名称、身份设定和身份类问题回答规则显式注入 system prompt
- [x] 让 `app.ts` 与 `src/web/dev.ts` 共用同一套 system prompt 逻辑
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 自定义 `systemPrompt` 不再只是原样拼接，而是包在明确的“身份设定”语义里
- 运行时会额外注入 Agent 名称，并明确要求：当用户询问“你是谁 / 你叫什么 / 你是做什么的”等身份问题时，优先依据名称与身份设定用第一人称回答
- 保持现有飞书工具、挂载文档优先、日期注入等系统规则不变

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test -- tests/runtime/agent-system-prompt.test.ts`
- [x] `corepack pnpm build`

## 结果

- 运行时 system prompt 现在会显式注入 Agent 名称与自定义身份设定
- 当用户问“你谁 / 你叫什么 / 你是做什么的 / 你是哪个 bot”时，模型会被明确要求优先依据这些配置回答
- `app.ts` 与 `src/web/dev.ts` 已共用 `buildAgentSystemPrompt()`，避免开发和生产两套行为漂移
- 新增 `tests/runtime/agent-system-prompt.test.ts`，当前类型检查、测试和构建均通过
