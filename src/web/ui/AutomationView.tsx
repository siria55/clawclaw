import { CronView } from "./CronView";
import { SearchConfigView } from "./SearchConfigView";
import { SkillsView } from "./SkillsView";
import styles from "./HubView.module.css";

export type AutomationTab = "cron" | "skills" | "search";

interface AutomationViewProps {
  activeTab: AutomationTab;
  onTabChange: (tab: AutomationTab) => void;
}

export function AutomationView(props: AutomationViewProps): React.JSX.Element {
  return (
    <div className={styles.page}>
      <div className={styles.subNav}>
        <button
          type="button"
          className={`${styles.subTab} ${props.activeTab === "cron" ? styles.subTabActive : ""}`}
          onClick={() => props.onTabChange("cron")}
        >
          Cron
        </button>
        <button
          type="button"
          className={`${styles.subTab} ${props.activeTab === "skills" ? styles.subTabActive : ""}`}
          onClick={() => props.onTabChange("skills")}
        >
          Skills
        </button>
        <button
          type="button"
          className={`${styles.subTab} ${props.activeTab === "search" ? styles.subTabActive : ""}`}
          onClick={() => props.onTabChange("search")}
        >
          搜索
        </button>
      </div>
      <div className={styles.panel}>
        {props.activeTab === "cron"
          ? <CronView />
          : props.activeTab === "skills"
          ? <SkillsView />
          : <SearchConfigView />}
      </div>
    </div>
  );
}
