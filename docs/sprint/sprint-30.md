# Sprint 30 — Skills 独立 Tab

**状态**: ✅ 完成

**目标**：将 Skills 从状态页拆出，单独作为一个 Tab，放在侧边栏导航中。

## 变更

- `App.tsx` — 加 `"skills"` view，侧边栏 tab 列表加「Skills」
- `src/web/ui/SkillsView.tsx` — 新建，包含 skill 列表 + 运行按钮（从 StatusView 迁移）
- `src/web/ui/SkillsView.module.css` — 新建样式
- `StatusView.tsx` — 删除 Skills section
- `App.module.css` — 无需改动（tab 样式复用）

## 任务

- [x] 新建 `SkillsView.tsx`
- [x] 新建 `SkillsView.module.css`
- [x] `App.tsx` 加 skills tab
- [x] `StatusView.tsx` 删除 Skills section
- [x] typecheck 通过
