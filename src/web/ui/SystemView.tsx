import { SettingsView } from "./SettingsView";
import { StatusView } from "./StatusView";
import styles from "./HubView.module.css";

export type SystemTab = "status" | "settings";

interface SystemViewProps {
  activeTab: SystemTab;
  onTabChange: (tab: SystemTab) => void;
}

export function SystemView(props: SystemViewProps): React.JSX.Element {
  return (
    <div className={styles.page}>
      <div className={styles.subNav}>
        <button
          type="button"
          className={`${styles.subTab} ${props.activeTab === "status" ? styles.subTabActive : ""}`}
          onClick={() => props.onTabChange("status")}
        >
          状态
        </button>
        <button
          type="button"
          className={`${styles.subTab} ${props.activeTab === "settings" ? styles.subTabActive : ""}`}
          onClick={() => props.onTabChange("settings")}
        >
          设置
        </button>
      </div>
      <div className={styles.panel}>
        {props.activeTab === "status" ? <StatusView /> : <SettingsView />}
      </div>
    </div>
  );
}
