# Sprint 87

## 目标

- 进一步收紧 `daily-digest` 国际部分的中文口径
- 避免国际区块出现繁体中文内容
- 补充测试与文档说明

## 完成项

- [x] 将国际部分语言规则收紧为“英文 / 简体中文”
- [x] 过滤明显繁体中文的国际文章
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 延续最终入选阶段的硬过滤，避免改动搜索与抽取主链路
- 允许英文与简体中文；明显繁体中文内容直接拦截
- 对繁体专属字形和港台中文站点做额外识别

## 验证

- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`

## 结果

- `daily-digest` 国际结果现在只保留简体中文 / 英文
- 明显繁体中文内容会被直接拦截
- 港台繁体中文站点会做额外 hostname 识别，降低共享字形内容漏入日报的概率
