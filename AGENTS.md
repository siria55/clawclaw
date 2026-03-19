# clawclaw

OpenClaw 的超级优化版 AI Agent 框架，TypeScript 实现。

核心

1. 能 24 小时运行，并连接飞书、企业微信等 IM
2. 每天定时发出当日新闻新报
3. 每天搜索的新闻都备份存储，有一个庞大的媒体库
4. 其他工作信息，供 bot 发给 IM

## 文档

- **Sprint**: [docs/sprint/](docs/sprint/)
- **产品**: [docs/prd/](docs/prd/)
- **技术**: [docs/tech/](docs/tech/)
- **使用说明**：[docs/manual](docs/manual)
    - 使用说明不要有代码示例，可以有命令行指令和相关说明
- **IM 等接口参考文档**：[docs/im-docs](docs/im-docs)
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
- 执行完一个 sprint 要更新 prd、tech、manual 等文档。sprint 文档本身要 check 勾选
- 你不要读/写 TODO.md，这个文件是我自己看的
