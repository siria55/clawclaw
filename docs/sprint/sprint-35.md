# Sprint 35 — Skill 生成与投递分离 + WebUI 图片预览

**状态**: ✅ 完成

**目标**：
1. 生成和发送拆成两个独立 Cron Job，可分别设定时间
2. WebUI 手动运行 Skill 后，展示生成的图片预览

## 架构变化

```
之前（Sprint 34）：
  Cron(skillId) → skill.run() → outputPath → platform.sendImage()  （一个 job 做两件事）

之后：
  Cron1(skillId, 7:00)          → skill.run() → 保存文件，不发 IM
  Cron2(sendSkillOutput, 8:00)  → 找最新 PNG → platform.sendImage()

WebUI 手动运行：
  ▶ 运行 → SSE done → 展示 <img> 图片预览（/api/skills/:id/latest-image）
```

## 任务

- [x] `src/skills/loader.ts` — 新增 `findLatestSkillPng(dataRoot, skillId): string | undefined`
- [x] `src/cron/types.ts` — `CronJob` / `CronJobConfig` 新增 `sendSkillOutput?: string`
- [x] `src/cron/scheduler.ts` — 移除 skill run 后的 auto-sendImage；新增 `sendSkillOutput` 分支
- [x] `src/web/server.ts` — 新增 `GET /api/skills/:id/latest-image`；`onRunSkill` 返回 `Promise<SkillResult>`
- [x] `src/web/dev.ts` / `src/app.ts` — `onRunSkill` 返回 result；`registerCronJob` 支持 `sendSkillOutput`
- [x] `src/web/ui/SkillsView.tsx` — done 后展示图片预览
- [x] `src/web/ui/SkillsView.module.css` — 新增 `.previewImg` 样式
- [x] typecheck
