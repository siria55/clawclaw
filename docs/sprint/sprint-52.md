# Sprint 52

## 目标

- 让飞书 Cron 能同时投递到多个目标
- 保持旧的单 `chatId` 配置兼容，不破坏现有任务

## 完成项

- [x] `CronJobConfig` 新增 `chatIds`，保留旧 `chatId` 兼容
- [x] 运行时 Cron delivery 支持同一任务同时发给多个飞书用户 / 群
- [x] Agent 模式、直发文本、直发 Markdown、直发图片、`sendSkillOutput` 都支持多目标投递
- [x] WebUI Cron 表单改成多行“发送目标”，每行一个 chatId
- [x] Cron 列表卡片可直接看到当前任务的多个投递目标
- [x] 服务端保存 / 读取 Cron 配置时自动归一化 `chatId` / `chatIds`
- [x] 补齐 CronScheduler / CronView / WebServer 相关测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 旧配置仍可只写 `chatId`
- 新配置会在保存时自动归一化为：
  - `chatId`: 第一个目标
  - `chatIds`: 去重后的全部目标
- Agent 只运行一次，生成出的同一条回复再广播到所有目标，避免重复消耗 LLM

## 验证

- [x] `pnpm typecheck`
- [ ] `pnpm lint`（仓库现有 ESLint / tsconfig 基线问题，非本次改动引入）
- [x] `pnpm test tests/cron/scheduler.test.ts tests/web/CronView.test.ts tests/web/server.test.ts`
- [x] `pnpm build`

## 结果

- 同一条飞书 Cron 现在可以同时发给 `chat` 和群
- 现有只配了单个 `chatId` 的任务无需迁移，仍可继续执行
