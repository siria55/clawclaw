# Sprint 29 — WebUI 手动触发 Skill

**状态**: ✅ 完成

**目标**：在状态页 Skills 区域为每个 skill 添加「运行」按钮，点击后立即触发 skill 执行。

## 架构

```
[WebUI] POST /api/skills/:id/run
  → WebServer.onRunSkill(id)
    → dev.ts: skill.run({ agent, delivery?, dataDir })
      → 有 feishu + chatId → 发 IM
      → 无               → 只跑本地逻辑（保存文件等）
```

### SkillContext 修改

`delivery` 改为可选，skill 内部 guard：

```ts
interface SkillContext {
  agent: Agent;
  delivery?: { platform: IMPlatform; chatId: string };  // 改为可选
  ...
}
```

### 新 API

`POST /api/skills/:id/run` → `{ ok: true }` 或 `{ ok: false, error: "..." }`

服务端增加 `onRunSkill?: (skillId: string) => Promise<void>` 回调。

### WebUI

Skills 区域每行加「运行」按钮，点击后：
- 显示「运行中…」
- 成功 → 显示 ✓ 并 3 秒后消失
- 失败 → 显示错误信息

## 任务

- [x] `src/skills/types.ts` — `delivery` 改为可选
- [x] `src/skills/daily-digest/index.ts` — guard `ctx.delivery` before IM send
- [x] `src/web/server.ts` — 加 `POST /api/skills/:id/run` + `onRunSkill` 回调
- [x] `src/web/dev.ts` — 实现 `onRunSkill`（带 delivery 或不带）
- [x] `src/web/ui/StatusView.tsx` — Skills 区域加「运行」按钮 + 状态显示
- [x] typecheck + tests 通过（155 tests）
