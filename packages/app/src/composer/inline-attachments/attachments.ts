import type { UserComposerAttachment } from "@/attachments/types";
import { getWorkspaceFileAttachmentLabel } from "@/attachments/workspace-file";
import type { InlineChipKind } from "@/composer/input/text-overlay.types";
import { getForgePresentation } from "@/git/forge";
import { formatAttachmentReference, formatImageReference } from "./references";
import { formatInlineLabel, type InlineAttachmentItem } from "./tokens";

function describe(attachment: UserComposerAttachment): {
  label: string;
  kind: InlineChipKind;
  url?: string;
} {
  switch (attachment.kind) {
    case "image":
      return { label: attachment.metadata.fileName || "image", kind: "image" };
    case "file":
      return { label: attachment.attachment.fileName, kind: "file" };
    case "workspace_file":
      return { label: getWorkspaceFileAttachmentLabel(attachment), kind: "file" };
    case "plugin_resource":
      return {
        label: `${attachment.item.identifier} ${attachment.item.title}`,
        kind: "resource",
      };
    default: {
      const { item } = attachment;
      const presentation = getForgePresentation(item.forge ?? "github");
      const isChangeRequest = item.kind === "change_request";
      const prefix = isChangeRequest ? presentation.numberPrefix : presentation.issueNumberPrefix;
      return {
        label: `${prefix}${item.number} ${item.title}`,
        kind: isChangeRequest ? "change_request" : "issue",
        url: item.url,
      };
    }
  }
}

export interface InlineAttachment extends InlineAttachmentItem<UserComposerAttachment> {
  kind: InlineChipKind;
}

/**
 * Describes each attachment as an inline token. Images carry no name the agent
 * can see, so they're referenced by position: `[Image #2]` is the second image
 * sent with the message.
 */
export function buildInlineAttachments(
  attachments: readonly UserComposerAttachment[],
): InlineAttachment[] {
  let imageCount = 0;
  return attachments.map((attachment) => {
    const { label, kind, url } = describe(attachment);
    const formatted = formatInlineLabel(label);
    const reference =
      kind === "image" ? formatImageReference(++imageCount) : formatAttachmentReference(label);
    return { item: attachment, label: formatted, reference, kind, url };
  });
}
