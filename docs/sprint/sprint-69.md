# Sprint 69

## 目标

- WebUI 中展示飞书 `ou_...` / `oc_...` 时，同时补充显示用户名或群名
- 覆盖系统状态、IM 状态、Cron 列表等仍以 ID 为主的展示位置
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 为 `GET /api/status` 补充飞书目标名与最近 IM 活动的用户名 / 群名
- [x] 为 `GET /api/cron` 补充飞书目标解析结果
- [x] 更新 WebUI 状态页、IM 状态页、Cron 列表展示
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 继续沿用服务端 enrich 策略，前端直接消费已解析的飞书目标信息
- 名称展示保留原始 ID，统一采用“名称（ID）”格式，兼顾可读性与排查定位

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- `系统状态` 的最近一条 IM 活动会显示会话名 / 用户名
- `IM > 状态` 会显示默认飞书目标名称
- `自动化 > Cron` 会显示每个飞书投递目标对应的用户名或群名
