import { describe, expect, it } from "vitest";
import { extractUploadedFileBlocks } from "./uploaded-file-blocks";

describe("extractUploadedFileBlocks", () => {
  it("turns an inlined upload into an attachment and strips it from the text", () => {
    const text = [
      "Create a PR",
      "",
      "Uploaded file: PR instructions.md",
      "Path: /tmp/uploads/abc/PR instructions.md",
      "MIME: text/markdown",
      "Size: 1009 bytes",
    ].join("\n");

    expect(extractUploadedFileBlocks(text)).toEqual({
      text: "Create a PR",
      attachments: [
        {
          type: "uploaded_file",
          id: "/tmp/uploads/abc/PR instructions.md",
          fileName: "PR instructions.md",
          path: "/tmp/uploads/abc/PR instructions.md",
          mimeType: "text/markdown",
          size: 1009,
        },
      ],
    });
  });

  it("leaves text without uploads unchanged", () => {
    expect(extractUploadedFileBlocks("  hello  ")).toEqual({ text: "  hello  ", attachments: [] });
  });
});
