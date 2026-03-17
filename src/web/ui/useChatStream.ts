import { useCallback, useRef, useState } from "react";
import type { ChatEntry, ThinkingItem } from "./types";

let _idCounter = 0;
function nextId(): string {
  return String(++_idCounter);
}

export function useChatStream(): {
  entries: ChatEntry[];
  streaming: boolean;
  send: (text: string) => Promise<void>;
} {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string): Promise<void> => {
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

    let assistantId: string | null = null;
    let thinkingId: string | null = null;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

          if (event === "thinking") {
            const d = data as { text: string };
            if (thinkingId === null) {
              thinkingId = nextId();
              const item: ThinkingItem = { kind: "thinking", id: thinkingId, text: d.text, streaming: true };
              setEntries((prev) => [...prev, item]);
            } else {
              const id = thinkingId;
              setEntries((prev) =>
                prev.map((e) =>
                  e.kind === "thinking" && e.id === id
                    ? { ...e, text: e.text + d.text }
                    : e,
                ),
              );
            }
          } else if (event === "message") {
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
            if (thinkingId !== null) {
              const id = thinkingId;
              setEntries((prev) =>
                prev.map((e) => e.kind === "thinking" && e.id === id ? { ...e, streaming: false } : e),
              );
            }
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
      if (thinkingId !== null) {
        const id = thinkingId;
        setEntries((prev) =>
          prev.map((e) => e.kind === "thinking" && e.id === id ? { ...e, streaming: false } : e),
        );
      }
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
