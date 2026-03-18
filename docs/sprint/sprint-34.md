# Sprint 34 — Skill 架构解耦：skill 只生成内容，IM 发送由项目配置负责

**状态**: ✅ 完成

**目标**：skill 职责收窄为「生成内容 + 保存文件」。IM 投递由 CronScheduler 统一处理，skill 不感知平台细节。

## 架构变化

```
之前：
  CronScheduler → skill.run(ctx with delivery) → skill 内部 sendImage()

之后：
  CronScheduler → skill.run(ctx without delivery) → SkillResult { outputPath }
                → 如有 outputPath + delivery → platform.sendImage(outputPath)

手动运行（WebUI）：
  onRunSkill → skill.run(ctx without delivery) → SkillResult (outputPath 忽略)
```

## 任务

- [x] `src/skills/types.ts` — 新增 `SkillResult`；`Skill.run()` 改为 `Promise<SkillResult>`；移除 `delivery` 和 `newsStorage`
- [x] `src/skills/daily-digest/index.ts` — 移除 delivery 发送代码；`run()` 返回 `{ outputPath }`
- [x] `src/cron/scheduler.ts` — `#fire()` 拿 `outputPath` 后调 platform.sendImage()
- [x] `src/web/dev.ts` — `onRunSkill` 不再传 delivery 给 skill
- [x] typecheck
- [x] 更新 docs/prd、docs/tech、docs/manual
