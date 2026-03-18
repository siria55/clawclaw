# Sprint 历史总览

所有 sprint 均已完成 ✅。以下按阶段分组，压缩记录关键里程碑。

---

## 第一阶段：核心框架（Sprint 1–4）

### Sprint 1 — 项目初始化
TypeScript strict 模式，建立 Agent/LLM/Tool 核心模块，配置 ESLint + Vitest，11 tests 通过。

### Sprint 2 — 代理 + Web UI 雏形
AnthropicProvider 支持 `HTTPS_PROXY` / `ANTHROPIC_BASE_URL`；原生 Node.js HTTP 提供 `POST /api/chat`（SSE 流）。

### Sprint 3 — IM 平台接入
`IMPlatform` 接口；飞书适配器（SHA256 验签、时间戳、challenge）；企业微信适配器（SHA1、AES-256）；ClawServer 统一处理。46 tests 通过。

### Sprint 4 — Cron + 上下文压缩 + UI 配置
CronScheduler（cron 表达式调度）；ContextCompressor（超限自动摘要）；WebUI 设置面板（本地存储）；`X-Claw-Config` 请求头传递配置。

---

## 第二阶段：WebUI 体系（Sprint 5–10）

### Sprint 5 — React + Vite 重构
迁移至 React 19 + Vite；App / ChatView / InputBar / useChatStream 组件结构；热更新开发体验。

### Sprint 6 — 状态面板 + 思考 Bubble
`GET /api/status`；StatusPanel 展示 Cron 任务和连接状态；ThinkingBubble 渲染 extended thinking；`thinking` SSE 事件。

### Sprint 7 — 新闻库
NewsStorage（JSON 持久化、搜索、分页）；`save_news` 工具；`GET /api/news`；NewsView（搜索 + 分页 + 外链）。

### Sprint 8 — UI 体验优化
TypingBubble（跳点动画）；浮层转全页 tab；4-tab 导航（对话 / 新闻 / 状态 / 设置）。

### Sprint 9 — 记忆模块
MemoryStorage（save / search / get）；三个 memory 工具；`system` 函数化 + `getContext` 钩子；支持 RAG pull 和 push。

### Sprint 10 — 使用文档
`docs/manual/` 完整快速上手 + CLI 参考文档。

---

## 第三阶段：IM 全功能（Sprint 11–23）

### Sprint 11 — 可选 IM 配置
飞书 / 企业微信平台改为可选启动，无凭证正常运行。

### Sprint 12 — WebUI IM 配置
IMConfigStorage；`GET/POST /api/im-config`；热更新路由；持久化到 `data/im-config.json`。

### Sprint 13 — 设置页交互
密码字段眼睛 toggle；LLM 设置独立保存；草稿模式 + 保存确认。

### Sprint 14 — Agent Meta 配置
AgentMetaConfig（name / systemPrompt）；`GET/POST /api/config/agent`；热更新系统提示；持久化到 `data/agent-config.json`。

### Sprint 15 — Memory 预览 + URL 路由
`GET /api/memory`；MemoryView（搜索 + 分页）；URL hash 路由；浏览器前进后退。

### Sprint 16 — Markdown 渲染
react-markdown 渲染 Assistant 消息；确认 IM 与 WebUI 共用同一 Agent 实例。

### Sprint 17 — IM 上下文 + 消息日志
userId/chatId 注入 Agent；IMEventStorage（ring buffer 200 条）；`GET /api/im-log?since=`；状态页实时日志轮询。

### Sprint 18 — Cron 可视化
CronJobConfig 可序列化；`GET/POST/DELETE /api/cron`；WebUI Cron CRUD；持久化到 `data/cron-config.json`。

### Sprint 19 — IM 持久化 + 多轮记忆
IMEventStorage 写文件；ConversationStorage（按 chatId 存多轮历史，40 条裁剪）；重启后记忆保留。

### Sprint 20 — data/ 目录分类
`data/` 拆分为 agent/ / im/ / cron/ 子目录。

### Sprint 21 — Cron 消息记录
Cron 消息写入 IMEventStorage；dev.ts 补全调度器接入。

### Sprint 22 — IM 日志分类 + JSON 可读
chatId 前缀分类（`oc_` 群聊 / `ou_` 直发）；JSON 文件 2-space 缩进；日志 tab 过滤。

### Sprint 23 — Cron 图片发送
`msgType: "text" | "image"`；FeishuPlatform.sendImage() 支持 URL / 本地路径；Cron 表单加类型选择。

---

## 第四阶段：Skills 系统（Sprint 24–30）

### Sprint 24 — Skills 架构 + DailyDigestSkill
Skill 接口 + SkillRegistry；DailyDigestSkill：爬取 36Kr → 渲染 HTML → Playwright 截图 → 发送飞书；CronJob 绑定 skillId。

### Sprint 25 — Skills 目录 + WebUI 展示
Skills 按子目录组织；`GET /api/skills`；状态页展示 skill 描述。

### Sprint 26 — Skill 数据持久化 + Agent 权限
Skills 输出保存到 `data/skills/{id}/YYYY-MM-DD.*`（MD / HTML / PNG）；`read_file` 工具 + 路径白名单；`allowedPaths` 在 WebUI 可编辑。

### Sprint 27 — 侧边栏布局重构
左竖排 sidebar 替换顶部横排 tab；移除 `max-width: 760px`；内部 view 放宽至 720px。

### Sprint 28 — Settings 数据同步修复
`httpsProxy` 接入 AnthropicProvider；清空字段可持久化；去掉脱敏返回；服务端 merge 空字符串表示清除。

### Sprint 29 — WebUI 手动触发 Skill
`POST /api/skills/:id/run`；SkillContext.delivery 改为可选；Skills 列表加「运行」按钮 + 状态反馈。

### Sprint 31 — DailyDigest 浏览器搜索新闻
`searchBaiduNews(page, query)` 用 Playwright 搜索百度新闻；`DailyDigestSkill` 构造器接受 `queries?: string[]`；多源（N 次百度搜索 + 36Kr 兜底）去重取 top 12；dev.ts 传入默认 3 个关键词。
