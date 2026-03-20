# clawclaw

OpenClaw 的增强版 AI Agent 框架，TypeScript 实现，支持：

- 飞书 / 企业微信等 IM 接入
- `daily-digest` 今日日报生成与定时投递
- WebUI 调试、配置、状态查看和内容浏览
- 长期记忆、挂载飞书文档、Cron 自动化

## 快速开始

```bash
corepack enable
corepack pnpm install
corepack pnpm playwright:install
cp .env.example .env
```

然后按需填写 `.env`，或者启动后直接在 WebUI 里配置。

启动调试环境：

```bash
corepack pnpm dev:web
```

启动完整应用：

```bash
corepack pnpm build
corepack pnpm start
```

## 重要说明

- 本地运行数据统一写入 `data/`
- `data/` 包含配置、会话、IM 日志、日报产物等运行态内容，不应提交到 GitHub
- Playwright 浏览器需要额外执行一次 `corepack pnpm playwright:install`
- 本项目以 `pnpm-lock.yaml` 作为唯一锁文件

## 文档

- [使用说明](docs/manual/README.md)
- [命令参考](docs/manual/cli.md)
- [产品文档](docs/prd/README.md)
- [技术设计](docs/tech/README.md)
- [Sprint 历史](docs/sprint/README.md)
