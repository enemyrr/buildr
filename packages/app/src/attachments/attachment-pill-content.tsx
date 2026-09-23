import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import React from "react";
import {
  CircleDot,
  FileText,
  GitPullRequest,
  MessageSquareCode,
  MousePointer2,
} from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type { WorkspaceComposerAttachment } from "@/attachments/types";
import { isPullRequestContextAttachment } from "@/attachments/workspace-attachment-utils";
import { getForgePresentation } from "@/git/forge";
import { ICON_SIZE, type Theme } from "@/styles/theme";

export interface AttachmentPillContent {
  icon: ReactNode;
  label: string;
}

function getReviewLabel(count: number, t: TFunction): string {
  const comments =
    count === 1
      ? t("message.attachments.commentsOne")
      : t("message.attachments.commentsMany", { count });
  return `${t("message.attachments.review")} · ${comments}`;
}

export function getAgentAttachmentPillContent(
  attachment: AgentAttachment,
  t: TFunction,
): AttachmentPillContent {
  switch (attachment.type) {
    case "review":
      return {
        icon: attachmentReviewIcon,
        label: getReviewLabel(attachment.comments.length, t),
      };
    case "forge_change_request": {
      const presentation = getForgePresentation(attachment.forge ?? "github");
      return {
        icon: attachmentGithubPrIcon,
        label: `${presentation.numberPrefix}${attachment.number} ${attachment.title}`,
      };
    }
    case "github_pr":
      return {
        icon: attachmentGithubPrIcon,
        label: `#${attachment.number} ${attachment.title}`,
      };
    case "forge_issue":
    case "github_issue":
      return {
        icon: attachmentGithubIssueIcon,
        label: `#${attachment.number} ${attachment.title}`,
      };
    case "text":
      if (attachment.externalResource) {
        return {
          icon: attachmentGithubIssueIcon,
          label: `${attachment.externalResource.identifier} ${attachment.externalResource.title}`,
        };
      }
      return {
        icon: attachmentFileIcon,
        label: attachment.title ?? t("message.attachments.textAttachment"),
      };
    case "uploaded_file":
      return {
        icon: attachmentFileIcon,
        label: attachment.fileName,
      };
  }
}

export function getWorkspaceAttachmentPillContent(
  attachment: WorkspaceComposerAttachment,
  t: TFunction,
): AttachmentPillContent {
  if (attachment.kind === "browser_element") {
    return { icon: attachmentBrowserIcon, label: attachment.attachment.tag };
  }
  if (isPullRequestContextAttachment(attachment)) {
    return { icon: attachmentFileIcon, label: attachment.title };
  }
  if (attachment.kind === "chat_history") {
    return {
      icon: attachmentFileIcon,
      label: attachment.attachment.title ?? t("message.attachments.textAttachment"),
    };
  }
  return {
    icon: attachmentReviewIcon,
    label: getReviewLabel(attachment.commentCount, t),
  };
}

const ThemedAttachmentFileText = withUnistyles(FileText);
const ThemedAttachmentGitPullRequest = withUnistyles(GitPullRequest);
const ThemedAttachmentCircleDot = withUnistyles(CircleDot);
const ThemedAttachmentMessageSquareCode = withUnistyles(MessageSquareCode);
const ThemedAttachmentMousePointer = withUnistyles(MousePointer2);

const iconForegroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const attachmentReviewIcon = (
  <ThemedAttachmentMessageSquareCode size={ICON_SIZE.xs} uniProps={iconForegroundMutedMapping} />
);
const attachmentGithubPrIcon = (
  <ThemedAttachmentGitPullRequest size={ICON_SIZE.xs} uniProps={iconForegroundMutedMapping} />
);
const attachmentGithubIssueIcon = (
  <ThemedAttachmentCircleDot size={ICON_SIZE.xs} uniProps={iconForegroundMutedMapping} />
);
const attachmentFileIcon = (
  <ThemedAttachmentFileText size={ICON_SIZE.xs} uniProps={iconForegroundMutedMapping} />
);
const attachmentBrowserIcon = (
  <ThemedAttachmentMousePointer size={ICON_SIZE.xs} uniProps={iconForegroundMutedMapping} />
);
