import { useCallback, useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast-context";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionId } from "@/keyboard/keyboard-action-dispatcher";
import { i18n } from "@/i18n/i18next";
import { UNDO_WINDOW_MS, type UndoEntry } from "./queue";
import { getLatestWorkspaceUndo, runWorkspaceUndo, useWorkspaceUndoStore } from "./store";

const UNDO_ACTIONS: readonly KeyboardActionId[] = ["workspace.undo"];

/**
 * Shows the newest undoable sidebar action as a toast and handles the undo shortcut. A newer
 * action replaces the toast; the older one stays undoable from the shortcut until it expires.
 */
export function WorkspaceUndoHost() {
  const toast = useToast();
  const latest = useWorkspaceUndoStore((state) => state.entries.at(-1) ?? null);
  const shownIdRef = useRef<number | null>(null);
  // Entry ids only grow. Removing the newest entry must not resurface an older one's toast.
  const newestShownIdRef = useRef(0);

  const undo = useCallback(
    (entry: UndoEntry) => {
      if (shownIdRef.current === entry.id) {
        shownIdRef.current = null;
        toast.dismiss();
      }
      void runWorkspaceUndo(entry.id).catch((error) => {
        toast.error(error instanceof Error ? error.message : i18n.t("sidebar.undo.failed"));
      });
    },
    [toast],
  );

  useEffect(() => {
    if (!latest || latest.id <= newestShownIdRef.current) {
      return;
    }
    shownIdRef.current = latest.id;
    newestShownIdRef.current = latest.id;
    toast.show(<UndoToastContent entry={latest} onUndo={undo} />, {
      durationMs: UNDO_WINDOW_MS,
      testID: "workspace-undo-toast",
    });
  }, [latest, toast, undo]);

  const handle = useCallback(() => {
    const entry = getLatestWorkspaceUndo();
    if (!entry) {
      return false;
    }
    undo(entry);
    return true;
  }, [undo]);

  useKeyboardActionHandler({
    handlerId: "workspace-undo-global",
    actions: UNDO_ACTIONS,
    enabled: latest !== null,
    priority: 0,
    handle,
  });

  return null;
}

function UndoToastContent({
  entry,
  onUndo,
}: {
  entry: UndoEntry;
  onUndo: (entry: UndoEntry) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onUndo(entry), [entry, onUndo]);
  return (
    <View style={styles.row}>
      <Text style={styles.message} numberOfLines={1}>
        {entry.message}
      </Text>
      <Button variant="ghost" size="xs" onPress={handlePress} testID="workspace-undo-toast-action">
        {t("sidebar.undo.action")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  message: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
}));
