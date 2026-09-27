import { useCallback, useMemo, type ReactElement } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  AlarmClock,
  AlarmClockOff,
  CalendarClock,
  CalendarDays,
  Clock,
  Sunrise,
} from "lucide-react-native";
import type { WorkspaceSnooze } from "@getpaseo/protocol/messages";
import {
  MenuItem,
  MenuSeparator,
  MenuSubTrigger,
  type MenuPageDefinition,
} from "@/components/ui/menu";
import { useToast } from "@/contexts/toast-context";
import { useHostFeature } from "@/runtime/host-features";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import type { Theme } from "@/styles/theme";
import { toErrorMessage } from "@/utils/error-messages";
import { formatSnoozeWake, setWorkspaceSnoozeWithUndo, type SnoozeTarget } from "./actions";
import { useCustomSnoozeStore } from "./custom-snooze-store";
import {
  canSnoozeWorkspace,
  isWorkspaceSnoozed,
  resolveSnoozePresets,
  type SnoozePresetId,
} from "./model";

export const WORKSPACE_SNOOZE_PAGE_ID = "workspaceSnooze";

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedAlarmClock = withUnistyles(AlarmClock);
const ThemedAlarmClockOff = withUnistyles(AlarmClockOff);
const ThemedCalendarClock = withUnistyles(CalendarClock);
const ThemedCalendarDays = withUnistyles(CalendarDays);
const ThemedClock = withUnistyles(Clock);
const ThemedSunrise = withUnistyles(Sunrise);
const snoozeLeadingIcon = <ThemedAlarmClock size={14} uniProps={mutedMapping} />;
const wakeLeadingIcon = <ThemedAlarmClockOff size={14} uniProps={mutedMapping} />;
const customLeadingIcon = <ThemedCalendarClock size={14} uniProps={mutedMapping} />;

const PRESET_PRESENTATION: Record<SnoozePresetId, { labelKey: string; icon: ReactElement }> = {
  "later-today": {
    labelKey: "sidebar.snooze.laterToday",
    icon: <ThemedClock size={14} uniProps={mutedMapping} />,
  },
  tomorrow: {
    labelKey: "sidebar.snooze.tomorrow",
    icon: <ThemedSunrise size={14} uniProps={mutedMapping} />,
  },
  "next-monday": {
    labelKey: "sidebar.snooze.nextMonday",
    icon: <ThemedCalendarDays size={14} uniProps={mutedMapping} />,
  },
};

interface SnoozeMenuState {
  /** The snooze that hides the workspace, or null when it is awake. */
  snooze: WorkspaceSnooze | null;
  canSnooze: boolean;
}

function useSnoozeMenuState(target: SnoozeTarget): SnoozeMenuState | null {
  const fields = useWorkspaceFields(target.serverId, target.workspaceId, (workspace) => ({
    snooze: workspace.snooze ?? null,
    status: workspace.status,
    statusEnteredAt: workspace.statusEnteredAt,
  }));
  if (!fields) {
    return null;
  }
  const snoozed = isWorkspaceSnoozed(fields, Date.now());
  return {
    snooze: snoozed ? fields.snooze : null,
    canSnooze: canSnoozeWorkspace(fields.status),
  };
}

/** Returns the `Snooze` page for the workspace kebab and context menu, or null without host support. */
export function useWorkspaceSnoozeMenuPage(target: SnoozeTarget | null): MenuPageDefinition | null {
  const { t } = useTranslation();
  const supported = useHostFeature(target?.serverId, "workspaceSnooze");
  return useMemo(
    () =>
      target && supported
        ? {
            id: WORKSPACE_SNOOZE_PAGE_ID,
            title: t("sidebar.snooze.action"),
            content: <WorkspaceSnoozePage target={target} />,
          }
        : null,
    [supported, t, target],
  );
}

/**
 * The root row reads as the decision's answer: the wake time while snoozed, nothing otherwise.
 * It is absent while the workspace needs you, the same way `Mark as read` is absent when there is
 * nothing to read.
 */
export function WorkspaceSnoozeSubTrigger({
  target,
}: {
  target: SnoozeTarget;
}): ReactElement | null {
  const { t } = useTranslation();
  const supported = useHostFeature(target.serverId, "workspaceSnooze");
  const state = useSnoozeMenuState(target);
  if (!supported || !state || (!state.snooze && !state.canSnooze)) {
    return null;
  }
  const value = state.snooze
    ? formatSnoozeWake(new Date(state.snooze.until), new Date())
    : undefined;
  return (
    <MenuSubTrigger
      id={WORKSPACE_SNOOZE_PAGE_ID}
      leading={snoozeLeadingIcon}
      value={value}
      testID={`sidebar-workspace-menu-snooze-${target.workspaceKey}`}
    >
      {t("sidebar.snooze.action")}
    </MenuSubTrigger>
  );
}

function WorkspaceSnoozePage({ target }: { target: SnoozeTarget }): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const state = useSnoozeMenuState(target);
  const snooze = state?.snooze ?? null;
  const openCustom = useCustomSnoozeStore((store) => store.open);
  const now = new Date();
  const presets = resolveSnoozePresets(now);

  const apply = useCallback(
    (until: Date | null) => {
      void setWorkspaceSnoozeWithUndo({ target, until, previous: snooze }).catch((error) => {
        toast.error(toErrorMessage(error) || t("sidebar.snooze.failed"));
      });
    },
    [snooze, t, target, toast],
  );
  const wake = useCallback(() => apply(null), [apply]);
  const custom = useCallback(
    () => openCustom({ target, previous: snooze }),
    [openCustom, snooze, target],
  );

  return (
    <>
      {presets.map((preset) => (
        <SnoozePresetRow
          key={preset.id}
          label={t(PRESET_PRESENTATION[preset.id].labelKey)}
          icon={PRESET_PRESENTATION[preset.id].icon}
          wakeLabel={formatSnoozeWake(preset.until, now)}
          until={preset.until}
          onApply={apply}
          testID={`workspace-snooze-menu-${preset.id}`}
        />
      ))}
      <MenuItem leading={customLeadingIcon} onSelect={custom} testID="workspace-snooze-menu-custom">
        {t("sidebar.snooze.custom")}
      </MenuItem>
      {snooze ? (
        <>
          <MenuSeparator />
          <MenuItem leading={wakeLeadingIcon} onSelect={wake} testID="workspace-snooze-menu-wake">
            {t("sidebar.snooze.wake")}
          </MenuItem>
        </>
      ) : null}
    </>
  );
}

function SnoozePresetRow({
  label,
  icon,
  wakeLabel,
  until,
  onApply,
  testID,
}: {
  label: string;
  icon: ReactElement;
  wakeLabel: string;
  until: Date;
  onApply: (until: Date) => void;
  testID: string;
}): ReactElement {
  const select = useCallback(() => onApply(until), [onApply, until]);
  // The wake time sits where a submenu row shows its value, so the row stays one line tall.
  const trailing = useMemo(
    () => (
      <Text style={styles.wakeText} numberOfLines={1}>
        {wakeLabel}
      </Text>
    ),
    [wakeLabel],
  );
  return (
    <MenuItem leading={icon} trailing={trailing} onSelect={select} testID={testID}>
      {label}
    </MenuItem>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Matches the value text on `MenuSubTrigger`.
  wakeText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
}));
