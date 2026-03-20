import { CronView } from "./CronView";
import { SkillsView } from "./SkillsView";
import styles from "./HubView.module.css";

export type AutomationTab = "cron" | "skills";

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
      </div>
      <div className={styles.panel}>
        {props.activeTab === "cron" ? <CronView /> : <SkillsView />}
      </div>
    </div>
  );
}
