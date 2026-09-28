import { ipcMain } from "electron";
import { z } from "zod";

import { createDraftEditorStore } from "./draft.js";
import { listAvailableEditorTargets, openEditorTarget } from "./registry.js";
import { createEditorTargetRuntime } from "./runtime.js";
import type { EditorTarget, EditorTargetRuntime } from "./target.js";

interface IpcHandlerRegistry {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

interface DraftSender {
  send(channel: string, payload: unknown): void;
  isDestroyed(): boolean;
}

const EditorTargetLaunchInputSchema = z.object({
  editorId: z.string().trim().min(1),
  workspacePath: z.string().trim().min(1),
  filePath: z.string().trim().min(1).optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
});

const DraftOpenInputSchema = z.object({
  editorId: z.string().trim().min(1),
  workspacePath: z.string().trim().min(1),
  text: z.string(),
});

function readSender(event: unknown): DraftSender | null {
  if (typeof event !== "object" || event === null || !("sender" in event)) return null;
  const sender = (event as { sender: unknown }).sender;
  if (typeof sender !== "object" || sender === null) return null;
  return "send" in sender && "isDestroyed" in sender ? (sender as DraftSender) : null;
}

export function registerEditorTargetHandlers(
  options: {
    ipc?: IpcHandlerRegistry;
    runtime?: EditorTargetRuntime;
    targets?: readonly EditorTarget[];
  } = {},
): void {
  const ipc = options.ipc ?? ipcMain;
  const runtime = options.runtime ?? createEditorTargetRuntime();

  ipc.handle("paseo:editor:listTargets", () =>
    listAvailableEditorTargets(runtime, options.targets),
  );
  ipc.handle("paseo:editor:openTarget", async (_event, payload: unknown) => {
    const input = EditorTargetLaunchInputSchema.parse(payload);
    await openEditorTarget(input, runtime, options.targets);
  });

  const drafts = createDraftEditorStore();
  ipc.handle("paseo:editor:openDraft", async (event, payload: unknown) => {
    const input = DraftOpenInputSchema.parse(payload);
    const sender = readSender(event);
    const session = await drafts.open(input.text, (text) => {
      if (sender && !sender.isDestroyed()) {
        sender.send("paseo:event:editor-draft-changed", { draftId: session.draftId, text });
      }
    });
    try {
      await openEditorTarget(
        {
          editorId: input.editorId,
          workspacePath: input.workspacePath,
          filePath: session.filePath,
        },
        runtime,
        options.targets,
      );
    } catch (error) {
      await drafts.close(session.draftId);
      throw error;
    }
    return { draftId: session.draftId };
  });
  ipc.handle("paseo:editor:closeDraft", async (_event, draftId: unknown) => {
    await drafts.close(z.string().parse(draftId));
  });
}
