# Sprint 91

## 目标

- 将 `daily-digest` 默认搜索主题改为更聚焦 `AI + 教育`
- 同步更新当前本地持久化配置，确保运行时立即生效
- 让 WebUI 中的默认示例也与新的搜索口径保持一致

## 完成项

- [x] 更新 `daily-digest` 默认 queries
- [x] 更新本地 `data/skills/daily-digest/config.json` 持久化 queries
- [x] 更新 WebUI 查询示例文案
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 以 `AI 教育 / 教育科技 / 生成式 AI 教育 / 教育 AI 公司 / AI 课堂 / AI 教师` 为主
- 保留少量国际厂商导向 query，如 `OpenAI education`、`Google education AI`、`Microsoft education AI`
- 避免继续使用 `全球科技公司`、`中国互联网平台` 这类过宽 query，减少 Brave 候选噪音

## 验证

- [x] `corepack pnpm test -- tests/web/SearchConfigView.test.tsx tests/web/SkillsView.test.tsx`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`

## 结果

- 默认日报 query 更贴近 `AI + 教育` 新闻
- 当前本地配置会立即按新 query 生效
- WebUI 中看到的示例与默认运行口径一致
