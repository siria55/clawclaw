# Sprint 24 — Skills 系统 + 新闻日报截图 Skill

**状态**: ✅ 完成

**目标**：
1. Cron 支持执行 skill（不只是 agent message 或 direct 文本/图片）
2. 实现新闻日报 skill：爬新闻 → 生成 HTML → 截图 → 发飞书

## 架构

```
src/skills/
  types.ts          Skill 接口 + SkillContext
  registry.ts       SkillRegistry（Map<id, Skill>）
  news-digest.ts    新闻日报 skill
```

### Skill 接口

```ts
interface SkillContext {
  delivery: { platform: IMPlatform; chatId: string };
  imEventStorage?: IMEventStorage;
  agent: Agent;
  newsStorage?: NewsStorage;
}
interface Skill {
  id: string;
  run(ctx: SkillContext): Promise<void>;
}
```

### CronJob 更新
- `CronJobConfig` / `CronJob` 加 `skillId?: string`
- `CronScheduler` 收到 `skillId` 时查 registry 并执行

### 新闻日报 Skill 流程
1. **爬新闻**：用 Playwright 访问 36Kr，用 locator API 提取标题/链接
2. **生成 HTML**：渲染成带样式的新闻日报页面
3. **截图**：Playwright `page.setContent(html)` + `page.screenshot()` → Buffer
4. **发送**：`FeishuPlatform.sendImageBuffer(chatId, buffer)` 上传并发图片消息

## 任务

- [x] 安装 playwright
- [x] `src/skills/types.ts` — Skill + SkillContext
- [x] `src/skills/registry.ts` — SkillRegistry
- [x] `CronJobConfig` / `CronJob` 加 `skillId?`
- [x] `CronScheduler` 接入 SkillRegistry
- [x] `src/skills/news-digest.ts` — 爬新闻 + 生成 HTML + 截图 + 发图
- [x] `FeishuPlatform.sendImageBuffer()` — 直接上传 Buffer
- [x] `app.ts` / `dev.ts` 注册 skill，传入 SkillRegistry
- [x] WebUI cron 表单加 skillId 字段
- [x] typecheck + tests 通过
