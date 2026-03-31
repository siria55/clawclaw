# Sprint 95

## 目标

- 继续收紧 `daily-digest` 默认 query，减少中国大陆资讯里的境外噪音
- 让默认搜索主题更明确落在“中国大陆教育 / 教育科技 / AI 教育 / 教育公司”语境
- 同步更新 WebUI 示例和相关文档，避免用户保存配置时又回到旧 query

## 完成项

- [x] 新增中国大陆教育语境的默认 query
- [x] 同步更新 `data/skills/daily-digest/config.json`
- [x] 同步更新 WebUI 搜索主题示例
- [x] 更新 sprint / prd / tech / manual / SKILL 文档
- [x] 跑测试与构建验证

## 设计说明

- 之前默认 query 虽然已从“泛科技”收紧到“AI + 教育”，但大多仍是中性词
- 中性词会被系统自动扩成“国内 + 国际”两路搜索，国内候选里仍容易混入港澳台、海外华文和非中国大陆来源
- 本次默认 query 改为显式中国大陆教育语境词，再保留少量明确国际 query，降低 Brave 自由扩散的空间

## 验证

- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts tests/web/SearchConfigView.test.ts tests/web/SkillsView.test.ts tests/web/server.test.ts`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`
- [x] 手动重跑 `daily-digest`

## 结果

- 默认 query 已切到中国大陆教育语境，并同步写入 `data/skills/daily-digest/config.json` 与 WebUI 示例
- 实跑后，国内链路的中国大陆优先候选数从上一轮的 `1` 提升到 `5`
- 最新实跑 `20260331T112752483Z-aqzj9f` 中，国内最终入选从较早的 `4` 提升到 `8`
- 但中国大陆优先池的 5 条候选仍未被 LLM 采纳，当前国内 8 条仍主要来自非大陆回退池，说明 Brave 候选质量仍是主要瓶颈
- 期间额外试过在默认 query 里直接加入 `site:` 限定，但 Brave `news/search` 对这些组合几乎返回 `0` 条国内结果，因此没有保留这版配置
