# Sprint 历史总览

所有 sprint 均已完成 ✅。单独的 `sprint-31.md` 到 `sprint-49.md` 已压缩归并到本页，不再保留逐条文档；最新增量保留 `sprint-50.md`、`sprint-51.md`、`sprint-52.md`、`sprint-53.md`、`sprint-54.md`、`sprint-55.md`、`sprint-56.md`、`sprint-57.md`、`sprint-58.md`、`sprint-59.md`、`sprint-60.md`、`sprint-61.md`、`sprint-62.md`、`sprint-63.md`、`sprint-64.md`、`sprint-65.md`、`sprint-66.md`、`sprint-67.md`、`sprint-68.md`、`sprint-69.md`、`sprint-70.md`、`sprint-71.md`、`sprint-72.md`、`sprint-73.md`、`sprint-74.md`、`sprint-75.md`、`sprint-76.md`、`sprint-77.md`、`sprint-78.md`、`sprint-79.md`、`sprint-80.md`、`sprint-81.md`、`sprint-82.md`、`sprint-83.md`、`sprint-84.md`、`sprint-85.md`、`sprint-86.md`。

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

## 第八阶段：页内导航与飞书 Markdown 交付（Sprint 50）

- `状态` / `设置` 长页新增页内 TOC，可在 tab 内跳到对应区块
- 飞书支持 `post + md` 格式发送 Markdown，标题、列表、引用、代码块和链接可直接渲染
- Agent 回复命中明显 Markdown 结构时自动升级为飞书 Markdown 发送
- Cron 直发支持 `markdown` 类型，补齐文本 / Markdown / 图片三种直发方式

## 第九阶段：IM 新闻捷径与工具调用修复（Sprint 51）

- 修复 Anthropic tool call 回传格式，解决飞书里一旦触发工具调用就可能无回复的问题
- 飞书 IM 新增 `daily-digest` 快捷链路：问“给我今天的新闻”默认发今日新闻图片
- 今日日报缺失时会自动执行 `daily-digest` 再发送；显式要文本版时发送 Markdown
- `状态` / `设置` 页内 TOC 改为停靠在页面右侧外沿，避免压在主内容旁边

## 第十阶段：Cron 多目标投递（Sprint 52）

- 飞书 Cron 从单 `chatId` 扩展到多 `chatIds`，一个任务可同时发给个人和群
- Agent 模式、直发模式和 `sendSkillOutput` 都支持多目标广播
- WebUI Cron 表单改成多行发送目标，服务端保存时自动做去重和兼容归一化

## 第十一阶段：日报模板内容化（Sprint 53）

- `daily-digest` 封面副标题改为每日轮换的中文短句，不再写死英文说明
- “今日摘要” 改成基于已选新闻内容生成的概览，不再展示纯数量 chips
- 新闻条目里的 `LOCAL SIGNAL` / `GLOBAL SIGNAL` 被移除，区块眉标题改成中文
- 飞书 Cron 多目标投递继续兼容个人 `ou_` 和群 `oc_` 两类 chat ID

## 第十二阶段：日报截图稳态与来源排除（Sprint 54）

- `daily-digest` 长图去掉高风险滤镜叠层，并压缩 section / item 间距，减少预览中的空白断层观感
- `10jqka` / 同花顺来源从日报最终选稿里直接排除

## 第十三阶段：日报编号回复与原文链接（Sprint 55）

- `daily-digest` 条目编号改成全局连续编号，国内 / 国际分栏之间不再重复
- 飞书里收到 digest 后可直接回复数字，机器人返回对应新闻原文链接
- Cron 发图和 IM 快捷发送都会补一条“回复数字获取链接”的提示

## 第十四阶段：IM 视图拆分（Sprint 56）

- WebUI 将 `状态`、`IM 状态`、`IM` 拆成三个独立 tab，分别承载运行概览、IM 平台状态和消息日志
- 飞书 digest 数字回复改成直接返回单独新闻链接，不再发送详情卡片

## 第十五阶段：IM 导航收敛（Sprint 57）

- WebUI 将侧边栏里的 `IM 状态` / `IM` 合并为单个 `IM` tab，页内再拆 `状态` / `消息` 子 tab
- 旧的 `#im-status` hash 兼容映射到新的 `IM` 页状态子 tab

## 第十六阶段：飞书 mention 数字回复修复（Sprint 58）

- 飞书群聊里的 `@机器人 1` / `@机器人 10` 会正确命中日报数字回复链路
- 日报快捷指令也兼容前置 mention，不再因群聊 @ 机器人而落回普通 Agent

## 第十七阶段：IM 配置并入 IM 大 tab（Sprint 59）

- `IM` 大 tab 新增 `配置` 子 tab，承载飞书 IM 凭证和运行摘要
- `设置` 页移除飞书 IM 配置，避免 IM 相关内容分散在两个一级 tab

## 第十八阶段：导航信息架构重整（Sprint 60）

- WebUI 一级 tab 重构为 `对话` / `内容` / `自动化` / `IM` / `系统`
- `内容`、`自动化`、`系统` 通过二级 tab 承载原来的单页入口，旧 hash 继续兼容

## 第十九阶段：DailyDigest 配置与执行收拢（Sprint 61）

- `daily-digest` 的搜索主题配置并入 `自动化 > Skills` 的同一卡片
- `设置` 页移除 `DailyDigest` 独立区块，保留系统级配置
- `daily-digest` 现在可在同一处完成配置、手动运行、日志查看和截图预览

## 第二十阶段：GitHub 与跨机器准备（Sprint 62）

- 新增根目录 `README.md`，明确另一台电脑的最短启动路径
- `.env.example` 和使用文档补齐 `corepack pnpm` 与 Playwright 浏览器安装步骤
- `data/` 改回本地运行态目录，不再作为 Git 仓库内容同步
- 删除 `package-lock.json`，统一只保留 `pnpm-lock.yaml`

## 第二十一阶段：OpenAI ChatGPT 接入（Sprint 63）

- 新增 OpenAI Chat Completions provider，支持 API Key、Base URL、HTTPS Proxy、模型名配置
- WebUI `系统 > 设置 > 模型` 可直接切换 `Anthropic Claude` / `OpenAI ChatGPT`
- 运行时热更新和 `X-Claw-Config` 临时覆盖均兼容 provider 切换
- `.env` 新增 `LLM_PROVIDER`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`

## 第二十二阶段：对话复制与飞书目标名展示（Sprint 64）

- `对话` 页中的 assistant 回复新增一键复制按钮，复制内容为原始文本
- `IM > 配置` 中的飞书 `Chat ID` 会自动解析目标名称，支持显示群名或用户名
- 飞书运行摘要也会补充当前目标名称，便于确认配置是否指向正确的私聊或群聊

## 第二十三阶段：对话复制浏览器修复（Sprint 65）

- 修复 Chat 页左侧 assistant 回复在真实浏览器中无法拖拽选中复制的问题
- assistant Markdown 改为包裹在独立正文容器中渲染，兼容当前 `react-markdown` 运行时约束
- 复制按钮继续保留，但不再影响正文区的原生文本选择

## 第二十四阶段：错误复制与 HTTP 状态展示（Sprint 66）

- Chat 页中的错误卡片新增复制按钮，方便直接带走 `401` 等失败信息
- `/api/chat` 的非 2xx 响应会显示 `HTTP 状态码 + 服务端返回内容`
- 错误详情区允许原生选中复制，便于排查认证或网关问题

## 第二十五阶段：OpenAI 异常响应兜底（Sprint 67）

- 修复 OpenAI provider 在异常响应里直接读取 `choices[0]` 导致的 `reading '0'` 报错
- 当上游网关返回非标准成功体或错误 JSON 时，优先透出其中的 `message` / `error`
- Chat 页继续沿用错误复制能力，可直接复制真实上游错误

## 第二十六阶段：飞书群聊 `@` 回复与日志身份展示（Sprint 68）

- 飞书群聊消息现在只有在明确 `@机器人` 时才会继续进入 `onMessage` / Agent 回复链路
- 未 `@` 机器人的群消息仍会保留在 IM 日志中，便于排查和回看
- `IM > 消息` 会补充展示飞书发言人的用户名，并在缺失时补查群名

## 第二十七阶段：WebUI 飞书名称补全（Sprint 69）

- `系统状态` 的最近一条 IM 活动会显示飞书会话名和用户名
- `IM > 状态` 的飞书运行摘要会补充默认目标名称
- `自动化 > Cron` 的投递目标会显示“用户名 / 群名 + 原始 ID”

## 第二十八阶段：日报双 Cron 默认模板（Sprint 70）

- 默认日报 Cron 改为两段式：`9:00` 先执行 `daily-digest`，`10:00` 再发送到飞书
- `skillId` 类型的 skill-only Cron 不再强制要求填写发送目标
- `dev:web` 与主应用入口统一默认 Cron 种子逻辑，避免两套运行时行为不一致

## 第二十九阶段：IM 身份展示补强（Sprint 71）

- `IM > 消息` 改成直接显示 `用户名 / 群名 + 原始 ID`，不再只露出零散小标签
- 飞书消息解析会优先把事件体里可直接拿到的用户名落盘，减少页面对额外查询权限的依赖
- 若飞书身份没解析出来，页面会明确显示“未解析用户名 / 群名”，避免误以为前端没刷新

## 第三十阶段：日报条目新闻时间（Sprint 72）

- `daily-digest` 会尽量从百度新闻搜索结果里提取每条新闻的时间信息
- 日报条目元信息改为显示“来源 + 新闻时间”
- JSON / Markdown 输出会一起携带新闻时间，便于后续复用

## 第三十一阶段：日报新闻源收紧（Sprint 73）

- `daily-digest` 候选阶段会先过滤百家号等自媒体 / 聚合号链接
- 最终入选阶段会继续拦截百家号、搜狐号、网易号、企鹅号、头条号等自媒体来源
- 主流媒体、公司官网和权威发布会获得更高排序优先级，尽量减少弱来源混入

## 第三十二阶段：日报 JSON 发布日期（Sprint 74）

- `daily-digest` 的 JSON 输出新增 `date` 字段，表示新闻发布日期
- `publishedAt` 继续保留原始时间文本，`date` 则尽量归一化为 `YYYY-MM-DD`
- 对“昨天 / 前天 / 几小时前 / 几分钟前”这类相对时间，系统会按日报生成日期做最佳努力换算

## 第三十三阶段：日报生成落盘修复（Sprint 75）

- 修复 `daily-digest-generate` 在 Playwright 搜索结果提取阶段触发的浏览器上下文错误，恢复正常落盘
- 手动执行 skill-only Cron 失败时，错误会继续返回给 WebUI，不再被静默吞掉
- `daily-digest-generate` 生成成功后，文件会落到 `data/skills/daily-digest/`

## 第三十四阶段：日报切换 Brave Search（Sprint 76）

- `daily-digest` 候选新闻搜索改用 Brave Search API 的新闻接口，不再依赖百度新闻页面抓取
- Brave 返回的来源、摘要、时间元信息会继续接入后续的过滤、时间展示和 `date` 推导链路
- 运行 `daily-digest` 时需要提供 `BRAVE_SEARCH_API_KEY`

## 第三十五阶段：Brave Key WebUI 配置（Sprint 77）

- `系统 > 设置` 新增 `Brave Search API Key` 配置区块
- Brave Key 会保存到 `data/skills/daily-digest/config.json`
- `daily-digest` 运行时优先读取 WebUI 保存的 key，未配置时回退到环境变量 `BRAVE_SEARCH_API_KEY`

## 第三十六阶段：日报 24 小时时效筛选（Sprint 78）

- `daily-digest` 的 Brave News Search 请求增加 `freshness=pd`，默认只搜过去 24 小时内的新闻
- 运行日志和文档说明统一改为“过去 24 小时”口径
- 保持现有自媒体过滤、主流媒体优先和发布日期归一化链路不变

## 第三十七阶段：日报结果隐藏新闻时间（Sprint 79）

- `daily-digest` 生成的 HTML / PNG / Markdown 条目不再展示新闻时间
- 内部 `publishedAt` 与 `date` 数据继续保留，供 JSON 输出和后续链路复用
- 文档说明统一改为“展示层隐藏时间，数据层保留时间”

## 第三十八阶段：日报时效窗口扩展到一周（Sprint 80）

- `daily-digest` 的 Brave News Search 请求由 `freshness=pd` 调整为 `freshness=pw`
- 默认搜索范围从“过去 24 小时”调整为“过去一周”
- 运行日志、测试和文档说明统一改为“过去一周”口径

## 第三十九阶段：日报筛选切向教育优先（Sprint 81）

- `daily-digest` 的 LLM 筛选口径调整为优先保留教育、教育科技、AI 教育、教育公司内容
- 泛科技新闻只有在与教育行业、教育场景、教育产品或教育公司明显相关时才保留
- 搜索词、Brave 接口、自媒体过滤和 JSON 输出链路保持不变

## 第四十阶段：国内搜索明确收敛到中国（Sprint 82）

- `daily-digest` 国内搜索的查询文本由模糊“国内…”口径收敛为明确“中国…”
- Brave 的国内新闻请求增加 `country=CN` 与 `search_lang=zh-hans`
- 这样即使用户配置里仍写 `国内AI科技`，运行时也会按中国语境搜索

## 第四十一阶段：身份类问答优先读 Agent 配置（Sprint 83）

- 运行时 system prompt 会显式注入 Agent 名称与自定义身份设定
- 当用户问“你谁 / 你叫什么 / 你是做什么的”时，模型被明确要求优先依据这些配置回答
- `app.ts` 与 `src/web/dev.ts` 共用同一套 system prompt 组装逻辑

## 第四十二阶段：Brave 搜索配置独立页（Sprint 84）

- `自动化` 下新增 `搜索` 子 tab，统一管理 Brave Search API Key 和 `daily-digest` 搜索主题
- 新增 `#search` hash，并兼容旧的 `#search-config` 直达入口
- 搜索配置继续持久化到 `data/skills/daily-digest/config.json`

## 第四十三阶段：Brave 参数可视化配置（Sprint 85）

- 按 Brave 官方 `news/search` 文档，把关键请求参数映射到 WebUI `自动化 > 搜索`
- 新增 `count / offset / freshness / safesearch / ui_lang / spellcheck / extra_snippets / goggles` 与国内 / 国际 `country / search_lang` 配置
- 这些参数继续持久化到 `data/skills/daily-digest/config.json`

## 第四十四阶段：国际语言口径收紧（Sprint 86）

- `daily-digest` 国际区块只保留中文 / 英文内容
- 明显为日文、韩文等其他语言的国际文章会在最终入选阶段被拦截
- 抽取提示词与最终筛选规则同步收紧

---

## 当前落点

- WebUI 一级导航为 5 个大 tab：`对话` / `内容` / `自动化` / `IM` / `系统`
- 仓库根目录已提供 GitHub 友好的 `README.md` 和新机器启动步骤
- 运行态数据统一保存在本地 `data/`，不再跟随仓库提交
- LLM 现已支持 `Anthropic Claude` 和 `OpenAI ChatGPT` 两条接入路径
- `对话` 页里的 AI 回复现已支持一键复制
- `对话` 页里的 AI 回复现已支持直接拖拽选中复制，浏览器原生复制链路已修复
- `对话` 页里的错误卡片现已支持复制，`401` 等报错会保留状态码与服务端错误内容
- OpenAI / 代理网关返回异常 JSON 时，不再退化成 `Cannot read properties of undefined (reading '0')`
- `内容` 内部为 `新闻库` / `记忆库`
- `自动化` 内部为 `Cron` / `Skills` / `搜索`
- `IM` 内部为 `状态` / `消息` / `配置`
- `系统` 内部为 `状态` / `设置`
- `#status` / `#settings` 以及 `#im-status` 等旧 hash 仍兼容到新的二级页
- 新闻库来自 `data/skills/*/YYYY-MM-DD.json`
- 长期记忆来自 `data/agent/memory.json`，仅保存 `memory_save` 显式写入的内容
- 飞书文档挂载、飞书组织读取、Cron 立即执行、飞书群聊可视化均已可用
- 飞书回复已支持 Markdown 渲染，Cron 直发可选 `text` / `markdown` / `image`
- 飞书里问“给我今天的新闻”会优先收到今日日报图片；文本版可显式索取
- 飞书 Cron 已支持同一任务同时投递到多个 chat / 群
- `daily-digest` 的搜索主题配置、手动运行、日志和图片预览已收拢到 `自动化 > Skills > daily-digest`
- Brave 搜索相关配置现已统一收拢到 `自动化 > 搜索`，可集中维护搜索主题、`Brave Search API Key` 和 Brave `news/search` 参数
- 今日日报封面会轮换一句中文短句，“今日摘要”展示内容概览而不是数量统计
- 今日日报长图已收紧版式并移除高风险滤镜层，同花顺来源不会进入最终结果
- 今日日报支持回复数字获取原文链接，编号与当天 JSON 输出顺序一致，返回内容为单独链接
- 飞书群聊里带 mention 的数字回复和新闻快捷指令也已兼容
- 飞书群聊里只有 `@机器人` 的消息才会触发回复，普通群消息仅记录日志不自动接话
- `IM > 消息` 里的飞书记录会同时展示群名和发言人用户名，排查来源更直接
- `系统状态` 和 `自动化 > Cron` 中出现的飞书 `ou_...` / `oc_...` 现在也会同时展示对应用户名 / 群名
- `IM > 配置` 里填写飞书 `Chat ID` 时，会同时显示解析后的用户名 / 群名，减少配错目标的风险
- 默认 `daily-digest` Cron 现在会自动初始化为 `9:00 生成 / 10:00 发送`
- Skill-only Cron 允许空发送目标，适合只生成文件、不直接投递的自动化任务
- `IM > 消息` 现在会直接显示 `会话 群名（oc_xxx）` / `用户 用户名（ou_xxx）`；若当前飞书权限不足，也会明确提示未解析状态
- `daily-digest` 的新闻条目现在会显示来源与新闻时间；若搜索结果没带稳定时间，则该条仅显示来源
- `daily-digest` 现在会优先使用主流媒体和官网来源，百家号等自媒体不会进入最终日报
- `daily-digest` 的 JSON 现在会额外带上结构化 `date` 字段，便于后续新闻库和自动化链路复用
- `daily-digest-generate` 的手动执行链路已修复，当前会正常生成 `.html / .md / .png / .json` 到 `data/skills/daily-digest/`
- `daily-digest` 的候选新闻搜索现已切到 Brave Search API，浏览器只保留给最终截图使用
- Brave Search API Key 现在可直接在 WebUI 中配置，不再只能依赖环境变量
- Brave `news/search` 的关键参数现在也可直接在 WebUI 中配置，并持久化到本地 `./data`
- `daily-digest` 现在默认只检索过去一周内的新闻，兼顾时效性和候选覆盖面
- `daily-digest` 生成结果现在只显示来源，不再显示新闻时间；JSON 仍保留 `publishedAt` / `date`
- `daily-digest` 现在会优先筛出教育、教育科技、AI 教育、教育公司内容，同时保留与教育强相关的科技动态
- `daily-digest` 的国内搜索现在会明确使用中国语境，不再把“国内”交给 Brave 自行歧义解释；国内请求会附带 `country=CN` 与 `search_lang=zh-hans`
- `daily-digest` 国际区块现在只保留中文 / 英文内容，日文、韩文等其他语言会在最终入选前被过滤
- Agent 现在会优先按 WebUI 中配置的名称和系统提示词回答“你谁 / 你叫什么 / 你是做什么的”
