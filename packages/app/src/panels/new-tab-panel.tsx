import { memo, useCallback, useEffect, useRef, type ComponentType, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { Pencil, Plus } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { TerminalProfileIcon } from "@/components/terminal-profile-icon";
import { Shortcut } from "@/components/ui/shortcut";
import { isWeb } from "@/constants/platform";
import { useAppSettings, type DefaultNewTab } from "@/hooks/use-settings";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { usePaneContext, usePaneFocus } from "@/panels/pane-context";
import { definePanel, type PanelIconProps } from "@/panels/panel-registry";
import { ICON_SIZE, SPACING, type Theme } from "@/styles/theme";
import {
  useWorkspaceTabLaunchCatalog,
  type WorkspaceTabLaunchItem,
} from "@/workspace-tabs/launcher";

const ThemedPlus = withUnistyles(Plus);
const ThemedPencil = withUnistyles(Pencil);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const extraMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
});
/** Every launcher row leads with the same glyph box so labels share one rail. */
const LAUNCHER_ICON_SIZE = ICON_SIZE.md;
const LAUNCHER_MAX_WIDTH = 380;
const EDIT_PROFILES_HIT_SIZE = ICON_SIZE.xs + SPACING[2];
const ROW_DATA_SET = { newTabLauncherRow: "true" };
const ROW_SELECTOR = '[data-new-tab-launcher-row="true"]';
function LauncherIcon({
  Icon,
  color = "",
}: {
  Icon: ComponentType<PanelIconProps>;
  color?: string;
}) {
  return <Icon size={LAUNCHER_ICON_SIZE} color={color} />;
}

const ThemedLauncherIcon = withUnistyles(LauncherIcon);

function LauncherShortcut({ actionId }: { actionId: string }): ReactElement | null {
  const keys = useShortcutKeys(actionId);
  return keys ? <Shortcut chord={keys} /> : null;
}

function rowStyle({
  pressed,
  hovered = false,
  focused = false,
}: PressableStateCallbackType & { hovered?: boolean; focused?: boolean }) {
  return [
    styles.row,
    (hovered || focused) && styles.rowHovered,
    focused && styles.rowFocused,
    pressed && styles.rowPressed,
  ];
}

function editProfilesStyle({ pressed, hovered }: PressableStateCallbackType) {
  return [styles.editProfiles, (hovered || pressed) && styles.editProfilesHovered];
}

function EditProfilesButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={editProfilesStyle}
      testID="workspace-new-tab-edit-terminal-profiles"
    >
      <View style={styles.editProfilesGlyph}>
        <ThemedPencil size={ICON_SIZE.xs} uniProps={extraMutedColorMapping} />
      </View>
    </Pressable>
  );
}

function LauncherRow({ item }: { item: WorkspaceTabLaunchItem }) {
  const { tabId } = usePaneContext();
  const handlePress = useCallback(() => {
    item.launch({ kind: "replace", tabId });
  }, [item, tabId]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      dataSet={ROW_DATA_SET}
      disabled={item.disabled}
      onPress={handlePress}
      style={rowStyle}
      tabIndex={-1}
      testID={`workspace-new-tab-${item.id}`}
    >
      {item.Icon ? <ThemedLauncherIcon Icon={item.Icon} uniProps={mutedColorMapping} /> : null}
      {item.terminalIconKey ? (
        <TerminalProfileIcon iconKey={item.terminalIconKey} size={LAUNCHER_ICON_SIZE} />
      ) : null}
      <Text numberOfLines={1} style={styles.rowLabel}>
        {item.label}
      </Text>
      {item.shortcutActionId ? <LauncherShortcut actionId={item.shortcutActionId} /> : null}
    </Pressable>
  );
}

function useNewTabDescriptor() {
  const { t } = useTranslation();
  const label = t("workspace.tabs.actions.newTab");
  return {
    label,
    subtitle: label,
    tooltip: label,
    titleState: "ready" as const,
    icon: ThemedPlus,
    statusBucket: null,
  };
}

/**
 * Unless the user picked the launcher, an empty main-pane slot becomes their default
 * tab as soon as it mounts. The placeholder stays in the layout model because pane
 * operations replace it synchronously (splits, the explorer sidebar) before it ever
 * renders. Falls back to an agent draft when the default is unavailable here.
 */
function PromoteToDefaultTab({ target }: { target: Exclude<DefaultNewTab, "launcher"> }): null {
  const { serverId, tabId } = usePaneContext();
  const groups = useWorkspaceTabLaunchCatalog({ serverId, purpose: "primary", host: "main" });
  const items = groups.flatMap((group) => group.items);
  const item =
    items.find((candidate) => candidate.id === target) ??
    items.find((candidate) => candidate.id === "agent");
  // Terminal creation is async; a catalog re-render must not launch a second one.
  const launchedRef = useRef(false);
  useEffect(() => {
    if (launchedRef.current || !item || item.disabled) return;
    launchedRef.current = true;
    item.launch({ kind: "replace", tabId });
  }, [item, tabId]);
  return null;
}

const NewTabPanel = memo(function NewTabPanel(): ReactElement | null {
  const { host } = usePaneContext();
  const { settings, isLoading } = useAppSettings();
  if (host === "explorer" || settings.defaultNewTab === "launcher") {
    return <NewTabLauncher />;
  }
  return isLoading ? null : <PromoteToDefaultTab target={settings.defaultNewTab} />;
});

function NewTabLauncher(): ReactElement {
  const { serverId, host } = usePaneContext();
  const { isInteractive, focusPane } = usePaneFocus();
  const containerRef = useRef<View | null>(null);
  const groups = useWorkspaceTabLaunchCatalog({
    serverId,
    purpose: host === "explorer" ? "supporting" : "primary",
    host,
  });

  useEffect(() => {
    if (!isWeb || !isInteractive) return;
    const container: unknown = containerRef.current;
    if (!(container instanceof HTMLElement)) return;
    const webContainer = container as HTMLElement;

    function rows() {
      return Array.from(webContainer.querySelectorAll(ROW_SELECTOR)) as HTMLElement[];
    }
    function focusFirstRow() {
      rows()[0]?.focus({ preventScroll: true });
    }
    function handlePointerDown(event: PointerEvent) {
      focusPane();
      if (!(event.target instanceof Element) || !event.target.closest(ROW_SELECTOR)) {
        requestAnimationFrame(focusFirstRow);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      const availableRows = rows();
      const currentIndex = availableRows.findIndex((row) => row === document.activeElement);
      let direction = 0;
      if (event.key === "ArrowDown") {
        direction = 1;
      } else if (event.key === "ArrowUp") {
        direction = -1;
      }
      if (direction !== 0 && availableRows.length > 0) {
        event.preventDefault();
        let start = currentIndex;
        if (currentIndex < 0) {
          start = direction > 0 ? -1 : 0;
        }
        const nextIndex = (start + direction + availableRows.length) % availableRows.length;
        availableRows[nextIndex]?.focus();
      }
      if (event.key === "Enter" && currentIndex >= 0) {
        event.preventDefault();
        availableRows[currentIndex]?.click();
      }
    }

    webContainer.addEventListener("pointerdown", handlePointerDown, true);
    webContainer.addEventListener("keydown", handleKeyDown);
    focusFirstRow();
    return () => {
      webContainer.removeEventListener("pointerdown", handlePointerDown, true);
      webContainer.removeEventListener("keydown", handleKeyDown);
    };
  }, [focusPane, isInteractive]);

  return (
    <View ref={containerRef} style={styles.container} testID="workspace-new-tab-panel">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.rail}>
          {groups.map((group) => (
            <View key={group.id} style={styles.group}>
              {group.label ? (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  {group.accessory ? (
                    <EditProfilesButton
                      label={group.accessory.label}
                      onPress={group.accessory.run}
                    />
                  ) : null}
                </View>
              ) : null}
              {group.items.map((item) => (
                <LauncherRow key={item.id} item={item} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export const newTabPanelRegistration = definePanel("new_tab", {
  component: NewTabPanel,
  useDescriptor: useNewTabDescriptor,
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  rail: {
    width: "100%",
    maxWidth: LAUNCHER_MAX_WIDTH,
    gap: theme.spacing[12],
  },
  group: {
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 44,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
    outlineWidth: 0,
    outlineColor: "transparent",
    backgroundColor: theme.colors.surface1,
  },
  rowHovered: { backgroundColor: theme.colors.surface2 },
  rowFocused: { borderColor: theme.colors.borderAccent },
  rowPressed: { opacity: 0.85 },
  rowLabel: { flex: 1, color: theme.colors.foreground },
  // The section header shares the launcher rows' outer rails. The pencil's own
  // padding is subtracted so its glyph — not its hover box — lands on the right rail.
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: theme.spacing[1],
  },
  groupLabel: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    // Without an explicit line height the font's ascent/descent split the text box
    // unevenly and the label rides above the pencil beside it.
    lineHeight: EDIT_PROFILES_HIT_SIZE,
  },
  // The box is the hover target; the negative margin cancels its growth on every
  // side, so its layout footprint stays the glyph and the header keeps its height.
  editProfiles: {
    width: EDIT_PROFILES_HIT_SIZE,
    height: EDIT_PROFILES_HIT_SIZE,
    margin: -(EDIT_PROFILES_HIT_SIZE - ICON_SIZE.xs) / 2,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  // Opacity sits on the whole glyph, not per path — the pencil's two strokes
  // overlap and would render unevenly if each faded on its own.
  editProfilesGlyph: {
    opacity: theme.opacity[50],
  },
  editProfilesHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
