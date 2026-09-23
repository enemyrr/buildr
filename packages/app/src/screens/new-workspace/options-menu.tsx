import { useCallback, useMemo, type ComponentProps, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronsUpDown, Folder, GitBranch, MoreHorizontal } from "lucide-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const ThemedChevronsUpDown = withUnistyles(ChevronsUpDown);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedFolder = withUnistyles(Folder);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const worktreeIcon = <ThemedGitBranch size={ICON_SIZE.sm} uniProps={mutedColorMapping} />;
const localIcon = <ThemedFolder size={ICON_SIZE.sm} uniProps={mutedColorMapping} />;

type Isolation = "local" | "worktree";

export interface NewWorkspaceOptionsMenuProps {
  disabled: boolean;
  badgePressableStyle: ComponentProps<typeof Pressable>["style"];
  /** Null hides the row: a local workspace has no branch to target. */
  targetBranch: { label: string; onOpen: () => void } | null;
  isolation: {
    value: Isolation;
    canCreateWorktree: boolean;
    onSelect: (value: Isolation) => void;
  };
}

/** The card header's `...`: target branch and isolation, the settings you rarely change. */
export function NewWorkspaceOptionsMenu({
  disabled,
  badgePressableStyle,
  targetBranch,
  isolation,
}: NewWorkspaceOptionsMenuProps): ReactElement | null {
  const { t } = useTranslation();
  const { onSelect: onSelectIsolation } = isolation;
  const selectWorktree = useCallback(() => onSelectIsolation("worktree"), [onSelectIsolation]);
  const selectLocal = useCallback(() => onSelectIsolation("local"), [onSelectIsolation]);
  const targetBranchLabel = targetBranch?.label;
  const targetBranchValue = useMemo(
    () => (
      <View style={styles.trailingValue}>
        <Text style={styles.trailingValueText} numberOfLines={1}>
          {targetBranchLabel}
        </Text>
        <ThemedChevronsUpDown size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
      </View>
    ),
    [targetBranchLabel],
  );

  if (!targetBranch && !isolation.canCreateWorktree) return null;

  return (
    <DropdownMenu compactMode="sheet">
      <DropdownMenuTrigger
        testID="new-workspace-options-trigger"
        disabled={disabled}
        style={badgePressableStyle}
        accessibilityRole="button"
        accessibilityLabel={t("newWorkspace.moreOptions")}
      >
        <ThemedMoreHorizontal size={ICON_SIZE.md} uniProps={mutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        offset={8}
        width={280}
        sheetTitle={t("newWorkspace.moreOptions")}
        testID="new-workspace-options-menu"
      >
        {targetBranch ? (
          <DropdownMenuItem
            testID="new-workspace-target-branch"
            onSelect={targetBranch.onOpen}
            trailing={targetBranchValue}
          >
            {t("newWorkspace.createFrom.targetBranch")}
          </DropdownMenuItem>
        ) : null}
        {targetBranch && isolation.canCreateWorktree ? <DropdownMenuSeparator /> : null}
        {isolation.canCreateWorktree ? (
          <>
            <DropdownMenuLabel>{t("newWorkspace.isolation.label")}</DropdownMenuLabel>
            <DropdownMenuItem
              testID="workspace-create-isolation-worktree"
              onSelect={selectWorktree}
              selected={isolation.value === "worktree"}
              leading={worktreeIcon}
            >
              {t("newWorkspace.isolation.worktree")}
            </DropdownMenuItem>
            <DropdownMenuItem
              testID="workspace-create-isolation-local"
              onSelect={selectLocal}
              selected={isolation.value === "local"}
              leading={localIcon}
            >
              {t("newWorkspace.isolation.local")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  trailingValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 160,
  },
  trailingValueText: {
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
    color: theme.colors.foregroundMuted,
  },
}));
