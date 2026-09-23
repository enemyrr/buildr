import type { AgentAttachment } from "@getpaseo/protocol/messages";

type UploadedFileAttachment = Extract<AgentAttachment, { type: "uploaded_file" }>;

// The daemon inlines uploaded files into the prompt text for providers that only take text (see
// renderPromptAttachmentAsText in packages/server). History replayed from those providers carries
// the block, so the client turns it back into an attachment.
const UPLOADED_FILE_BLOCK =
  /(?:^|\n+)Uploaded file: ([^\n]+)\nPath: ([^\n]+)\nMIME: ([^\n]+)\nSize: (\d+) bytes/g;

export function extractUploadedFileBlocks(text: string): {
  text: string;
  attachments: UploadedFileAttachment[];
} {
  const attachments: UploadedFileAttachment[] = [];
  const stripped = text.replace(
    UPLOADED_FILE_BLOCK,
    (_match, fileName: string, path: string, mimeType: string, size: string) => {
      attachments.push({
        type: "uploaded_file",
        id: path,
        fileName,
        path,
        mimeType,
        size: Number(size),
      });
      return "";
    },
  );
  if (attachments.length === 0) return { text, attachments };
  return { text: stripped.trim(), attachments };
}
