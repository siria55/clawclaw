/** Platform-agnostic incoming message from any IM platform. */
export interface IMMessage {
  /** Source platform identifier, e.g. "feishu" | "wecom" */
  platform: string;
  /** Conversation ID (group chat or direct message) */
  chatId: string;
  /** ID of the user who sent the message */
  userId: string;
  /** Plain text content */
  text: string;
  /** Raw platform event payload, for advanced use */
  raw: unknown;
}

export interface IMVerifyParams {
  method: "GET" | "POST";
  headers: Record<string, string>;
  /** Parsed URL query parameters */
  query: Record<string, string>;
  body: string;
}

/**
 * Interface every IM platform adapter must implement.
 *
 * Adapters translate between platform-specific HTTP events and the
 * framework's unified `IMMessage` format, and provide the ability to
 * send replies back.
 */
export interface IMPlatform {
  /** Human-readable name, e.g. "feishu" */
  readonly name: string;

  /**
   * Verify the authenticity of an incoming request.
   * Throws if verification fails.
   * May throw a platform-specific challenge (e.g. `FeishuChallenge`, `WecomEcho`)
   * that the server must respond to instead of processing a message.
   */
  verify(params: IMVerifyParams): Promise<void>;

  /**
   * Parse a verified Webhook body into a unified IMMessage.
   * Returns `null` if the event should be ignored (e.g. bot's own message).
   */
  parse(body: string): Promise<IMMessage | null>;

  /**
   * Send a text reply to a conversation.
   */
  send(chatId: string, text: string): Promise<void>;
}
