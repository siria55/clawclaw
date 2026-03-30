# 技术设计文档

## 模块依赖图

```
src/index.ts（公共入口）
│
├── core/agent.ts          ← LLM 编排循环
│   ├── core/types.ts      ← AgentConfig / AgentEvent
│   └── core/compressor.ts ← 历史压缩
│
├── llm/anthropic.ts       ← Anthropic 适配器
├── llm/openai.ts          ← OpenAI Chat Completions 适配器
│   └── llm/types.ts       ← LLMProvider 接口
│
├── tools/
│   ├── tools/types.ts     ← Tool 接口 / defineTool()
│   ├── tools/feishu-org.ts← 飞书部门 / 成员读取工具
│   ├── tools/memory.ts    ← createMemoryTools()
│   └── tools/read-file.ts ← createReadFileTool()
│
├── im/
│   ├── conversations.ts   ← ConversationStorage（session 历史 + bridge）
│   ├── context.ts         ← buildIMRunContext() / persistIMRunContext()
│   ├── news-reply.ts      ← 飞书“今天新闻”快捷处理
│   └── route.ts           ← IM 路由类型 / onMessage 拦截
│
├── memory/storage.ts      ← MemoryStorage（JSON 持久化）
├── docs/library.ts        ← MountedDocLibrary（文档同步 / 缓存 / 检索）
│
├── platform/feishu.ts     ← 飞书适配器
├── platform/wecom.ts      ← 企业微信适配器
│
├── server/index.ts        ← ClawServer（IM 服务）
├── web/server.ts          ← WebServer（调试 API）
├── cron/scheduler.ts      ← CronScheduler
└── skills/
    ├── types.ts           ← Skill / SkillContext / SkillResult
    ├── registry.ts        ← SkillRegistry
    ├── loader.ts          ← SKILL.md 解析
    └── daily-digest/      ← DailyDigestSkill
```

原则：依赖只向下，`server` 和 `web` 依赖 `core`，`core` 依赖 `llm` 和 `tools`，`tools` 依赖 `news` 和 `memory`，`skills` 依赖 `core`，各层不反向依赖。

运行期数据统一写入项目根目录下的 `data/`。启动入口会自动创建所需目录，因此仓库本身不需要提交任何本机生成的配置、会话日志或 skill 产物；这些内容应作为本地运行态并通过 `.gitignore` 排除。

---

## Agent 编排循环

`Agent.run()` 和 `Agent.stream()` 内部结构相同，区别在于后者每步 yield 事件：

```
while turns < maxTurns:
  1. compressor.compress(messages)        // 超长历史压缩（可选）
  2. system = resolveSystem()             // 动态 system prompt 求值
  3. contextMessages = getContext(msgs)   // 临时上下文注入（不写历史）
  4. response = llm.complete({
       system,
       messages: [...messages, ...contextMessages],
       tools,
     })
  5. messages.push(response.message)      // 写入历史
  6. if no toolCalls → break
  7. execute tools in parallel
  8. messages.push(toolResults)
```

`contextMessages` 仅在步骤 4 传入 LLM，不写入 `messages`，因此不会出现在 `AgentRunResult.messages` 中。这是 Agentic Context Engineering 的关键机制：检索结果等临时信息"用完即扔"，不污染历史。

---

## Agentic Context Engineering

### 动态 system prompt

`AgentConfig.system` 类型为 `string | (() => string | Promise<string>)`。

每轮调用前通过 `#resolveSystem()` 求值：优先使用 `updateSystem()` 热注入的函数，其次回退到构造时的 `config.system`。

```ts
async #resolveSystem(): Promise<string> {
  if (this.#systemFn) return this.#systemFn();
  return typeof this.#config.system === "function"
    ? this.#config.system()
    : this.#config.system;
}
```

适用场景：注入当前时间、今日摘要、最新配置、用户偏好等随时间变化的信息。

**热更新：** `agent.updateSystem(fn)` 在运行时替换 system prompt 函数，下一轮对话即使用新 prompt，无需重启。WebUI 设置页保存 Agent 配置后自动调用此方法。

### getContext 钩子

```ts
getContext?: (messages: Message[]) => Message[] | Promise<Message[]>
```

每轮 LLM 调用前执行，接收当前完整历史，返回本轮额外注入的消息。注入消息**不写入历史**，仅影响当次 LLM 决策。

适用场景：
- 根据用户消息内容自动检索记忆库，将命中结果注入
- 根据用户消息内容检索已挂载的飞书文档片段，并把命中片段注入
- 注入当前 Agent 状态、任务上下文
- 实现 RAG push（主动推送检索结果），与工具 `memory_search` 的 RAG pull 互补

当前实现里，`app.ts` / `web/dev.ts` 会把记忆命中和文档命中合并为临时上下文消息，典型段落为：
- `[相关记忆]`
- `[挂载文档资料]`

与此同时，系统提示词会显式要求 Agent 在回答飞书组织问题时优先调用飞书工具，而不是凭空生成部门人数或成员信息。

记忆侧当前只有“自动搜、显式存”两段链路：
- `getContext` 会自动执行 `memoryStorage.search()`，但不会自动写入 `MemoryStorage`
- `memory_save` 是长期记忆唯一写入口，执行路径在 `src/tools/memory.ts`
- 因此 `data/agent/memory.json` 为空通常表示尚未发生显式保存，而不是检索失效
- “重要性”当前不由服务端规则判定，是否调用 `memory_save` 由模型结合 system prompt、工具描述和上下文决定

---

## IM 会话模型

`chatId` 和 `sessionId` 在 IM 场景里职责不同：

- `chatId`：平台真实回包目标，`platform.send(chatId, text)` 仍只认这个值
- `sessionId`：ConversationStorage 的短期历史键
- `continuityId`：同一发言人在同一来源里的会话桥接键

当前规则：
- 飞书普通消息：`sessionId = chatId`
- 飞书线程消息：`sessionId = ${chatId}#thread:<rootId|threadId|parentId>`
- 企业微信：暂时仍按 `chatId` 作为 `sessionId`

`ConversationStorage.loadSession(sessionId, continuityId)` 先读取当前 session 历史；若为空，则回看同 `continuityId` 的最近一个 session，把最后一条用户消息和最后一条助手回复压成一条短参考消息。这样新 session 能自然续上，但不会把旧历史整段搬过去。

---

## 飞书通讯录读取

`FeishuPlatform` 现在同时承担 IM 发送和飞书组织读取两类职责，但实现上仍保持分层：

- `#getAccessToken()` 统一获取 tenant access token
- `#request()` 统一处理 Contact v3 请求、HTTP 错误和 Feishu `code !== 0` 业务错误
- `getBotOpenId()` 查询当前机器人 `open_id`，用于群聊 `@机器人` 精确匹配
- `getDepartment(openDepartmentId)` 读取单个部门详情
- `listDepartmentChildren(parentDepartmentId)` 拉取子部门，可选递归拉全树
- `findDepartmentsByName(keyword)` 基于部门树做本地名称匹配
- `listDepartmentUsers(openDepartmentId)` 拉取直属成员
- `getUser(openId)` 按用户 `open_id` 读取单个飞书用户，用于配置页和 IM 日志里的用户名解析

Agent 工具层 `createFeishuOrgTools(() => feishu)` 使用闭包读取当前运行时的 `FeishuPlatform` 实例，因此：

- 主应用 `app.ts` 和开发入口 `web/dev.ts` 共用同一套工具定义
- WebUI 热更新飞书配置后，无需重建 Agent；工具下一次执行时自动读取新实例
- Web 对话与 IM 对话会得到相同的飞书组织查询能力

## Web Chat 可复制回复

`ChatView` 中的 assistant 气泡现在带有独立复制按钮：

- 仅 assistant 消息显示复制入口，用户消息不显示
- assistant 气泡显式启用文本选择，可直接拖拽选中复制
- 复制内容直接使用 `message.content` 原始文本，避免把 Markdown 渲染产生的额外 UI 文案一并复制
- 复制成功后短暂显示“已复制”，不影响流式渲染和自动滚动

渲染实现上，assistant Markdown 现在包裹在独立的 `.md` 容器中，再把 `ReactMarkdown` 挂进去：

- 避开 `react-markdown` 当前版本对顶层 `className` 透传的不兼容行为
- 让 `user-select: text` 只作用于正文区域，不影响复制按钮
- 真实浏览器中可稳定拖拽选中文本，适用于段落、列表和代码块

## Chat 错误复制与 HTTP 错误透出

`useChatStream` 现在会在读取流之前先检查 `/api/chat` 的 HTTP 状态：

- `resp.ok === false` 时不再继续按 SSE 解析
- 前端会优先读取响应体文本，并尝试从 JSON 里提取 `error` 或 `message`
- 最终错误文案格式为 `HTTP 401 Unauthorized: ...` 这类可读字符串

`EventBadge` 对错误事件做了额外处理：

- 错误卡片头部新增复制按钮
- 复制内容使用完整错误文案，不截断
- 展开后的 `pre` 详情区允许原生文本选择，适合复制长错误或网关返回

## OpenAI 异常响应兜底

`OpenAIProvider.complete()` 现在不再假定返回体里一定有 `choices[0]`：

- 先检查 `response.choices` 是否为数组，再读取首个 choice
- 若缺失 `choices` 或 `choice.message`，改为从 `response.message`、`response.error`、`response.error.message` 中提取可读错误
- 若上游只返回了异常结构，也会抛出 `OpenAI returned an invalid response: ...`，避免退化成 `Cannot read properties of undefined (reading '0')`

这类错误会继续沿用 Chat 页现有的错误卡片和复制能力，方便直接排查 API Key、Base URL 或网关兼容性问题。

这让 WebUI 更适合作为调试台和内容中转页，尤其适合把日报、总结或提示词快速粘贴到其他工具中。

## 飞书目标名称解析接口

WebServer 新增了一个轻量的飞书目标解析链路：

- `GET /api/im-config/feishu-target?chatId=...`
- 优先使用已保存的飞书配置构建 `FeishuPlatform`
- 未保存时回退到环境变量里的飞书凭证
- `oc_...` 目标调用 `getChat()` 返回群聊名称
- `ou_...` 目标调用 `getUser()` 返回用户名
- 其他前缀返回 `unknown`，前端仍保留原始 ID 展示

前端 `FeishuConfigSection` 分别解析：

- 表单里正在编辑的 `Chat ID`
- 当前运行摘要里的 `chatId`

这样既能在输入时即时确认目标，也能在保存后复核运行态实际指向。

## 飞书 IM 日志身份补全

`GET /api/im-log` 现在会在返回前做一层飞书 enrich：

- 飞书事件会优先保留原始 `userId` / `chatId`，并尽量把事件体里可直接拿到的 `userName` 一并落盘
- WebServer 返回日志时，再按需调用 `getUser()` / `getChat()` 补充缺失的 `userName` / `chatName`
- 查询结果带内存缓存，避免 WebUI 轮询时重复打飞书接口
- 前端消息卡片会直接展示 `会话 群名（oc_xxx）` / `用户 用户名（ou_xxx）`；若未解析成功，则显示明确的“未解析用户名 / 群名”占位文案

同一套 enrich 逻辑也被复用到：

- `GET /api/status`：补充飞书默认目标名称，以及最近一条 IM 活动的 `userName` / `chatName`
- `GET /api/cron`：为飞书投递目标补充解析后的用户名 / 群名，供 Cron 列表直接展示

---

## 飞书 Markdown 发送

`IMPlatform` 现在允许平台按需实现可选的 `sendMarkdown(chatId, markdown)` 能力。

飞书实现细节：

- `FeishuPlatform.send()` 先检查内容里是否出现标题、列表、引用、代码块、链接等明显 Markdown 结构
- 命中后改走 `sendMarkdown()`，发送 `msg_type: "post"`
- `content` 使用单个 `md` 节点承载正文，兼容飞书原生 Markdown 渲染
- 若首行是 Markdown 标题，会提取为 `post.zh_cn.title`，剩余正文继续作为 `md` 文本发送

Cron 直发链路也同步支持 `msgType: "markdown"`：

- 当 `direct === true && msgType === "markdown"` 时，`CronScheduler` 优先调用 `platform.sendMarkdown()`
- 未实现 `sendMarkdown()` 的平台继续回退到普通 `send()`，避免破坏跨平台接口

---

## Cron 多目标投递

`CronJobConfig` 现在兼容两种投递字段：

- `chatId`: 旧字段，单目标
- `chatIds`: 新字段，多目标

归一化规则：

- 服务端保存 Cron 时会把两者归一化
- `chatId` 永远保留为第一个目标，兼容旧代码路径
- `chatIds` 保存全部去重后的目标列表

执行规则：

- Agent 只执行一次
- 生成出的同一条回复或同一张图片会依次发送到所有目标
- `sendSkillOutput` 也是按同样的多目标广播逻辑执行
- 飞书里既可以填用户 `ou_...`，也可以填群 `oc_...`
- 仅 `skillId` 的 skill-only Cron 不要求配置 `chatId`

这样可以避免“为了同时发个人和群而复制两条完全相同的 Cron 任务”。

---

## Anthropic Tool Result 编码

此前 Agent 触发工具调用后，内部工具执行结果会直接以普通对象数组写回消息历史；而 Anthropic 要求工具结果必须是标准 `tool_result` block。

修复后链路为：

- `Agent.#executeTools()` 保留 `toolCallId`
- 工具执行结果写入历史时保留 `{ toolCallId, toolName, result }`
- `AnthropicProvider` 在发送前把这层内部结构转换成 `{ type: "tool_result", tool_use_id, content, is_error? }`

这样可以避免代理或 Anthropic API 返回 `invalid_request_error: ... type: Field required`，也就是飞书里“触发了工具后整段对话没回复”的根因。

---

## OpenAI Chat Completions 适配

OpenAI provider 复用同一套内部 `Message` / `ToolCallResult` 结构，但在发请求前需要做两层转换：

- `system` 参数会被转成首条 `developer` message，兼容 OpenAI 最新 Chat Completions 约定
- 内部 `tool` 消息会展开成多条 `role: "tool"` 消息，每条都带 `tool_call_id`

返回阶段则做反向转换：

- OpenAI assistant 文本被标准化为 `{ type: "text", text }` block
- OpenAI `tool_calls` 被标准化为 `{ type: "tool_use", id, name, input }` block

这样做的目的有两个：

- 保持 Agent 编排层完全不知道底层是 Anthropic 还是 OpenAI
- 即使中途切换 provider，历史消息仍能继续复用，不需要做额外迁移

---

## IM 路由短路处理

`ClawServer` 和 `WebServer` 的 IM route 现在支持可选的 `onMessage(message)` 拦截器：

- 返回 `handled: true` 时，本轮请求不会进入 Agent
- 适合实现强约束、可预测的 IM 快捷命令
- 目前用于飞书里的 `daily-digest` 快捷请求
- 飞书群聊会在进入 `onMessage` 前先做 mention-to-bot 判断；未 `@机器人` 时仅记录事件，不触发后续回复

`daily-digest` 快捷处理规则：

- 匹配“给我今天的新闻”“今天新闻文本版”这类短请求
- 解析前会先去掉飞书群聊里的前置 mention，如 `@_user_1 给我今天的新闻`
- 默认返回今日 PNG 图片
- 显式要求“文本版 / Markdown / 文字”时返回今日 Markdown
- 今日文件不存在时先执行一次 `daily-digest` skill
- 生成中请求会复用同一轮 Promise，避免重复起多个日报生成任务

---

## Skills 系统

### 架构设计

Skill 职责收窄为"生成内容 + 保存文件"。IM 投递由 CronScheduler 统一处理，Skill 不感知平台细节。

```
Cron1(skillId)          → skill.run(ctx) → 保存文件，不发 IM
Cron2(sendSkillOutput)  → findLatestSkillPng() → platform.sendImage()

WebUI 手动运行：
onRunSkill → skill.run(ctx) → SkillResult → SSE done + outputPath → 前端加载图片预览
```

生成与投递解耦为两个独立 Cron Job；默认日报模板为 `0 9 * * *` 生成、`0 10 * * *` 发送。

`daily-digest` 模板渲染新增两条轻量规则：

- `pickDeckText(date)`：按日期稳定选一条中文短句，避免封面副标题写死
- `buildSummaryText(selection)`：从已选文章摘要 / 标题提取前两条国内和国际重点，拼成内容型概览

这样 HTML 截图和 Markdown 文本版都会共享同一段“今日摘要”，不会再退化成数量统计。

截图模板另外补了两条稳定性约束：

- 避免在长图主容器和卡片层使用大面积 `blur` / `backdrop-filter`，减少 Playwright 和聊天预览里的合成伪影
- 在 `selectDigestArticles()` 前过滤 `10jqka` / 同花顺来源，确保最终输出不含该来源
- digest 编号按 `selection.all` 全局连续编号，和落盘 JSON 的数组顺序保持一致

飞书 digest 数字回复链路依赖三部分：

- `news-reply` 在 route-level `onMessage` 中优先识别纯数字消息
- 数字识别前会先剥掉飞书群聊里的前置 mention，如 `@_user_1 8`
- 最近一次 digest 上下文通过 `IMEventStorage.replyText` 中的 `[日报图片] YYYY-MM-DD` / `[日报文本] YYYY-MM-DD` 标记回溯
- 命中后直接读取 `data/skills/daily-digest/YYYY-MM-DD.json` 对应下标，返回单独原文链接文本

这样 Cron 发图和用户主动索取 digest 都能复用同一套“回复数字拿链接”逻辑。

### SkillContext / SkillResult

```ts
interface SkillContext {
  agent: Agent;              // LLM 调用
  imEventStorage?: IMEventStorage;
  dataDir?: string;          // 输出目录（如 data/skills/daily-digest）
  log?: (msg: string) => void; // WebUI 实时日志回调
}

interface SkillResult {
  outputPath?: string;       // 生成文件的路径（PNG 截图等）
}
```

### SKILL.md 标准

每个 Skill 子目录包含：
- `SKILL.md` — 元数据 + Agent 指令（YAML frontmatter + markdown body）
- `index.ts` — 执行逻辑（读 SKILL.md，实现 `Skill` 接口）

frontmatter 字段（简化 YAML，无额外依赖）：

```
---
id: daily-digest
description: 浏览器搜索科技新闻，按国内 10 / 国际 5 生成 HTML 日报截图
queries: 中国AI科技,中国创业投资,中国互联网平台,美国OpenAI,美国英伟达AI,硅谷创投,海外互联网监管,全球科技公司
domestic-articles: 10
international-articles: 5
max-articles: 15
max-candidates: 36
---
Agent 指令（支持 $SEARCH_URLS / $MAX_ARTICLES 变量替换）
```

`loadSkillDef(skillDir)` 解析 SKILL.md，返回 `SkillDef`（含 `instructions` 字段为 frontmatter 之后的 markdown body）。
其中 `max-candidates` 用于抽取阶段的候选上限，`domestic-articles` / `international-articles` 用于最终日报配额。
`DailyDigestSkill` 运行时还可从 `ConfigStorage<DailyDigestConfig>` 读取覆盖配置，目前支持在 WebUI 动态修改搜索主题和 Brave Search API Key。

### DailyDigestSkill 执行流程

1. 读取 `SKILL.md` 获得默认搜索词、候选上限和国内/国际配额；若 `data/skills/daily-digest/config.json` 中存在自定义主题，则运行时覆盖默认搜索词
2. 启动 Playwright chromium（headless）
3. 依次请求 Brave Search API 的 `news/search` 接口，使用 `freshness=pw` 限制在过去一周内获取候选新闻结果；国内搜索会额外附带 `country=CN` 与 `search_lang=zh-hans`，并将“国内…”规范化为“中国…”搜索文本；接口通过 `X-Subscription-Token` 读取 `BRAVE_SEARCH_API_KEY`
4. 将 Brave 返回的标题、URL、来源、摘要与时间字段归一化为候选链接，跨关键词去重后先过滤百家号等自媒体 / 黑名单链接，再按国内 / 国际各调用一次 `ctx.agent.llm.complete()`，优先筛出教育、教育科技、AI 教育、教育公司内容，同时保留与教育场景强相关的科技动态，输出为结构化 JSON（`DigestArticle[]`，含 `category`）
5. 解析层先尝试标准 JSON，再兼容 fenced json 和 near-JSON 宽松恢复，避免标题里的未转义引号把整批结果打空
6. 按国内 10 / 国际 5 的配额选出最终 15 篇，并对自媒体来源做硬拦截、对主流媒体和官网做额外加权；同时把 Brave 返回的时间 merge 回最终文章对象，并最佳努力推导 `date: YYYY-MM-DD`
7. 运行时读取 `template.html` / `section.html` / `item.html` / `layout.css`，只填内容，不再在 TS 里硬编码整页 HTML
8. 条目元信息展示层只显示来源；新闻时间仍保留在文章对象中供 JSON 输出与 `date` 推导复用
9. Playwright 截图为 PNG，写入 `data/skills/daily-digest/YYYY-MM-DD.{html,md,png,json}`
10. 返回 `{ outputPath: "data/skills/daily-digest/YYYY-MM-DD.png" }`
11. 由独立的 `sendSkillOutput` Cron Job 调用 `feishu.sendImage(chatId, pngPath)`

其中 HTML 不再由 `index.ts` 直接拼整页结构，而是运行时读取 `src/skills/daily-digest/template.html`、`section.html`、`item.html` 和 `layout.css` 进行模板替换；这样 HTML 模板和 CSS 模板共同成为截图与导出文件的单一版式源。
截图阶段使用 `browser.newContext({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 4 })`，并以 `scale: "device"` 输出 PNG，在不改变版心尺寸的前提下提升清晰度。
`daily-digest` 现在不再依赖浏览器打开新闻搜索页获取候选链接，而是直接调用 Brave 官方新闻搜索 API；Playwright 浏览器只保留在最终 HTML 截图阶段使用。

### Cron 手动执行错误传播

`CronScheduler.runNow()` 在手动执行场景下会把 skill 执行失败继续向上抛出；WebUI 的 `POST /api/cron/:id/run` 因此会返回 `500 + error message`，不再把失败的 `daily-digest-generate` 误报成成功。

### 新闻库数据来源

`GET /api/news` 不再依赖 NewsStorage，改为扫描 `data/skills/*/YYYY-MM-DD.json`，合并排序后分页返回。文件名即日期，`savedAt` 由文件名推导。

---

## NewsStorage / MemoryStorage / ConfigStorage

`NewsStorage` 已移除（Sprint 36）。新闻数据来自 `DailyDigestSkill` 每次运行保存的 `YYYY-MM-DD.json`，`GET /api/news` 直接扫描这些文件。

### MemoryStorage / ConversationStorage / ConfigStorage

- `new MemoryStorage("./data/agent/memory.json")` — 长期记忆，仅保存 `memory_save` 写入的条目
- `new ConversationStorage("./data/im/conversations.json")` — IM session 历史
- `new ConfigStorage<IMConfig>("./data/im/im-config.json")` — IM 凭证
- `new ConfigStorage<LLMConfig>("./data/agent/llm-config.json")` — LLM 配置（provider / apiKey / baseURL / httpsProxy / model）
- `new ConfigStorage<AgentMetaConfig>("./data/agent/agent-config.json")` — Agent 名称和系统提示词
- `new ConfigStorage<MountedDocConfig>("./data/agent/feishu-docs/config.json", { docs: [] })` — 挂载飞书文档配置
- `new ConfigStorage<DailyDigestConfig>("./data/skills/daily-digest/config.json")` — DailyDigest 搜索主题与 Brave Search API Key
- `new ConfigStorage<CronJobConfig[]>("./data/cron/cron-config.json", [])` — Cron 任务配置

ConversationStorage 负责短期 session 历史；MemoryStorage 负责长期共享记忆，两者不会自动互相镜像。也就是说，IM 多轮对话会持久化到 `conversations.json`，但不会自动沉淀到 `memory.json`。各配置文件职责分离，互不干扰。WebServer 通过各自独立的注入点访问，POST 保存后通过回调（`onIMConfig` / `onLLMConfig` / `onAgentConfig`）热更新运行中的服务，无需重启。`LLM_PROVIDER` 环境变量可在未持久化配置时决定默认使用 `anthropic` 还是 `openai`。
运行时通过统一的 `buildAgentSystemPrompt()` 将 `name + systemPrompt + 默认能力说明 + 身份类问答规则` 组装成最终 system prompt，`app.ts` 与 `src/web/dev.ts` 共用同一逻辑。

---

## WebUI 运行概览

`GET /api/status` 现在除了原有的 `connections` / `cronJobs` 外，还会返回服务端即时拼装的 `overview` 字段，供状态页做可视化展示。

`overview` 的数据来源分两层：

- 运行时层：`app.ts` / `web/dev.ts` 通过 `getStatus()` 注入飞书实例是否激活、配置来源（持久化配置或环境变量）、Webhook 路径
- 存储层：`WebServer` 直接读取 `ConfigStorage` / `MemoryStorage` / `IMEventStorage` / `ConversationStorage` / `MountedDocLibrary`，生成配置文件状态、群聊摘要和指标摘要

这样做的好处：

- 状态页不需要逐个请求多个接口再自己拼数据
- 后端能直接感知真实落盘文件状态，而不是只看表单值
- 同一接口同时覆盖“当前实例是否在跑”和“配置文件是否真的写到了磁盘”

`IMEventStorage` 现在除了 ring buffer 事件列表，还会维护一个群聊摘要索引：

- 群聊 key 为 `${platform}:${chatId}`
- `bot_added` 事件会把群标记为 `active: true`
- `bot_removed` 事件会把群标记为 `active: false`
- 普通消息和 cron 事件会刷新 `lastSeen`
- 若事件里带群名，则同步更新 `chatName`

这样状态页可以直接展示“机器人已加入哪些飞书群，以及群名是什么”，不需要再从消息日志倒推。

---

## 工具系统

### defineTool()

```ts
defineTool({
  name: string,
  description: string,
  schema: ZodType,
  execute: (input: z.infer<typeof schema>) => Promise<ToolResult>,
})
```

内联 `zodToJsonSchema()` 将 Zod schema 转换为 JSON Schema，避免引入 `zod-to-json-schema` 依赖。当前支持 `ZodObject / ZodString / ZodNumber / ZodBoolean / ZodOptional`，不覆盖的类型退化为 `{}`。如需更复杂 schema，可替换为完整的转换包。

### 工具工厂模式

`createMemoryTools(storage)` 通过工厂函数注入 storage 依赖，便于测试时替换实例，也支持多 Agent 共享同一个 storage 或各自独立。

---

## WebServer API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/` | GET | SPA 入口（index.html） |
| `/api/chat` | POST | SSE 流式对话，body `{message}` |
| `/api/status` | GET | 系统状态 JSON |
| `/api/news` | GET | 新闻库查询，扫描 `data/skills/*/YYYY-MM-DD.json`，query: `q / page / pageSize` |
| `/api/memory` | GET | 记忆库查询，query: `q / page / pageSize` |
| `/api/skills` | GET | 已注册 Skill 列表（id + description） |
| `/api/skills/:id/run` | POST | 手动触发 Skill，SSE 流式日志 |
| `/api/skills/:id/latest-image` | GET | 返回该 Skill 最新 PNG（`image/png`），404 表示无输出 |
| `/api/im-config` | GET/POST | 飞书等 IM 凭证（读写 `data/im/im-config.json`） |
| `/api/config/llm` | GET/POST | LLM 配置（读写 `data/agent/llm-config.json`） |
| `/api/config/agent` | GET/POST | Agent 配置（读写 `data/agent/agent-config.json`） |
| `/api/config/daily-digest` | GET/POST | DailyDigest 搜索主题与 Brave Search API Key（读写 `data/skills/daily-digest/config.json`） |
| `/api/config/feishu-docs` | GET/POST | 挂载飞书文档配置（读写 `data/agent/feishu-docs/config.json`） |
| `/api/config/feishu-docs/sync` | POST | 用 Playwright 同步飞书文档正文到本地缓存 |
| `/api/cron` | GET/POST/DELETE | Cron 任务 CRUD |
| `/api/cron/:id/run` | POST | 立即执行单条 Cron 任务 |
| `/api/im-log` | GET | IM 事件日志（query: `since=`） |
| `*` | GET | 静态文件或 SPA fallback |

SPA fallback 规则：请求路径无扩展名 → 返回 `index.html`；有扩展名且文件不存在 → 404。

### SSE 事件类型

#### `/api/chat` — 对话流

| 事件 | data 结构 | 说明 |
|------|-----------|------|
| `thinking` | `{text}` | Claude extended thinking 内容（增量） |
| `message` | `{content}` | assistant 文本（增量） |
| `tool_call` | `{toolName, input}` | 工具调用 |
| `tool_result` | `{toolName, result}` | 工具结果 |
| `error` | `{message}` | 错误 |
| `done` | `{result}` | 运行结束 |

#### `/api/skills/:id/run` — Skill 执行日志

| 事件 data 结构 | 说明 |
|----------------|------|
| `{type:"log", text}` | 执行过程日志（浏览器访问、文件保存等） |
| `{type:"done", outputPath?}` | 执行完成；`outputPath` 存在时前端加载图片预览 |
| `{type:"error", error}` | 执行失败 |

---

## Web UI

React 19 + Vite 6 + CSS Modules + TypeScript strict。

**开发服务端口：**
- Vite dev server：`http://localhost:5173`（通过 proxy 转发 `/api/*` 到 `http://localhost:3000`）
- API server（`corepack pnpm dev:api`）：`http://localhost:3000`
- WebServer（生产 app.ts）：`http://localhost:3001`

**五个一级能力域 + 二级 tab（hash 路由）：**

| 一级域 | 二级 tab | URL hash | 组件 | 说明 |
|--------|----------|----------|------|------|
| 对话 | 对话 | `#chat` | `ChatView` | 消息气泡 + 工具事件 + 思考气泡 + 等待动画 |
| 内容 | 新闻库 | `#news` | `NewsView` | 关键词搜索、分页浏览（读 skill JSON 输出） |
| 内容 | 记忆库 | `#memory` | `MemoryView` | 关键词搜索、分页、内容展开/收起，只展示已通过 `memory_save` 落库的条目 |
| 自动化 | Cron | `#cron` | `CronView` | Cron 列表、增删改、立即执行、直发文本 / Markdown / 图片、支持多目标发送 |
| 自动化 | Skills | `#skills` | `SkillsView` | Skill 列表、手动触发、实时执行日志；`daily-digest` 卡片内可直接修改搜索主题 |
| IM | 消息 | `#im` | `IMView` | IM 页默认二级 tab；展示实时 IM 日志、群聊 / 直发筛选 |
| IM | 状态 | `#im-status` | `IMView` | 展示 IM 平台连接、飞书运行摘要、群聊列表，并带右侧 TOC |
| IM | 配置 | `#im-config` | `IMView` | 展示飞书 IM 凭证表单和运行摘要 |
| 系统 | 状态 | `#status` | `StatusView` | 运行概览、最近 IM 活动、配置文件，并带停靠在页面右侧的页内 TOC |
| 系统 | 设置 | `#settings` | `SettingsView` | Agent 配置 / 飞书文档挂载 / Brave Search / LLM 配置，并带停靠在页面右侧的页内 TOC |

URL hash 路由由 `App.tsx` 自行管理（无路由库依赖）：初始化读 `window.location.hash`，将其解析为 `view + subtab` 路由状态；切换一级 tab 时跳到该组默认 hash，切换二级 tab 时更新对应子页 hash，监听 `hashchange` 支持浏览器前进/后退。

`CronView` 通过 `GET /api/cron` 读取配置，`POST /api/cron` 保存，`DELETE /api/cron/:id` 删除，`POST /api/cron/:id/run` 直接触发一次运行；后端再通过 `CronScheduler.runNow()` 复用既有 Skill / IM 投递链路。直发模式下可选择 `text` / `markdown` / `image`，其中 Markdown 会优先走平台的 `sendMarkdown()` 能力。发送目标支持多行输入，保存后会归一化为 `chatId + chatIds`；若是仅执行 Skill 的 Cron，则允许空目标保存。

`ContentView`、`AutomationView`、`SystemView` 负责承载同一一级域下的二级 tab 壳层；`App.tsx` 统一控制其 `activeTab` 和 `onTabChange`，避免子页各自读写 hash 导致路由分散。

`SettingsView`、`StatusView` 以及 `IMView` 的状态子 tab 都会在页面右侧渲染 `SectionToc`，点击后使用 `scrollIntoView()` 在当前 tab 内平滑滚动到目标区块，不修改主 URL hash。

`IMView` 由 `App.tsx` 透传当前二级 tab，并按 tab 类型组织三类数据：

- `状态` 子 tab 读取 `GET /api/status`，展示 IM 平台连接、飞书运行信息和群聊摘要
- `消息` 子 tab 通过 `GET /api/im-log` 首次加载最近事件，再基于 `since=<lastId>` 轮询增量日志；前端只保留最近 50 条，避免单页无限增长
- IM 日志卡片会固定渲染“会话 / 用户”两组身份标签，不再只在名字存在时显示零散 badge；当飞书名字缺失时，界面会明确提示未解析状态
- `配置` 子 tab 读取 `GET /api/im-config` 与 `GET /api/status`，展示飞书 IM 凭证表单和当前运行摘要；保存继续写回 `POST /api/im-config`
- 为兼容旧链接，`#im-status` / `#im-config` 会分别映射到 `IMView` 的 `状态` / `配置` 子 tab

`SettingsView` 的飞书文档区块通过 `GET /api/config/feishu-docs` 读取配置和同步状态，`POST /api/config/feishu-docs` 保存来源列表，`POST /api/config/feishu-docs/sync` 调用 `MountedDocLibrary` 用 Playwright 拉取正文并写入本地缓存。

**关键 hooks：**
- `useChatStream` — SSE 解析、事件状态管理、thinking 块累积
- `useNewsQuery` — `GET /api/news` 封装，参数序列化、loading 状态

**等待指示器（TypingBubble）：** `streaming=true` 且无正在流式输出的 assistant 气泡时显示三点跳动动画，给予即时反馈。

**SkillsView 日志面板：** 手动触发 Skill 后，通过 `fetch` + `ReadableStream` 读取 SSE 流，实时渲染深色终端风格日志，自动滚动到底部。`done` 事件后请求 `GET /api/skills/:id/latest-image` 展示 PNG 预览，加载失败自动隐藏。`daily-digest` 额外在同一卡片内提供搜索主题配置，避免手动运行和配置分散在不同 tab。

---

## 上下文压缩（LLMContextCompressor）

触发条件：估算 token 数（字符数 / 4）超过 `threshold`（默认 6000）。

压缩策略：
1. 保留首条用户消息（维持原始意图）
2. 用 LLM 摘要中间消息
3. 保留最近 `keepRecentPairs × 2` 条消息（默认 4 轮）

摘要消息以 `[Conversation summary — N messages compressed]` 开头，LLM 可感知压缩发生。

---

## 签名验证设计

飞书和企业微信的签名方案不同，`IMVerifyParams` 提供 `method / headers / query / body`，各适配器自行提取所需字段：

- **飞书**：从 `headers` 取签名，SHA256 HMAC + 5 分钟时间窗防重放
- **企业微信**：从 `query` 取签名参数，SHA1 明文验证；消息体 AES-256-CBC 解密

自动过滤 Bot 自发消息（飞书：`sender.sender_type === "app"`；企业微信：`MsgType === "event"`）。

---

## 测试策略

- **单元测试**：Mock LLM / IMPlatform，不访问外网
- **存储测试**：使用 `tmpdir` 临时目录，`afterEach` 清理
- **Web hook 测试**：`port: 0` 随机端口，避免冲突
- **React hook 测试**：`@vitest-environment jsdom` + `@testing-library/react renderHook`
- **覆盖率阈值**：全局 80%

当前测试总数：146 个，全部通过。
