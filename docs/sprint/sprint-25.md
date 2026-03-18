# Sprint 25 — Skills 目录结构 + WebUI 展示 + Cron 群聊支持

**状态**: ✅ 完成

**目标**：
1. 每个 skill 放独立子目录（`daily-digest/index.ts`），便于扩展
2. WebUI 新增 Skills 面板，可视化展示已注册 skill 列表
3. Cron 支持发送到群聊（oc_ 前缀），WebUI 表单加提示和类型标注

## 架构

```
src/skills/
  types.ts
  registry.ts
  daily-digest/
    index.ts        DailyDigestSkill（id: "daily-digest"）
```

### GET /api/skills
返回 `{ skills: { id, description }[] }`，由 SkillRegistry 提供。

### WebUI Skills 面板
在「连接状态」下方新增 Skills 卡片，展示 id + description。

### 群聊支持
- `FeishuPlatform.send/sendImage/sendImageBuffer` 已支持 `oc_` 前缀（chat_id 模式）
- WebUI cron 表单 chatId 字段加提示：`ou_xxx（用户）/ oc_xxx（群聊）`
- Cron 任务列表显示目标类型标签（用户 / 群聊）

## 任务

- [x] 迁移 `news-digest.ts` → `skills/daily-digest/index.ts`，id/class 改名
- [x] `WebServerConfig` 加 `skillRegistry?`，增加 `GET /api/skills` 端点
- [x] `StatusView.tsx` 展示 Skills 面板
- [x] `app.ts` / `dev.ts` 传 skillRegistry 给 WebServer
- [x] Cron 表单 chatId 加提示，任务列表加目标类型标签
- [x] typecheck + tests 通过


**目标**：
1. 每个 skill 放独立子目录（`daily-digest/index.ts`），便于扩展
2. WebUI 新增 Skills 面板，可视化展示已注册 skill 列表
3. Cron 支持发送到群聊（oc_ 前缀），WebUI 表单加提示和类型标注

## 架构

```
src/skills/
  types.ts
  registry.ts
  daily-digest/
    index.ts        DailyDigestSkill（id: "daily-digest"）
```

### GET /api/skills
返回 `{ skills: { id, description }[] }`，由 SkillRegistry 提供。

### WebUI Skills 面板
在「连接状态」下方新增 Skills 卡片，展示 id + description。

### 群聊支持
- `FeishuPlatform.send/sendImage/sendImageBuffer` 已支持 `oc_` 前缀（chat_id 模式）
- WebUI cron 表单 chatId 字段加提示：`ou_xxx（用户）/ oc_xxx（群聊）`
- Cron 任务列表显示目标类型标签

## 任务

- [ ] 迁移 `news-digest.ts` → `skills/daily-digest/index.ts`，id/class 改名
- [ ] `WebServerConfig` 加 `skillRegistry?`，增加 `GET /api/skills` 端点
- [ ] `StatusView.tsx` 展示 Skills 面板
- [ ] `app.ts` / `dev.ts` 传 skillRegistry 给 WebServer
- [ ] Cron 表单 chatId 加提示，任务列表加目标类型标签
- [ ] typecheck + tests 通过
