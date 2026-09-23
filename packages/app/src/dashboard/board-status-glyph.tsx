import { CircleCheck, CircleDashed, CircleDot, CircleSlash, Contrast } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import type { WorkspaceBoardStatus } from "@/dashboard/board-status";
import type { Theme } from "@/styles/theme";

const ThemedCircleDashed = withUnistyles(CircleDashed);
const ThemedContrast = withUnistyles(Contrast);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedCircleSlash = withUnistyles(CircleSlash);

const backlogMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const inProgressMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });
const inReviewMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });
const doneMapping = (theme: Theme) => ({ color: theme.colors.statusMerged });
const canceledMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** Backlog, In progress ◐, In review, Done ✓, Canceled ⊘. Matches the sidebar status menu. */
export function BoardStatusGlyph({ status, size }: { status: WorkspaceBoardStatus; size: number }) {
  switch (status) {
    case "backlog":
      return <ThemedCircleDashed size={size} uniProps={backlogMapping} />;
    case "in_progress":
      return <ThemedContrast size={size} uniProps={inProgressMapping} />;
    case "in_review":
      return <ThemedCircleDot size={size} uniProps={inReviewMapping} />;
    case "done":
      return <ThemedCircleCheck size={size} uniProps={doneMapping} />;
    case "canceled":
      return <ThemedCircleSlash size={size} uniProps={canceledMapping} />;
  }
}

export const BOARD_STATUS_LABEL_KEYS: Record<WorkspaceBoardStatus, string> = {
  backlog: "dashboard.columns.backlog",
  in_progress: "dashboard.columns.inProgress",
  in_review: "dashboard.columns.inReview",
  done: "dashboard.columns.done",
  canceled: "dashboard.columns.canceled",
};
