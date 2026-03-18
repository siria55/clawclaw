# Sprint 18 — Cron 可视化 + WebUI 配置

**状态**: 🚧 进行中

**目标**：
1. WebUI Status 页：Cron 任务显示真实数据（schedule / message / chatId / 下次运行时间）
2. WebUI 可新增 / 编辑 / 删除 Cron 任务，持久化到 `data/cron-config.json`
3. 启动时从文件加载 cron 配置，热更新无需重启

---

## 分析

### 现状
- `CronScheduler.jobIds` 只返回 id 列表，`getStatus()` 中 schedule/message 都是 "—"
- Cron 任务在 `app.ts` 硬编码，无法从 WebUI 增删改
- `CronJob` 依赖运行时对象（agent / platform），需要可序列化的 `CronJobConfig` 层

### 方案
- 新增 `CronJobConfig`（纯数据）：`{ id, schedule, message, chatId, platform, enabled }`
- 新增 `CronScheduler.list()` 返回完整 job 信息
- `data/cron-config.json` 持久化所有用户自定义任务
- `WebServer` 新增 `GET/POST/DELETE /api/cron` 端点
- `app.ts` 启动时从文件加载并注册任务；`onCronConfig` 回调热更新调度器
- Status 页升级：展示真实数据 + 增删改表单

---

## 任务

### 1. CronJobConfig 类型 + storage
- [ ] `src/cron/types.ts`：新增 `CronJobConfig { id, schedule, message, chatId, platform, enabled }`
- [ ] `src/cron/index.ts`：导出 `CronJobConfig`

### 2. CronScheduler.list()
- [ ] 新增 `list(): Array<{ id, schedule, message, chatId, platform }>` 方法，供 status/api 用

### 3. WebServer /api/cron 端点
- [ ] `WebServerConfig` 新增 `cronStorage? / onCronAdd? / onCronDelete?`
- [ ] `GET /api/cron` → 返回所有 job 配置
- [ ] `POST /api/cron` → 新增/更新 job（写文件 + 热更新调度器）
- [ ] `DELETE /api/cron/:id` → 删除 job

### 4. app.ts 加载 + 热更新
- [ ] 启动时从 `data/cron-config.json` 加载，注册到调度器
- [ ] `getStatus()` 改为 `cron.list()` 获取真实数据
- [ ] 硬编码的 daily-digest 迁移到 cron-config.json 初始值

### 5. WebUI — Cron 配置页
- [ ] `StatusView.tsx`：Cron section 展示 schedule / message / chatId
- [ ] 每个任务有删除按钮
- [ ] 底部「新增任务」表单：id / schedule / message / chatId（platform 自动选当前已连接）

---

## 验收标准

- [ ] Status 页 Cron 显示真实 schedule / message
- [ ] 可从 WebUI 新增 / 删除 Cron 任务，刷新后仍存在
- [ ] 删除或新增后调度器立即生效（无需重启）
- [ ] 类型检查通过，所有测试通过
