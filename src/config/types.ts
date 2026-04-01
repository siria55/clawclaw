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

export type BraveSearchSafeSearch = "off" | "moderate" | "strict" | "";

/** Brave `news/search` query parameters used by daily-digest. */
export interface BraveSearchRequestConfig {
  count?: number;
  offset?: number;
  freshness?: string;
  spellcheck?: boolean;
  safesearch?: BraveSearchSafeSearch;
  uiLang?: string;
  extraSnippets?: boolean;
  goggles?: string[];
}

/** Brave `news/search` region / language parameters for one query scope. */
export interface BraveSearchScopeConfig {
  country?: string;
  searchLang?: string;
}

/** Brave `news/search` config grouped by common params and domestic/international overrides. */
export interface BraveSearchConfig {
  request?: BraveSearchRequestConfig;
  domestic?: BraveSearchScopeConfig;
  international?: BraveSearchScopeConfig;
}

/** Supported news search engine backends. */
export type NewsSearchSource = "brave" | "bing" | "bocha";

/** Bocha `web-search` request parameters. */
export type BochaFreshness = "24h" | "7d" | "30d" | "oneYear" | "noLimit";

/** Bocha `web-search` config grouped by request params. */
export interface BochaSearchConfig {
  count?: number;
  freshness?: BochaFreshness;
  summary?: boolean;
}

/** DailyDigest skill runtime settings configurable from WebUI. */
export interface DailyDigestConfig {
  /** Search topics used by the skill. One query per search request. */
  queries?: string[];
  /** Brave Search API key used by daily-digest when configured from WebUI. */
  braveSearchApiKey?: string;
  /** Bing News Search API key (Azure Cognitive Services). */
  bingSearchApiKey?: string;
  /** Bocha Web Search API key (bochaai.com). */
  bochaSearchApiKey?: string;
  /** News search engine for domestic queries. Default: "brave". */
  domesticSource?: NewsSearchSource;
  /** News search engine for international queries. Default: "brave". */
  internationalSource?: NewsSearchSource;
  /** Brave `news/search` request parameters configurable from WebUI. */
  braveSearch?: BraveSearchConfig;
  /** Bocha `web-search` request parameters configurable from WebUI. */
  bochaSearch?: BochaSearchConfig;
}
