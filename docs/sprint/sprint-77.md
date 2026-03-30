# Sprint 77

## 目标

- 在 WebUI 中新增 `Brave Search API Key` 配置入口
- 让 `daily-digest` 运行时优先读取 WebUI 保存的 Brave Key，并回退到环境变量
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 扩展 `DailyDigestConfig` 支持保存 Brave Search API Key
- [x] 在 WebUI 设置页增加 Brave Search API Key 配置区块
- [x] 让服务端保存 / 读取 / 合并 Brave Key 配置
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- Brave Key 作为 `daily-digest` 的 skill 配置项保存到 `data/skills/daily-digest/config.json`
- WebUI 使用密码输入框展示，和搜索主题复用同一个 `/api/config/daily-digest` 接口
- 运行时优先用 WebUI 保存的 key；未配置时再回退到 `BRAVE_SEARCH_API_KEY` 环境变量

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- `系统 > 设置` 新增 `搜索（Brave Search）` 区块，可直接保存 `Brave Search API Key`
- `daily-digest` 运行时优先读取 `data/skills/daily-digest/config.json` 中的 `braveSearchApiKey`，未配置时回退到环境变量 `BRAVE_SEARCH_API_KEY`
- `/api/config/daily-digest` 已支持读写和保留 `queries + braveSearchApiKey` 的合并保存
- 新增 SettingsView / WebServer / DailyDigest 相关测试，当前 `typecheck`、`test`、`build` 均通过
- 额外检查 `corepack pnpm lint` 时发现仓库仍有既存 ESLint / parser 配置问题，与本次改动无直接关系
