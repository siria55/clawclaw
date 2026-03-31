# Sprint 84

## 目标

- 在 WebUI 中新增独立的 Brave 搜索配置 tab
- 将 Brave Search API Key 与搜索主题集中展示、可编辑，并持久化保存到 `./data`
- 同步更新路由、测试和相关文档说明

## 完成项

- [x] 在 WebUI `自动化` 下新增 `搜索` 子 tab
- [x] 在新 tab 中集中展示并保存 Brave Search API Key 与搜索主题
- [x] 保持配置持久化到 `data/skills/daily-digest/config.json`
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 复用现有 `/api/config/daily-digest` 接口，不新增后端配置文件
- `搜索` tab 统一管理 Brave Search API Key 与 `daily-digest` 的查询词
- 现有 `系统 > 设置` 和 `自动化 > Skills` 中的相关入口先保持兼容，不做破坏性移除

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test -- tests/web/SearchConfigView.test.ts tests/web/App.test.ts`
- [x] `corepack pnpm build`

## 结果

- `自动化` 新增 `搜索` 子 tab，并增加 `#search` / `#search-config` 路由映射
- 新增 `SearchConfigView`，统一管理 Brave Search API Key 与 `daily-digest` 搜索主题
- 搜索配置继续复用 `/api/config/daily-digest`，持久化到 `data/skills/daily-digest/config.json`
- 补充了 `SearchConfigView` 和 `App` 路由测试，并同步更新 `manual`、`prd`、`tech`、`sprint` 文档
