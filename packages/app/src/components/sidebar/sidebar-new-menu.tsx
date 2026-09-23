import { useState } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { FolderPlus, Import, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const ThemedPlus = withUnistyles(Plus);
const ThemedFolderPlus = withUnistyles(FolderPlus);
const ThemedImport = withUnistyles(Import);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const addProjectLeadingIcon = (
  <ThemedFolderPlus size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);
const importLeadingIcon = (
  <ThemedImport size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);

function triggerStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.trigger, Boolean(hovered) && styles.triggerHovered];
}

export function SidebarNewMenu({
  onAddProject,
  onImportSession,
}: {
  onAddProject: () => void;
  onImportSession: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = t("sidebar.actions.addProject");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={300} enabledOnDesktop={!open}>
        <TooltipTrigger asChild>
          <View>
            <DropdownMenuTrigger
              style={triggerStyle}
              testID="sidebar-new-menu"
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              {({ hovered }) => (
                <ThemedPlus
                  size={ICON_SIZE.sm}
                  uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
                />
              )}
            </DropdownMenuTrigger>
          </View>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <Text style={styles.tooltipText}>{label}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end" offset={4} width={220}>
        <DropdownMenuItem
          testID="sidebar-add-project"
          leading={addProjectLeadingIcon}
          onSelect={onAddProject}
        >
          {label}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID="sidebar-import-session"
          leading={importLeadingIcon}
          onSelect={onImportSession}
        >
          {t("importSession.title")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
