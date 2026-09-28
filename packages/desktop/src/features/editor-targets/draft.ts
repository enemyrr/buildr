import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Ctrl+G in the composer: the draft goes to a temp file the user's editor opens, and every
// save streams back. The directory is watched, not the file, because editors that save by
// renaming a temp file over the original would otherwise orphan the watcher.

const DRAFT_FILE_NAME = "prompt.md";
const SAVE_DEBOUNCE_MS = 50;

export interface DraftSession {
  draftId: string;
  filePath: string;
}

interface OpenDraft {
  directory: string;
  watcher: FSWatcher;
  timer: NodeJS.Timeout | null;
}

export function createDraftEditorStore(rootDirectory = path.join(tmpdir(), "paseo-drafts")) {
  const drafts = new Map<string, OpenDraft>();

  async function open(text: string, onChange: (text: string) => void): Promise<DraftSession> {
    const draftId = randomUUID();
    const directory = path.join(rootDirectory, draftId);
    const filePath = path.join(directory, DRAFT_FILE_NAME);
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, text, "utf8");
    let lastText = text;
    const sync = async () => {
      try {
        const next = await readFile(filePath, "utf8");
        if (next === lastText || !drafts.has(draftId)) return;
        lastText = next;
        onChange(next);
      } catch {
        // Mid-rename the file can be briefly missing; the next event reads it.
      }
    };
    const draft: OpenDraft = {
      directory,
      timer: null,
      watcher: watch(directory, (_event, fileName) => {
        if (fileName !== DRAFT_FILE_NAME) return;
        if (draft.timer) clearTimeout(draft.timer);
        draft.timer = setTimeout(() => {
          draft.timer = null;
          void sync();
        }, SAVE_DEBOUNCE_MS);
      }),
    };
    drafts.set(draftId, draft);
    return { draftId, filePath };
  }

  async function close(draftId: string): Promise<void> {
    const draft = drafts.get(draftId);
    if (!draft) return;
    drafts.delete(draftId);
    if (draft.timer) clearTimeout(draft.timer);
    draft.watcher.close();
    await rm(draft.directory, { recursive: true, force: true });
  }

  async function closeAll(): Promise<void> {
    await Promise.all([...drafts.keys()].map(close));
  }

  return { open, close, closeAll };
}
