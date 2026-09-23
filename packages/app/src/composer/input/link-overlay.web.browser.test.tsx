import React, { act, useCallback, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditingTextInput } from "@/components/ui/text-input/text-input.web";
import type { EditingTextInputHandle } from "@/components/ui/text-input";
import { ComposerLinkOverlay } from "./link-overlay.web";

const URL = "https://example.com/docs";
const WRAPPER_STYLE = { position: "relative", width: 240, font: "14px sans-serif" } as const;
const roots: Root[] = [];

function Harness() {
  const inputRef = useRef<EditingTextInputHandle | null>(null);
  const getTextArea = useCallback(() => {
    const element = inputRef.current?.getNativeRef();
    return element instanceof HTMLTextAreaElement ? element : null;
  }, []);
  return (
    <div style={WRAPPER_STYLE}>
      <EditingTextInput ref={inputRef} initialValue="" multiline={true} />
      <ComposerLinkOverlay getTextArea={getTextArea} value="" />
    </div>
  );
}

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<Harness />));
  const textarea = container.querySelector("textarea");
  if (!textarea) throw new Error("No textarea rendered");
  return { container, textarea };
}

function type(textarea: HTMLTextAreaElement, text: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      textarea,
      text,
    );
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ComposerLinkOverlay", () => {
  it("paints links and hides the textarea text only while the draft has a link", () => {
    const { container, textarea } = mount();
    type(textarea, "plain text");
    expect(container.querySelector("[data-composer-link]")).toBeNull();
    expect(textarea.style.color).toBe("");

    type(textarea, `see ${URL} now`);
    const link = container.querySelector("[data-composer-link]");
    expect(link?.getAttribute("data-composer-link")).toBe(URL);
    expect(textarea.style.color).toBe("transparent");
    expect(link?.parentElement?.textContent).toBe(`see ${URL} now`);

    type(textarea, "gone");
    expect(container.querySelector("[data-composer-link]")).toBeNull();
    expect(textarea.style.color).toBe("");
  });

  it("wraps the painted text exactly like the textarea", () => {
    const { container, textarea } = mount();
    const draft = `${"word ".repeat(30)}${URL}${"\nline".repeat(3)}\n`;
    type(textarea, draft);
    textarea.style.height = `${textarea.scrollHeight}px`;
    act(() => textarea.dispatchEvent(new Event("input")));
    const painted = container.querySelector("[data-composer-link]")?.parentElement;
    if (!painted) throw new Error("No overlay painted");
    const box = textarea.getBoundingClientRect();
    const overlay = painted.parentElement?.getBoundingClientRect();
    expect(overlay?.top).toBeCloseTo(box.top, 0);
    expect(overlay?.left).toBeCloseTo(box.left, 0);
    expect(painted.getBoundingClientRect().height).toBeCloseTo(textarea.scrollHeight, 0);
  });

  it("opens a link on modifier-click and ignores a plain click", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { container, textarea } = mount();
    type(textarea, URL);
    const link = container.querySelector("[data-composer-link]");
    if (!link) throw new Error("No link painted");
    const rect = link.getBoundingClientRect();
    const point = { clientX: rect.left + 4, clientY: rect.top + rect.height / 2, bubbles: true };

    textarea.dispatchEvent(new MouseEvent("mousedown", point));
    expect(open).not.toHaveBeenCalled();

    textarea.dispatchEvent(new MouseEvent("mousedown", { ...point, metaKey: true }));
    expect(open).toHaveBeenCalledWith(URL, "_blank", "noopener,noreferrer");
  });
});
