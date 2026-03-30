// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatView } from "../../src/web/ui/ChatView.js";
import type { ChatEntry } from "../../src/web/ui/types.js";

describe("ChatView", () => {
  const writeText = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("copies assistant reply text", async () => {
    const entries: ChatEntry[] = [{
      kind: "message",
      message: {
        id: "assistant-1",
        role: "assistant",
        content: "## 今日摘要\n- 第一条",
      },
    }];

    render(React.createElement(ChatView, { entries, streaming: false }));

    fireEvent.click(screen.getByRole("button", { name: "复制 AI 回复" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("## 今日摘要\n- 第一条"));
    expect(screen.getByText("已复制")).toBeDefined();
  });

  it("marks assistant bubbles as selectable text", () => {
    const entries: ChatEntry[] = [{
      kind: "message",
      message: {
        id: "assistant-2",
        role: "assistant",
        content: "这段内容应该可以直接选中复制",
      },
    }];

    render(React.createElement(ChatView, { entries, streaming: false }));

    const bubble = screen.getByText("这段内容应该可以直接选中复制")
      .closest('[data-message-role="assistant"]');
    expect(bubble?.style.userSelect).toBe("text");
  });

  it("does not show copy button for user messages", () => {
    const entries: ChatEntry[] = [{
      kind: "message",
      message: {
        id: "user-1",
        role: "user",
        content: "你好",
      },
    }];

    render(React.createElement(ChatView, { entries, streaming: false }));

    expect(screen.queryByRole("button", { name: "复制 AI 回复" })).toBeNull();
  });
});
