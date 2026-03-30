# 命令参考

所有命令均建议通过 `corepack pnpm` 运行。首次在新机器上拉起项目时，先执行：

```bash
corepack enable
corepack pnpm install
corepack pnpm playwright:install
```

---

## 开发

### `corepack pnpm dev:web`

**推荐的本地调试方式。** 同时启动 API 服务和 Vite 前端开发服务器：

- API 服务：`http://localhost:3000`
- Web UI：`http://localhost:5173`（支持热更新）

适合调试 Agent 行为、查看工具调用过程、浏览新闻库。

前提：`.env` 中已设置对应 provider 的 API Key。

---

### `corepack pnpm dev`

以 watch 模式启动完整应用（含 IM Webhook 服务），文件变更后自动重启。

与 `corepack pnpm dev:web` 的区别：
- `dev:web` — 仅启动 Web 调试界面，无 IM Webhook
- `dev` — 完整应用，含 ClawServer（IM Webhook）和 WebServer（调试界面）

适合调试 IM 消息收发、Cron 定时任务。

前提：`.env` 中填入了相应的 IM 平台配置（`FEISHU_*` 或 `WECOM_*`）。

---

### `corepack pnpm dev:api`

仅启动 API 服务（不含 Vite 前端），在 `http://localhost:3000` 监听。

适合已有外部前端或仅测试 API 接口的场景。

---

## 构建与部署

### `corepack pnpm build`

编译 TypeScript 源码到 `dist/`，同时构建前端 UI 到 `src/web/dist/`。

完整构建流程：
1. `tsc` — TypeScript 编译
2. `vite build` — 前端打包

---

### `corepack pnpm start`

以生产模式启动应用，运行 `dist/app.js`。

运行前必须先执行 `corepack pnpm build`。启动后输出：

```
ClawServer  → http://localhost:3000  (IM Webhook)
WebServer   → http://localhost:3001  (调试界面)
```

端口可通过 `PORT` 环境变量修改（默认 3000）。

---

### `corepack pnpm clean`

清除编译产物（`dist/` 和 `src/web/dist/`）。

---

## 测试

### `corepack pnpm test`

运行所有测试（单次运行）。

---

### `corepack pnpm test:watch`

以 watch 模式运行测试，文件变更后自动重跑。适合 TDD 开发。

---

### `corepack pnpm test:coverage`

运行测试并生成覆盖率报告，输出到 `coverage/` 目录。

覆盖率阈值：全局 80%。

---

## 代码质量

### `corepack pnpm typecheck`

运行 TypeScript 类型检查（不输出文件）。

提交代码前建议运行，确保无类型错误。

---

### `corepack pnpm lint`

运行 ESLint 检查 `src/` 和 `tests/` 目录。

---

### `corepack pnpm lint:fix`

运行 ESLint 并自动修复可修复的问题。

---

## 典型工作流

**初次上手：**

```bash
corepack enable
corepack pnpm install
corepack pnpm playwright:install
cp .env.example .env
# 如用 Anthropic：填写 ANTHROPIC_API_KEY
# 如用 OpenAI：填写 LLM_PROVIDER=openai 和 OPENAI_API_KEY
corepack pnpm dev:web
# 访问 http://localhost:5173
```

**功能开发：**

```bash
corepack pnpm test:watch   # 保持测试监听
# 编辑源文件，测试自动重跑
corepack pnpm typecheck    # 提交前类型检查
corepack pnpm lint         # 提交前 lint 检查
```

**生产部署：**

```bash
corepack pnpm build
corepack pnpm start
# 配置 IM 平台 Webhook 指向 http://your-server:3000/feishu
```
