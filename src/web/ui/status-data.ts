export interface ConnectionStatus {
  platform: string;
  label: string;
  connected: boolean;
}

export interface RuntimeFeishuStatus {
  configured: boolean;
  active: boolean;
  source: "storage" | "env" | "none";
  webhookPath: string;
}

export interface StatusMetric {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

export interface StatusFile {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  summary: string;
  updatedAt?: string;
  sizeBytes?: number;
}

export interface StatusOverview {
  feishu: {
    runtime: RuntimeFeishuStatus;
    configuredInStorage: boolean;
    appId?: string;
    chatId?: string;
    hasAppSecret: boolean;
    hasVerificationToken: boolean;
    hasEncryptKey: boolean;
    permissionsHint: string;
  };
  metrics: StatusMetric[];
  configFiles: StatusFile[];
  chats: Array<{
    platform: string;
    chatId: string;
    chatName?: string;
    active: boolean;
    joinedAt?: string;
    lastSeen: string;
    lastEventType: "message" | "bot_added" | "bot_removed" | "cron";
  }>;
  lastIMEvent?: {
    platform: string;
    chatId: string;
    userId: string;
    timestamp: string;
    textPreview: string;
  };
}

export interface SystemStatus {
  connections: ConnectionStatus[];
  overview?: StatusOverview;
}

export interface IMEvent {
  id: string;
  platform: string;
  userId: string;
  chatId: string;
  chatName?: string;
  eventType?: "message" | "bot_added" | "bot_removed" | "cron";
  text: string;
  replyText: string | undefined;
  timestamp: string;
}

export async function fetchStatus(): Promise<SystemStatus> {
  const res = await fetch("/api/status");
  if (!res.ok) return { connections: [] };
  return res.json() as Promise<SystemStatus>;
}

export async function fetchIMLog(since?: string): Promise<{ events: IMEvent[]; total: number }> {
  const url = since ? `/api/im-log?since=${since}` : "/api/im-log";
  const res = await fetch(url);
  if (!res.ok) return { events: [], total: 0 };
  return res.json() as Promise<{ events: IMEvent[]; total: number }>;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "未落盘";
  return new Date(iso).toLocaleString("zh-CN");
}

export function formatSize(sizeBytes: number | undefined): string {
  if (sizeBytes === undefined) return "-";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`;
}

export function describeFeishuSource(source: RuntimeFeishuStatus["source"]): string {
  if (source === "storage") return "来自已保存配置";
  if (source === "env") return "来自环境变量";
  return "未启用";
}

export function describeEventType(
  eventType: IMEvent["eventType"] | StatusOverview["chats"][number]["lastEventType"],
): string {
  switch (eventType) {
    case "bot_added":
      return "机器人进群";
    case "bot_removed":
      return "机器人退群";
    case "cron":
      return "Cron";
    default:
      return "消息";
  }
}
