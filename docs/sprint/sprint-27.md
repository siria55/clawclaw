# Sprint 27 — WebUI 布局重构（竖排侧边栏）

**状态**: ✅ 完成

**目标**：
- 移除 `max-width: 760px` 的中间列限制，使用全屏宽度
- 将顶部横排 tab 改为左侧竖排侧边栏导航

## 新布局

```
┌─────────┬──────────────────────────────────────────────┐
│ ⚡      │                                              │
│clawclaw │          内容区（flex:1，各 view 自管宽度）    │
│ debug   │                                              │
│─────────│                                              │
│ 对话    │                                              │
│ 新闻库  │                                              │
│ 记忆库  │                                              │
│ 状态    │                                              │
│ 设置    │                                              │
└─────────┴──────────────────────────────────────────────┘
```

- `App.tsx` 去掉 `<header>`，改成 `<aside>` + `<main>`
- `App.module.css` layout 改 flex-row，新增 sidebar/nav/content 样式
- 各 view 内部 max-width 适当放宽（560 → 720）

## 任务

- [x] 更新 `App.tsx` 布局结构
- [x] 更新 `App.module.css`
- [x] 放宽各 view 内部 max-width（StatusView 560→720、SettingsView 480→720）
- [x] typecheck + 确认样式正常
