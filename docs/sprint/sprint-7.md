# Sprint 7 — 新闻搜索与新闻库

**周期**: Sprint 7
**状态**: ✅ 完成

## 目标

搭建新闻搜索 + 持久化存储的完整链路：

1. **新闻库模块** — `src/news/` 提供 `NewsArticle` 数据类型和基于 JSON 文件的持久化存储
2. **Agent 工具** — `save_news` 工具，Agent 在浏览器搜索到新闻后调用，将文章写入新闻库
3. **API 接口** — `GET /api/news` 支持关键词搜索和分页，供 Web UI 调用
4. **Web UI** — 在调试界面新增"新闻库"标签页，可浏览、搜索历史新闻

---

## 架构

```
Browser Tool (Agent 操作浏览器搜索)
    → save_news Tool
    → NewsStorage (JSON 文件)
    → GET /api/news
    → NewsView.tsx
```

Cron 每日触发 → Agent 搜索新闻 → save_news 写入 → 新闻库累积 → Web UI 可查阅

---

## 任务

### 1. `src/news/` 模块

#### `src/news/types.ts`

```ts
export interface NewsArticle {
  id: string;          // nanoid，写入时自动生成
  title: string;
  url: string;
  summary: string;
  source: string;      // 来源，如 "Reuters", "36Kr"
  publishedAt?: string;  // ISO 8601，可选（搜索时不一定能拿到）
  savedAt: string;     // 写入库的时间，ISO 8601
  tags: string[];      // 可为空数组
}

export interface NewsQuery {
  q?: string;          // 关键词，匹配 title + summary
  tag?: string;        // 标签过滤
  page?: number;       // 从 1 开始，默认 1
  pageSize?: number;   // 默认 20，最大 100
}

export interface NewsPage {
  articles: NewsArticle[];
  total: number;
  page: number;
  pageSize: number;
}
```

#### `src/news/storage.ts` — `NewsStorage` 类

- 构造函数接受 `filePath: string`（存储文件路径）
- `save(article: Omit<NewsArticle, "id" | "savedAt">): NewsArticle` — 写入，自动填充 `id`（使用 `crypto.randomUUID()`）和 `savedAt`
- `query(q: NewsQuery): NewsPage` — 内存过滤（文件较小时够用）：
  - 关键词匹配 `title` 和 `summary`（不区分大小写）
  - 标签过滤
  - 分页
  - 按 `savedAt` 降序
- `all(): NewsArticle[]` — 返回全部文章（内部读取文件）
- 文件格式：JSON 数组，每次追加写入（读 → push → 写）

#### `src/news/index.ts` — 公共导出

- [x] `src/news/types.ts`
- [x] `src/news/storage.ts`
- [x] `src/news/index.ts`

---

### 2. Agent 工具 — `src/tools/news.ts`

`save_news` 工具，供 Agent 在搜索到新闻后调用：

```ts
defineTool({
  name: "save_news",
  description: "将搜索到的新闻文章保存到本地新闻库",
  schema: z.object({
    title: z.string(),
    url: z.string(),
    summary: z.string(),
    source: z.string(),
    publishedAt: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  execute: async (input) => { /* 调用 NewsStorage.save() */ }
})
```

工厂函数 `createSaveNewsTool(storage: NewsStorage): Tool` — 将 storage 注入工具。

- [x] `src/tools/news.ts` — `createSaveNewsTool()`
- [x] `src/tools/index.ts` — 导出

---

### 3. Web API — `GET /api/news`

在 `WebServer` 中新增：

- `WebServerConfig.newsStorage?: NewsStorage` — 可选，传入 storage 实例
- `GET /api/news?q=&tag=&page=1&pageSize=20` — 调用 `newsStorage.query()`；未配置时返回空 `NewsPage`
- Response: `Content-Type: application/json`，body 为 `NewsPage`

- [x] `src/web/server.ts` — 新增 `newsStorage` 配置，`GET /api/news` 路由

---

### 4. Web UI — 新闻库标签页

#### 导航：`App.tsx` 新增 tab 切换

Header 增加两个 tab（Chat / 新闻库），替换当前只有聊天的布局：

```
[⚡ clawclaw  debug]    [Chat] [新闻库]    [状态] [设置]
```

- `view` state: `"chat" | "news"`
- 切换 tab 时渲染对应视图

#### `NewsView.tsx` + `NewsView.module.css`

布局：
- 顶部搜索栏（关键词输入、标签过滤 select、搜索按钮）
- 文章列表（卡片式，每张卡：标题 + 来源 badge + 日期 + 摘要预览 + 标签）
- 底部分页（上一页 / 下一页 / 总数显示）
- 点击标题在新 tab 打开原文链接

交互细节：
- 打开标签页时自动加载第一页
- 搜索框 Enter 键触发搜索
- 空状态：无文章时显示友好提示

#### `useNewsQuery.ts` — 封装 `GET /api/news` 查询

```ts
function useNewsQuery(): {
  articles: NewsArticle[];
  total: number;
  loading: boolean;
  query: (params: NewsQueryParams) => void;
}
```

- [x] `src/web/ui/App.tsx` — tab 切换逻辑
- [x] `src/web/ui/App.module.css` — tab 样式
- [x] `src/web/ui/NewsView.tsx` + `NewsView.module.css`
- [x] `src/web/ui/useNewsQuery.ts`

---

### 5. 测试

- [x] `tests/news/storage.test.ts` — `NewsStorage` 单元测试（临时文件，测试后删除）：
  - save 自动生成 id 和 savedAt
  - query 关键词过滤
  - query 标签过滤
  - query 分页
  - query 按 savedAt 降序
- [x] `tests/tools/news.test.ts` — `createSaveNewsTool` 单元测试
- [x] `tests/web/server.test.ts` — `GET /api/news` 路由测试
- [x] `tests/web/useNewsQuery.test.ts` — hook 单元测试（mock fetch）

---

## 验收标准

- [x] Agent 调用 `save_news` 后文章写入 JSON 文件，重启后数据保留
- [x] `GET /api/news?q=关键词` 返回匹配文章，分页正确
- [x] Web UI"新闻库"标签页可搜索、分页浏览历史文章
- [x] 点击文章标题在新 tab 打开原文
- [x] 所有测试通过
