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
  apiKey?: string;
  baseURL?: string;
  httpsProxy?: string;
  model?: string;
}

/** Persisted application configuration (all sections optional). */
export interface IMConfig {
  feishu?: FeishuConfig;
  llm?: LLMConfig;
}
