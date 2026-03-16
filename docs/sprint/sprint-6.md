# Sprint 6 — Web UI 增强：系统状态面板 + 思考 Bubble

**周期**: Sprint 6
**状态**: 📋 待开始

## 目标

两项独立的 Web UI 增强：
1. **系统状态面板** — 在调试 UI 中展示运行时状态：Cron 任务列表、IM 平台连接状态（飞书/企业微信）
2. **思考 Bubble** — 对话视图中展示 Claude 的 `thinking` 推理块，折叠/展开

---

## 功能 A — 系统状态面板

### 背景

目前 WebUI 只能发消息调试，看不到系统运行状态。需要在 UI 里展示：
- 已注册的 Cron 任务（id、表达式、触发消息）
- IM 平台连接状态（飞书、企业微信是否已挂载）

### 后端：`GET /api/status`

#### `WebServerConfig` 新增 `getStatus` 回调

```ts
export interface SystemStatus {
  cronJobs: CronJobStatus[];
  connections: ConnectionStatus[];
}

export interface CronJobStatus {
  id: string;
  schedule: string;  // cron 表达式
  message: string;   // 触发时发给 Agent 的消息
  timezone: string;
}

export interface ConnectionStatus {
  platform: "feishu" | "wecom" | string;
  label: string;     // 显示名，如 "飞书 Bot"
  connected: boolean;
}
```

- `WebServerConfig` 新增 `getStatus?: () => SystemStatus`
- `GET /api/status` 调用 `getStatus()` 返回 JSON；若未配置则返回空结构 `{ cronJobs: [], connections: [] }`

### 前端：`StatusPanel.tsx`

- 触发方式：header 新增"状态"按钮（与"设置"按钮同排），点击打开右侧抽屉（复用 SettingsPanel 的抽屉样式）
- 内容分两区：
  - **Cron 任务** — 卡片列表，每项显示 id、schedule badge、message 预览
  - **IM 连接** — 每项显示平台名、连接状态指示灯（绿色/灰色）
- 打开时调用 `GET /api/status`，展示结果；有刷新按钮

### 任务清单

- [ ] `src/web/server.ts` — 新增 `SystemStatus` / `CronJobStatus` / `ConnectionStatus` 类型，`WebServerConfig.getStatus` 字段，`GET /api/status` 路由
- [ ] `src/web/ui/StatusPanel.tsx` + `StatusPanel.module.css` — 状态抽屉组件
- [ ] `src/web/ui/App.tsx` — header 新增状态按钮，挂载 `StatusPanel`
- [ ] `tests/web/server.test.ts` — 补充 `/api/status` 路由测试

---

## 功能 B — 思考 Bubble

### 背景

Claude 支持 extended thinking，会在消息内容中返回 `thinking` 类型的 content block。目前服务端 `extractText` 只提取 `text` block，思考内容被丢弃。需要将思考内容作为独立 SSE 事件推送，前端渲染为可折叠的灰色推理气泡。

### 后端：`thinking` SSE 事件

`server.ts` 的 `#handleChat` 事件循环中，增加 `thinking` 类型 block 的处理：

```ts
// 新增 send("thinking", { text: block.thinking })
```

消息事件中的 `content` 保持只含 `text` block（不变）。

### 前端

#### `types.ts` 新增

```ts
export interface ThinkingItem {
  kind: "thinking";
  id: string;
  text: string;
  streaming?: boolean;
}

// ChatEntry 扩展
export type ChatEntry = ChatMessageItem | ToolEventItem | ThinkingItem;
```

#### `ThinkingBubble.tsx`

- 默认折叠，header 显示 "💭 思考过程"
- 展开后显示思考文本（`<pre>` 或普通段落）
- 视觉：浅灰背景 `#f0f0f0`，左对齐，圆角，比 EventBadge 更柔和

#### `useChatStream.ts`

- 新增处理 `thinking` SSE 事件：追加/累积 `ThinkingItem`（与 message 类似的累积逻辑）

#### `ChatView.tsx`

- 新增 `ThinkingBubble` 渲染分支

### 任务清单

- [ ] `src/web/server.ts` — `#handleChat` 提取并 emit `thinking` SSE 事件
- [ ] `src/web/ui/types.ts` — 新增 `ThinkingItem`，更新 `ChatEntry`
- [ ] `src/web/ui/ThinkingBubble.tsx` + `ThinkingBubble.module.css`
- [ ] `src/web/ui/useChatStream.ts` — 处理 `thinking` 事件
- [ ] `src/web/ui/ChatView.tsx` — 渲染 `ThinkingBubble`
- [ ] `tests/web/server.test.ts` — thinking 事件 SSE 测试
- [ ] `tests/web/useChatStream.test.ts` — thinking 事件处理测试

---

## 验收标准

- [ ] `GET /api/status` 正确返回 cron 和连接数据
- [ ] 状态面板打开后展示 cron 列表和 IM 连接状态
- [ ] 当 Agent 使用 extended thinking 时，对话中出现折叠的"思考过程"气泡
- [ ] 思考气泡默认折叠，点击展开，再次点击折叠
- [ ] 所有现有测试继续通过
