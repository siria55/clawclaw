# Sprint 26 — Skill 数据持久化 + Agent 权限管理

**状态**: ✅ 完成

**目标**：
1. `daily-digest` skill 每次运行保存 MD / HTML / PNG 到 `data/skills/daily-digest/`
2. `data/skills/{skill-id}/` 作为各 skill 数据目录的约定
3. Agent 加 `read_file` 工具 + 权限配置（允许读取的路径列表），可在 WebUI 设置

## 架构

```
data/skills/
  daily-digest/
    2026-03-18.md
    2026-03-18.html
    2026-03-18.png
```

### SkillContext 扩展
```ts
interface SkillContext {
  // ...existing
  dataDir?: string;   // e.g. ./data/skills/daily-digest
}
```

### CronSchedulerOptions 扩展
```ts
interface CronSchedulerOptions {
  // ...existing
  skillDataRoot?: string;  // e.g. ./data/skills
}
```
调度时自动计算 `dataDir = {skillDataRoot}/{skillId}`，并 mkdirSync 创建目录。

### read_file 工具
- 输入：`{ path: string }`
- 执行时动态读取 `agentConfigStorage.allowedPaths`，路径在范围内才允许读取
- 默认允许路径：`["./data/skills"]`
- 超过 64KB 自动截断

### AgentMetaConfig 扩展
```ts
interface AgentMetaConfig {
  name?: string;
  systemPrompt?: string;
  allowedPaths?: string[];  // default: ["./data/skills"]
}
```

### WebUI 权限管理
在「设置 → Agent」区域新增「允许读取的路径」文本域（换行分隔）。

## 任务

- [x] `SkillContext` 加 `dataDir?`
- [x] `CronSchedulerOptions` 加 `skillDataRoot?`，`CronScheduler` 计算并传递 `dataDir`
- [x] `DailyDigestSkill` 保存 MD + HTML + PNG 到 `dataDir`
- [x] `AgentMetaConfig` 加 `allowedPaths?`
- [x] `src/tools/read-file.ts` — `createReadFileTool(getAllowedPaths)`
- [x] `WebServer #handlePostAgentConfig` 持久化 `allowedPaths`
- [x] `SettingsView` Agent 区域加 allowedPaths 编辑器
- [x] `app.ts` / `dev.ts` 接入 read_file 工具 + skillDataRoot
- [x] typecheck + tests 通过（155 tests）


**目标**：
1. `daily-digest` skill 每次运行保存 MD / HTML / PNG 到 `data/skills/daily-digest/`
2. `data/skills/{skill-id}/` 作为各 skill 数据目录的约定
3. Agent 加 `read_file` 工具 + 权限配置（允许读取的路径列表），可在 WebUI 设置

## 架构

```
data/skills/
  daily-digest/
    2026-03-18.md
    2026-03-18.html
    2026-03-18.png
```

### SkillContext 扩展
```ts
interface SkillContext {
  // ...existing
  dataDir?: string;   // e.g. ./data/skills/daily-digest
}
```

### CronSchedulerOptions 扩展
```ts
interface CronSchedulerOptions {
  // ...existing
  skillDataRoot?: string;  // e.g. ./data/skills
}
```
调度时自动计算 `dataDir = {skillDataRoot}/{skillId}`。

### read_file 工具
- 输入：`{ path: string }`
- 执行时从 `agentConfigStorage` 动态读取 `allowedPaths`，路径在范围内才允许读取
- 默认允许路径：`["./data/skills"]`

### AgentMetaConfig 扩展
```ts
interface AgentMetaConfig {
  name?: string;
  systemPrompt?: string;
  allowedPaths?: string[];  // default: ["./data/skills"]
}
```

### WebUI 权限管理
在「设置 → Agent」区域新增「允许读取的路径」字段（换行分隔的路径列表）。

## 任务

- [ ] `SkillContext` 加 `dataDir?`
- [ ] `CronSchedulerOptions` 加 `skillDataRoot?`，`CronScheduler` 计算并传递 `dataDir`
- [ ] `DailyDigestSkill` 保存 MD + HTML + PNG 到 `dataDir`
- [ ] `AgentMetaConfig` 加 `allowedPaths?`
- [ ] `src/tools/read-file.ts` — `createReadFileTool(getAllowedPaths)`
- [ ] `WebServer #handlePostAgentConfig` 持久化 `allowedPaths`
- [ ] `SettingsView` Agent 区域加 allowedPaths 编辑器
- [ ] `app.ts` / `dev.ts` 接入 read_file 工具 + skillDataRoot
- [ ] typecheck + tests 通过
