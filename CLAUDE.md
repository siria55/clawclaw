# clawclaw

OpenClaw 的超级优化版 AI Agent 框架，TypeScript 实现。

核心：能 24 小时运行，并连接飞书、企业微信等 IM

## 文档

- **Sprint**: [docs/sprint/](docs/sprint/)
- **产品**: [docs/prd/](docs/prd/)
- **技术**: [docs/tech/](docs/tech/)
- **使用说明**：[docs/manual](docs/manual)
    - 使用说明不要有代码示例，可以有命令行指令和相关说明
- **参考文献**: [docs/references](docs/references/)

## 权限

和 OpenClaw 不同，你的主要权限是操作浏览器，没有其他 execute 权限

## 开发规范

```bash
pnpm test          # 运行测试
pnpm lint          # ESLint 检查
pnpm typecheck     # 类型检查
pnpm build         # 编译
```

## 核心原则

- 严格类型，无 `any`
- 每个模块必须有对应测试
- 函数单一职责，不超过 40 行
- 所有 public API 必须有 JSDoc
