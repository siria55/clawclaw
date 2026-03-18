# Sprint 20 — data/ 目录分类

**状态**: ✅ 完成

**目标**：将 `data/` 下的文件按模块分到子目录，便于管理和备份。

## 目录结构

```
data/
  agent/
    memory.json
    news.json
    llm-config.json
    agent-config.json
  im/
    im-config.json
    im-events.json
    conversations.json
  cron/
    cron-config.json
```

## 任务

- [x] `app.ts`：更新所有文件路径 + mkdirSync 子目录
- [x] `dev.ts`：同上
- [x] typecheck + tests 通过

## 迁移旧数据

如果 `data/` 下已有旧文件，手动迁移：

```bash
mkdir -p data/agent data/im data/cron
mv data/memory.json data/agent/ 2>/dev/null
mv data/news.json data/agent/ 2>/dev/null
mv data/llm-config.json data/agent/ 2>/dev/null
mv data/agent-config.json data/agent/ 2>/dev/null
mv data/im-config.json data/im/ 2>/dev/null
mv data/im-events.json data/im/ 2>/dev/null
mv data/conversations.json data/im/ 2>/dev/null
mv data/cron-config.json data/cron/ 2>/dev/null
```
