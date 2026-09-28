import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

// `# note` appends the note to the project's agent memory file instead of sending it.
// Only single-line drafts count, so a pasted markdown document that starts with a heading
// still goes to the agent. `#123` stays an issue reference.
const MEMORY_NOTE_PATTERN = /^#(?!\d)\s*(\S.*)$/;

export function resolveMemoryNote(input: { text: string; hasAttachments: boolean }): string | null {
  if (input.hasAttachments) return null;
  const trimmed = input.text.trim();
  if (trimmed.includes("\n")) return null;
  const note = MEMORY_NOTE_PATTERN.exec(trimmed)?.[1]?.trim();
  return note ? note : null;
}

/** Claude reads CLAUDE.md; every other provider reads AGENTS.md. The other file is a fallback. */
export function resolveMemoryFileCandidates(provider: string | null): [string, string] {
  return provider === "claude" ? ["CLAUDE.md", "AGENTS.md"] : ["AGENTS.md", "CLAUDE.md"];
}

export function appendMemoryLine(content: string, note: string): string {
  const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return `${content}${separator}- ${note}\n`;
}

type MemoryClient = Pick<DaemonClient, "readFile" | "writeFile" | "createFileEntry">;

async function tryReadText(client: MemoryClient, cwd: string, path: string) {
  try {
    const file = await client.readFile(cwd, path);
    return {
      content: new TextDecoder().decode(file.bytes),
      modifiedAt: file.modifiedAt,
      revision: file.revision,
    };
  } catch {
    return null;
  }
}

/** Appends the note to the first memory file that exists, creating the preferred one if none do. */
export async function saveMemoryNote(input: {
  client: MemoryClient;
  cwd: string;
  provider: string | null;
  note: string;
}): Promise<string> {
  const { client, cwd, note } = input;
  const candidates = resolveMemoryFileCandidates(input.provider);
  let path = candidates[0];
  let file = null;
  for (const candidate of candidates) {
    file = await tryReadText(client, cwd, candidate);
    if (file) {
      path = candidate;
      break;
    }
  }
  if (!file) {
    const created = await client.createFileEntry({
      cwd,
      parentPath: ".",
      name: path,
      kind: "file",
    });
    if (!created.success) throw new Error(created.error ?? `Couldn't create ${path}`);
    file = await tryReadText(client, cwd, path);
    if (!file) throw new Error(`Couldn't read ${path}`);
  }
  const result = await client.writeFile({
    cwd,
    path,
    content: appendMemoryLine(file.content, note),
    expectedModifiedAt: file.modifiedAt,
    ...(file.revision ? { expectedRevision: file.revision } : {}),
  });
  if (result.status === "conflict") throw new Error(`${path} changed while saving. Try again.`);
  if (result.status === "error") throw new Error(result.error);
  return path;
}
