# Sprint 97

## 目标

- 收紧 `daily-digest` 对“中国大陆来源”的识别口径
- 修复泛 `.cn` 域名被误判为大陆来源的问题
- 让日报记录页与后端使用同一套大陆来源判断，减少 UI 误导
- 补充测试与文档，验证国内栏位更倾向真实中国大陆媒体来源

## 完成项

- [x] 新增共享大陆来源识别规则
- [x] 后端国内候选分层与排序逻辑改用显式白名单
- [x] 日报记录页同步改用同口径标签判断
- [x] 补充误判域名与真大陆来源测试
- [x] 更新 sprint / prd / tech / manual 文档
- [x] 跑测试、类型检查、构建，并实跑一次 `daily-digest`

## 设计说明

- 现状里 `isMainlandChinaHostname()` 直接把 `.cn` / `.com.cn` 视作中国大陆来源
- 这会让 `sputniknews.cn`、`archdaily.cn`、`k.sina.cn` 等站点进入“大陆优先”池，挤压真正大陆媒体
- 本次改为显式白名单：只把明确识别出的中国大陆媒体、政府 / 高校域名视作大陆来源
- 同时为明显伪大陆或弱来源域名增加降权，避免继续主导国内候选排序

## 验证

- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts tests/web/DailyDigestRunsView.test.tsx`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`
- [x] 实跑 `daily-digest` 检查新的 run 记录

## 结果

- 大陆来源识别已从“泛 `.cn` / `.com.cn`”改为“显式白名单”，`sputniknews.cn`、`archdaily.cn`、`k.sina.cn` 不再进入大陆优先池
- 日报记录页的 `大陆来源` / `非大陆回退` 标签已改为和后端共用同一套规则
- 新增“大陆主流媒体提示词”国内搜索派生请求，实跑后大陆候选数从 `0` 提升到 `2`
- 但本次实跑里新增的 2 条大陆候选仍不够贴教育口径，最终国内来源仍以非大陆回退为主；说明剩余瓶颈已从“来源误判”转向“Brave 候选相关性不足”
