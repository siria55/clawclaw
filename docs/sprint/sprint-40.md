# Sprint 40 — DailyDigestSkill 抽取链路加固

**状态**: ✅ 完成

**问题**：`DailyDigestSkill` 虽然能抓到新闻搜索链接，但最后一步复用了聊天 Agent 的 `run()`，容易被人设 prompt 干扰；同时 LLM 偶尔返回“接近 JSON、但个别标题里的双引号未转义”的结果，导致解析失败并落成空日报。

**方案**：
- 抽取阶段不再走聊天 Agent 对话链路，改为直接调用 `ctx.agent.llm.complete()`
- 使用专用 `EXTRACTION_SYSTEM`，强约束只输出 JSON 数组
- 增加 fenced json 提取和 near-JSON 宽松解析兜底
- 补回归测试覆盖 Anthropic 文本块、fenced json、未转义引号场景

## 任务

- [x] `src/skills/daily-digest/index.ts` — 改为专用 LLM 抽取链路，新增宽松 JSON 解析
- [x] `tests/skills/daily-digest.test.ts` — 补解析回归测试
- [x] 真实重跑 `daily-digest`，确认 `data/skills/daily-digest/2026-03-19.json` 不再为空
- [x] `docs/prd/README.md` / `docs/tech/README.md` / `docs/manual/README.md` — 同步实现细节
- [x] `pnpm typecheck`
- [x] `pnpm test tests/skills/daily-digest.test.ts`
