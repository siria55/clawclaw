# Sprint 44 — DailyDigest 主题支持 WebUI 配置

**状态**: ✅ 完成

**问题**：
- `DailyDigestSkill` 的搜索主题只能写死在 `SKILL.md`，每次想调整搜索方向都要改代码。
- 日报 HTML 里的数字编号偏小，分栏后视觉层级不够明显。

**方案**：
- 新增 `data/skills/daily-digest/config.json` 作为运行时配置文件。
- WebUI 设置页新增 `DailyDigest` 区块，通过 `/api/config/daily-digest` 读写搜索主题。
- `DailyDigestSkill` 运行时优先读取配置文件中的主题，未配置时回退到 `SKILL.md` 默认值。
- 调整 `layout.css` 中的编号尺寸，放大数字和容器。

## 任务

- [x] `src/config/types.ts` / `src/config/storage.ts` — 新增 DailyDigest 配置类型和默认值访问
- [x] `src/web/server.ts` — 新增 `/api/config/daily-digest` 读写接口
- [x] `src/web/ui/SettingsView.tsx` — 设置页新增 DailyDigest 搜索主题配置
- [x] `src/app.ts` / `src/web/dev.ts` — 接入 `data/skills/daily-digest/config.json`
- [x] `src/skills/daily-digest/index.ts` — 运行时读取配置覆盖默认搜索主题
- [x] `src/skills/daily-digest/layout.css` — 放大 HTML 编号数字
- [x] `tests/skills/daily-digest.test.ts` / `tests/web/server.test.ts` — 补回归测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` — 同步文档
- [x] `pnpm typecheck`
- [x] `pnpm test tests/skills/daily-digest.test.ts tests/web/server.test.ts`
- [x] `pnpm test`
