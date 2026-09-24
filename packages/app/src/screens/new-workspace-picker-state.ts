import {
  NEW_WORKSPACE_PICKER_ATTACHMENT_OWNER,
  isPickerOwnedAttachment,
  type UserComposerAttachment,
} from "@/attachments/types";
import type { ForgeSearchItem } from "@getpaseo/protocol/messages";
import type { PickerItem, RefPickerItem } from "./new-workspace-picker-item";

export interface PickerSelectionState {
  selectedItem: RefPickerItem | null;
  allowAutoPrSelection: boolean;
}

export type PickerSelectionEvent =
  | { type: "pr-detected" }
  | { type: "pr-added"; item: Extract<PickerItem, { kind: "github-pr" }> }
  | { type: "picker-selected"; item: RefPickerItem }
  | { type: "cleared" }
  | { type: "target-changed" };

export const initialPickerSelectionState: PickerSelectionState = {
  selectedItem: null,
  allowAutoPrSelection: false,
};

export function reducePickerSelection(
  state: PickerSelectionState,
  event: PickerSelectionEvent,
): PickerSelectionState {
  switch (event.type) {
    case "pr-detected":
      return { ...state, allowAutoPrSelection: true };
    case "pr-added":
      return state.allowAutoPrSelection
        ? { selectedItem: event.item, allowAutoPrSelection: false }
        : state;
    case "picker-selected":
      return { selectedItem: event.item, allowAutoPrSelection: false };
    case "cleared":
    case "target-changed":
      return initialPickerSelectionState;
  }
}

function isPrAttachment(
  attachment: UserComposerAttachment,
): attachment is Extract<UserComposerAttachment, { kind: "forge_change_request" | "github_pr" }> {
  return attachment.kind === "forge_change_request" || attachment.kind === "github_pr";
}

function isIssueAttachment(
  attachment: UserComposerAttachment,
): attachment is Extract<UserComposerAttachment, { kind: "forge_issue" | "github_issue" }> {
  return attachment.kind === "forge_issue" || attachment.kind === "github_issue";
}

// Ownership lives on the attachment because drafts outlive this component.
// The picker owns at most one PR and one issue, and takes over a matching
// attachment so the header is its only representation. Other PRs and issues
// remain untouched.
export function syncPickerPrAttachment(input: {
  attachments: UserComposerAttachment[];
  item: PickerItem | null;
}): UserComposerAttachment[] {
  const selectedPr = input.item?.kind === "github-pr" ? input.item.item : null;
  const nextAttachments = input.attachments.filter(
    (attachment) =>
      !(isPickerOwnedAttachment(attachment) && attachment.kind === "github_pr") &&
      !(selectedPr && isPrAttachment(attachment) && attachment.item.number === selectedPr.number),
  );
  if (!selectedPr) {
    return nextAttachments;
  }
  return [
    ...nextAttachments,
    { kind: "github_pr", item: selectedPr, owner: NEW_WORKSPACE_PICKER_ATTACHMENT_OWNER },
  ];
}

export function syncPickerIssueAttachment(input: {
  attachments: UserComposerAttachment[];
  issue: ForgeSearchItem | null;
}): UserComposerAttachment[] {
  const { issue } = input;
  const nextAttachments = input.attachments.filter(
    (attachment) =>
      !(isPickerOwnedAttachment(attachment) && attachment.kind === "github_issue") &&
      !(issue && isIssueAttachment(attachment) && attachment.item.number === issue.number),
  );
  if (!issue) {
    return nextAttachments;
  }
  return [
    ...nextAttachments,
    { kind: "github_issue", item: issue, owner: NEW_WORKSPACE_PICKER_ATTACHMENT_OWNER },
  ];
}

/** The issue the picker attached, which the header shows in place of the ref. */
export function selectPickerIssue(
  attachments: readonly UserComposerAttachment[],
): ForgeSearchItem | null {
  for (const attachment of attachments) {
    if (isPickerOwnedAttachment(attachment) && attachment.kind === "github_issue") {
      return attachment.item;
    }
  }
  return null;
}

export function clearPickerPrAttachmentForTargetChange(input: {
  attachments: UserComposerAttachment[];
  currentTargetId: string;
  nextTargetId: string;
}): UserComposerAttachment[] {
  if (input.currentTargetId === input.nextTargetId) {
    return input.attachments;
  }
  // An issue belongs to the old repository too.
  return input.attachments.filter(
    (attachment) => !isPrAttachment(attachment) && !isPickerOwnedAttachment(attachment),
  );
}
