import { useCallback, useRef, useState } from "react";
import type { ChatEntry, ClawConfig } from "./types";

const STORAGE_KEY = "clawclaw_config";

export function loadConfig(): ClawConfig {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as ClawConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: ClawConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

let _idCounter = 0;
function nextId(): string {
  return String(++_idCounter);
}

export function useChatStream(): {
  entries: ChatEntry[];
  streaming: boolean;
  send: (text: string, config: ClawConfig) => Promise<void>;
} {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string, config: ClawConfig): Promise<void> => {
    if (streaming) return;

    // Append user message
    const userEntry: ChatEntry = {
      kind: "message",
      message: { id: nextId(), role: "user", content: text },
    };
    setEntries((prev) => [...prev, userEntry]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const configKeys = Object.keys(config) as (keyof ClawConfig)[];
    if (configKeys.some((k) => config[k])) {
      headers["X-Claw-Config"] = JSON.stringify(config);
    }

    let assistantId: string | null = null;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: text }),
        signal: ctrl.signal,
      });

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)/ms);
          if (!eventMatch || !dataMatch) continue;

          const event = eventMatch[1];
          let data: unknown;
          const raw = dataMatch[1];
          if (!raw) continue;
          try { data = JSON.parse(raw); } catch { continue; }

          if (event === "message") {
            const d = data as { content: string };
            if (assistantId === null) {
              assistantId = nextId();
              const entry: ChatEntry = {
                kind: "message",
                message: { id: assistantId, role: "assistant", content: d.content, streaming: true },
              };
              setEntries((prev) => [...prev, entry]);
            } else {
              const id = assistantId;
              setEntries((prev) =>
                prev.map((e) =>
                  e.kind === "message" && e.message.id === id
                    ? { ...e, message: { ...e.message, content: e.message.content + d.content } }
                    : e,
                ),
              );
            }
          } else if (event === "tool_call") {
            const d = data as { toolName: string; input: unknown };
            setEntries((prev) => [
              ...prev,
              { kind: "event", event: { id: nextId(), type: "tool_call", toolName: d.toolName, data: d.input } },
            ]);
          } else if (event === "tool_result") {
            const d = data as { toolName: string; result: unknown };
            setEntries((prev) => [
              ...prev,
              { kind: "event", event: { id: nextId(), type: "tool_result", toolName: d.toolName, data: d.result } },
            ]);
          } else if (event === "error") {
            const d = data as { message: string };
            setEntries((prev) => [
              ...prev,
              { kind: "event", event: { id: nextId(), type: "error", data: d.message } },
            ]);
          } else if (event === "done") {
            if (assistantId !== null) {
              const id = assistantId;
              setEntries((prev) =>
                prev.map((e) =>
                  e.kind === "message" && e.message.id === id
                    ? { ...e, message: { ...e.message, streaming: false } }
                    : e,
                ),
              );
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setEntries((prev) => [
          ...prev,
          { kind: "event", event: { id: nextId(), type: "error", data: (err as Error).message } },
        ]);
      }
    } finally {
      if (assistantId !== null) {
        const id = assistantId;
        setEntries((prev) =>
          prev.map((e) =>
            e.kind === "message" && e.message.id === id
              ? { ...e, message: { ...e.message, streaming: false } }
              : e,
          ),
        );
      }
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming]);

  return { entries, streaming, send };
}
