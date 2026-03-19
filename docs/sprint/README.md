# Sprint 历史总览

所有 sprint 均已完成 ✅。单独的 `sprint-31.md` 到 `sprint-49.md` 已压缩归并到本页，不再保留逐条文档。

---

## 第一阶段：核心框架（Sprint 1–4）

- 建立 TypeScript strict 工程、Agent / LLM / Tool 核心模块和基础测试体系
- 接入 Anthropic provider、SSE 对话接口、飞书 / 企业微信 webhook 服务
- 引入 CronScheduler、上下文压缩和最早期的 WebUI 配置能力

## 第二阶段：WebUI 基础能力（Sprint 5–10）

- 前端迁移到 React + Vite，形成 Chat / News / Status / Settings 基础界面
- 补齐状态接口、思考流渲染、新闻库和记忆模块
- 完成 `docs/manual/` 快速上手与 CLI 使用说明

## 第三阶段：IM 与运行时配置（Sprint 11–23）

- IM 平台改为可选启动，支持在 WebUI 配置和热更新飞书凭证
- 增加 Agent 配置、记忆库查看、Markdown 渲染、IM 日志与会话持久化
- 完成 Cron 可视化、图片发送、`data/agent` / `data/im` / `data/cron` 分目录存储

## 第四阶段：Skills 体系成型（Sprint 24–30）

- 建立 Skill 接口、注册表和 `daily-digest` 首个内容生成 Skill
- 输出统一落盘到 `data/skills/{id}/YYYY-MM-DD.*`
- WebUI 支持 Skill 列表、手动运行和 settings 持久化修复

## 第五阶段：Skills 存储与交付收敛（Sprint 31–37）

- `daily-digest` 从固定站点抓取转向浏览器搜索新闻，逐步沉淀为独立内容流水线
- WebUI 新增 Skill 执行日志流，便于实时观察运行过程
- Skill 定义抽离到 `SKILL.md`，新闻库直接读取 Skill 输出 JSON
- Skill 生成与 IM 投递彻底解耦，引入 `sendSkillOutput`，WebUI 可展示最新图片预览
- 删除 `NewsStorage`、`save_news` 和 `src/news/` 遗留死代码，统一以 Skill 输出作为新闻来源

## 第六阶段：日报链路加固（Sprint 38、40–44）

- `daily-digest` 改用 Playwright 直接搜索，去掉高成本 sub-agent 搜索链路
- 抽取阶段切到专用 LLM 调用与宽松 JSON 解析，修复“抓到链接但日报为空”
- HTML 渲染改为模板 + `layout.css`，截图升级为 `1080px` 版心 + `4x` 高清
- 日报支持国内 / 国际分栏、配额控制和模板化渲染
- 搜索主题支持 WebUI 配置并落盘到 `data/skills/daily-digest/config.json`

## 第七阶段：会话、知识和飞书可视化（Sprint 39、45–49）

- IM 会话从 `chatId` 扩展为 `sessionId` / `continuityId`，支持飞书线程拆分和短桥接
- `Cron` 从状态页拆成独立 tab，并支持直接点击「运行」立即执行
- Agent 支持挂载飞书文档并在对话前检索命中片段作为上下文
- Agent 支持读取飞书通讯录 / 部门权限数据，覆盖 Web 与 IM 对话
- WebUI 状态页增强为运行概览，可直接查看飞书配置来源、配置文件状态、关键指标
- 状态页新增飞书群聊摘要，可看到机器人已加入的群、群名、最近事件和时间

---

## 当前落点

- WebUI 为 7 个标签页：`#chat` / `#news` / `#memory` / `#skills` / `#status` / `#cron` / `#settings`
- 新闻库来自 `data/skills/*/YYYY-MM-DD.json`
- 长期记忆来自 `data/agent/memory.json`，仅保存 `memory_save` 显式写入的内容
- 飞书文档挂载、飞书组织读取、Cron 立即执行、飞书群聊可视化均已可用
