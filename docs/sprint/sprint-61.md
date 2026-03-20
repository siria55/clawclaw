# Sprint 61

## 目标

- 将 `DailyDigest` 的配置与执行入口收拢到同一处，减少跨 tab 来回切换
- 清理 `设置` 页中与单一 skill 强绑定的配置项

## 完成项

- [x] 将 `DailyDigest` 搜索主题配置并入 `Skills` 页的 `daily-digest` 卡片
- [x] `设置` 页移除独立的 `DailyDigest` 配置区块
- [x] 补充 `SkillsView` 相关测试，并更新现有文档

## 设计说明

- `DailyDigest` 属于具体 skill，本次调整将其“配置 + 手动执行 + 运行日志 + 图片预览”放到同一个技能卡片里
- `设置` 页继续只保留跨系统的配置：`Agent`、`飞书文档`、`模型`

## 验证

- [x] `corepack pnpm test tests/web/SkillsView.test.ts`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`
- [x] `corepack pnpm test`

## 结果

- `DailyDigest` 现在可在 `自动化 > Skills > daily-digest` 同一卡片中完成搜索主题配置、手动执行、日志查看和图片预览
- `设置` 页只保留系统级配置，不再混入某一个具体 skill 的专属配置
