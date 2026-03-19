// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SectionToc } from "../../src/web/ui/SectionToc.js";

describe("SectionToc", () => {
  it("scrolls to the target section when clicking a toc item", () => {
    const target = document.createElement("section");
    target.id = "settings-agent";
    const scrollIntoView = vi.fn();
    Object.assign(target, { scrollIntoView });
    document.body.appendChild(target);

    render(React.createElement(SectionToc, {
      items: [{ id: "settings-agent", label: "Agent", hint: "提示词" }],
    }));

    fireEvent.click(screen.getByRole("button", { name: /agent/i }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });

    target.remove();
  });
});
