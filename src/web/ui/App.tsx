import { useEffect, useState } from "react";
import { AutomationView, type AutomationTab } from "./AutomationView";
import { ChatView } from "./ChatView";
import { ContentView, type ContentTab } from "./ContentView";
import { IMView, type IMSubTab } from "./IMView";
import { InputBar } from "./InputBar";
import { SystemView, type SystemTab } from "./SystemView";
import { useChatStream } from "./useChatStream";
import styles from "./App.module.css";

type View = "chat" | "content" | "automation" | "im" | "system";

interface RouteState {
  view: View;
  contentTab: ContentTab;
  automationTab: AutomationTab;
  imTab: IMSubTab;
  systemTab: SystemTab;
}

const DEFAULT_ROUTE: RouteState = {
  view: "chat",
  contentTab: "news",
  automationTab: "cron",
  imTab: "messages",
  systemTab: "status",
};

const VIEWS: View[] = ["chat", "content", "automation", "im", "system"];

const TAB_LABELS: Record<View, string> = {
  chat: "对话",
  content: "内容",
  automation: "自动化",
  im: "IM",
  system: "系统",
};

const DEFAULT_HASH_BY_VIEW: Record<View, string> = {
  chat: "#chat",
  content: "#news",
  automation: "#cron",
  im: "#im",
  system: "#status",
};

function getRouteFromHash(hash: string): RouteState {
  switch (hash) {
    case "#news":
      return { ...DEFAULT_ROUTE, view: "content", contentTab: "news" };
    case "#memory":
      return { ...DEFAULT_ROUTE, view: "content", contentTab: "memory" };
    case "#skills":
      return { ...DEFAULT_ROUTE, view: "automation", automationTab: "skills" };
    case "#cron":
      return { ...DEFAULT_ROUTE, view: "automation", automationTab: "cron" };
    case "#im-status":
      return { ...DEFAULT_ROUTE, view: "im", imTab: "status" };
    case "#im-config":
      return { ...DEFAULT_ROUTE, view: "im", imTab: "config" };
    case "#im":
      return { ...DEFAULT_ROUTE, view: "im", imTab: "messages" };
    case "#settings":
      return { ...DEFAULT_ROUTE, view: "system", systemTab: "settings" };
    case "#status":
      return { ...DEFAULT_ROUTE, view: "system", systemTab: "status" };
    default:
      return DEFAULT_ROUTE;
  }
}

function getHashForContentTab(tab: ContentTab): string {
  return tab === "memory" ? "#memory" : "#news";
}

function getHashForAutomationTab(tab: AutomationTab): string {
  return tab === "skills" ? "#skills" : "#cron";
}

function getHashForIMTab(tab: IMSubTab): string {
  if (tab === "status") return "#im-status";
  if (tab === "config") return "#im-config";
  return "#im";
}

function getHashForSystemTab(tab: SystemTab): string {
  return tab === "settings" ? "#settings" : "#status";
}

export function App(): React.JSX.Element {
  const { entries, streaming, send } = useChatStream();
  const [route, setRoute] = useState<RouteState>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = (): void => setRoute(getRouteFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (view: View): void => { window.location.hash = DEFAULT_HASH_BY_VIEW[view]; };
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
          {VIEWS.map((v) => (
            <button
              key={v}
              className={`${styles.tab} ${route.view === v ? styles.tabActive : ""}`}
              onClick={() => navigate(v)}
            >
              {TAB_LABELS[v]}
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.content}>
        {route.view === "chat" ? (
          <>
            <ChatView entries={entries} streaming={streaming} />
            <InputBar disabled={streaming} onSend={handleSend} />
          </>
        ) : (
          <RouteView route={route} />
        )}
      </main>
    </div>
  );
}

function RouteView(props: { route: RouteState }): React.JSX.Element {
  if (props.route.view === "content") {
    return (
      <ContentView
        activeTab={props.route.contentTab}
        onTabChange={(tab) => { window.location.hash = getHashForContentTab(tab); }}
      />
    );
  }

  if (props.route.view === "automation") {
    return (
      <AutomationView
        activeTab={props.route.automationTab}
        onTabChange={(tab) => { window.location.hash = getHashForAutomationTab(tab); }}
      />
    );
  }

  if (props.route.view === "im") {
    return (
      <IMView
        activeTab={props.route.imTab}
        onTabChange={(tab) => { window.location.hash = getHashForIMTab(tab); }}
      />
    );
  }

  return (
    <SystemView
      activeTab={props.route.systemTab}
      onTabChange={(tab) => { window.location.hash = getHashForSystemTab(tab); }}
    />
  );
}
