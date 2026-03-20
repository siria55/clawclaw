# Sprint 55

## 目标

- 让 `daily-digest` 支持“回复数字获取对应新闻链接”
- 让飞书里的 digest 编号可唯一映射到具体新闻

## 完成项

- [x] 日报 HTML / Markdown 列表改为全局连续编号，不再按国内 / 国际各自从 1 开始
- [x] 飞书 IM 快捷链路支持纯数字回复，命中最近一次 digest 后返回对应新闻链接
- [x] 数字回复仅在该 chat 最近确实收到过 digest 时生效，避免劫持普通数字消息
- [x] 飞书 IM 发 digest 图片 / 文字版后会追加提示“回复数字获取原文链接”
- [x] Cron 发送 `daily-digest` 图片后也会同步追加编号回复提示
- [x] 补齐 `news-reply`、`cron scheduler`、`daily-digest` 相关测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- 编号与 `data/skills/daily-digest/YYYY-MM-DD.json` 的数组顺序保持一致，因此回复数字可直接映射到当天文章数组下标
- 最近一次 digest 上下文通过 `IMEventStorage.replyText` 中的 `[日报图片] YYYY-MM-DD` / `[日报文本] YYYY-MM-DD` 标记识别
- 命中数字回复后，飞书优先发送 Markdown 链接卡片；不支持 Markdown 的平台回退到纯文本链接

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test tests/im/news-reply.test.ts tests/cron/scheduler.test.ts tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm build`

## 结果

- 飞书里收到 digest 后，直接回复 `3`、`11` 这类数字即可拿到对应新闻原文链接
- digest 编号现在是全局唯一编号，国内 / 国际分栏之间不会再重复编号
