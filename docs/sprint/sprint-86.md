# Sprint 86

## 目标

- 收紧 `daily-digest` 国际部分的语言口径
- 避免国际区块出现中文、英文之外的语言内容
- 补充测试与文档说明

## 完成项

- [x] 为国际文章新增语言过滤
- [x] 保持中文 / 英文国际稿正常保留
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 优先在最终入选阶段拦截国际稿，避免改动搜索与抽取主链路
- 允许中文、英文及常见数字/标点混排
- 对明显的日文、韩文、西里尔、阿拉伯文等脚本做过滤

## 验证

- [x] `corepack pnpm test -- tests/skills/daily-digest.test.ts`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm build`

## 结果

- 国际文章在最终入选阶段新增语言过滤，只保留中文 / 英文内容
- 明显含日文、韩文等其他语言脚本的国际文章会被挡掉
- 抽取提示词、单测和文档说明已同步更新
