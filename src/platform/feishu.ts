import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IMPlatform, IMMessage, IMVerifyParams } from "./types.js";

interface FeishuConfig {
  appId: string;
  appSecret: string;
  /** Verification token from Feishu open platform console */
  verificationToken: string;
  /**
   * Encrypt key for AES body decryption and signature verification (optional).
   * When set, all request bodies are AES-256-CBC encrypted by Feishu.
   */
  encryptKey: string | undefined;
}

interface FeishuTenantTokenResponse {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
}

interface FeishuOpenApiResponse<TData> {
  code: number;
  msg?: string;
  data?: TData;
}

/** Department record returned by Feishu Contact v3 APIs. */
export interface FeishuDepartment {
  name: string;
  open_department_id: string;
  department_id?: string;
  parent_department_id?: string;
  leader_user_id?: string;
  member_count?: number;
  primary_member_count?: number;
  order?: string;
}

/** Paginated department list returned by Feishu Contact v3 APIs. */
export interface FeishuDepartmentPage {
  items: FeishuDepartment[];
  pageToken?: string;
  hasMore: boolean;
}

/** User record returned by Feishu Contact v3 APIs. */
export interface FeishuDepartmentUser {
  name: string;
  open_id?: string;
  user_id?: string;
  union_id?: string;
  email?: string;
  mobile?: string;
  employee_no?: string;
}

/** Paginated department user list returned by Feishu Contact v3 APIs. */
export interface FeishuDepartmentUserPage {
  items: FeishuDepartmentUser[];
  pageToken?: string;
  hasMore: boolean;
}

export interface FeishuChat {
  chat_id: string;
  name?: string;
  description?: string;
}

interface FeishuPostContent {
  zh_cn: {
    title?: string;
    content: Array<Array<{ tag: "md"; text: string }>>;
  };
}

/** Max age of a Feishu request timestamp before it's considered a replay attack. */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Feishu (Lark) IM platform adapter.
 *
 * Required env vars: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_VERIFICATION_TOKEN
 * Optional env var:  FEISHU_ENCRYPT_KEY (enables AES body decryption + signature verification)
 */
export class FeishuPlatform implements IMPlatform {
  readonly name = "feishu";
  readonly #config: FeishuConfig;

  constructor(config?: Partial<FeishuConfig>) {
    this.#config = {
      appId: config?.appId ?? requireEnv("FEISHU_APP_ID"),
      appSecret: config?.appSecret ?? requireEnv("FEISHU_APP_SECRET"),
      verificationToken: config?.verificationToken ?? requireEnv("FEISHU_VERIFICATION_TOKEN"),
      encryptKey: config?.encryptKey ?? process.env["FEISHU_ENCRYPT_KEY"],
    };
  }

  async verify(params: IMVerifyParams): Promise<void> {
    const { headers, body } = params;

    // Decrypt body first if encryptKey is configured — Feishu encrypts ALL events including
    // the initial url_verification challenge.
    const plainBody = this.#decrypt(body);

    // Handle url_verification before any signature check.
    // Feishu sends the challenge without x-lark-signature headers.
    try {
      const event = JSON.parse(plainBody) as Record<string, unknown>;
      if (event["type"] === "url_verification") {
        throw new FeishuChallenge(event["challenge"] as string);
      }
    } catch (err) {
      if (err instanceof FeishuChallenge) throw err;
      // Not JSON — fall through to signature check
    }

    // Reject stale requests (replay protection)
    const timestamp = headers["x-lark-request-timestamp"];
    if (timestamp) {
      const age = Date.now() - Number(timestamp) * 1000;
      if (Math.abs(age) > MAX_TIMESTAMP_AGE_MS) {
        throw new Error("Feishu request timestamp too old");
      }
    }

    // Signature verification when encryptKey is configured
    const signature = headers["x-lark-signature"];
    if (this.#config.encryptKey) {
      if (!signature || !timestamp) {
        throw new Error("Feishu signature headers missing");
      }
      const nonce = headers["x-lark-request-nonce"] ?? "";
      const expected = computeFeishuSignature(timestamp, nonce, this.#config.encryptKey, body);
      if (signature !== expected) {
        throw new Error("Feishu signature mismatch");
      }
    }
  }

  async parse(body: string): Promise<IMMessage | null> {
    const plainBody = this.#decrypt(body);
    const event = JSON.parse(plainBody) as Record<string, unknown>;

    // Feishu URL verification challenge on first setup
    if (event["type"] === "url_verification") {
      throw new FeishuChallenge(event["challenge"] as string);
    }

    const header = event["header"] as Record<string, unknown> | undefined;
    const eventBody = event["event"] as Record<string, unknown> | undefined;
    const eventType = asString(header?.["event_type"]);

    if (eventType === "im.chat.member.bot.added_v1") {
      return this.#parseBotMembershipEvent(eventBody, "bot_added", "机器人已加入群");
    }
    if (eventType === "im.chat.member.bot.deleted_v1") {
      return this.#parseBotMembershipEvent(eventBody, "bot_removed", "机器人已移出群");
    }
    if (eventType !== "im.message.receive_v1") return null;

    const message = eventBody?.["message"] as Record<string, unknown> | undefined;
    const sender = eventBody?.["sender"] as Record<string, unknown> | undefined;

    if (!message || !sender) return null;

    // Skip messages sent by the bot itself
    if ((sender["sender_type"] as string) === "app") return null;

    const content = JSON.parse(message["content"] as string) as { text?: string };
    const senderId = asRecord(sender["sender_id"]);
    const chatId = asString(message["chat_id"]);
    const userId = asString(senderId?.["open_id"]);
    const chatName = await this.#resolveChatName(chatId, eventBody);

    return {
      platform: this.name,
      chatId,
      ...(chatName ? { chatName } : {}),
      sessionId: buildFeishuSessionId(message, chatId),
      continuityId: buildContinuityId(this.name, chatId, userId),
      userId,
      eventType: "message",
      text: content.text?.trim() ?? "",
      raw: event,
    };
  }

  /**
   * Upload an image (URL or local file path) and send it as a Feishu image message.
   */
  async sendImage(chatId: string, source: string): Promise<void> {
    const token = await this.#getAccessToken();
    const imageKey = await this.#uploadImage(token, source);
    await this.#sendMessage(token, chatId, "image", { image_key: imageKey });
  }

  /**
   * Upload a raw image buffer and send it as a Feishu image message.
   */
  async sendImageBuffer(chatId: string, buffer: Buffer): Promise<void> {
    const token = await this.#getAccessToken();
    const imageKey = await this.#uploadImageBuffer(token, buffer);
    await this.#sendMessage(token, chatId, "image", { image_key: imageKey });
  }

  /** Fetch one department by `open_department_id`. */
  async getDepartment(departmentId: string): Promise<FeishuDepartment> {
    const data = await this.#request<{ department?: FeishuDepartment }>(
      `/contact/v3/departments/${encodeURIComponent(departmentId)}`,
      {
        department_id_type: "open_department_id",
        user_id_type: "open_id",
      },
    );
    if (!data.department) {
      throw new Error(`Feishu department ${departmentId} not found`);
    }
    return data.department;
  }

  /**
   * List child departments under one parent department.
   *
   * Set `fetchChild` to `true` to traverse all descendant departments.
   */
  async listDepartmentChildren(
    parentDepartmentId: string,
    options: { fetchChild?: boolean; pageSize?: number; pageToken?: string } = {},
  ): Promise<FeishuDepartmentPage> {
    const pageSize = clampPageSize(options.pageSize);
    const data = await this.#request<{
      items?: FeishuDepartment[];
      page_token?: string;
      has_more?: boolean;
    }>(
      "/contact/v3/departments",
      {
        parent_department_id: parentDepartmentId,
        department_id_type: "open_department_id",
        page_size: String(pageSize),
        fetch_child: options.fetchChild ? "true" : "false",
        user_id_type: "open_id",
        ...(options.pageToken ? { page_token: options.pageToken } : {}),
      },
    );
    return {
      items: data.items ?? [],
      hasMore: data.has_more ?? false,
      ...(data.page_token ? { pageToken: data.page_token } : {}),
    };
  }

  /** Search departments by name with a best-effort fuzzy match. */
  async findDepartmentsByName(keyword: string): Promise<FeishuDepartment[]> {
    const normalizedKeyword = normalizeSearchTerm(keyword);
    if (!normalizedKeyword) return [];

    const departments = await this.#listAllDepartments();
    return departments
      .filter((department) => scoreDepartmentMatch(department.name, keyword) > 0)
      .sort((left, right) => scoreDepartmentMatch(right.name, keyword) - scoreDepartmentMatch(left.name, keyword));
  }

  /** List direct members under one department. */
  async listDepartmentUsers(
    departmentId: string,
    options: { pageSize?: number; pageToken?: string } = {},
  ): Promise<FeishuDepartmentUserPage> {
    const pageSize = clampPageSize(options.pageSize);
    const data = await this.#request<{
      items?: FeishuDepartmentUser[];
      page_token?: string;
      has_more?: boolean;
    }>(
      "/contact/v3/users/find_by_department",
      {
        department_id: departmentId,
        department_id_type: "open_department_id",
        page_size: String(pageSize),
        user_id_type: "open_id",
        ...(options.pageToken ? { page_token: options.pageToken } : {}),
      },
    );
    return {
      items: data.items ?? [],
      hasMore: data.has_more ?? false,
      ...(data.page_token ? { pageToken: data.page_token } : {}),
    };
  }

  /** Fetch one user by `open_id`. */
  async getUser(userId: string): Promise<FeishuDepartmentUser> {
    const data = await this.#request<{ user?: FeishuDepartmentUser }>(
      `/contact/v3/users/${encodeURIComponent(userId)}`,
      {
        user_id_type: "open_id",
      },
    );
    if (!data.user) {
      throw new Error(`Feishu user ${userId} not found`);
    }
    return data.user;
  }

  /** Fetch one chat's basic metadata by `chat_id`. */
  async getChat(chatId: string): Promise<FeishuChat> {
    const data = await this.#request<{ chat?: Omit<FeishuChat, "chat_id"> }>(
      `/im/v1/chats/${encodeURIComponent(chatId)}`,
      {},
    );
    if (!data.chat) {
      throw new Error(`Feishu chat ${chatId} not found`);
    }
    return {
      chat_id: chatId,
      ...data.chat,
    };
  }

  async #uploadImageBuffer(token: string, buffer: Buffer): Promise<string> {
    const form = new FormData();
    form.append("image_type", "message");
    form.append("image", new Blob([buffer]), "image.png");

    const response = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu uploadImage failed: ${response.status} ${body}`);
    }
    const data = await response.json() as { code: number; data?: { image_key: string } };
    if (data.code !== 0 || !data.data?.image_key) {
      throw new Error(`Feishu uploadImage error: ${JSON.stringify(data)}`);
    }
    return data.data.image_key;
  }

  async #uploadImage(token: string, source: string): Promise<string> {
    const isUrl = source.startsWith("http://") || source.startsWith("https://");
    const imageBuffer = isUrl
      ? Buffer.from(await (await fetch(source)).arrayBuffer())
      : readFileSync(source);

    const form = new FormData();
    form.append("image_type", "message");
    form.append("image", new Blob([imageBuffer]), "image.png");

    const response = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu uploadImage failed: ${response.status} ${body}`);
    }
    const data = await response.json() as { code: number; data?: { image_key: string } };
    if (data.code !== 0 || !data.data?.image_key) {
      throw new Error(`Feishu uploadImage error: ${JSON.stringify(data)}`);
    }
    return data.data.image_key;
  }

  async send(chatId: string, text: string): Promise<void> {
    if (shouldUseMarkdownPost(text)) {
      await this.sendMarkdown(chatId, text);
      return;
    }
    await this.#sendText(chatId, text);
  }

  /** Send markdown content via Feishu `post` message with a single `md` node. */
  async sendMarkdown(chatId: string, markdown: string): Promise<void> {
    const token = await this.#getAccessToken();
    await this.#sendMessage(token, chatId, "post", buildMarkdownPostContent(markdown));
  }

  async #sendText(chatId: string, text: string): Promise<void> {
    const token = await this.#getAccessToken();
    await this.#sendMessage(token, chatId, "text", { text });
  }

  async #sendMessage(
    token: string,
    chatId: string,
    msgType: "text" | "image" | "post",
    content: unknown,
  ): Promise<void> {
    const receiveIdType = chatId.startsWith("ou_") ? "open_id" : "chat_id";
    const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: msgType,
        content: JSON.stringify(content),
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu send failed: ${response.status} ${body}`);
    }
  }

  /**
   * Decrypt body if it contains an `{"encrypt":"..."}` wrapper and encryptKey is set.
   * Returns the original body string unchanged otherwise.
   */
  #decrypt(body: string): string {
    if (!this.#config.encryptKey) return body;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (typeof parsed["encrypt"] !== "string") return body;
      return feishuAesDecrypt(parsed["encrypt"], this.#config.encryptKey);
    } catch {
      return body;
    }
  }

  async #getAccessToken(): Promise<string> {
    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: this.#config.appId,
          app_secret: this.#config.appSecret,
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu access token failed: ${response.status} ${body}`);
    }
    const data = (await response.json()) as FeishuTenantTokenResponse;
    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`Feishu access token error: ${data.msg ?? "unknown error"}`);
    }
    if (!data.tenant_access_token) {
      throw new Error("Feishu access token missing from response");
    }
    return data.tenant_access_token;
  }

  async #listAllDepartments(): Promise<FeishuDepartment[]> {
    const departments: FeishuDepartment[] = [];
    let pageToken: string | undefined;

    do {
      const page = await this.listDepartmentChildren("0", {
        fetchChild: true,
        pageSize: 50,
        ...(pageToken ? { pageToken } : {}),
      });
      departments.push(...page.items);
      pageToken = page.hasMore ? page.pageToken : undefined;
    } while (pageToken);

    return dedupeDepartments(departments);
  }

  async #parseBotMembershipEvent(
    eventBody: Record<string, unknown> | undefined,
    eventType: "bot_added" | "bot_removed",
    defaultText: string,
  ): Promise<IMMessage | null> {
    const chatId = asString(eventBody?.["chat_id"]);
    if (!chatId) return null;

    const operatorId = asRecord(eventBody?.["operator_id"]);
    const userId = asString(operatorId?.["open_id"]);
    const chatName = await this.#resolveChatName(chatId, eventBody);

    return {
      platform: this.name,
      chatId,
      ...(chatName ? { chatName } : {}),
      sessionId: chatId,
      continuityId: buildContinuityId(this.name, chatId, userId || "system"),
      userId,
      eventType,
      text: `${defaultText}${chatName ? `：${chatName}` : ""}`,
      raw: eventBody,
    };
  }

  async #resolveChatName(chatId: string, eventBody: Record<string, unknown> | undefined): Promise<string | undefined> {
    const inlineName = extractFeishuChatName(eventBody);
    if (inlineName) return inlineName;
    if (!chatId.startsWith("oc_")) return undefined;
    try {
      return (await this.getChat(chatId)).name;
    } catch {
      return undefined;
    }
  }

  async #request<TData>(path: string, query: Record<string, string | undefined>): Promise<TData> {
    const token = await this.#getAccessToken();
    const url = new URL(`https://open.feishu.cn/open-apis${path}`);

    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Feishu request failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as FeishuOpenApiResponse<TData>;
    if (data.code !== 0) {
      throw new Error(`Feishu API error: ${data.msg ?? "unknown error"}`);
    }
    if (data.data === undefined) {
      throw new Error("Feishu API returned empty data");
    }
    return data.data;
  }
}

/**
 * Decrypt a Feishu AES-256-CBC encrypted event body.
 * Key  = SHA256(encryptKey) — 32 bytes
 * Data = base64decode(encryptedStr): first 16 bytes = IV, rest = ciphertext
 */
export function feishuAesDecrypt(encryptedStr: string, encryptKey: string): string {
  const key = createHash("sha256").update(encryptKey).digest();
  const data = Buffer.from(encryptedStr, "base64");
  const iv = data.subarray(0, 16);
  const ciphertext = data.subarray(16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Compute Feishu request signature.
 * signature = SHA256(timestamp + nonce + encryptKey + body)
 */
export function computeFeishuSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  body: string,
): string {
  return createHash("sha256")
    .update(timestamp + nonce + encryptKey + body)
    .digest("hex");
}

/** Thrown when Feishu sends a URL verification challenge. Server must echo back `challenge`. */
export class FeishuChallenge extends Error {
  constructor(readonly challenge: string) {
    super("feishu_challenge");
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function buildFeishuSessionId(message: Record<string, unknown>, chatId: string): string {
  const anchorId = asString(message["root_id"]) || asString(message["thread_id"]) || asString(message["parent_id"]);
  return anchorId ? `${chatId}#thread:${anchorId}` : chatId;
}

function buildContinuityId(platform: string, chatId: string, userId: string): string {
  return `${platform}:${chatId}:${userId || "anonymous"}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function extractFeishuChatName(eventBody: Record<string, unknown> | undefined): string | undefined {
  const directName = asString(eventBody?.["name"]) || asString(eventBody?.["chat_name"]);
  if (directName) return directName;

  const chat = asRecord(eventBody?.["chat"]);
  const chatName = asString(chat?.["name"]);
  if (chatName) return chatName;

  const message = asRecord(eventBody?.["message"]);
  const messageChatName = asString(message?.["chat_name"]);
  if (messageChatName) return messageChatName;

  const i18nNames = asRecord(eventBody?.["i18n_names"]) ?? asRecord(chat?.["i18n_names"]);
  return asString(i18nNames?.["zh_cn"]) || asString(i18nNames?.["en_us"]) || undefined;
}

function clampPageSize(value: number | undefined): number {
  if (!value) return 50;
  return Math.max(1, Math.min(50, Math.trunc(value)));
}

function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function scoreDepartmentMatch(name: string, keyword: string): number {
  const normalizedName = normalizeSearchTerm(name);
  const normalizedKeyword = normalizeSearchTerm(keyword);
  if (!normalizedKeyword) return 0;
  if (normalizedName === normalizedKeyword) return 3;
  if (normalizedName.startsWith(normalizedKeyword)) return 2;
  if (containsCharsInOrder(normalizedName, normalizedKeyword)) return 1;
  return normalizedName.includes(normalizedKeyword) ? 1 : 0;
}

function dedupeDepartments(items: FeishuDepartment[]): FeishuDepartment[] {
  const map = new Map<string, FeishuDepartment>();
  for (const item of items) {
    map.set(item.open_department_id, item);
  }
  return [...map.values()];
}

function containsCharsInOrder(text: string, query: string): boolean {
  let index = 0;
  for (const char of text) {
    if (char === query[index]) index++;
    if (index === query.length) return true;
  }
  return false;
}

function shouldUseMarkdownPost(text: string): boolean {
  if (!text.trim()) return false;
  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(text));
}

function buildMarkdownPostContent(markdown: string): FeishuPostContent {
  const normalized = markdown.trim();
  const title = extractMarkdownTitle(normalized);
  const body = title ? normalized.replace(/^#{1,6}\s+.+?(?:\r?\n|$)/, "").trim() : normalized;
  const text = body || normalized;
  return {
    zh_cn: {
      ...(title ? { title } : {}),
      content: [[{ tag: "md", text }]],
    },
  };
}

function extractMarkdownTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#{1,6}\s+(.+?)(?:\r?\n|$)/);
  if (!match) return undefined;
  const value = match[1];
  if (!value) return undefined;
  const title = value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
  return title || undefined;
}

const MARKDOWN_PATTERNS = [
  /```/,
  /^\s{0,3}#{1,6}\s/m,
  /^\s*[-*+]\s/m,
  /^\s*\d+\.\s/m,
  /^\s*>\s/m,
  /\[[^\]]+\]\([^)]+\)/,
  /\*\*[^*]+\*\*/,
  /~~[^~]+~~/,
  /^\s*---+\s*$/m,
];
