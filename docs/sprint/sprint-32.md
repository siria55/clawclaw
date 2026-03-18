# Sprint 32 — Skill 执行日志 WebUI 实时展示

**状态**: ✅ 完成

**目标**：Skill 运行时，WebUI 实时展示 Agent 操作步骤和进度，方便调试。

## 架构

```
POST /api/skills/:id/run
  → SSE 流式响应（text/event-stream）
  → data: {"type":"log","text":"..."} × N
  → data: {"type":"done"} 或 {"type":"error","error":"..."}

SkillContext.log(msg) → server write SSE event
DailyDigestSkill → ctx.log() 在关键节点
searchNewsWithAgent → 用 agent.stream() 捕获 tool_call / tool_result 事件

SkillsView → fetch + ReadableStream 读取 SSE
  → 实时 append 到 log 面板
  → 自动滚动到底部
```

## 任务

- [x] `src/skills/types.ts` — 添加 `log?` 到 SkillContext
- [x] `src/skills/daily-digest/index.ts` — 用 `stream()` 替换 `run()`，透传 log 事件
- [x] `src/web/server.ts` — `#handleRunSkill` 改为 SSE；`onRunSkill` 签名加 log 参数
- [x] `src/web/dev.ts` — `onRunSkill` 传递 log 回调
- [x] `src/web/ui/SkillsView.tsx` — SSE 读取 + 日志面板 UI
- [x] `src/web/ui/SkillsView.module.css` — log panel 样式
- [x] typecheck
