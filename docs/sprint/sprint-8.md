# Sprint 8 — Web UI 体验优化

**周期**: Sprint 8
**状态**: ✅ 完成

## 目标

修复两个明显的 Web UI 体验问题：

1. **Chat 等待指示器** — 发出消息后到第一个 token 到达之前，右侧显示 `...` 等待气泡
2. **状态 / 设置全页化** — 将浮动侧边栏改为独立页面，与「对话」「新闻库」并列在顶部导航

---

## 架构变化

### 导航扩展

`View` 类型从 `"chat" | "news"` 扩展为：

```
"chat" | "news" | "status" | "settings"
```

Header 导航变为四个 tab：

```
[⚡ clawclaw  debug]    [对话] [新闻库] [状态] [设置]
```

不再有悬浮侧边栏，不再有 overlay，点击 tab 直接切换到对应全页视图。

---

## 任务

### 1. Chat 等待指示器

**问题**：发送消息后，服务端还未返回第一个 SSE 事件时，页面右侧空白，用户不知道是否在处理。

**方案**：`ChatView` 接受 `streaming` prop，当 `streaming === true` 且当前没有正在流式输出的 assistant 气泡时，在列表末尾追加一个 `<TypingBubble />` 组件（三个跳动的点）。

#### `src/web/ui/TypingBubble.tsx` + `TypingBubble.module.css`

```tsx
// 右对齐气泡，显示三个跳动的点动画
export function TypingBubble(): React.JSX.Element
```

CSS 动画：三个圆点依次上下跳动（`@keyframes bounce`，各延迟 0 / 0.15s / 0.3s）。

#### `src/web/ui/ChatView.tsx`

- 新增 `streaming: boolean` prop
- 在 entries 渲染后，条件渲染：

```tsx
{streaming && !entries.some(
  (e) => e.kind === "message" && e.message.role === "assistant" && e.message.streaming === true
) && <TypingBubble />}
```

#### `src/web/ui/App.tsx`

- `<ChatView entries={entries} streaming={streaming} />`

**涉及文件**：
- [x] `src/web/ui/TypingBubble.tsx` + `TypingBubble.module.css`（新建）
- [x] `src/web/ui/ChatView.tsx` — 新增 `streaming` prop，渲染 `<TypingBubble />`
- [x] `src/web/ui/App.tsx` — 传入 `streaming` prop

---

### 2. 状态 / 设置全页化

#### `src/web/ui/SettingsView.tsx` + `SettingsView.module.css`（新建）

从 `SettingsPanel` 提取内容，去掉 `open`/`onClose`/overlay，改为全页布局：

```tsx
interface Props {
  config: ClawConfig;
  onChange: (config: ClawConfig) => void;
}
export function SettingsView({ config, onChange }: Props): React.JSX.Element
```

- 沿用 `SettingsPanel` 的字段（API Key、Base URL、HTTPS Proxy、Model）
- 全页布局，顶部标题「设置」，表单居中，最大宽度 480px
- 移除原有的 overlay 和关闭按钮

#### `src/web/ui/StatusView.tsx` + `StatusView.module.css`（新建）

从 `StatusPanel` 提取内容，去掉 `open`/`onClose`/overlay，改为全页布局：

```tsx
export function StatusView(): React.JSX.Element
```

- 沿用 `StatusPanel` 的数据获取逻辑（`GET /api/status`）
- 全页布局，顶部标题「系统状态」，卡片区域展示 cron jobs 和 IM 连接

#### `src/web/ui/App.tsx` — 重构导航

- `View` 类型改为 `"chat" | "news" | "status" | "settings"`
- 移除 `settingsOpen`、`statusOpen` 状态
- 移除 `<SettingsPanel>` 和 `<StatusPanel>` 的引用
- Header 导航改为四个 tab 按钮：对话 / 新闻库 / 状态 / 设置
- 主区域根据 `view` 渲染对应组件：
  - `"chat"` → `<ChatView> + <InputBar>`
  - `"news"` → `<NewsView />`
  - `"status"` → `<StatusView />`
  - `"settings"` → `<SettingsView config={config} onChange={handleConfigChange} />`
- 移除 `hasConfig` 的小圆点（状态已经是专属页，不再需要 indicator）；或保留小圆点作为视觉提示

**涉及文件**：
- [x] `src/web/ui/SettingsView.tsx` + `SettingsView.module.css`（新建）
- [x] `src/web/ui/StatusView.tsx` + `StatusView.module.css`（新建）
- [x] `src/web/ui/App.tsx` — 导航重构，移除浮层逻辑
- [x] `src/web/ui/App.module.css` — 调整 tab 样式（现在有 4 个 tab）
- [x] `src/web/ui/SettingsPanel.tsx` + `SettingsPanel.module.css`（删除，内容迁移到 SettingsView）
- [x] `src/web/ui/StatusPanel.tsx` + `StatusPanel.module.css`（删除，内容迁移到 StatusView）

---

### 3. 测试

- [x] `tests/web/useChatStream.test.ts` — 已有测试，无需新增（streaming 逻辑不变）
- [x] 手动验证：发送消息 → 右侧出现 `...` → 第一个 token 到达后 `...` 消失，替换为 assistant 气泡
- [x] 手动验证：点击「状态」「设置」tab 跳转到对应全页，内容与原侧边栏一致

---

## 验收标准

- [x] 发送消息后、第一个 token 到达前，右侧显示跳动的 `...` 等待气泡
- [x] 第一个 token 到达后，等待气泡消失，正常显示 assistant 气泡
- [x] 「状态」和「设置」为顶部导航 tab，点击切换到全页视图
- [x] 不存在悬浮侧边栏和 overlay
- [x] 所有现有测试继续通过
