/** Feishu (Lark) IM platform credentials stored in im-config.json. */
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  verificationToken: string;
  /** Optional: enables request signature verification when set. */
  encryptKey?: string;
  /** Optional: target chat ID for CronScheduler delivery. */
  chatId?: string;
}

/** LLM provider configuration saved server-side. */
export interface LLMConfig {
  provider?: "anthropic" | "openai";
  apiKey?: string;
  baseURL?: string;
  httpsProxy?: string;
  model?: string;
}

/** Persisted IM platform configuration (all platforms optional). */
export interface IMConfig {
  feishu?: FeishuConfig;
}

/** One mounted Feishu/Lark doc source configured in WebUI. */
export interface MountedDocSource {
  id: string;
  title: string;
  url: string;
  enabled: boolean;
}

/** Persisted mounted-doc config saved server-side. */
export interface MountedDocConfig {
  docs?: MountedDocSource[];
}

/** Agent persona and system prompt configurable from WebUI. */
export interface AgentMetaConfig {
  name?: string;
  systemPrompt?: string;
  /** Paths the agent is allowed to read via read_file tool (default: ["./data/skills"]). */
  allowedPaths?: string[];
}

/** DailyDigest skill runtime settings configurable from WebUI. */
export interface DailyDigestConfig {
  /** Search topics used by the skill. One query per search request. */
  queries?: string[];
}
