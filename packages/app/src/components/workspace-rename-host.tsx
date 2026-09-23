import { useCallback, useEffect, useRef } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionId } from "@/keyboard/keyboard-action-dispatcher";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { usePanelStore } from "@/stores/panel-store";
import {
  buildWorkspaceHeaderRenameKey,
  useWorkspaceHeaderRenameStore,
} from "@/stores/workspace-header-rename-store";

const WORKSPACE_RENAME_ACTIONS: readonly KeyboardActionId[] = ["workspace.rename"];

/**
 * Handles `workspace.rename` (the command center) by turning the active workspace's header title
 * into an input. The header is the one place that names the active workspace regardless of
 * whether its sidebar row is rendered, so this registers once, keyed on the route selection.
 * Focus mode hides the header, so the action leaves focus mode first.
 */
export function WorkspaceRenameHost() {
  const selection = useActiveWorkspaceSelection();
  const workspaceKey = selection
    ? buildWorkspaceHeaderRenameKey(selection.serverId, selection.workspaceId)
    : null;
  const startFrameRef = useRef<number | null>(null);

  const cancelPendingStart = useCallback(() => {
    if (startFrameRef.current !== null) {
      cancelAnimationFrame(startFrameRef.current);
      startFrameRef.current = null;
    }
  }, []);

  useEffect(() => cancelPendingStart, [cancelPendingStart]);

  // The command center closes and dispatches in the same React batch. Starting a frame later lets
  // the palette unmount before the header input mounts and takes focus.
  const handle = useCallback(() => {
    if (!workspaceKey) return false;
    cancelPendingStart();
    usePanelStore.getState().exitFocusMode();
    startFrameRef.current = requestAnimationFrame(() => {
      startFrameRef.current = null;
      useWorkspaceHeaderRenameStore.getState().start(workspaceKey);
    });
    return true;
  }, [cancelPendingStart, workspaceKey]);

  // Navigating away drops the edit rather than leaving it armed for the next visit.
  useEffect(() => {
    cancelPendingStart();
    useWorkspaceHeaderRenameStore.getState().stop();
  }, [cancelPendingStart, workspaceKey]);

  useKeyboardActionHandler({
    handlerId: "workspace-rename-global",
    actions: WORKSPACE_RENAME_ACTIONS,
    enabled: workspaceKey !== null,
    priority: 0,
    handle,
  });

  return null;
}
