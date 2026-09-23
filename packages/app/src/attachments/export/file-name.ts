import type { AttachmentMetadata } from "@/attachments/types";

export function resolveAttachmentFileName(attachment: AttachmentMetadata): string {
  if (attachment.fileName) return attachment.fileName;
  const subtype = attachment.mimeType.split("/")[1]?.split("+")[0] ?? "bin";
  const extension = subtype === "jpeg" ? "jpg" : subtype;
  return `image-${attachment.id}.${extension}`;
}
