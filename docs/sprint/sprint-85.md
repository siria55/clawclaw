# Sprint 85

## 目标

- 查阅 Brave Search API 官方文档，梳理 `news/search` 可配置参数
- 在 WebUI `自动化 > 搜索` 中展示并允许修改 Brave Search 相关参数
- 将参数配置本地持久化到 `data/skills/daily-digest/config.json`
- 同步更新测试与文档说明

## 完成项

- [x] 扩展 DailyDigest 配置，支持保存 Brave Search 参数
- [x] 让 `daily-digest` 运行时读取并使用这些参数
- [x] 在 WebUI 搜索配置页展示并编辑这些参数
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 以 Brave 官方 `news/search` 文档为准，只暴露当前日报链路中真正有意义的参数
- 继续复用 `/api/config/daily-digest` 接口，不新增独立配置文件
- 配置仍保存在 `data/skills/daily-digest/config.json`

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts tests/web/SearchConfigView.test.ts tests/web/server.test.ts`
- [x] `corepack pnpm build`

## 结果

- `DailyDigestConfig` 新增 Brave `news/search` 参数配置，支持本地持久化
- `daily-digest` 运行时会读取并应用 `count / offset / freshness / safesearch / ui_lang / spellcheck / extra_snippets / goggles` 与国内 / 国际 `country / search_lang`
- WebUI `自动化 > 搜索` 现可直接查看和编辑这些参数，并继续沿用 `data/skills/daily-digest/config.json`
- 已补充 `daily-digest` URL 构造、WebUI 搜索配置页、`/api/config/daily-digest` 深合并等测试
