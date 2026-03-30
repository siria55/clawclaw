# Sprint 66

## 目标

- 修复 Chat 页中 `401` 等请求失败信息不可直接复制的问题
- 优化 `/api/chat` 非 2xx 响应在前端的错误展示，保留 HTTP 状态码与服务端返回内容
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 为聊天流错误事件增加可复制入口
- [x] 优化 HTTP 错误提取逻辑，正确显示 `401` 等响应信息
- [x] 补充相关前端测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 错误信息既要能看到，也要能复制，因此保留可展开的错误卡片，同时增加复制按钮
- 对 `/api/chat` 的非 2xx 响应优先读取响应体文本；有状态码时将其带入最终错误文案
- 错误详情区允许原生文本选择，便于拖拽复制长报错

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`
- [x] 本地 Playwright 浏览器检查：模拟 `/api/chat` 返回 `401`，页面显示完整错误并可通过复制按钮带走

## 结果

- Chat 页中的错误卡片现在支持一键复制，`401` 等失败信息可直接带走
- `/api/chat` 的非 2xx 响应会优先展示 `HTTP 状态码 + 服务端返回内容`
