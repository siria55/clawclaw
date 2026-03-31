# Sprint 94

## 目标

- 修复 `daily-digest` 候选去重阶段对国内 / 国际提示分类的覆盖问题
- 避免同一篇链接同时命中国内与国际搜索时，被错误偏向到国际
- 重跑验证中国大陆来源是否能重新进入国内候选池

## 完成项

- [x] 修复候选去重时的 `hintCategory` 合并规则
- [x] 补充测试覆盖“同链接国内优先”场景
- [x] 更新 sprint / prd / tech / manual / SKILL 文档
- [x] 重跑 `daily-digest` 验证结果

## 设计说明

- 当前 `dedupeLinks()` 在合并重复 URL 时，会把 `domestic + international` 合并成 `international`
- 对日报而言，同一链接若被中国语境检索命中，应该优先保留 `domestic` 提示
- 这样可以避免中国大陆来源在去重后被错误移出国内候选池

## 验证

- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm typecheck`
- [x] 手动重跑 `daily-digest`

## 结果

- 最新实跑中，国内候选从 `domesticMainlandLinkCount=0` 回升到 `domesticMainlandLinkCount=1`
- 说明“同链接被覆盖成国际”的问题已修复
- 但中国大陆来源仍然偏少，下一步需要继续收紧 query 与回退筛选口径
