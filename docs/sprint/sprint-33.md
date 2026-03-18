# Sprint 33 — SKILL.md 标准 + 新闻库合并

**状态**: ✅ 完成

**目标**：
1. 参考 Claude Code skill 标准，将 skill 定义（元数据 + Agent 指令）抽到 `SKILL.md` 文件，与执行代码分离
2. 新闻库合并到 skill 存储 —— DailyDigestSkill 保存 `articles.json`，`GET /api/news` 直接读 skill 输出，移除 NewsStorage 在新闻库展示中的用途

## 架构

```
src/skills/daily-digest/
├── SKILL.md          ← 元数据（id/description/queries/max-articles）+ Agent 指令
└── index.ts          ← 读 SKILL.md、提供浏览器工具、渲染截图、发飞书

SKILL.md frontmatter 字段（简化 YAML，逗号分隔数组）：
  id, description, queries, max-articles

data/skills/daily-digest/
├── YYYY-MM-DD.html
├── YYYY-MM-DD.md
├── YYYY-MM-DD.png
└── YYYY-MM-DD.json   ← NEW: raw articles array

GET /api/news → 扫描 data/skills/*/YYYY-MM-DD.json → 合并排序 → 分页
```

## 任务

- [x] `src/skills/loader.ts` — NEW: parseFrontmatter / loadSkillDef
- [x] `src/skills/daily-digest/SKILL.md` — NEW: skill 定义
- [x] `src/skills/daily-digest/index.ts` — 从 SKILL.md 读 prompt，保存 articles.json，移除 newsStorage
- [x] `src/web/server.ts` — `#handleNews` 读 skill JSON；添加 `skillDataRoot` 配置；移除 `newsStorage`
- [x] `src/web/dev.ts` / `src/app.ts` — 传入 `skillDataRoot`；移除 newsStorage from server
- [x] typecheck
