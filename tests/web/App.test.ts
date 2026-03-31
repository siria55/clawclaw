// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../src/web/ui/useChatStream.js", () => ({
  useChatStream: () => ({
    entries: [],
    streaming: false,
    send: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../src/web/ui/ChatView.js", () => ({
  ChatView: () => React.createElement("div", { "data-testid": "chat-view" }, "chat-view"),
}));

vi.mock("../../src/web/ui/InputBar.js", () => ({
  InputBar: () => React.createElement("div", { "data-testid": "input-bar" }, "input-bar"),
}));

vi.mock("../../src/web/ui/ContentView.js", () => ({
  ContentView: (props: { activeTab: string; onTabChange: (tab: "news" | "memory") => void }) => (
    React.createElement("div", { "data-testid": "content-view" },
      React.createElement("span", null, props.activeTab),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("news") }, "content-news"),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("memory") }, "content-memory"),
    )
  ),
}));

vi.mock("../../src/web/ui/AutomationView.js", () => ({
  AutomationView: (props: { activeTab: string; onTabChange: (tab: "cron" | "skills" | "search") => void }) => (
    React.createElement("div", { "data-testid": "automation-view" },
      React.createElement("span", null, props.activeTab),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("cron") }, "automation-cron"),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("skills") }, "automation-skills"),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("search") }, "automation-search"),
    )
  ),
}));

vi.mock("../../src/web/ui/IMView.js", () => ({
  IMView: (props: { activeTab: string; onTabChange: (tab: "status" | "messages" | "config") => void }) => (
    React.createElement("div", { "data-testid": "im-view" },
      React.createElement("span", null, props.activeTab),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("status") }, "im-status"),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("messages") }, "im-messages"),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("config") }, "im-config"),
    )
  ),
}));

vi.mock("../../src/web/ui/SystemView.js", () => ({
  SystemView: (props: { activeTab: string; onTabChange: (tab: "status" | "settings") => void }) => (
    React.createElement("div", { "data-testid": "system-view" },
      React.createElement("span", null, props.activeTab),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("status") }, "system-status"),
      React.createElement("button", { type: "button", onClick: () => props.onTabChange("settings") }, "system-settings"),
    )
  ),
}));

import { App } from "../../src/web/ui/App.js";

function renderApp(hash = ""): void {
  window.location.hash = hash;
  render(React.createElement(App));
}

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    ["#memory", "content-view", "memory"],
    ["#skills", "automation-view", "skills"],
    ["#search", "automation-view", "search"],
    ["#search-config", "automation-view", "search"],
    ["#im-status", "im-view", "status"],
    ["#im-config", "im-view", "config"],
    ["#settings", "system-view", "settings"],
  ])("maps legacy hash %s to the grouped view", async (hash, testId, text) => {
    renderApp(hash);
    const view = await screen.findByTestId(testId);
    expect(view.textContent ?? "").toContain(text);
  });

  it("uses grouped default hashes when switching top-level tabs", async () => {
    renderApp("#memory");

    fireEvent.click(screen.getByRole("button", { name: "自动化" }));
    await waitFor(() => expect(window.location.hash).toBe("#cron"));
    expect(screen.getByTestId("automation-view").textContent ?? "").toContain("cron");

    fireEvent.click(screen.getByRole("button", { name: "系统" }));
    await waitFor(() => expect(window.location.hash).toBe("#status"));
    expect(screen.getByTestId("system-view").textContent ?? "").toContain("status");

    fireEvent.click(screen.getByRole("button", { name: "对话" }));
    await waitFor(() => expect(window.location.hash).toBe("#chat"));
    expect(await screen.findByTestId("chat-view")).toBeDefined();
  });

  it("updates hashes when a grouped subtab changes", async () => {
    renderApp("#news");

    fireEvent.click(screen.getByRole("button", { name: "content-memory" }));
    await waitFor(() => expect(window.location.hash).toBe("#memory"));
    expect(screen.getByTestId("content-view").textContent ?? "").toContain("memory");

    fireEvent.click(screen.getByRole("button", { name: "自动化" }));
    await waitFor(() => expect(window.location.hash).toBe("#cron"));
    fireEvent.click(screen.getByRole("button", { name: "automation-skills" }));
    await waitFor(() => expect(window.location.hash).toBe("#skills"));
    expect(screen.getByTestId("automation-view").textContent ?? "").toContain("skills");
    fireEvent.click(screen.getByRole("button", { name: "automation-search" }));
    await waitFor(() => expect(window.location.hash).toBe("#search"));
    expect(screen.getByTestId("automation-view").textContent ?? "").toContain("search");

    fireEvent.click(screen.getByRole("button", { name: "IM" }));
    await waitFor(() => expect(window.location.hash).toBe("#im"));
    fireEvent.click(screen.getByRole("button", { name: "im-config" }));
    await waitFor(() => expect(window.location.hash).toBe("#im-config"));
    expect(screen.getByTestId("im-view").textContent ?? "").toContain("config");

    fireEvent.click(screen.getByRole("button", { name: "系统" }));
    await waitFor(() => expect(window.location.hash).toBe("#status"));
    fireEvent.click(screen.getByRole("button", { name: "system-settings" }));
    await waitFor(() => expect(window.location.hash).toBe("#settings"));
    expect(screen.getByTestId("system-view").textContent ?? "").toContain("settings");
  });
});
