# Sprint 70

## 目标

- 为 `daily-digest` 增加两条默认 Cron：每天 9 点生成、每天 10 点发送
- 允许仅执行 Skill 的 Cron 不强制依赖飞书目标
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 支持 skill-only Cron 在无发送目标时正常注册与执行
- [x] 将默认日报 Cron 模板升级为“9 点生成 + 10 点发送”
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档
- [x] 尽量补齐当前本地运行态 Cron 配置

## 设计说明

- `skillId` 类型的 Cron 只负责生成内容，不应强制要求 `chatId`
- 发送型 Cron 继续通过 Cron 配置中的 `chatId / chatIds` 选择飞书目标

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- 已完成，默认日报 Cron 已改为两段式模板，并补齐无目标 skill-only Cron 的运行链路
- 本地 `data/cron/cron-config.json` 已写入两条任务；由于当前飞书默认目标为空，`10:00` 发送任务默认保留为停用，待填写 `oc_...` / `ou_...` 后启用
