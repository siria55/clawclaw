# Sprint 59

## 目标

- 将 IM 相关配置从 `设置` 挪到 `IM` 大 tab
- 在 `IM` 页内新增 `配置` 子 tab，集中承载飞书 IM 配置

## 完成项

- [x] `IM` 页新增 `配置` 子 tab，承载飞书 IM 凭证与运行摘要
- [x] 抽出复用的飞书 IM 配置组件，继续使用 `/api/im-config` 保存并热更新
- [x] `设置` 页移除飞书 IM 配置区块，页内 TOC 同步收缩
- [x] 补齐 `IMView` 测试，覆盖 `配置` 子 tab 的加载与展示
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- `IM` 大 tab 现在分成三个子 tab：
  - `状态`
  - `消息`
  - `配置`
- `配置` 子 tab 直接复用现有飞书 IM 配置接口，不新增后端路由
- `设置` 页保留 Agent、飞书文档、DailyDigest、模型配置，不再混入 IM 平台配置

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test tests/web/StatusView.test.ts`
- [x] `corepack pnpm build`

## 结果

- IM 的状态、消息和配置现在集中在同一个大 tab 下查看和维护
- `设置` 页更聚焦于 Agent / 文档 / 摘要 / 模型等非 IM 配置
