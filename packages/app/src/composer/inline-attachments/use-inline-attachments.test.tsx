/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserComposerAttachment } from "@/attachments/types";
import type { ComposerTextSource } from "@/composer/text-source";
import { createInlineToken, formatInlineLabel } from "./tokens";
import { useInlineAttachments } from "./use-inline-attachments";
import type { UseInlineAttachmentsInput } from "./use-inline-attachments.types";

const image: UserComposerAttachment = {
  kind: "image",
  metadata: {
    id: "image-1",
    mimeType: "image/png",
    storageType: "web-indexeddb",
    storageKey: "image-1",
    fileName: "image.png",
    createdAt: 0,
  },
};

describe("useInlineAttachments", () => {
  it("doesn't restore text a submit cleared while the draft store lags behind", () => {
    const sentText = `${createInlineToken(formatInlineLabel("image.png"))} Hello`;
    // On web the draft store gets typed text a frame after the input does.
    const staleStore: ComposerTextSource = {
      getSnapshot: () => sentText,
      subscribe: () => () => {},
    };
    let liveText = sentText;
    const replaceText = vi.fn((text: string) => {
      liveText = text;
    });
    const input = (attachments: UserComposerAttachment[]): UseInlineAttachmentsInput => ({
      enabled: true,
      attachments,
      setAttachments: vi.fn(),
      textSource: staleStore,
      getText: () => liveText,
      getSelection: () => ({ start: liveText.length, end: liveText.length }),
      setSelection: vi.fn(),
      replaceText,
      isWritingText: () => false,
      onChangeText: vi.fn(),
      onSelectionChange: vi.fn(),
      onRemoveAttachment: vi.fn(),
      onOpenAttachment: vi.fn(),
    });
    const { rerender } = renderHook(
      (props: UseInlineAttachmentsInput) => useInlineAttachments(props),
      {
        initialProps: input([image]),
      },
    );
    expect(replaceText).not.toHaveBeenCalled();

    liveText = "";
    rerender(input([]));

    expect(replaceText).not.toHaveBeenCalled();
    expect(liveText).toBe("");
  });
});
