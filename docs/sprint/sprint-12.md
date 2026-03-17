# Sprint 12 — WebUI IM 配置

**状态**: ✅ 完成

**目标**: 飞书等 IM 凭证可直接在 WebUI 设置页填写并生效，无需编辑 .env 或重启服务

## 架构

```
SettingsView (浏览器)
  └─ POST /api/im-config → WebServer
        └─ onIMConfig(config) → ClawServer.setRoute("/feishu", ...)
                                      ↓
                              FeishuPlatform 热更新
```

配置持久化到 `./data/im-config.json`，重启后自动恢复。

## 任务清单

### 1. `src/config/` 模块

- [x] `src/config/types.ts` — `FeishuConfig` 接口（appId, appSecret, verificationToken, encryptKey?, chatId?）
- [x] `src/config/storage.ts` — `IMConfigStorage`，读写 `./data/im-config.json`
- [x] `src/config/index.ts` — 公共导出

### 2. `ClawServer` 动态路由

- [x] `src/server/index.ts` — 新增 `setRoute(path, route)` / `removeRoute(path)` 方法

### 3. `WebServer` 新增端点

- [x] `GET /api/im-config` — 返回当前 IM 配置（敏感字段脱敏：保留前 4 位 + `****`）
- [x] `POST /api/im-config` — 接收新配置，保存到文件，调用 `onIMConfig` 回调热更新
- [x] `WebServerConfig` 新增 `imConfigStorage?` 和 `onIMConfig?` 字段

### 4. `src/app.ts`

- [x] 启动时读取 `./data/im-config.json`，与 env vars 合并初始化飞书
- [x] 传入 `onIMConfig` 回调：接收新配置 → 创建 `FeishuPlatform` → `clawServer.setRoute()`

### 5. Web UI — `SettingsView`

- [x] 新增"飞书配置"分区，字段：App ID / App Secret / Verification Token / Encrypt Key（可选）/ Chat ID（可选）
- [x] 页面加载时 `GET /api/im-config` 填入脱敏值
- [x] 独立保存按钮 → `POST /api/im-config` → 显示成功/失败提示

### 6. 测试

- [x] `tests/config/storage.test.ts` — 6 个用例
- [x] `tests/web/server.test.ts` — 新增 4 个 /api/im-config 用例

## 验收标准

- [x] 在 WebUI 填入飞书凭证保存后，飞书 Webhook 立即生效（无需重启）
- [x] 重启后配置从文件恢复，飞书仍可用
- [x] 敏感字段（appSecret、verificationToken）在 GET 响应中脱敏
- [x] 保存成功/失败有明确提示
- [x] 类型检查通过，144 个测试全部通过
