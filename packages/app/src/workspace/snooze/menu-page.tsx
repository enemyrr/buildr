import { useCallback, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { AlarmClock, AlarmClockOff, CalendarClock } from "lucide-react-native";
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
import { formatSnoozeWake, setWorkspaceSnoozeWithUndo, type SnoozeTarget } from "./actions";
import { useCustomSnoozeStore } from "./custom-snooze-store";
import { isWorkspaceSnoozed, resolveSnoozePresets, type SnoozePresetId } from "./model";

export const WORKSPACE_SNOOZE_PAGE_ID = "workspaceSnooze";

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedAlarmClock = withUnistyles(AlarmClock);
const ThemedAlarmClockOff = withUnistyles(AlarmClockOff);
const ThemedCalendarClock = withUnistyles(CalendarClock);
const snoozeLeadingIcon = <ThemedAlarmClock size={14} uniProps={mutedMapping} />;
const wakeLeadingIcon = <ThemedAlarmClockOff size={14} uniProps={mutedMapping} />;
const customLeadingIcon = <ThemedCalendarClock size={14} uniProps={mutedMapping} />;

const PRESET_LABEL_KEYS: Record<SnoozePresetId, string> = {
  "later-today": "sidebar.snooze.laterToday",
  tomorrow: "sidebar.snooze.tomorrow",
  "next-monday": "sidebar.snooze.nextMonday",
};

/** The snooze that currently hides the workspace, or null when it is awake. */
function useActiveSnooze(target: SnoozeTarget): WorkspaceSnooze | null {
  const fields = useWorkspaceFields(target.serverId, target.workspaceId, (workspace) => ({
    snooze: workspace.snooze ?? null,
    status: workspace.status,
    statusEnteredAt: workspace.statusEnteredAt,
  }));
  if (!fields || !isWorkspaceSnoozed(fields, Date.now())) {
    return null;
  }
  return fields.snooze;
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

export function WorkspaceSnoozeSubTrigger({
  target,
}: {
  target: SnoozeTarget;
}): ReactElement | null {
  const { t } = useTranslation();
  const supported = useHostFeature(target.serverId, "workspaceSnooze");
  const snooze = useActiveSnooze(target);
  if (!supported) {
    return null;
  }
  const value = snooze
    ? t("sidebar.snooze.until", { time: formatSnoozeWake(new Date(snooze.until), new Date()) })
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
  const snooze = useActiveSnooze(target);
  const openCustom = useCustomSnoozeStore((state) => state.open);
  const now = new Date();
  const presets = resolveSnoozePresets(now);

  const apply = useCallback(
    (until: Date | null) => {
      void setWorkspaceSnoozeWithUndo({ target, until, previous: snooze }).catch((error) => {
        toast.error(error instanceof Error ? error.message : t("sidebar.snooze.failed"));
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
          label={t(PRESET_LABEL_KEYS[preset.id])}
          description={formatSnoozeWake(preset.until, now)}
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
  description,
  until,
  onApply,
  testID,
}: {
  label: string;
  description: string;
  until: Date;
  onApply: (until: Date) => void;
  testID: string;
}): ReactElement {
  const select = useCallback(() => onApply(until), [onApply, until]);
  return (
    <MenuItem description={description} onSelect={select} testID={testID}>
      {label}
    </MenuItem>
  );
}
