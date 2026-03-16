# Sprint 5 — Web UI 重构（React + Vite）

**周期**: Sprint 5
**状态**: 📋 待开始

## 目标

用 React + Vite 重构 Web 调试界面，替换当前单文件 HTML，UI 风格改为亮色简洁风格，提升可维护性和视觉体验。

---

## 技术选型

| 项目 | 选择 |
|------|------|
| 框架 | React 19 |
| 构建 | Vite 6 |
| 语言 | TypeScript strict |
| 样式 | CSS Modules（无额外依赖） |
| 测试 | Vitest（现有配置） |

**不引入** UI 组件库——保持轻量，手写样式。

---

## 任务

### 1. 项目结构调整

- [ ] 在 `src/web/ui/` 下创建 React 应用（与 Node.js 服务端代码分离）
- [ ] 新增 `src/web/vite.config.ts` — 构建配置，输出到 `src/web/dist/`
- [ ] `package.json` 更新 `dev:web` 脚本：同时启动 Vite dev server（热更新）和 Node server

### 2. UI 组件拆分

- [ ] `App.tsx` — 根组件，布局骨架
- [ ] `ChatView.tsx` — 消息列表区域，气泡渲染
- [ ] `InputBar.tsx` — 底部输入框 + 发送按钮
- [ ] `SettingsPanel.tsx` — 设置抽屉（API Key / Base URL / Proxy / Model）
- [ ] `EventBadge.tsx` — tool_call / tool_result 事件标签
- [ ] `useChatStream.ts` — 封装 POST SSE 流读取逻辑（复用现有流协议）

### 3. 视觉设计

亮色简洁风格，参考设计规范：

- **背景**：`#ffffff` / `#f5f5f5`
- **主色**：`#171717`（文字）、`#0066ff`（用户气泡、发送按钮）
- **边框**：`#e5e5e5`
- **字体**：系统字体栈，14px 正文
- **气泡**：用户蓝色右对齐，AI 白色/浅灰左对齐，圆角 `12px`
- **工具事件**：内联折叠卡片，默认收起，点击展开详情
- **设置面板**：右侧抽屉，覆盖层，输入框聚焦高亮蓝色
- **响应式**：最大宽度 `760px` 居中，移动端全宽

### 4. 服务端调整

- [ ] `WebServer` 改为从 `src/web/dist/` 提供静态资源（生产模式）
- [ ] dev 模式下，Vite 开发服务器代理 `/api/chat` 到 Node server（`vite.config.ts` 中配置 proxy）

### 5. 测试

- [ ] `useChatStream` hook 单元测试（mock fetch）
- [ ] `WebServer` 静态文件服务测试更新

---

## 验收标准

- [ ] `npm run dev:web` 启动后，热更新正常，修改 React 组件即时刷新
- [ ] `npm run build` 后，`WebServer` 正确提供构建产物
- [ ] UI 视觉对比旧版有明显提升，亮色简洁风格
- [ ] 工具事件卡片可折叠展开
- [ ] 设置面板 localStorage 持久化保留
- [ ] 所有现有 web/server 测试继续通过
