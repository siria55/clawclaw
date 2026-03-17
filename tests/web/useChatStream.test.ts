// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatStream } from "../../src/web/ui/useChatStream.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a ReadableStream that emits raw SSE text. */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Format a single SSE frame. */
function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function mockFetch(chunks: string[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      body: makeStream(chunks),
    })),
  );
}

// ── useChatStream ─────────────────────────────────────────────────────────────

describe("useChatStream", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with empty entries and streaming=false", () => {
    const { result } = renderHook(() => useChatStream());
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.streaming).toBe(false);
  });

  it("appends user message and assistant message on send", async () => {
    mockFetch([
      sseFrame("message", { content: "hello" }),
      sseFrame("done", { turns: 1 }),
    ]);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("hi");
    });

    expect(result.current.streaming).toBe(false);
    const msgs = result.current.entries.filter((e) => e.kind === "message");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].kind === "message" && msgs[0].message.role).toBe("user");
    expect(msgs[1].kind === "message" && msgs[1].message.role).toBe("assistant");
    expect(msgs[1].kind === "message" && msgs[1].message.content).toBe("hello");
  });

  it("accumulates streamed message chunks", async () => {
    mockFetch([
      sseFrame("message", { content: "foo" }),
      sseFrame("message", { content: "bar" }),
      sseFrame("done", { turns: 1 }),
    ]);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("test");
    });

    const assistant = result.current.entries.find(
      (e) => e.kind === "message" && e.message.role === "assistant",
    );
    expect(assistant?.kind === "message" && assistant.message.content).toBe("foobar");
  });

  it("appends tool_call event", async () => {
    mockFetch([
      sseFrame("tool_call", { toolName: "browser", input: { url: "http://example.com" } }),
      sseFrame("done", { turns: 1 }),
    ]);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("browse");
    });

    const events = result.current.entries.filter((e) => e.kind === "event");
    expect(events).toHaveLength(1);
    expect(events[0].kind === "event" && events[0].event.type).toBe("tool_call");
    expect(events[0].kind === "event" && events[0].event.toolName).toBe("browser");
  });

  it("appends tool_result event", async () => {
    mockFetch([
      sseFrame("tool_result", { toolName: "browser", result: "page content" }),
      sseFrame("done", { turns: 1 }),
    ]);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("browse");
    });

    const events = result.current.entries.filter((e) => e.kind === "event");
    expect(events[0].kind === "event" && events[0].event.type).toBe("tool_result");
  });

  it("appends error event on SSE error frame", async () => {
    mockFetch([sseFrame("error", { message: "boom" })]);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("hi");
    });

    const err = result.current.entries.find(
      (e) => e.kind === "event" && e.event.type === "error",
    );
    expect(err).toBeDefined();
  });

  it("appends error entry on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network error"); }));

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("hi");
    });

    const err = result.current.entries.find(
      (e) => e.kind === "event" && e.event.type === "error",
    );
    expect(err).toBeDefined();
    expect(err?.kind === "event" && err.event.data).toBe("network error");
  });

  it("appends thinking item on thinking SSE event", async () => {
    mockFetch([
      sseFrame("thinking", { text: "let me reason..." }),
      sseFrame("message", { content: "answer" }),
      sseFrame("done", { turns: 1 }),
    ]);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("hi");
    });

    const thinking = result.current.entries.find((e) => e.kind === "thinking");
    expect(thinking).toBeDefined();
    expect(thinking?.kind === "thinking" && thinking.text).toBe("let me reason...");
    expect(thinking?.kind === "thinking" && thinking.streaming).toBe(false);
  });

  it("accumulates multiple thinking chunks", async () => {
    mockFetch([
      sseFrame("thinking", { text: "part1 " }),
      sseFrame("thinking", { text: "part2" }),
      sseFrame("done", { turns: 1 }),
    ]);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("hi");
    });

    const thinking = result.current.entries.find((e) => e.kind === "thinking");
    expect(thinking?.kind === "thinking" && thinking.text).toBe("part1 part2");
  });
});
