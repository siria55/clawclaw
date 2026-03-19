# Sprint 47 — Agent 读取飞书通讯录权限数据

**状态**: ✅ 已完成

**问题**：
- Agent 当前只能使用长期记忆、本地文件和挂载文档回答，无法直接读取飞书开放平台通讯录数据。
- 即使飞书应用已经具备通讯录读取权限，Agent 在 Web 对话和 IM 对话中也无法查询部门人数、直属成员等组织信息。

**方案**：
- 基于现有飞书应用凭证，扩展 `FeishuPlatform` 的通讯录读取能力。
- 新增 Agent 工具，支持查询部门信息和直属成员列表，覆盖“部门人数”这类常见问答。
- 在系统提示词和文档中补充权限说明，明确需要开通通讯录读取权限及对应权限范围。

## 任务

- [x] `src/platform/feishu.ts` — 新增通讯录读取接口封装
- [x] `src/tools/feishu-org.ts` / `src/tools/index.ts` — 新增飞书组织信息工具
- [x] `src/app.ts` / `src/web/dev.ts` — 将飞书组织工具接入 Agent（Web + IM 共用）
- [x] `tests/platform/feishu.test.ts` / `tests/tools/feishu-org.test.ts` — 补回归测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` / `docs/sprint/README.md` — 同步文档
- [x] `pnpm typecheck`
- [x] `pnpm test`
