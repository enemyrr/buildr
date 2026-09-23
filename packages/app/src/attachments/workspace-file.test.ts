import { describe, expect, it } from "vitest";
import {
  createWorkspaceFileAttachment,
  formatWorkspaceFileMention,
  getWorkspaceFileAttachmentKey,
  getWorkspaceFileAttachmentSubtitle,
  insertWorkspaceFileMention,
  workspaceFileAttachmentToAgentAttachment,
} from "./workspace-file";
import { splitComposerAttachmentsForSubmit } from "@/composer/attachments/submit";

describe("workspace file attachments", () => {
  it("models whole files and line ranges as distinct selections", () => {
    const wholeFile = createWorkspaceFileAttachment({ path: "src/app.ts" });
    const lineRange = createWorkspaceFileAttachment({
      path: "src/app.ts",
      selection: { kind: "line_range", startLine: 12, endLine: 24 },
    });

    expect(wholeFile).toEqual({
      kind: "workspace_file",
      path: "src/app.ts",
      selection: { kind: "whole_file" },
    });
    expect(getWorkspaceFileAttachmentKey(wholeFile)).not.toBe(
      getWorkspaceFileAttachmentKey(lineRange),
    );
    expect(getWorkspaceFileAttachmentSubtitle(wholeFile)).toBe("src/app.ts");
    expect(getWorkspaceFileAttachmentSubtitle(lineRange)).toBe("src/app.ts · 12-24");
  });

  it("formats inline mentions and pads them against surrounding text", () => {
    const wholeFile = createWorkspaceFileAttachment({ path: "src/app.ts" });
    const range = createWorkspaceFileAttachment({
      path: "src/app.ts",
      selection: { kind: "line_range", startLine: 1, endLine: 5 },
    });

    expect(formatWorkspaceFileMention(wholeFile)).toBe('"src/app.ts"');
    expect(formatWorkspaceFileMention(range)).toBe('"src/app.ts" (lines 1-5)');
    expect(insertWorkspaceFileMention({ text: "", attachment: wholeFile })).toEqual({
      text: '"src/app.ts" ',
      cursor: 13,
    });
    expect(insertWorkspaceFileMention({ text: "look at", attachment: wholeFile })).toEqual({
      text: 'look at "src/app.ts" ',
      cursor: 21,
    });
    expect(
      insertWorkspaceFileMention({ text: "fix  please", attachment: wholeFile, at: 4 }),
    ).toEqual({ text: 'fix "src/app.ts" please', cursor: 16 });
  });

  it("submits a path reference without uploading or inserting prompt text", () => {
    const attachment = createWorkspaceFileAttachment({
      path: "src/app.ts",
      selection: { kind: "line_range", startLine: 12, endLine: 24 },
    });

    expect(workspaceFileAttachmentToAgentAttachment(attachment)).toEqual({
      type: "text",
      mimeType: "text/plain",
      title: "app.ts",
      text: "Workspace file: src/app.ts\nLines: 12-24",
    });
    expect(splitComposerAttachmentsForSubmit([attachment])).toEqual({
      images: [],
      attachments: [workspaceFileAttachmentToAgentAttachment(attachment)],
    });
  });
});
