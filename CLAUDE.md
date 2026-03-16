# eeo_claw

OpenClaw 的超级优化版 AI Agent 框架，TypeScript 实现。

## 文档

- **Sprint**: [docs/sprint/](docs/sprint/)
- **产品**: [docs/prd/](docs/prd/)
- **技术**: [docs/tech/](docs/tech/)
- **参考文献**: [docs/references](docs/references/)

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
