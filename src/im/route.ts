import type { Agent } from "../core/agent.js";
import type { Message } from "../llm/types.js";
import type { IMMessage, IMPlatform } from "../platform/types.js";

export interface IMRouteHandleResult {
  handled: boolean;
  replyText?: string;
  messages?: Message[];
}

export interface IMRoute {
  platform: IMPlatform;
  agent: Agent;
  onMessage?: (message: IMMessage) => Promise<IMRouteHandleResult | undefined>;
}
