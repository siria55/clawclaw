# Sprint 65

## 目标

- 修复 Chat 页左侧 AI 回复在真实浏览器中无法直接选中复制的问题
- 修复 assistant Markdown 渲染链路中的浏览器运行时错误
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 将 assistant Markdown 渲染包裹到独立正文容器，移除不兼容的 `ReactMarkdown className` 用法
- [x] 显式为 assistant 气泡和正文内容开启文本选择，保留复制按钮但不影响拖拽选中
- [x] 补充并保留相关前端测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- “可复制”分为两层：一键复制原始文本，以及浏览器原生的拖拽选中复制
- 复制按钮区域继续保持 `user-select: none`，避免误选中按钮文案
- assistant 正文容器统一开启 `user-select: text`，让 Markdown 段落、列表、代码块都可直接选中

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`
- [x] 本地 Playwright 浏览器检查：拖拽选中左侧 assistant 文本，`window.getSelection().toString()` 返回完整回复内容

## 结果

- Chat 页左侧 AI 回复现在可直接拖拽选中复制，也可继续使用顶部复制按钮
- assistant Markdown 在真实浏览器中恢复正常渲染，不再因为组件 props 不兼容而中断
