# Sprint 15 — Memory 预览 + URL Tab 路由

**状态**: 🚧 进行中

**目标**：
1. 记忆库可在 WebUI 中浏览（关键词搜索 + 分页）
2. 五个标签页各自对应独立 URL（hash 路由），支持直接访问和前进/后退

---

## 架构

```
GET /api/memory?q=&page=&pageSize=   ← 新增记忆库查询接口

App.tsx hash routing:
  #chat     → ChatView
  #news     → NewsView
  #memory   → MemoryView（新增）
  #status   → StatusView
  #settings → SettingsView
  无 hash   → 默认 #chat
```

---

## 任务

### 1. 后端 `GET /api/memory`
- [ ] `WebServerConfig` 新增 `memoryStorage?: MemoryStorage`
- [ ] `GET /api/memory` — `q` / `page` / `pageSize` 参数，返回 `{ entries, total, page, pageSize }`
- [ ] 注入到 `src/app.ts` 和 `src/web/dev.ts`

### 2. `MemoryView.tsx` + `MemoryView.module.css`
- [ ] 关键词搜索、分页浏览（每页 20 条，按 createdAt 倒序）
- [ ] 展示 content、tags、createdAt
- [ ] 无数据时展示空态

### 3. URL Hash 路由
- [ ] `App.tsx` 读取 `window.location.hash` 初始化 view
- [ ] Tab 切换时更新 `window.location.hash`
- [ ] 监听 `hashchange` 事件（支持浏览器前进/后退）

### 4. 测试
- [ ] `tests/web/server.test.ts` — `GET /api/memory` GET

---

## 验收标准

- [ ] 访问 `/#memory` 能看到记忆库列表，支持关键词搜索和分页
- [ ] 切换标签页时 URL hash 同步更新
- [ ] 直接访问 `/#settings` 打开设置页
- [ ] 浏览器前进/后退能正确切换标签
- [ ] 类型检查通过，所有测试通过
