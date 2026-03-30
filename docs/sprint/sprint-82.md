# Sprint 82

## 目标

- 修复 `daily-digest` 国内搜索偶发命中日本等非中国结果的问题
- 将国内搜索明确约束到中国语境
- 同步更新测试与相关文档说明

## 完成项

- [x] 将国内搜索词从模糊的“国内”收敛为明确的“中国”口径
- [x] 为 Brave News Search 的国内请求增加中国国家与中文语言参数
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 对 `daily-digest` 国内搜索计划做两层修正：
- 一是将中性词扩展时的国内前缀由“国内”改为“中国”，并将显式国内词（如 `国内AI科技`）规范化为中国口径的搜索文本
- 二是在 Brave News Search 的国内请求上增加 `country=CN` 和 `search_lang=zh`
- 仅调整国内候选搜索，不改动国际搜索、来源过滤、发布日期处理和最终 JSON 输出

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm build`

## 结果

- 中性搜索词的国内扩展现在改为 `中国...`，显式国内词如 `国内AI科技` 也会在运行时规范化为中国口径搜索文本
- Brave 的国内新闻请求现在会附带 `country=CN` 与 `search_lang=zh-hans`
- 国际搜索不受影响；来源过滤、发布日期处理和 JSON 输出链路保持不变
- 使用当前本地 Brave Key 实测 `中国AI科技 + country=CN + search_lang=zh-hans + freshness=pw` 返回 `200`
