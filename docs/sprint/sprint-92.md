# Sprint 92

## 目标

- 修复 `daily-digest` 的“国内资讯”基本没有中国大陆新闻的问题
- 让国内候选在进入 LLM 抽取前，先优先使用中国大陆媒体 / 机构 / 官网来源
- 补充运行记录与文档，方便排查国内候选为何回退到非大陆来源

## 完成项

- [x] 新增中国大陆来源识别与国内候选分层
- [x] 国内抽取改为“大陆优先，不足再回退”
- [x] 强化最终排序中的中国大陆来源优先级
- [x] 更新 sprint / prd / tech / manual / SKILL 文档
- [x] 补充测试并完成验证

## 设计说明

- Brave 的 `country=CN` 与 `search_lang=zh-hans` 只能偏向中国 / 简中结果，不能保证一定返回中国大陆媒体
- 对“国内”候选增加显式的中国大陆域名识别，例如 `.cn`、`.gov.cn`、`.edu.cn` 以及常见大陆媒体 / 商业媒体域名
- 国内候选先做大陆来源抽取；若数量不足，再用非大陆候选补齐，避免港媒、台媒、海外华文或日文站点直接主导“国内资讯”
- 最终选稿阶段继续对国内大陆来源加权，降低非大陆来源在“国内”栏目的排序优先级

## 验证

- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts tests/web/DailyDigestRunsView.test.tsx`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 的国内链路不再把 Brave 返回的“泛中国语境”结果直接当作国内新闻
- 中国大陆媒体、政府 / 高校 / 企业官网来源会先进入国内抽取
- WebUI `日报记录` 可直接看出当天国内候选里到底有多少大陆来源、多少非大陆回退
