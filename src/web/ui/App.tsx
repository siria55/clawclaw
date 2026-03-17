import { useState } from "react";
import { ChatView } from "./ChatView";
import { InputBar } from "./InputBar";
import { NewsView } from "./NewsView";
import { SettingsView } from "./SettingsView";
import { StatusView } from "./StatusView";
import { useChatStream, loadConfig, saveConfig } from "./useChatStream";
import type { ClawConfig } from "./types";
import styles from "./App.module.css";

type View = "chat" | "news" | "status" | "settings";

export function App(): React.JSX.Element {
  const { entries, streaming, send } = useChatStream();
  const [view, setView] = useState<View>("chat");
  const [config, setConfig] = useState<ClawConfig>(loadConfig);

  const handleConfigChange = (next: ClawConfig): void => {
    setConfig(next);
    saveConfig(next);
  };

  const handleSend = (text: string): void => {
    void send(text, config);
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>⚡</span>
          <span className={styles.name}>clawclaw</span>
          <span className={styles.badge}>debug</span>
        </div>

        <nav className={styles.tabs}>
          <button
            className={`${styles.tab} ${view === "chat" ? styles.tabActive : ""}`}
            onClick={() => setView("chat")}
          >
            对话
          </button>
          <button
            className={`${styles.tab} ${view === "news" ? styles.tabActive : ""}`}
            onClick={() => setView("news")}
          >
            新闻库
          </button>
          <button
            className={`${styles.tab} ${view === "status" ? styles.tabActive : ""}`}
            onClick={() => setView("status")}
          >
            状态
          </button>
          <button
            className={`${styles.tab} ${view === "settings" ? styles.tabActive : ""}`}
            onClick={() => setView("settings")}
          >
            设置
          </button>
        </nav>
      </header>

      {view === "chat" ? (
        <>
          <ChatView entries={entries} streaming={streaming} />
          <InputBar disabled={streaming} onSend={handleSend} />
        </>
      ) : view === "news" ? (
        <NewsView />
      ) : view === "status" ? (
        <StatusView />
      ) : (
        <SettingsView config={config} onChange={handleConfigChange} />
      )}
    </div>
  );
}
