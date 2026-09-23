import { useCallback, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { CircleCheck, CircleDashed, CircleDot, CircleSlash, Contrast } from "lucide-react-native";
import { MenuItem, MenuSeparator, type MenuPageDefinition } from "@/components/ui/menu";
import {
  WORKSPACE_BOARD_STATUSES,
  deriveWorkspaceBoardStatus,
  type WorkspaceBoardStatus,
} from "@/dashboard/board-status";
import type { PrHint } from "@/git/pr-hint";
import { setWorkspaceBoardStatus, useWorkspaceStatusStore } from "@/stores/workspace-status-store";
import type { Theme } from "@/styles/theme";

export const WORKSPACE_STATUS_PAGE_ID = "workspaceBoardStatus";

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const warningMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });
const successMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });
const mergedMapping = (theme: Theme) => ({ color: theme.colors.statusMerged });

const STATUS_PRESENTATION: Record<
  WorkspaceBoardStatus,
  { color: (theme: Theme) => { color: string }; labelKey: string }
> = {
  backlog: { color: mutedMapping, labelKey: "sidebar.workspace.boardStatus.backlog" },
  in_progress: { color: warningMapping, labelKey: "sidebar.workspace.boardStatus.inProgress" },
  in_review: { color: successMapping, labelKey: "sidebar.workspace.boardStatus.inReview" },
  done: { color: mergedMapping, labelKey: "sidebar.workspace.boardStatus.done" },
  canceled: { color: mutedMapping, labelKey: "sidebar.workspace.boardStatus.canceled" },
};

const THEMED_ICONS = {
  backlog: withUnistyles(CircleDashed),
  in_progress: withUnistyles(Contrast),
  in_review: withUnistyles(CircleDot),
  done: withUnistyles(CircleCheck),
  canceled: withUnistyles(CircleSlash),
} satisfies Record<WorkspaceBoardStatus, unknown>;

export function WorkspaceBoardStatusIcon({
  status,
  size = 14,
}: {
  status: WorkspaceBoardStatus;
  size?: number;
}): ReactElement {
  const Icon = THEMED_ICONS[status];
  return <Icon size={size} uniProps={STATUS_PRESENTATION[status].color} />;
}

export interface WorkspaceStatusTarget {
  workspaceKey: string;
  prHint: Pick<PrHint, "state"> | null;
}

/** The `Set status` page shared by the workspace kebab and the row's context menu. */
export function useWorkspaceStatusMenuPage(
  target: WorkspaceStatusTarget | null,
): MenuPageDefinition | null {
  const { t } = useTranslation();
  return useMemo(
    () =>
      target
        ? {
            id: WORKSPACE_STATUS_PAGE_ID,
            title: t("sidebar.workspace.actions.setStatus"),
            content: <WorkspaceStatusPage target={target} />,
          }
        : null,
    [t, target],
  );
}

export function workspaceBoardStatusLabelKey(status: WorkspaceBoardStatus): string {
  return STATUS_PRESENTATION[status].labelKey;
}

/** The manual override when one is set, otherwise the status the PR implies. */
export function useResolvedWorkspaceBoardStatus(
  target: WorkspaceStatusTarget,
): WorkspaceBoardStatus {
  const override = useWorkspaceStatusStore((state) => state.overrides[target.workspaceKey]);
  return override ?? deriveWorkspaceBoardStatus(target.prHint);
}

function WorkspaceStatusPage({ target }: { target: WorkspaceStatusTarget }): ReactElement {
  const { t } = useTranslation();
  const current = useResolvedWorkspaceBoardStatus(target);
  const hasOverride = useWorkspaceStatusStore(
    (state) => state.overrides[target.workspaceKey] !== undefined,
  );
  const clearOverride = useCallback(
    () => setWorkspaceBoardStatus(target.workspaceKey, null),
    [target.workspaceKey],
  );
  return (
    <>
      {WORKSPACE_BOARD_STATUSES.map((status) => (
        <WorkspaceStatusRow
          key={status}
          status={status}
          workspaceKey={target.workspaceKey}
          selected={status === current}
          label={t(STATUS_PRESENTATION[status].labelKey)}
        />
      ))}
      {hasOverride ? (
        <>
          <MenuSeparator />
          <MenuItem onSelect={clearOverride} testID="workspace-status-menu-reset">
            {t("sidebar.workspace.boardStatus.automatic")}
          </MenuItem>
        </>
      ) : null}
    </>
  );
}

function WorkspaceStatusRow({
  status,
  workspaceKey,
  selected,
  label,
}: {
  status: WorkspaceBoardStatus;
  workspaceKey: string;
  selected: boolean;
  label: string;
}): ReactElement {
  const leading = useMemo(() => <WorkspaceBoardStatusIcon status={status} />, [status]);
  const select = useCallback(
    () => setWorkspaceBoardStatus(workspaceKey, status),
    [status, workspaceKey],
  );
  return (
    <MenuItem
      leading={leading}
      selected={selected}
      onSelect={select}
      testID={`workspace-status-menu-${status}`}
    >
      {label}
    </MenuItem>
  );
}
