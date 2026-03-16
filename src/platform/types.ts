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
   * Verify the authenticity of an incoming Webhook request.
   * Throws if the request fails verification.
   */
  verify(headers: Record<string, string>, body: string): Promise<void>;

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
