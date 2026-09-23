import type { AgentAttachment } from "@getpaseo/protocol/messages";
import { formatQuotedFileMentionPath } from "@/utils/file-mention-autocomplete";
import type { WorkspaceFileComposerAttachment, WorkspaceFileSelection } from "./types";

interface CreateWorkspaceFileAttachmentInput {
  path: string;
  selection?: WorkspaceFileSelection;
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "");
}

export function isWorkspaceFileComposerAttachment(
  value: unknown,
): value is WorkspaceFileComposerAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    record.kind !== "workspace_file" ||
    typeof record.path !== "string" ||
    record.path.trim().length === 0
  ) {
    return false;
  }
  const selection = record.selection;
  if (!selection || typeof selection !== "object") {
    return false;
  }
  const { kind, startLine, endLine } = selection as Record<string, unknown>;
  if (kind === "whole_file") {
    return true;
  }
  return (
    kind === "line_range" &&
    typeof startLine === "number" &&
    Number.isInteger(startLine) &&
    typeof endLine === "number" &&
    Number.isInteger(endLine) &&
    startLine > 0 &&
    endLine >= startLine
  );
}

export function createWorkspaceFileAttachment({
  path,
  selection = { kind: "whole_file" },
}: CreateWorkspaceFileAttachmentInput): WorkspaceFileComposerAttachment {
  return {
    kind: "workspace_file",
    path: normalizePath(path),
    selection,
  };
}

export function getWorkspaceFileAttachmentKey(attachment: WorkspaceFileComposerAttachment): string {
  const selection = attachment.selection;
  const selectionKey =
    selection.kind === "whole_file"
      ? selection.kind
      : `${selection.kind}:${selection.startLine}-${selection.endLine}`;
  return `${normalizePath(attachment.path)}:${selectionKey}`;
}

export function formatWorkspaceFileMention(attachment: WorkspaceFileComposerAttachment): string {
  const path = formatQuotedFileMentionPath(attachment.path);
  const { selection } = attachment;
  return selection.kind === "line_range"
    ? `${path} (lines ${selection.startLine}-${selection.endLine})`
    : path;
}

export function insertWorkspaceFileMention(input: {
  text: string;
  attachment: WorkspaceFileComposerAttachment;
  at?: number;
}): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(input.at ?? input.text.length, input.text.length));
  const before = input.text.slice(0, at);
  const after = input.text.slice(at);
  const lead = before.length === 0 || /\s$/.test(before) ? "" : " ";
  const trail = /^\s/.test(after) ? "" : " ";
  const mention = `${lead}${formatWorkspaceFileMention(input.attachment)}${trail}`;
  return { text: `${before}${mention}${after}`, cursor: before.length + mention.length };
}

export function workspaceFileAttachmentToAgentAttachment(
  attachment: WorkspaceFileComposerAttachment,
): Extract<AgentAttachment, { type: "text" }> {
  const fileName = attachment.path.split("/").pop() ?? attachment.path;
  const lines =
    attachment.selection.kind === "line_range"
      ? `\nLines: ${attachment.selection.startLine}-${attachment.selection.endLine}`
      : "";
  return {
    type: "text",
    mimeType: "text/plain",
    title: fileName,
    text: `Workspace file: ${attachment.path}${lines}`,
  };
}

export function getWorkspaceFileAttachmentSubtitle(
  attachment: WorkspaceFileComposerAttachment,
): string {
  if (attachment.selection.kind === "whole_file") {
    return attachment.path;
  }
  return `${attachment.path} · ${attachment.selection.startLine}-${attachment.selection.endLine}`;
}
