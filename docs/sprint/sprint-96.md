# Sprint 96

## 目标

- 修复 `daily-digest-send` 在当天日报缺失时回退发送旧日报的问题
- 明确改为“只发送当天日报”，当天缺失时向飞书目标发送失败提醒
- 同步补充测试与文档，避免后续误解为“发送最新日报”

## 完成项

- [x] `daily-digest-send` 只查找当天日报图片
- [x] 当天日报缺失时发送明确失败提醒，不再回退旧日报
- [x] 补充 CronScheduler 测试
- [x] 更新 sprint / prd / tech / manual 文档
- [x] 跑相关测试验证

## 设计说明

- 当前 `sendSkillOutput: "daily-digest"` 复用了“找指定 skill 最新 PNG”的通用逻辑
- 这会导致 9 点生成失败时，10 点继续把昨天的日报发出去，用户很难第一时间察觉
- 本次将 `daily-digest` 发送链路改为按当天日期查找；若当天文件不存在，则发送失败提示，并明确说明“本次未发送旧日报”

## 验证

- [x] `corepack pnpm test -- tests/cron/scheduler.test.ts tests/cron/default-jobs.test.ts tests/cron/types.test.ts`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`

## 结果

- `daily-digest-send` 现在只会查找当天 `YYYY-MM-DD.png`
- 如果当天日报缺失，会向所有飞书目标发送明确失败提醒，不再回退发送昨天的日报
- IM 事件日志里的 cron 回复也会记录为 `[日报发送失败] YYYY-MM-DD`
- 默认 cron 文案已从“发送最新日报”调整为“发送当日日报”
