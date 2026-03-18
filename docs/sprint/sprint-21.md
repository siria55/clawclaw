# Sprint 21 — Cron 消息持久化 + dev.ts 补全调度器

**状态**: ✅ 完成

**目标**：
1. `dev.ts` 缺少 CronScheduler，cron 任务存但不跑 → 补上
2. CronScheduler.#fire() 发出的消息不写 imEventStorage → 补上

## 任务

- [x] `CronSchedulerOptions` 加 `imEventStorage?`
- [x] `CronScheduler.#fire()` 发消息前 append、发完后 setReply
- [x] `dev.ts` 加 CronScheduler，从 cronStorage 加载任务并启动
- [x] typecheck + tests 通过
