# Sprint 41 — DailyDigest HTML 改用 layout.css

**状态**: ✅ 完成

**问题**：`DailyDigestSkill` 的 HTML 结构虽然稳定，但样式直接写死在 `renderHtml()` 里的 `<style>` 标签中，和设计稿样式文件脱节，后续改版难维护。

**方案**：
- 新版 HTML 统一从 `src/skills/daily-digest/layout.css` 读取样式并内联
- `layout.css` 改成可直接驱动日报结构的真实样式表，不再保留 Figma 原始导出片段
- `renderDailyDigestHtml()` 输出新的 hero / summary / list 布局
- Playwright 截图宽度同步切到 1080px

## 任务

- [x] `src/skills/daily-digest/layout.css` — 改为日报专用样式表
- [x] `src/skills/daily-digest/index.ts` — HTML 渲染改用 `layout.css`
- [x] `tests/skills/daily-digest.test.ts` — 增加渲染测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` — 同步样式来源说明
- [x] `pnpm typecheck`
- [x] `pnpm test tests/skills/daily-digest.test.ts`
