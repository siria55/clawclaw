import { useState } from "react";
import { ChatView } from "./ChatView";
import { InputBar } from "./InputBar";
import { SettingsPanel } from "./SettingsPanel";
import { useChatStream, loadConfig, saveConfig } from "./useChatStream";
import type { ClawConfig } from "./types";
import styles from "./App.module.css";

export function App(): React.JSX.Element {
  const { entries, streaming, send } = useChatStream();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState<ClawConfig>(loadConfig);

  const handleConfigChange = (next: ClawConfig): void => {
    setConfig(next);
    saveConfig(next);
  };

  const handleSend = (text: string): void => {
    void send(text, config);
  };

  const hasConfig = Object.values(config).some(Boolean);

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>⚡</span>
          <span className={styles.name}>clawclaw</span>
          <span className={styles.badge}>debug</span>
        </div>
        <div className={styles.actions}>
          {hasConfig && <span className={styles.configDot} title="已配置自定义 LLM" />}
          <button
            className={`${styles.settingsBtn} ${settingsOpen ? styles.settingsBtnActive : ""}`}
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="设置"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12.05 8a4.58 4.58 0 0 0 .04-.5c0-.17-.01-.34-.04-.5l1.08-.84a.25.25 0 0 0 .06-.32l-1.02-1.77a.25.25 0 0 0-.31-.11l-1.27.51a4.73 4.73 0 0 0-.87-.5l-.19-1.35A.25.25 0 0 0 9.25 2.5h-2.5a.25.25 0 0 0-.25.22l-.19 1.35a4.73 4.73 0 0 0-.87.5L4.17 4.06a.25.25 0 0 0-.31.11L2.84 5.84a.25.25 0 0 0 .06.32L3.98 7c-.02.16-.03.33-.03.5s.01.34.03.5L2.9 8.84a.25.25 0 0 0-.06.32l1.02 1.77c.06.11.2.15.31.11l1.27-.51c.27.18.56.34.87.5l.19 1.35c.03.12.14.22.25.22h2.5c.12 0 .22-.1.25-.22l.19-1.35c.31-.16.6-.32.87-.5l1.27.51c.12.05.25 0 .31-.11l1.02-1.77a.25.25 0 0 0-.06-.32L12.05 8Z"
                fill="currentColor"
              />
            </svg>
            设置
          </button>
        </div>
      </header>

      <ChatView entries={entries} />

      <InputBar disabled={streaming} onSend={handleSend} />

      <SettingsPanel
        open={settingsOpen}
        config={config}
        onChange={handleConfigChange}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
