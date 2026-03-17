# Sprint 11 — 可选 IM 配置启动

**状态**: ✅ 完成

**目标**: 未配置飞书/企业微信环境变量时，应用也能正常启动

## 修改范围

### `src/app.ts`

- [x] 条件创建 `FeishuPlatform`：仅在 `FEISHU_APP_ID` + `FEISHU_APP_SECRET` + `FEISHU_VERIFICATION_TOKEN` 同时存在时实例化
- [x] 条件注册路由：仅在平台可用时向 `ClawServer` 添加对应路由
- [x] Cron delivery 条件注册：仅在飞书可用时添加 daily-digest 任务
- [x] 启动日志说明飞书是否已配置

## 验收标准

- [x] 未配置任何 `FEISHU_*` 时，`pnpm dev` / `pnpm start` 能正常启动
- [x] WebServer 调试界面可正常访问
- [x] 状态页显示「飞书 未配置」
- [x] 配置了飞书变量后，行为与之前完全一致
- [x] 类型检查通过
