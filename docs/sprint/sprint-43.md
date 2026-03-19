# Sprint 43 — DailyDigest 国内 / 国际分栏模板

**状态**: ✅ 完成

**问题**：
- 当前 `DailyDigestSkill` 只有单一新闻列表，无法区分国内与国际内容，也无法稳定控制配额。
- HTML 虽然已经切到 `layout.css`，但整页结构仍然写在 `index.ts` 字符串里，后续改版时模板和内容耦合过紧。

**方案**：
- 抽取结果新增 `category` 字段，按国内 10 篇、国际 5 篇裁出最终 15 篇日报。
- `SKILL.md` 增加 `domestic-articles` / `international-articles` / `max-candidates`，让配额和候选上限配置化。
- 渲染层拆成 `template.html` / `section.html` / `item.html` + `layout.css`，`index.ts` 只做模板填充。

## 任务

- [x] `src/skills/daily-digest/index.ts` — 新增分类抽取、配额选择、模板填充
- [x] `src/skills/daily-digest/SKILL.md` — 更新查询词和配额配置
- [x] `src/skills/daily-digest/template.html` / `section.html` / `item.html` — 新增 HTML 模板
- [x] `src/skills/daily-digest/layout.css` — 对齐国内 / 国际分栏版式
- [x] `src/skills/loader.ts` — 支持读取配额和候选上限
- [x] `tests/skills/daily-digest.test.ts` — 补分类配额和模板渲染测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` — 同步文档
- [x] `pnpm typecheck`
- [x] `pnpm test tests/skills/daily-digest.test.ts`
- [x] `pnpm test`
- [x] 真实重跑 `daily-digest`，刷新当天 HTML / MD / JSON / PNG 输出
