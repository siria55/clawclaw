# Sprint 42 — DailyDigest 截图升级为 4x 高清

**状态**: ✅ 完成

**问题**：`DailyDigestSkill` 当前截图虽然版式正确，但 PNG 清晰度不够，放大或在高分屏里查看时发虚。

**方案**：
- 截图上下文改为固定 `1080px` 版心 + `deviceScaleFactor: 4`
- Playwright 截图显式使用 `scale: "device"`
- 将截图参数提升为常量，方便测试和后续统一维护

## 任务

- [x] `src/skills/daily-digest/index.ts` — 截图上下文改为 4x 高清
- [x] `tests/skills/daily-digest.test.ts` — 增加截图参数测试
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` — 同步高清截图说明
- [x] `pnpm typecheck`
- [x] `pnpm test tests/skills/daily-digest.test.ts`
- [x] 真实重跑 `daily-digest`，刷新当天 PNG 输出
