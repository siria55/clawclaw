# Sprint 54

## 目标

- 修正 `daily-digest` 长截图在国内 / 国际分栏交界处看起来像断层的问题
- 从日报入选结果里排除同花顺来源

## 完成项

- [x] `daily-digest` 长图样式去掉高风险 `blur` / `backdrop-filter` 叠层效果
- [x] 压缩日报卡片、区块和列表的纵向间距，减少长图预览里的“空白带”观感
- [x] `selectDigestArticles()` 对 `10jqka` / 同花顺来源做硬过滤
- [x] 补充 `daily-digest` 回归测试
- [x] 更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 设计说明

- DOM 本身的国内 / 国际 section 间距并不大，问题更接近长图截图和聊天预览中的合成 / 缩放观感
- 模板层去掉大面积滤镜后，长图在 Playwright 截图和 IM 预览里更稳定
- 同花顺通过 hostname 与 source 双重规则排除，避免再被选入日报结果

## 验证

- [x] `pnpm typecheck`
- [x] `pnpm test tests/skills/daily-digest.test.ts`
- [x] `pnpm build`
- [x] 重新执行一次 `daily-digest` 生成，确认截图和 JSON 输出

## 结果

- 日报长图更紧凑，国内 / 国际交界处不再依赖大面积滤镜层
- 同花顺新闻不会再出现在 `daily-digest` 最终输出里
