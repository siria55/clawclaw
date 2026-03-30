// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventBadge } from "../../src/web/ui/EventBadge.js";

describe("EventBadge", () => {
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

  it("copies error event text", async () => {
    render(React.createElement(EventBadge, {
      event: {
        id: "err-1",
        type: "error",
        data: "HTTP 401 Unauthorized: invalid api key",
      },
    }));

    fireEvent.click(screen.getByRole("button", { name: "复制错误内容" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      "HTTP 401 Unauthorized: invalid api key",
    ));
    expect(screen.getByText("已复制")).toBeDefined();
  });

  it("does not render copy button for tool_call events", () => {
    render(React.createElement(EventBadge, {
      event: {
        id: "tool-1",
        type: "tool_call",
        toolName: "browser",
        data: { url: "https://example.com" },
      },
    }));

    expect(screen.queryByRole("button", { name: "复制错误内容" })).toBeNull();
  });
});
