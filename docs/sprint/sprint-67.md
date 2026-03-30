# Sprint 67

## 目标

- 修复 Chat 页中错误信息变成 `Cannot read properties of undefined (reading '0')` 的问题
- 保证请求失败时前端仍能稳定展示可复制的原始错误信息
- 同步更新 `docs/sprint/README.md`、`docs/prd/README.md`、`docs/tech/README.md`、`docs/manual/README.md`

## 完成项

- [x] 复现并定位 `Cannot read properties of undefined (reading '0')` 的根因
- [x] 修复 Chat 错误展示链路，恢复正确错误文案
- [x] 补充相关测试
- [x] 更新 sprint / prd / tech / manual 文档

## 设计说明

- 失败场景下优先展示后端原始错误，而不是让前端错误处理本身再次抛错
- 错误复制能力需要继续保留，不能因这次修复回退

## 验证

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm build`

## 结果

- OpenAI 异常响应不再退化成 `Cannot read properties of undefined (reading '0')`
- Chat 页会继续展示可复制的真实错误信息，如上游返回的认证失败文案
