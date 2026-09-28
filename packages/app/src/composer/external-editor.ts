import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDesktopHost } from "@/desktop/host";
import { resolvePreferredEditorId, usePreferredEditor } from "@/hooks/use-preferred-editor";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { isAbsolutePath } from "@/utils/path";
import { useDesktopOpenTargets } from "@/workspace/desktop-open-targets";

// Ctrl+G opens the draft in the preferred editor. Every save there replaces the composer
// text, until the draft is sent, Ctrl+G is pressed again, or the composer unmounts.

function readDraftChange(payload: unknown): { draftId: string; text: string } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { draftId, text } = payload as Record<string, unknown>;
  return typeof draftId === "string" && typeof text === "string" ? { draftId, text } : null;
}

export function useExternalDraftEditor(input: {
  serverId: string;
  cwd: string;
  getText: () => string;
  applyText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const { serverId, cwd, getText, applyText, onError } = input;
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const { targets, isAvailable } = useDesktopOpenTargets({ isLocalExecution: isLocalDaemon });
  const { preferredEditorId } = usePreferredEditor();
  const editors = targets.filter((target) => target.kind === "editor");
  const editorId = resolvePreferredEditorId(
    editors.map((editor) => editor.id),
    preferredEditorId,
  );
  const editor = editors.find((candidate) => candidate.id === editorId) ?? null;
  const bridge = getDesktopHost()?.editor;
  const canOpen =
    isAvailable && editor !== null && Boolean(bridge?.openDraft) && isAbsolutePath(cwd);

  const [activeEditorLabel, setActiveEditorLabel] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const applyTextRef = useRef(applyText);
  applyTextRef.current = applyText;

  const stop = useCallback(() => {
    const draftId = draftIdRef.current;
    if (!draftId) return;
    draftIdRef.current = null;
    setActiveEditorLabel(null);
    void getDesktopHost()
      ?.editor?.closeDraft?.(draftId)
      .catch(() => undefined);
  }, []);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (draftIdRef.current) {
      stop();
      return true;
    }
    const openDraft = getDesktopHost()?.editor?.openDraft;
    if (!canOpen || !editor || !openDraft) return false;
    try {
      const { draftId } = await openDraft({
        editorId: editor.id,
        workspacePath: cwd,
        text: getText(),
      });
      draftIdRef.current = draftId;
      setActiveEditorLabel(editor.label);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
    return true;
  }, [canOpen, cwd, editor, getText, onError, stop]);

  useEffect(() => {
    const on = getDesktopHost()?.events?.on;
    if (!on) return;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const dispose = await on("editor-draft-changed", (payload) => {
        const change = readDraftChange(payload);
        if (change && change.draftId === draftIdRef.current) applyTextRef.current(change.text);
      });
      if (disposed) dispose();
      else unsubscribe = dispose;
    })();
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => stop, [stop]);

  return useMemo(
    () => ({ canOpen, activeEditorLabel, toggle, stop }),
    [activeEditorLabel, canOpen, stop, toggle],
  );
}
