# Sprint 57

## 目标

- 将侧边栏里的 `IM 状态` 和 `IM` 合并为单个 `IM` tab
- 在 `IM` 页内部提供子 tab，分别查看状态和消息

## 完成项

- [x] WebUI 侧边栏将 `IM 状态` / `IM` 合并为一个 `IM` 入口
- [x] `IM` 页内新增子 tab，可切换 `状态` / `消息`
- [x] 旧的 `#im-status` hash 兼容映射到新的 `IM` 页状态子 tab
- [x] 保留 `IM` 页内的飞书运行信息、群聊摘要、实时消息日志和群聊 / 直发筛选
- [x] 更新 WebUI 测试，覆盖合并后的 `IM` 子 tab 行为
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 侧边栏只保留一个 `IM` tab，减少一级导航长度
- `IM` 页内拆成两个子视图：
  - `状态`：平台连接、飞书运行摘要、群聊摘要，并保留右侧 TOC
  - `消息`：实时 IM 日志和筛选
- 兼容旧链接时，访问 `#im-status` 会自动落到新 `IM` 页的 `状态` 子 tab

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test tests/web/StatusView.test.ts`
- [x] `corepack pnpm build`

## 结果

- WebUI 侧边栏更短，IM 相关信息集中在同一页查看
- 历史 `#im-status` 链接不会失效，仍能打开 IM 状态视图
