# Sprint 13 — 设置页交互优化

**状态**: ✅ 完成

**目标**：
1. 密码字段添加小眼睛按钮，可切换明文/密文显示
2. LLM 设置区增加「保存」按钮，不再每次按键就写入 localStorage

## 任务清单

- [x] `SettingsView.tsx` — `Field` 组件 `type="password"` 时显示眼睛 toggle（👁/🙈）
- [x] `SettingsView.tsx` — LLM 设置区改为本地 draft state，点「保存配置」才写入
- [x] `SettingsView.module.css` — `.fieldRow` 相对定位容器 + `.eyeBtn` 绝对定位按钮

## 验收标准

- [x] API Key、App Secret、Verification Token 等密码字段右侧有眼睛图标
- [x] 点击眼睛可在明文/密文间切换
- [x] LLM 设置区有独立「保存配置」按钮，保存后显示「已保存」提示
- [x] 保存前修改字段不影响已生效的配置
- [x] 类型检查通过
