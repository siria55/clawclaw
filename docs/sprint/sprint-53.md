# Sprint 53

## 目标

- 收敛 `daily-digest` 日报模板，去掉无信息量的英文标签
- 让“今日摘要”真正概括新闻内容，而不是只显示数量统计
- 明确飞书 Cron 多目标投递里 `oc_` 群 ID 的使用方式

## 完成项

- [x] 日报封面 `deck` 改为按日期稳定轮换的一句中文短句
- [x] 删除新闻列表中的 `LOCAL SIGNAL` / `GLOBAL SIGNAL` 标签
- [x] 分栏眉标题从英文改成中文“国内主线” / “国际主线”
- [x] 移除“今日摘要”里的国内 / 国际 / 总计数量 chips
- [x] `buildSummaryText()` 改为基于已选文章标题 / 摘要生成内容型概览
- [x] Markdown 日报正文补入同一段“今日摘要”
- [x] 更新 `daily-digest` 相关测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 摘要逻辑不再做来源统计，而是优先取文章摘要、缺失时回退标题，拼成国内 / 国际两句概览
- `deck` 使用固定短句池按日期取值，保证每天稳定、又不再写死一段英文说明
- 飞书 Cron 的多目标仍保持 `chatIds` 广播；飞书群常见使用 `oc_` 开头的 chat ID

## 验证

- [x] `pnpm typecheck`
- [x] `pnpm test tests/skills/daily-digest.test.ts`
- [x] `pnpm test tests/cron/scheduler.test.ts tests/web/CronView.test.ts tests/web/server.test.ts`
- [x] `pnpm build`

## 结果

- 今日日报顶部不再出现固定英文说明，摘要卡会直接概括当天新闻重点
- 新闻条目里的无效标签已移除，版面信息密度更高
- 飞书 Cron 可继续同时投递到个人 `ou_` 和群 `oc_`
