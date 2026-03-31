# Sprint 88

## 目标

- 持久化保存 `daily-digest` 每次执行的 Brave 请求参数与返回结果
- 提供 WebUI 一级入口查看每次执行的检索详情
- 方便排查“为什么只搜到很少的新闻”

## 完成项

- [x] 为每次 `daily-digest` 执行生成独立 run 记录
- [x] 保存 Brave 请求参数、返回结果与关键筛选阶段数据
- [x] 提供后端接口读取 run 列表与详情
- [x] 在 WebUI 新增一级 tab 展示 run 记录
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- run 记录落在 `data/skills/daily-digest/runs/`
- 每个 run 单独一个 JSON 文件，避免覆盖当天日报输出
- 页面需要能直接查看请求参数、Brave 返回结果、候选数与最终入选数

## 验证

- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts tests/skills/daily-digest-run-record.test.ts tests/web/server.test.ts tests/web/App.test.ts tests/web/DailyDigestRunsView.test.tsx`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 每次执行都会把 Brave 请求参数、返回结果、抽取阶段数据和最终入选结果保存到 `data/skills/daily-digest/runs/{runId}.json`
- WebUI 新增一级 tab `日报记录`，可直接查看最近执行列表和单次 run 详情
- 后端新增 run 列表与详情接口，前端可直接排查“为什么只搜到很少的新闻”
