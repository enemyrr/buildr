import type { ComponentType } from "react";
import { i18n } from "@/i18n/i18next";
import type { PanelDescriptor, PanelIconProps } from "@/panels/panel-registry";

export function buildDraftPanelDescriptor(input: {
  isCreating: boolean;
  pendingPrompt?: string | null;
  icon: ComponentType<PanelIconProps>;
}): PanelDescriptor {
  const { icon, isCreating, pendingPrompt } = input;
  const untitledLabel = i18n.t("panels.draft.untitled");
  const creatingLabel = pendingPrompt?.trim() || untitledLabel;
  if (isCreating) {
    return {
      label: creatingLabel,
      subtitle: i18n.t("panels.draft.creatingAgent"),
      tooltip: creatingLabel,
      titleState: "ready",
      icon,
      statusBucket: "running",
    };
  }

  return {
    label: untitledLabel,
    subtitle: untitledLabel,
    tooltip: untitledLabel,
    titleState: "ready",
    icon,
    statusBucket: null,
  };
}
