# Sprint 60

## 目标

- 重整 WebUI 的一级 / 二级 tab 结构，减少并列入口的混乱感
- 将功能页按能力域重新归组，同时保留旧 hash 兼容

## 完成项

- [x] 一级 tab 重构为 `对话` / `内容` / `自动化` / `IM` / `系统`
- [x] `内容` 大 tab 收纳 `新闻库` / `记忆库`
- [x] `自动化` 大 tab 收纳 `Cron` / `Skills`
- [x] `系统` 大 tab 收纳 `状态` / `设置`
- [x] `IM` 继续保留 `状态` / `消息` / `配置` 三个子 tab
- [x] 旧的 `#news` / `#memory` / `#cron` / `#skills` / `#status` / `#settings` / `#im-*` hash 继续兼容
- [x] 补充 App 路由与 IM 子 tab 相关测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 一级 tab 只承载能力域，不再同时混放“单页功能”和“配置页”
- 二级 tab 专门承载该能力域下的具体页面：
  - `内容` → `新闻库` / `记忆库`
  - `自动化` → `Cron` / `Skills`
  - `IM` → `状态` / `消息` / `配置`
  - `系统` → `状态` / `设置`
- 点击一级 tab 会落到该分组的默认二级页；但旧 hash 仍可直接打开对应二级页，避免历史链接失效

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test tests/web/App.test.tsx tests/web/StatusView.test.ts`
- [x] `corepack pnpm build`

## 结果

- WebUI 导航从“很多并列页面”收敛为“少量一级域 + 清晰二级页”
- 用户现在更容易判断应该去 `内容`、`自动化`、`IM` 还是 `系统`
