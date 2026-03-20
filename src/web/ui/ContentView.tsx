import { MemoryView } from "./MemoryView";
import { NewsView } from "./NewsView";
import styles from "./HubView.module.css";

export type ContentTab = "news" | "memory";

interface ContentViewProps {
  activeTab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
}

export function ContentView(props: ContentViewProps): React.JSX.Element {
  return (
    <div className={styles.page}>
      <div className={styles.subNav}>
        <button
          type="button"
          className={`${styles.subTab} ${props.activeTab === "news" ? styles.subTabActive : ""}`}
          onClick={() => props.onTabChange("news")}
        >
          新闻库
        </button>
        <button
          type="button"
          className={`${styles.subTab} ${props.activeTab === "memory" ? styles.subTabActive : ""}`}
          onClick={() => props.onTabChange("memory")}
        >
          记忆库
        </button>
      </div>
      <div className={styles.panel}>
        {props.activeTab === "news" ? <NewsView /> : <MemoryView />}
      </div>
    </div>
  );
}
