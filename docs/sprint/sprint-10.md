# Sprint 10 — CLI 使用文档

**状态**: ✅ 完成

**目标**: 补全命令行使用说明，让开发者能快速上手 clawclaw

## 任务清单

### 1. 使用说明

- [x] 重写 `docs/manual/README.md`：完整的快速上手、环境变量、pnpm 命令、无代码示例（符合 CLAUDE.md 规范）
- [x] 新增 `docs/manual/cli.md`：详细的命令参考（每个命令的用途、参数、适用场景、典型工作流）

### 2. 更新 PRD

- [x] `docs/prd/README.md` 与当前功能一致，无需更新

### 3. 更新技术文档

- [x] `docs/tech/README.md`：补充 Vite dev 服务端口说明（5173 / 3000 / 3001）

## 验收标准

- [x] `docs/manual/README.md` 包含完整的快速上手步骤（install → .env → pnpm dev:web → 访问 5173）
- [x] `docs/manual/cli.md` 涵盖所有 pnpm 命令及使用场景
- [x] 所有文档与当前代码状态一致（Sprint 1-9 已完成功能，pnpm 命令，正确端口）
- [x] manual 无代码示例，符合 CLAUDE.md 规范
