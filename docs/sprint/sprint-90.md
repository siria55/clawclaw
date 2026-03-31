# Sprint 90

## 目标

- 增强 `日报记录` 对 `LLM 抽取` 阶段的诊断能力
- 在 WebUI 中更直观看到 LLM 收到的候选、通过率和最终入选情况
- 便于排查“为什么 LLM 抽取过滤了很多”

## 完成项

- [x] 为 `LLM 抽取` run record 持久化保存结构化候选链接
- [x] 在 `日报记录` 页面新增抽取诊断视图
- [x] 展示候选数、抽取数、通过率和候选明细
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- `extractions` 里新增 `candidateLinks`，与 prompt 对应但保留结构化字段
- WebUI 在 `LLM 抽取` 区块展示：
  - 抽取前候选数 / 抽取后文章数 / 通过率
  - 送入 LLM 的候选列表
  - 抽取结果与最终入选的对照
  - 基于候选特征的诊断提示

## 验证

- [x] `corepack pnpm test -- tests/web/DailyDigestRunsView.test.tsx tests/web/server.test.ts tests/skills/daily-digest-run-record.test.ts tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`

## 结果

- `日报记录` 可以直接定位是 Brave 候选不准、LLM 过严，还是最终选稿继续过滤
- `LLM 抽取` 不再只剩 prompt 大段文本，排查效率显著提升
