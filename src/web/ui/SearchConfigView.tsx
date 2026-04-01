import { useEffect, useRef, useState } from "react";
import { mergeBraveSearchConfig } from "../../config/daily-digest.js";
import type { BraveSearchConfig, BraveSearchSafeSearch, DailyDigestConfig, NewsSearchSource } from "../../config/types.js";
import styles from "./SearchConfigView.module.css";

const BRAVE_DOC_URL = "https://api-dashboard.search.brave.com/api-reference/news/news_search/get";

interface SearchConfigFields {
  queries: string;
  braveSearchApiKey: string;
  bingSearchApiKey: string;
  bochaSearchApiKey: string;
  domesticSource: NewsSearchSource;
  internationalSource: NewsSearchSource;
  count: string;
  offset: string;
  freshness: string;
  spellcheck: boolean;
  safesearch: BraveSearchSafeSearch;
  uiLang: string;
  extraSnippets: boolean;
  goggles: string;
  domesticCountry: string;
  domesticSearchLang: string;
  internationalCountry: string;
  internationalSearchLang: string;
}

interface StatusMessage {
  type: "ok" | "err";
  msg: string;
}

const DEFAULT_FIELDS = buildFieldsFromConfig({});

function normalizeQueries(queries: string): string[] {
  return normalizeStringList(queries.split("\n"));
}

function normalizeGoggles(goggles: string): string[] {
  return normalizeStringList(goggles.split("\n"));
}

function normalizeStringList(values: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNonNegativeInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildFieldsFromConfig(config: DailyDigestConfig): SearchConfigFields {
  const braveSearch = mergeBraveSearchConfig(config.braveSearch);
  return {
    queries: (config.queries ?? []).join("\n"),
    braveSearchApiKey: config.braveSearchApiKey ?? "",
    bingSearchApiKey: config.bingSearchApiKey ?? "",
    bochaSearchApiKey: config.bochaSearchApiKey ?? "",
    domesticSource: config.domesticSource ?? "brave",
    internationalSource: config.internationalSource ?? "brave",
    count: String(braveSearch.request.count),
    offset: String(braveSearch.request.offset),
    freshness: braveSearch.request.freshness,
    spellcheck: braveSearch.request.spellcheck,
    safesearch: braveSearch.request.safesearch,
    uiLang: braveSearch.request.uiLang,
    extraSnippets: braveSearch.request.extraSnippets,
    goggles: braveSearch.request.goggles.join("\n"),
    domesticCountry: braveSearch.domestic.country,
    domesticSearchLang: braveSearch.domestic.searchLang,
    internationalCountry: braveSearch.international.country,
    internationalSearchLang: braveSearch.international.searchLang,
  };
}

function toBraveSearchConfig(fields: SearchConfigFields): BraveSearchConfig {
  return {
    request: {
      count: normalizePositiveInt(fields.count, 20),
      offset: normalizeNonNegativeInt(fields.offset, 0),
      freshness: fields.freshness.trim(),
      spellcheck: fields.spellcheck,
      safesearch: fields.safesearch,
      uiLang: fields.uiLang.trim(),
      extraSnippets: fields.extraSnippets,
      goggles: normalizeGoggles(fields.goggles),
    },
    domestic: {
      country: fields.domesticCountry.trim(),
      searchLang: fields.domesticSearchLang.trim(),
    },
    international: {
      country: fields.internationalCountry.trim(),
      searchLang: fields.internationalSearchLang.trim(),
    },
  };
}

async function fetchSearchConfig(): Promise<SearchConfigFields> {
  const res = await fetch("/api/config/daily-digest");
  if (!res.ok) return DEFAULT_FIELDS;
  const data = await res.json() as DailyDigestConfig;
  return buildFieldsFromConfig(data);
}

async function saveSearchConfig(fields: SearchConfigFields): Promise<void> {
  const res = await fetch("/api/config/daily-digest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: normalizeQueries(fields.queries),
      braveSearchApiKey: fields.braveSearchApiKey,
      bingSearchApiKey: fields.bingSearchApiKey,
      bochaSearchApiKey: fields.bochaSearchApiKey,
      domesticSource: fields.domesticSource,
      internationalSource: fields.internationalSource,
      braveSearch: toBraveSearchConfig(fields),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function SearchConfigView(): React.JSX.Element {
  const [fields, setFields] = useState<SearchConfigFields>(DEFAULT_FIELDS);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetchSearchConfig()
      .then(setFields)
      .catch(() => {
        setStatus({ type: "err", msg: "加载搜索配置失败" });
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showStatus = (next: StatusMessage): void => {
    setStatus(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(null), 4000);
  };

  const setField = <K extends keyof SearchConfigFields>(key: K, value: SearchConfigFields[K]): void => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const save = (): void => {
    setSaving(true);
    void saveSearchConfig(fields)
      .then(() => {
        showStatus({ type: "ok", msg: "已保存搜索配置" });
      })
      .catch((error: unknown) => {
        showStatus({ type: "err", msg: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h2 className={styles.title}>搜索</h2>
        <div className={styles.hint}>
          Brave 搜索相关配置统一保存在 `data/skills/daily-digest/config.json`。<br />
          参数口径参考官方 `news/search` 文档：
          <a className={styles.link} href={BRAVE_DOC_URL} target="_blank" rel="noreferrer">Brave Search API</a>
          。这里展示的是日报链路实际会带上的参数；搜索运算符可直接写在“搜索主题”里。
        </div>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>搜索源与鉴权</div>
          <div className={styles.fields}>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="search-domestic-source">国内搜索源</label>
                <select
                  id="search-domestic-source"
                  className={styles.select}
                  value={fields.domesticSource}
                  onChange={(e) => setField("domesticSource", e.target.value as NewsSearchSource)}
                >
                  <option value="brave">Brave Search</option>
                  <option value="bing">Bing News Search</option>
                  <option value="bocha">博查 (Bocha)</option>
                </select>
                <span className={styles.fieldHint}>国内候选新闻使用的搜索引擎。Bing 和博查对中国大陆媒体覆盖更好。</span>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="search-international-source">国际搜索源</label>
                <select
                  id="search-international-source"
                  className={styles.select}
                  value={fields.internationalSource}
                  onChange={(e) => setField("internationalSource", e.target.value as NewsSearchSource)}
                >
                  <option value="brave">Brave Search</option>
                  <option value="bing">Bing News Search</option>
                  <option value="bocha">博查 (Bocha)</option>
                </select>
                <span className={styles.fieldHint}>国际候选新闻使用的搜索引擎。</span>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="search-brave-api-key">Brave Search API Key</label>
              <input
                id="search-brave-api-key"
                className={styles.input}
                type="password"
                placeholder="BSA..."
                value={fields.braveSearchApiKey}
                onChange={(e) => setField("braveSearchApiKey", e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span className={styles.fieldHint}>留空时回退到环境变量 `BRAVE_SEARCH_API_KEY`。</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="search-bing-api-key">Bing Search API Key</label>
              <input
                id="search-bing-api-key"
                className={styles.input}
                type="password"
                placeholder="Azure Cognitive Services Key"
                value={fields.bingSearchApiKey}
                onChange={(e) => setField("bingSearchApiKey", e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span className={styles.fieldHint}>Azure 门户的 Bing Search v7 订阅密钥。留空时回退到环境变量 `BING_SEARCH_API_KEY`。</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="search-bocha-api-key">博查 (Bocha) API Key</label>
              <input
                id="search-bocha-api-key"
                className={styles.input}
                type="password"
                placeholder="bca-..."
                value={fields.bochaSearchApiKey}
                onChange={(e) => setField("bochaSearchApiKey", e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span className={styles.fieldHint}>博查 AI 开放平台的 API Key。留空时回退到环境变量 `BOCHA_SEARCH_API_KEY`。</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="search-daily-digest-queries">搜索主题（每行一个）</label>
              <textarea
                id="search-daily-digest-queries"
                className={styles.textarea}
                placeholder={"中国 教育部 AI 教育\n中国 智慧教育\n中国 高校 AI 教育\n中国 教育科技 公司\nOpenAI education"}
                value={fields.queries}
                onChange={(e) => setField("queries", e.target.value)}
                rows={8}
                autoComplete="off"
                spellCheck={false}
              />
              <span className={styles.fieldHint}>这些主题会映射到 Brave 的 `q` 参数，逐个请求并汇总候选新闻。国内主题建议直接写成 `中国 ...`，能明显减少境外噪音。</span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>Brave `news/search` 通用参数</div>
          <div className={styles.sectionHint}>
            这些参数会同时用于国内和国际请求。当前链路只取每个主题的一页结果。
          </div>
          <div className={styles.grid}>
            <TextField
              id="search-count"
              label="count"
              value={fields.count}
              onChange={(value) => setField("count", value)}
              placeholder="20"
              hint="每次请求返回多少条结果。Brave 文档当前上限为 50。"
              inputMode="numeric"
            />
            <TextField
              id="search-offset"
              label="offset"
              value={fields.offset}
              onChange={(value) => setField("offset", value)}
              placeholder="0"
              hint="分页偏移量，默认 0。日报链路通常保持第一页。"
              inputMode="numeric"
            />
            <TextField
              id="search-freshness"
              label="freshness"
              value={fields.freshness}
              onChange={(value) => setField("freshness", value)}
              placeholder="p3d"
              hint="常用值：`pd` / `pw` / `pm` / `py`；也支持 `p3d` 这类滚动天数别名，以及 Brave 官方 `YYYY-MM-DDtoYYYY-MM-DD` 自定义区间。留空表示不限制。"
            />
            <div className={styles.field}>
              <label className={styles.label} htmlFor="search-safesearch">safesearch</label>
              <select
                id="search-safesearch"
                className={styles.select}
                value={fields.safesearch}
                onChange={(e) => setField("safesearch", e.target.value as BraveSearchSafeSearch)}
              >
                <option value="">Brave 默认</option>
                <option value="strict">strict</option>
                <option value="moderate">moderate</option>
                <option value="off">off</option>
              </select>
              <span className={styles.fieldHint}>内容安全过滤等级。</span>
            </div>
            <TextField
              id="search-ui-lang"
              label="ui_lang"
              value={fields.uiLang}
              onChange={(value) => setField("uiLang", value)}
              placeholder="zh-Hans"
              hint="界面语言提示。留空时由 Brave 使用默认值。"
            />
            <CheckboxField
              id="search-spellcheck"
              label="spellcheck"
              checked={fields.spellcheck}
              onChange={(checked) => setField("spellcheck", checked)}
              hint="是否启用拼写修正。当前默认关闭，避免自动改写查询。"
            />
            <CheckboxField
              id="search-extra-snippets"
              label="extra_snippets"
              checked={fields.extraSnippets}
              onChange={(checked) => setField("extraSnippets", checked)}
              hint="请求额外摘要片段，可能提升摘要信息量，也可能增加响应体。"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="search-goggles">goggles（每行一个）</label>
            <textarea
              id="search-goggles"
              className={styles.textarea}
              placeholder={"https://example.com/goggle-1\nhttps://example.com/goggle-2"}
              value={fields.goggles}
              onChange={(e) => setField("goggles", e.target.value)}
              rows={4}
              autoComplete="off"
              spellCheck={false}
            />
            <span className={styles.fieldHint}>会按多值参数重复追加到 `goggles`；留空表示不使用。</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>国内请求覆盖参数</div>
          <div className={styles.grid}>
            <TextField
              id="search-domestic-country"
              label="国内 country"
              value={fields.domesticCountry}
              onChange={(value) => setField("domesticCountry", value)}
              placeholder="CN"
              hint="国内请求会附带到 `country`；留空可关闭国家过滤。"
            />
            <TextField
              id="search-domestic-search-lang"
              label="国内 search_lang"
              value={fields.domesticSearchLang}
              onChange={(value) => setField("domesticSearchLang", value)}
              placeholder="zh-hans"
              hint="国内请求语言参数。默认 `zh-hans`。"
            />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>国际请求覆盖参数</div>
          <div className={styles.grid}>
            <TextField
              id="search-international-country"
              label="国际 country"
              value={fields.internationalCountry}
              onChange={(value) => setField("internationalCountry", value)}
              placeholder="US"
              hint="国际请求默认不带 `country`；需要时可在这里指定。"
            />
            <TextField
              id="search-international-search-lang"
              label="国际 search_lang"
              value={fields.internationalSearchLang}
              onChange={(value) => setField("internationalSearchLang", value)}
              placeholder="en"
              hint="国际请求默认不带 `search_lang`；需要时可在这里指定。"
            />
          </div>
        </section>

        <div className={styles.meta}>
          保存后会直接写入本地 `./data`。`daily-digest` 下次搜索时会按这里的配置选择搜索引擎并构造请求。
        </div>

        <div className={styles.actions}>
          <button className={styles.saveBtn} type="button" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存搜索配置"}
          </button>
          {status && <span className={`${styles.status} ${styles[status.type]}`}>{status.msg}</span>}
        </div>
      </div>
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint: string;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
}

function TextField(props: TextFieldProps): React.JSX.Element {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        className={styles.input}
        type="text"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        inputMode={props.inputMode}
      />
      <span className={styles.fieldHint}>{props.hint}</span>
    </div>
  );
}

interface CheckboxFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint: string;
}

function CheckboxField(props: CheckboxFieldProps): React.JSX.Element {
  return (
    <label className={styles.checkboxField} htmlFor={props.id}>
      <div className={styles.checkboxRow}>
        <input
          id={props.id}
          className={styles.checkbox}
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className={styles.checkboxLabel}>{props.label}</span>
      </div>
      <span className={styles.fieldHint}>{props.hint}</span>
    </label>
  );
}
