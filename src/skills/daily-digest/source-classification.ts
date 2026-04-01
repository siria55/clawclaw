const MAINLAND_CHINA_MEDIA_HOST_PATTERNS = [
  /(^|\.)xinhuanet\.com$/i,
  /(^|\.)news\.cn$/i,
  /(^|\.)people\.com\.cn$/i,
  /(^|\.)cctv\.com$/i,
  /(^|\.)gmw\.cn$/i,
  /(^|\.)chinanews\.com\.cn$/i,
  /(^|\.)thepaper\.cn$/i,
  /(^|\.)jiemian\.com$/i,
  /(^|\.)yicai\.com$/i,
  /(^|\.)caixin\.com$/i,
  /(^|\.)stcn\.com$/i,
  /(^|\.)cnstock\.com$/i,
  /(^|\.)cls\.cn$/i,
  /(^|\.)eeo\.com\.cn$/i,
  /(^|\.)21jingji\.com$/i,
  /(^|\.)nbd\.com\.cn$/i,
  /(^|\.)bjnews\.com\.cn$/i,
  /(^|\.)cyzone\.cn$/i,
  /(^|\.)pedaily\.cn$/i,
  /(^|\.)36kr\.com$/i,
  /(^|\.)tmtpost\.com$/i,
  /(^|\.)huxiu\.com$/i,
  /(^|\.)ithome\.com$/i,
  /(^|\.)leiphone\.com$/i,
  /(^|\.)geekpark\.net$/i,
  /^(news|edu|finance)\.sina\.com\.cn$/i,
  /^(new|news|edu|tech|finance)\.qq\.com$/i,
  /^(news|edu|tech|finance)\.163\.com$/i,
] as const;

const MAINLAND_CHINA_OFFICIAL_HOST_PATTERNS = [
  /(^|\.)gov\.cn$/i,
  /(^|\.)edu\.cn$/i,
] as const;

const TRADITIONAL_CHINESE_MEDIA_HOST_PATTERNS = [
  /(^|\.)storm\.mg$/i,
  /(^|\.)udn\.com$/i,
  /(^|\.)ettoday\.net$/i,
  /(^|\.)hk01\.com$/i,
  /(^|\.)mingpao\.com$/i,
  /(^|\.)hket\.com$/i,
  /(^|\.)stheadline\.com$/i,
  /(^|\.)cna\.com\.tw$/i,
  /(^|\.)ltn\.com\.tw$/i,
] as const;

const PSEUDO_MAINLAND_HOST_PATTERNS = [
  /(^|\.)sputniknews\.cn$/i,
  /(^|\.)archdaily\.cn$/i,
  /(^|\.)k\.sina\.cn$/i,
  /(^|\.)k\.sina\.com\.cn$/i,
] as const;

const NON_MAINLAND_DOMESTIC_HOST_PATTERNS = [
  /(^|\.)worldjournal\.com$/i,
  /(^|\.)secretchina\.com$/i,
  /(^|\.)digitimes\.com\.tw$/i,
  /(^|\.)afpbb\.com$/i,
  /(^|\.)nikkei\.com$/i,
  /(^|\.)infoseek\.co\.jp$/i,
  /(^|\.)sankei\.com$/i,
  /(^|\.)jiji\.com$/i,
  /(^|\.)newsweekjapan\.jp$/i,
  /(^|\.)recordchina\.co\.jp$/i,
  /(^|\.)yomiuri\.co\.jp$/i,
  /(^|\.)mainichi\.jp$/i,
  /(^|\.)47news\.jp$/i,
  /(^|\.)tv-asahi\.co\.jp$/i,
  /(^|\.)tbs\.co\.jp$/i,
  /(^|\.)zaobao\.com\.sg$/i,
  /(^|\.)sinchew\.com\.my$/i,
] as const;

const NON_MAINLAND_REGIONAL_SUFFIXES = [".jp", ".sg", ".my"] as const;

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase();
}

function matchesHostPatterns(hostname: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(hostname));
}

function endsWithOneOf(hostname: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => hostname.endsWith(suffix));
}

/**
 * Returns true when the hostname belongs to a known mainland-China media outlet.
 */
export function isMainlandChinaMediaHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (isPseudoMainlandHostname(normalized)) return false;
  return matchesHostPatterns(normalized, MAINLAND_CHINA_MEDIA_HOST_PATTERNS);
}

/**
 * Returns true when the hostname belongs to a mainland-China government or education domain.
 */
export function isMainlandChinaOfficialHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (isPseudoMainlandHostname(normalized)) return false;
  return matchesHostPatterns(normalized, MAINLAND_CHINA_OFFICIAL_HOST_PATTERNS);
}

/**
 * Returns true when the hostname should count as an explicit mainland-China source.
 */
export function isMainlandChinaHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return isMainlandChinaMediaHostname(normalized) || isMainlandChinaOfficialHostname(normalized);
}

/**
 * Returns true when the hostname is a pseudo-mainland domain that should not enter the mainland bucket.
 */
export function isPseudoMainlandHostname(hostname: string): boolean {
  return matchesHostPatterns(normalizeHostname(hostname), PSEUDO_MAINLAND_HOST_PATTERNS);
}

/**
 * Returns true when the hostname is likely a Hong Kong / Taiwan / Macau traditional-Chinese outlet.
 */
export function isTraditionalChineseHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized.endsWith(".tw")
    || normalized.endsWith(".hk")
    || normalized.endsWith(".mo")
    || matchesHostPatterns(normalized, TRADITIONAL_CHINESE_MEDIA_HOST_PATTERNS);
}

/**
 * Returns true when the hostname is a domestic-query fallback source outside mainland China.
 */
export function isNonMainlandDomesticHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return isPseudoMainlandHostname(normalized)
    || isTraditionalChineseHostname(normalized)
    || endsWithOneOf(normalized, NON_MAINLAND_REGIONAL_SUFFIXES)
    || matchesHostPatterns(normalized, NON_MAINLAND_DOMESTIC_HOST_PATTERNS);
}
