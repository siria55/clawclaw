# Sprint 73

## 目标

- 收紧 `daily-digest` 新闻源筛选，尽量避免百家号等自媒体来源
- 提升主流媒体、官网和权威发布在结果中的优先级
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 为 `daily-digest` 增加自媒体来源拦截规则
- [x] 为主流媒体与官网增加更明确的排序优先级
- [x] 补充对应测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 优先在代码层做稳定过滤，不只依赖 LLM 提示词
- 对百家号、搜狐号、网易号、企鹅号、今日头条号等聚合 / 自媒体来源做硬拦截
- 对路透、彭博、新华社、财新、澎湃、界面、公司官网等来源做正向加权

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 候选阶段会先过滤百家号等自媒体 / 黑名单链接，减少低质量候选进入 LLM
- 最终结果阶段会继续拦截百家号、搜狐号、网易号、企鹅号、头条号等自媒体来源，避免混入日报
- 主流媒体、公司官网和权威发布获得额外排序加权，在配额有限时会更优先进入最终日报
