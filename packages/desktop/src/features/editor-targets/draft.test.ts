import { mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDraftEditorStore } from "./draft.js";

function nextChange(): { promise: Promise<string>; onChange: (text: string) => void } {
  let resolve: (text: string) => void = () => undefined;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, onChange: (text) => resolve(text) };
}

describe("createDraftEditorStore", () => {
  let store: ReturnType<typeof createDraftEditorStore> | null = null;

  afterEach(async () => {
    await store?.closeAll();
    store = null;
  });

  it("writes the draft and streams saves back", async () => {
    store = createDraftEditorStore(await mkdtemp(path.join(tmpdir(), "draft-test-")));
    const change = nextChange();
    const session = await store.open("hello", change.onChange);
    expect(await readFile(session.filePath, "utf8")).toBe("hello");

    await writeFile(session.filePath, "hello from the editor", "utf8");
    expect(await change.promise).toBe("hello from the editor");
  });

  it("follows editors that save by renaming over the file", async () => {
    store = createDraftEditorStore(await mkdtemp(path.join(tmpdir(), "draft-test-")));
    const change = nextChange();
    const session = await store.open("", change.onChange);
    const swap = `${session.filePath}.swp`;
    await writeFile(swap, "renamed save", "utf8");
    await rename(swap, session.filePath);
    expect(await change.promise).toBe("renamed save");
  });

  it("removes the draft on close", async () => {
    store = createDraftEditorStore(await mkdtemp(path.join(tmpdir(), "draft-test-")));
    const session = await store.open("x", () => undefined);
    await store.close(session.draftId);
    expect(existsSync(session.filePath)).toBe(false);
  });
});
