import { useEffect, useState } from "react";
import { ChatView } from "./ChatView";
import { InputBar } from "./InputBar";
import { MemoryView } from "./MemoryView";
import { NewsView } from "./NewsView";
import { SettingsView } from "./SettingsView";
import { SkillsView } from "./SkillsView";
import { StatusView } from "./StatusView";
import { useChatStream } from "./useChatStream";
import styles from "./App.module.css";

type View = "chat" | "news" | "memory" | "skills" | "status" | "settings";

const HASH_TO_VIEW: Record<string, View> = {
  "#chat": "chat",
  "#news": "news",
  "#memory": "memory",
  "#skills": "skills",
  "#status": "status",
  "#settings": "settings",
};

const TAB_LABELS: Record<View, string> = {
  chat: "对话",
  news: "新闻库",
  memory: "记忆库",
  skills: "Skills",
  status: "状态",
  settings: "设置",
};

function getViewFromHash(): View {
  return HASH_TO_VIEW[window.location.hash] ?? "chat";
}

export function App(): React.JSX.Element {
  const { entries, streaming, send } = useChatStream();
  const [view, setView] = useState<View>(getViewFromHash);

  useEffect(() => {
    const onHashChange = (): void => setView(getViewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (v: View): void => { window.location.hash = v; };
  const handleSend = (text: string): void => { void send(text); };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logo}>⚡</span>
          <div className={styles.brandText}>
            <span className={styles.name}>clawclaw</span>
            <span className={styles.badge}>debug</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {(["chat", "news", "memory", "skills", "status", "settings"] as View[]).map((v) => (
            <button
              key={v}
              className={`${styles.tab} ${view === v ? styles.tabActive : ""}`}
              onClick={() => navigate(v)}
            >
              {TAB_LABELS[v]}
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.content}>
        {view === "chat" ? (
          <>
            <ChatView entries={entries} streaming={streaming} />
            <InputBar disabled={streaming} onSend={handleSend} />
          </>
        ) : view === "news" ? (
          <NewsView />
        ) : view === "memory" ? (
          <MemoryView />
        ) : view === "skills" ? (
          <SkillsView />
        ) : view === "status" ? (
          <StatusView />
        ) : (
          <SettingsView />
        )}
      </main>
    </div>
  );
}
