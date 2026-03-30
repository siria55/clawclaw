# Sprint 81

## 目标

- 将 `daily-digest` 的最终筛选口径调整为“教育 / 教育科技 / AI 教育 / 教育公司”优先
- 同时保留与教育场景强相关的科技、创投和互联网动态
- 同步更新测试与相关文档说明

## 完成项

- [x] 调整 `daily-digest` 的 LLM system / prompt 筛选口径
- [x] 保持现有搜索词配置与来源过滤逻辑不变
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 本次只调整候选链接进入最终日报前的筛选提示词，不修改 Brave 搜索接口、发布日期处理和来源优先级逻辑
- 优先保留教育、教育科技、AI 教育、教育公司、教育平台、教育政策、教育产品相关内容
- 对泛科技新闻增加限制：只有在与教育行业、教育场景、教育产品或教育公司明显相关时才保留

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 的 LLM system / prompt 现在会优先保留教育、教育科技、AI 教育、教育公司内容
- 泛科技新闻现在只有在与教育行业、教育场景、教育产品或教育公司明显相关时才会保留
- 当前 Brave 搜索词、来源过滤、发布日期处理和 JSON 输出链路均保持不变
- 已新增教育优先筛选口径测试，当前类型检查、测试和构建均通过
