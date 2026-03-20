# Sprint 62

## 目标

- 为推送 GitHub 和在另一台电脑拉起项目做准备
- 清理不应进入仓库的本机运行数据与多余锁文件

## 完成项

- [x] 补充根目录 `README.md`，提供另一台电脑的最短启动路径
- [x] 完善 `.env.example` 和文档中的安装步骤
- [x] 将 `data/` 从 Git 跟踪中移除，并改为本地运行态目录
- [x] 移除 `package-lock.json`，统一使用 `pnpm-lock.yaml`
- [x] 重写 Git 历史，彻底移除已进入提交历史的 `data/` 与 `package-lock.json`
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 运行期配置、会话、日志、日报产物都应保存在本地 `data/`，而不是跟随仓库同步
- 另一台电脑拉起项目时，最关键的是 `corepack pnpm install` 和 `Playwright` 浏览器安装步骤要明确
- 已经进入历史的本地配置不能只靠 `.gitignore` 解决，必须重写历史后再推送到 GitHub

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`
- [x] `corepack pnpm test`
- [x] `git log --all -- data package-lock.json`

## 结果

- 仓库新增根目录 `README.md`，另一台电脑可按 `corepack pnpm install`、`corepack pnpm playwright:install`、`corepack pnpm dev:web` 直接拉起
- `data/` 不再进入 Git 跟踪，本地运行数据仍保留在工作区
- Git 历史中的运行态文件和 `package-lock.json` 已被清除，适合首次推送 GitHub
- 仓库统一只保留 `pnpm-lock.yaml`，避免另一台电脑混用 `npm` 和 `pnpm`
